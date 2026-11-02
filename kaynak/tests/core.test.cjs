const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { DownloadManager, parseLinks, contained, downloadArgs, friendlyError } = require('../electron/downloads.cjs');
const { SettingsStore } = require('../electron/settings.cjs');
const { VideoSearch, searchArgs, searchQuery, normalizeResults } = require('../electron/search.cjs');
const { checkUpdate, isNewer, PAGE, ENDPOINT } = require('../electron/updates.cjs');
const LINK = 'https://www.youtube.com/watch?v=YE7VzlLtp-4';
const LINK2 = 'https://www.youtube.com/watch?v=aqz-KE-bpKQ';
const unitRoot = path.resolve(__dirname, '../../Kanitlar/unit'); fs.mkdirSync(unitRoot, { recursive: true });
function dirs() {
  const root = fs.mkdtempSync(path.join(unitRoot, 'case-'));
  const dataDir = path.join(root, 'Veriler'), downloadDir = path.join(root, 'Videolar'), other = path.join(root, 'Secilen');
  for (const d of [dataDir, downloadDir, other]) fs.mkdirSync(d);
  return { root, dataDir, downloadDir, defaultDownloadDir: downloadDir, other, vendorDir: path.join(root, 'vendor'), version: '1.1.0' };
}
function fakeChild() {
  const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = () => { child.killed = true; }; return child;
}
function manager() {
  const options = dirs(), children = [], calls = [];
  options.spawn = (exe, args, opt) => { const child = fakeChild(); children.push(child); calls.push({ exe, args, opt }); return child; };
  return { m: new DownloadManager(options), options, children, calls };
}
async function complete(child, file) {
  fs.writeFileSync(file, Buffer.alloc(1024));
  child.stdout.write('KTY_META:{"title":"Gerçek başlık","channel":"Kanal","duration":9,"height":1080}\n');
  child.stdout.write(`KTY_FILE:${JSON.stringify(file)}\n`);
  await new Promise(done => setImmediate(done)); child.emit('close', 0);
}
test('YouTube/Shorts/çoklu bağlantı normalizasyonu ve tekilleştirme', () => {
  assert.deepEqual(parseLinks(`${LINK} https://youtu.be/YE7VzlLtp-4?x=1 https://youtube.com/shorts/aqz-KE-bpKQ`), [{ videoId: 'YE7VzlLtp-4', url: LINK }, { videoId: 'aqz-KE-bpKQ', url: LINK2 }]);
});
test('Sahte host, kimlik, yalnız liste ve protokol reddi', () => {
  for (const input of ['https://youtube.com.evil.test/watch?v=YE7VzlLtp-4', 'https://youtube.com@evil.test/watch?v=YE7VzlLtp-4', 'file://youtube.com/watch?v=YE7VzlLtp-4', 'https://youtube.com/playlist?list=abc', 'https://youtube.com:444/watch?v=YE7VzlLtp-4', 'https://youtu.be/../../outside', '--exec']) assert.throws(() => parseLinks(input));
});
test('Geçersiz toplu giriş kuyruğu kısmen değiştirmez', () => { const { m } = manager(); assert.throws(() => m.enqueue(LINK + ' https://evil.test/x')); assert.equal(m.jobs.length, 0); });
test('Sıralı kuyrukta aynı etkin video tekrar eklenmez', async () => {
  const { m, children, options } = manager(); assert.equal(m.enqueue(`${LINK} ${LINK2}`).count, 2); assert.equal(children.length, 1); assert.equal(m.enqueue(LINK).count, 0);
  await complete(children[0], path.join(options.downloadDir, 'one.mp4')); assert.equal(children.length, 2); assert.equal(m.running.job.url, LINK2);
});
test('Klasör değişimi devam eden ve eski işlerin konumunu korur', async () => {
  const { m, options, children, calls } = manager(); m.enqueue(LINK); const original = m.running.job;
  m.setDirectory(options.other); m.enqueue(LINK2); assert.equal(original.downloadDir, options.downloadDir);
  await complete(children[0], path.join(options.downloadDir, 'one.mp4'));
  assert.equal(original.status, 'completed'); assert.equal(calls[0].opt.cwd, options.downloadDir); assert.equal(calls[1].opt.cwd, options.other);
  const restored = new DownloadManager({ ...options, downloadDir: options.other });
  assert.equal(restored.jobs.find(j => j.videoId === original.videoId).file, original.file); assert.equal(restored.jobs.find(j => j.videoId === 'aqz-KE-bpKQ').downloadDir, options.other);
});
test('Eski 1.0 geçmişi ve yarım kalan kuyruk seçilen yeni klasöre taşınmaz', () => {
  const options = dirs(), file = path.join(options.downloadDir, 'eski.mp4'); fs.writeFileSync(file, 'old');
  fs.writeFileSync(path.join(options.dataDir, 'indirmeler.json'), JSON.stringify([{ id: 'old-1', url: LINK, status: 'completed', file }, { id: 'old-2', url: LINK2, status: 'downloading' }]));
  const m = new DownloadManager({ ...options, downloadDir: options.other });
  assert.equal(m.jobs[0].file, file); assert.equal(m.jobs[1].status, 'queued'); assert.equal(m.jobs[1].downloadDir, options.downloadDir);
});
test('Geçmiş temizliği tüm bitmiş durumları kaldırır; kuyruğu ve dosyayı korur', async () => {
  const { m, options, children } = manager(); m.enqueue(LINK); const file = path.join(options.downloadDir, 'done.mp4'); await complete(children[0], file);
  m.jobs.push({ id: 'failed', url: LINK2, status: 'failed' }, { id: 'cancelled', url: LINK2, status: 'cancelled' });
  m.enqueue(LINK2); assert.equal(m.clearHistory().count, 3); assert.equal(m.jobs.length, 1); assert.equal(m.jobs[0].status, 'preparing'); assert(fs.existsSync(file));
});
test('Tek geçmiş kaydı silinir; etkin iş silinemez', async () => {
  const { m, options, children } = manager(); m.enqueue(LINK); assert.throws(() => m.removeHistory(m.jobs[0].id));
  const file = path.join(options.downloadDir, 'done.mp4'); await complete(children[0], file); m.removeHistory(m.jobs[0].id); assert.equal(m.jobs.length, 0); assert(fs.existsSync(file));
});
test('İptal kapanışı sürerken kayıt temizliği işlem oturumunu korur', () => {
  const { m } = manager(); m.enqueue(LINK); const job = m.running.job; m.cancel(job.id); m.clearHistory(); assert(m.jobs.includes(job)); assert.throws(() => m.removeHistory(job.id));
});
test('Çıktı klasör dışındaysa veya çalıştırılabilir dosyaysa başarı sayılmaz', async () => {
  for (const unsafe of ['outside', 'exe']) {
    const { m, options, children } = manager(); m.enqueue(LINK);
    await complete(children[0], unsafe === 'outside' ? path.join(options.other, 'bad.mp4') : path.join(options.downloadDir, 'bad.exe'));
    assert.equal(m.jobs[0].status, 'failed'); assert.equal(m.jobs[0].file, null);
  }
});
test('Shell kullanılmaz; MP4 kalite araçları ve son URL argümanı korunur', () => {
  const options = dirs(), args = downloadArgs({ url: LINK }, options); assert.equal(args.at(-2), '--'); assert.equal(args.at(-1), LINK); assert(args.includes('bestvideo+bestaudio/best')); assert(args.includes('mp4'));
  assert.equal(args[args.indexOf('--paths') + 1], options.downloadDir); assert(contained(options.downloadDir, path.join(options.downloadDir, 'a.mp4'))); assert(!contained(options.downloadDir, path.join(options.downloadDir, '../a.mp4')));
});
test('Türkçe ağ, disk ve erişim hataları', () => { assert.match(friendlyError('no space left'), /boş alan/); assert.match(friendlyError('ERROR 403 forbidden'), /engelledi/); assert.match(friendlyError('connection timed out'), /İnternet/); });
test('Klasör ve dört tema yeniden açılışta saklanır', () => {
  const options = dirs(); let s = new SettingsStore(options.dataDir, options.downloadDir); s.setDirectory(options.other);
  for (const theme of ['light', 'dark', 'vivid', 'system']) { s.setTheme(theme); s = new SettingsStore(options.dataDir, options.downloadDir); assert.equal(s.value.theme, theme); assert.equal(s.value.downloadDir, fs.realpathSync(options.other)); }
  assert.throws(() => s.setTheme('unknown')); assert.throws(() => s.setDirectory('relative')); assert.throws(() => s.setDirectory(path.join(options.other, 'missing')));
});
test('Ulaşılamayan kayıt klasörü açılışı engellemez', () => {
  const options = dirs(); fs.writeFileSync(path.join(options.dataDir, 'ayarlar.json'), JSON.stringify({ theme: 'dark', downloadDir: path.join(options.root, 'USB-unavailable') }));
  const s = new SettingsStore(options.dataDir, options.downloadDir); assert.equal(s.value.downloadDir, options.downloadDir); assert.equal(s.value.theme, 'dark'); assert(s.warning); assert(!fs.existsSync(path.join(options.root, 'USB-unavailable')));
});
test('Video adı normalizasyonu; URL/kontrol/çok uzun isim sınırları', () => {
  assert.equal(searchQuery('  Büyük\nTavşan  Blender '), 'Büyük Tavşan Blender'); assert.equal(searchQuery('Türkçe \u202Evideo'), 'Türkçe video');
  for (const q of ['', 'a', 'x'.repeat(201), LINK]) assert.throws(() => searchQuery(q));
  const args = searchArgs('ad; $(komut)', 'D:/vendor'); assert.equal(args.at(-1), 'ytsearch6:ad; $(komut)'); assert(args.includes('--flat-playlist')); assert(args.includes('--skip-download'));
});
test('Arama sonuçları yalnız doğrulanmış video kimliklerinden üretilir', () => {
  const entries = [{ id: 'YE7VzlLtp-4', title: '<script>test</script>', channel: 'Blender', duration: 59, thumbnail: 'https://evil.test/track' }, { id: 'YE7VzlLtp-4' }, { id: '../../evil' }, { id: 'aqz-KE-bpKQ', is_live: true }];
  const results = normalizeResults({ entries }); assert.equal(results.length, 1); assert.equal(results[0].url, LINK); assert.equal(results[0].thumbnail, 'https://i.ytimg.com/vi/YE7VzlLtp-4/hqdefault.jpg'); assert.equal(results[0].title, '<script>test</script>');
  assert.deepEqual(normalizeResults({ entries: null }), []);
});
test('Gerçek motor çıktısı biçimi arama hizmetinden geçer', async () => {
  const options = dirs(); let child, captured;
  const s = new VideoSearch({ ...options, executable: () => 'engine.exe', spawn: (exe, args, opt) => { captured = { exe, args, opt }; child = fakeChild(); return child; } });
  const p = s.search('Blender Tavşan'); child.stdout.write(JSON.stringify({ entries: [{ id: 'YE7VzlLtp-4', title: 'Tavşan' }] })); child.emit('close', 0);
  assert.equal((await p).results[0].url, LINK); assert.equal(captured.opt.shell, false); assert.equal(captured.args.at(-1), 'ytsearch6:Blender Tavşan');
});
test('Yeni arama eski yanıtı iptal eder; iptal hata kodu ayrı kalır', async () => {
  const children = [], s = new VideoSearch({ vendorDir: 'D:/vendor', executable: () => 'engine', spawn: () => { const child = fakeChild(); children.push(child); return child; } });
  const a = s.search('first'); const rejected = assert.rejects(a, error => error.code === 'SEARCH_CANCELLED');
  const b = s.search('second'); children[0].stdout.write('{"entries":[]}'); children[0].emit('close', 0); children[1].stdout.write('{"entries":[]}'); children[1].emit('close', 0);
  await rejected; assert.equal((await b).query, 'second'); assert.equal(s.pending, null);
});
test('Arama ağ hatası ve bozuk JSON sonucu başarı gibi dönmez', async () => {
  for (const [code, output] of [[1, ''], [0, '{bad']]) {
    let child; const s = new VideoSearch({ vendorDir: 'D:/vendor', executable: () => 'engine', spawn: () => { child = fakeChild(); return child; } });
    const p = s.search('video'); child.stderr.write('connection timed out'); child.stdout.write(output); child.emit('close', code); await assert.rejects(p);
  }
});
test('Sürüm karşılaştırması sayısaldır; düşürme veya bozuk sürüm önermez', () => {
  assert(isNewer('1.10.0', '1.9.9')); assert(isNewer('2.0.0', '1.99.99')); assert(!isNewer('1.1.0', '1.1.0')); assert(!isNewer('1.0.9', '1.1.0')); assert(!isNewer('https://evil.test', '1.1.0')); assert(!isNewer('1.2.0-beta', '1.1.0'));
});
test('Açılış kontrolü her çağrıda gerçek katalog hedefini kullanır; yeni/güncel', async () => {
  let calls = 0;
  const mock = async (url, options) => { calls++; assert.equal(url, ENDPOINT); assert.equal(options.cache, 'no-store'); assert.equal(JSON.parse(options.body).data.op, 'catalog'); assert(!options.headers.Authorization); return { ok: true, text: async () => JSON.stringify({ result: { games: [{ id: 'kutarya-video', slug: 'kutarya-video', status: 'published', version: '1.2.0' }] } }) }; };
  assert.equal((await checkUpdate('1.1.0', mock)).status, 'available'); assert.equal((await checkUpdate('1.2.0', mock)).status, 'current'); assert.equal(calls, 2); assert.equal((await checkUpdate('1.1.0', mock)).page, PAGE);
});
test('Sürüm servisi çevrimdışı/bozuk/taslak olduğunda indirmeden ayrı kalır', async () => {
  for (const mock of [async () => { throw new Error('offline'); }, async () => ({ ok: false }), async () => ({ ok: true, text: async () => '{bad' }), async () => ({ ok: true, text: async () => JSON.stringify({ result: { games: [{ id: 'kutarya-video', slug: 'kutarya-video', status: 'draft', version: '2.0.0' }] } }) })]) assert.equal((await checkUpdate('1.1.0', mock)).status, 'offline');
});
