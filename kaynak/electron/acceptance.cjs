const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { DownloadManager } = require('./downloads.cjs');
const { SettingsStore } = require('./settings.cjs');
const { checkUpdate } = require('./updates.cjs');
exports.run = async function(c) {
  const { app, win, manager, settings, testDir, testUrl, vendorDir, dataDir, defaultDownloadDir, errors, broadcast, checkForUpdate, setUpdate, dialog, getFile } = c;
  const report = { packaged: app.isPackaged, appVersion: app.getVersion(), runtime: process.versions.electron, checks: [], errors, realYouTube: !!testUrl, nativeFolderSelectionMocked: true, windowsNotificationDelivered: false, installationTested: false };
  const check = (name, passed, detail = null) => { report.checks.push({ name, passed: !!passed, detail }); if (!passed) throw new Error(name); };
  const wait = async (predicate, timeout = 30000) => { const end = Date.now() + timeout; while (!await predicate()) { if (Date.now() > end) throw new Error('Kabul zaman aşımı'); await new Promise(done => setTimeout(done, 150)); } };
  const js = code => win.webContents.executeJavaScript(code);
  const capture = async name => { await js('document.fonts.ready'); await new Promise(done => setTimeout(done, 350)); fs.writeFileSync(path.join(testDir, name), (await win.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG()); };
  const originalDialog = dialog.showOpenDialog;
  try {
    for (const binary of ['yt-dlp.exe', 'ffmpeg.exe', 'ffprobe.exe', 'deno.exe']) check(binary, fs.existsSync(path.join(vendorDir, binary)));
    await wait(() => js('window.uiReady === true'));
    check('Sandbox ve dar IPC', await js('typeof require === "undefined" && typeof window.kutarya.search === "function" && typeof window.kutarya.chooseFolder === "function"'));
    check('Açılış profil ayrımı', settings.file.startsWith(testDir) && manager.options.downloadDir.startsWith(testDir));
    check('Boş başlangıç', manager.jobs.length === 0);
    check('Sahte host reddi', !(await js('window.kutarya.add("https://youtube.com.evil.test/watch?v=YE7VzlLtp-4")')).ok);
    const liveUpdate = await checkForUpdate(); report.liveUpdate = liveUpdate;
    check('Gerçek HTTPS sürüm kontrolü', ['current', 'available'].includes(liveUpdate.status));
    for (const theme of ['light', 'dark', 'vivid', 'system']) {
      check(`Tema IPC ${theme}`, (await js(`window.kutarya.theme(${JSON.stringify(theme)})`)).ok);
      await wait(() => js(`document.querySelector('#theme-select').value === ${JSON.stringify(theme)}`));
      check(`Tema kalıcı ${theme}`, new SettingsStore(dataDir, defaultDownloadDir).value.theme === theme);
      if (theme !== 'system') await capture(`tema-${theme}.png`);
    }
    await js('window.kutarya.theme("light")'); await capture('01-arayuz.png');
    win.setSize(780, 660); await new Promise(done => setTimeout(done, 350));
    check('Dar pencerede yatay taşma yok', await js('document.documentElement.scrollWidth <= window.innerWidth'));
    await capture('02-dar-pencere.png'); win.setSize(1100, 820);
    const future = await checkUpdate(app.getVersion(), async () => ({ ok: true, text: async () => JSON.stringify({ result: { games: [{ id: 'kutarya-video', slug: 'kutarya-video', status: 'published', version: '9.0.0' }] } }) }));
    setUpdate(future); await wait(() => js('!document.querySelector("#update-banner").hidden'));
    check('Yeni sürüm uygulama içi bildirimi (kontrollü servis)', await js('document.querySelector("#update-title").textContent.includes("9.0.0")'));
    await capture('bildirim-kontrollu.png'); await js('document.querySelector("#update-dismiss").click()'); check('Bildirim kapatılabilir', await js('document.querySelector("#update-banner").hidden'));
    setUpdate({ status: 'offline' }); await wait(() => js('document.querySelector("#check-update").textContent.includes("Yeniden dene")'));
    check('Çevrimdışı sürüm durumu indirme alanını engellemez', await js('!document.querySelector("#submit-button").disabled'));
    setUpdate(liveUpdate);
    const other = path.join(testDir, 'Secilen-Videolar'); fs.mkdirSync(other);
    let chooserOptions;
    dialog.showOpenDialog = async (_win, options) => { chooserOptions = options; return { canceled: false, filePaths: [other] }; };
    await js('document.querySelector("#choose-folder").click()'); await wait(() => manager.options.downloadDir === fs.realpathSync(other));
    check('Klasör seçimi IPC ve kalıcılık (kontrollü seçici)', chooserOptions.properties.includes('openDirectory') && new SettingsStore(dataDir, defaultDownloadDir).value.downloadDir === manager.options.downloadDir);
    dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
    check('Klasör seçici iptali', (await js('window.kutarya.chooseFolder()')).value.cancelled && manager.options.downloadDir === fs.realpathSync(other));
    dialog.showOpenDialog = originalDialog;
    const fixtureFile = path.join(other, 'history-test.mp4'); fs.writeFileSync(fixtureFile, Buffer.alloc(1024));
    manager.jobs = Array.from({ length: 100 }, (_, i) => ({ id: `fixture-${i}`, videoId: 'YE7VzlLtp-4', url: 'https://www.youtube.com/watch?v=YE7VzlLtp-4', downloadDir: other, title: `Geçmiş kabul kaydı ${i + 1}`, channel: 'Kontrollü kabul verisi', status: 'completed', file: fixtureFile, size: 1024, progress: 100 }));
    manager.save(); broadcast(); await wait(() => js('document.querySelector("#history-count").textContent === "100"'));
    check('100 eski kayıt ana ekranda tek satır', await js('document.querySelectorAll("#job-list .job").length === 1'));
    await js('document.querySelector("#tab-history").click()'); check('Geçmiş 20 satırla sınırlı', await js('document.querySelectorAll("#job-list .job").length === 20 && document.querySelector("#page-info").textContent === "1 / 5"'));
    await js('document.querySelector("#next-page").click()'); check('Geçmiş ikinci sayfa', await js('document.querySelector("#page-info").textContent === "2 / 5"'));
    await js('document.querySelector("#job-list [aria-label=" + JSON.stringify("Kaydı geçmişten sil") + "]").click()');
    await wait(() => manager.jobs.length === 99); check('Tek geçmiş kaydı temizlenir', fs.existsSync(fixtureFile));
    await js('document.querySelector("#clear-button").click()'); check('Temizleme açıklaması', await js('document.querySelector("#clear-dialog").open'));
    await js('document.querySelector("#clear-confirm").click()'); await wait(() => manager.jobs.length === 0); check('Geçmiş temizlenir dosyası durur', fs.existsSync(fixtureFile));
    await js('document.querySelector("#tab-downloads").click()');
    if (testUrl) {
      await js('document.querySelector("#url-input").value = "Big Buck Bunny Blender"; document.querySelector("#download-form").requestSubmit()');
      await wait(() => js('document.querySelectorAll(".result-card").length > 0'), 50000);
      const results = await js('Array.from(document.querySelectorAll(".result-card")).map(c => ({videoId:c.dataset.videoId,title:c.querySelector("h3").textContent,channel:c.querySelector(".result-channel").textContent}))'); report.search = results;
      check('İsimle gerçek YouTube araması', results.length > 0 && results.length <= 6 && results.some(r => r.videoId === 'YE7VzlLtp-4'), results);
      for (const result of results) await js(`document.querySelector('[data-video-id="${result.videoId}"]').scrollIntoView({block:'center'})`);
      await js('Promise.all(Array.from(document.querySelectorAll(".result-cover img")).map(i=>i.decode().catch(()=>{})))'); await js('window.scrollTo(0,0)'); await capture('03-arama.png');
      await js('document.querySelector("[data-download-id=\\"YE7VzlLtp-4\\"]").click()'); await wait(() => manager.jobs.length === 1);
      check('Gerçek sonuç seçimi indirir', manager.jobs[0].url === testUrl && manager.jobs[0].downloadDir === fs.realpathSync(other));
      await wait(() => ['completed', 'failed'].includes(manager.jobs[0]?.status), 240000);
      const job = manager.jobs[0]; report.download = job;
      check('Gerçek YouTube indirmesi', job.status === 'completed', job.error || job.file);
      const probe = JSON.parse(execFileSync(path.join(vendorDir, 'ffprobe.exe'), ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', job.file], { windowsHide: true, encoding: 'utf8' }));
      check('MP4 gerçek video ve ses', job.file.endsWith('.mp4') && probe.streams.some(s => s.codec_type === 'video') && probe.streams.some(s => s.codec_type === 'audio'));
      report.media = { duration: probe.format.duration, size: probe.format.size, streams: probe.streams.map(s => ({ type: s.codec_type, codec: s.codec_name, width: s.width, height: s.height })) };
      await js('document.querySelector("#search-cancel").click()'); await js('window.scrollTo(0,0)'); await capture('04-indirme-sonucu.png');
      const reload = new DownloadManager(manager.options); check('İndirme yeni klasörde kalıcı', reload.jobs[0].file === job.file && reload.jobs[0].status === 'completed');
      settings.setDirectory(defaultDownloadDir); manager.setDirectory(defaultDownloadDir); check('Klasör değişince eski dosya açılabilir', getFile(job.id) === job.file);
      manager.jobs = []; manager.save(); broadcast();
      await js(`(() => { const e = new Event('paste', {bubbles:true,cancelable:true}); Object.defineProperty(e,'clipboardData',{value:{getData:()=>${JSON.stringify(testUrl)}}}); document.querySelector('#url-input').dispatchEvent(e); })()`);
      await wait(() => manager.jobs.length === 1); check('Yapıştırınca otomatik kuyruk', manager.jobs[0].url === testUrl);
      manager.cancel(manager.jobs[0].id); await wait(() => !manager.running);
      check('İptal ve süreç kapanışı', manager.jobs[0].status === 'cancelled'); manager.clearHistory();
    }
    check('Renderer hatası yok', errors.length === 0, errors); report.passed = true;
  } catch (error) { report.passed = false; report.failure = error.stack; }
  finally { dialog.showOpenDialog = originalDialog; c.search.cancel(); await manager.shutdown(); }
  fs.writeFileSync(path.join(testDir, 'kabul.json'), JSON.stringify(report, null, 2));
  app.exit(report.passed ? 0 : 1);
};
