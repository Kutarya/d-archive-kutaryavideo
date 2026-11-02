const { EventEmitter } = require('node:events');
const { spawn, execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const readline = require('node:readline');

const ACTIVE = new Set(['queued', 'preparing', 'downloading', 'processing']);
function parseLinks(text) {
  if (typeof text !== 'string') throw new Error('Bir YouTube video bağlantısı yapıştır.');
  const chunks = text.trim().split(/\s+/u).filter(Boolean);
  if (!chunks.length) throw new Error('Bir YouTube video bağlantısı yapıştır.');
  const links = new Map();
  for (const chunk of chunks) {
    let url;
    try { url = new URL(/^https?:\/\//i.test(chunk) ? chunk : `https://${chunk}`); } catch { throw new Error('Bağlantı okunamadı. YouTube video adresini yapıştır.'); }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) throw new Error('Geçerli bir YouTube video adresi kullan.');
    const host = url.hostname.toLowerCase();
    let id;
    if (host === 'youtu.be') id = url.pathname.slice(1);
    else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com'].includes(host)) {
      if (url.pathname === '/watch') id = url.searchParams.get('v');
      else id = url.pathname.match(/^\/(?:shorts|live|embed|v)\/([^/]+)\/?$/)?.[1];
    }
    if (!/^[\w-]{11}$/.test(id || '')) throw new Error('YouTube, Shorts veya youtu.be video bağlantısı kullan. Yalnız oynatma listesi adresi yeterli değil.');
    links.set(id, { videoId: id, url: `https://www.youtube.com/watch?v=${id}` });
  }
  return [...links.values()];
}
function friendlyError(raw) {
  if (/429|too many requests/i.test(raw)) return 'YouTube bu ağdan gelen istekleri geçici olarak sınırlandırdı. Bir süre sonra yeniden dene.';
  if (/no space left|not enough space|disk full|errno 28/i.test(raw)) return 'Diskte yeterli boş alan yok. Yer açıp yeniden dene.';
  if (/private video|members.only|join this channel/i.test(raw)) return 'Bu video özel veya üyelere açık. Herkese açık bir bağlantı kullan.';
  if (/sign in|confirm your age|age.restricted|not a bot/i.test(raw)) return 'YouTube bu video için oturum veya erişim doğrulaması istiyor. Şu anda otomatik indirilemiyor.';
  if (/copyright|video unavailable|removed|not available|blocked|geo.restricted/i.test(raw)) return 'Video kaldırılmış ya da bulunduğun ağ veya bölgeden erişilemiyor.';
  if (/403|forbidden|429|too many requests/i.test(raw)) return 'YouTube indirme isteğini geçici olarak engelledi. Bir süre sonra yeniden dene.';
  if (/timed out|name resolution|connection|network|unable to download/i.test(raw)) return 'Bağlantı kesildi veya sunucu yanıt vermedi. İnternetini kontrol edip yeniden dene.';
  if (/permission denied|access is denied|errno 13/i.test(raw)) return 'Videolar klasörüne yazılamıyor. Klasörün yazılabilir olduğunu kontrol et.';
  if (/requested format/i.test(raw)) return 'YouTube şu anda indirilebilir video akışı vermedi. Bir süre sonra yeniden dene.';
  return 'İndirme tamamlanamadı. Yeniden dene; ayrıntıyı hata bilgisi düğmesinden görebilirsin.';
}
function contained(folder, file) {
  const relative = path.relative(path.resolve(folder), path.resolve(file));
  return relative.length > 0 && !relative.startsWith('..') && !path.isAbsolute(relative);
}
function downloadArgs(job, options) {
  return [
    '--ignore-config', '--no-playlist', '--no-color', '--newline', '--encoding', 'utf-8',
    '--no-simulate', '--js-runtimes', `deno:${path.join(options.vendorDir, 'deno.exe')}`,
    '--ffmpeg-location', options.vendorDir, '--windows-filenames', '--trim-filenames', '160',
    '--continue', '--no-mtime', '--socket-timeout', '25', '--retries', '5', '--fragment-retries', '5',
    '--retry-sleep', 'exp=1:8', '--concurrent-fragments', '4',
    '--format', 'bestvideo+bestaudio/best', '--merge-output-format', 'mp4', '--remux-video', 'mp4', '--embed-metadata',
    '--paths', options.downloadDir, '--output', '%(title).140B [%(id)s].%(ext)s',
    '--print', 'before_dl:KTY_META:{"title":%(title)j,"channel":%(channel)j,"duration":%(duration)j,"width":%(width)j,"height":%(height)j}',
    '--print', 'after_move:KTY_FILE:%(filepath)j',
    '--progress-template', 'download:KTY_PROGRESS:%(progress)j', '--progress-delta', '0.25',
    '--', job.url
  ];
}

class DownloadManager extends EventEmitter {
  constructor(options) {
    super();
    this.options = { ...options };
    this.spawn = options.spawn || spawn;
    this.executable = path.join(options.vendorDir, 'yt-dlp.exe');
    this.jobs = [];
    this.running = null;
    this.closing = false;
    this.lastNotify = 0;
    fs.mkdirSync(options.dataDir, { recursive: true });
    fs.mkdirSync(options.defaultDownloadDir || options.downloadDir, { recursive: true });
    this.historyFile = path.join(options.dataDir, 'indirmeler.json');
    try {
      const saved = JSON.parse(fs.readFileSync(this.historyFile, 'utf8'));
      if (Array.isArray(saved)) for (const item of saved) {
        try {
          const link = parseLinks(item.url)[0];
          if (!item.id || !/^[\w-]+$/.test(item.id)) continue;
          if (!ACTIVE.has(item.status) && !['completed', 'failed', 'cancelled'].includes(item.status)) continue;
          const downloadDir = typeof item.downloadDir === 'string' && path.isAbsolute(item.downloadDir) ? path.resolve(item.downloadDir) : options.defaultDownloadDir || options.downloadDir;
          this.jobs.push({ ...item, ...link, downloadDir, status: ACTIVE.has(item.status) ? 'queued' : item.status, file: typeof item.file === 'string' && contained(downloadDir, item.file) && /\.mp4$/i.test(item.file) ? item.file : null });
        } catch {}
      }
    } catch {}
  }
  snapshot() {
    return { jobs: this.jobs.map(job => ({ ...job })), downloadDir: this.options.downloadDir, version: this.options.version || require('../package.json').version, engineState: this.engineState || 'ready' };
  }
  save() {
    const temp = `${this.historyFile}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(this.jobs), 'utf8');
    fs.renameSync(temp, this.historyFile);
  }
  notify(force = true) {
    if (!force && Date.now() - this.lastNotify < 230) return;
    this.lastNotify = Date.now();
    this.emit('change', this.snapshot());
  }
  enqueue(text) {
    const links = parseLinks(text); // Bütün adresler doğrulanmadan kuyruk değişmez.
    const added = [];
    for (const link of links) {
      if (this.jobs.some(job => job.videoId === link.videoId && ACTIVE.has(job.status))) continue;
      const job = { id: crypto.randomUUID(), ...link, downloadDir: this.options.downloadDir, title: 'Video bilgileri alınıyor…', channel: 'YouTube', status: 'queued', progress: 0, createdAt: new Date().toISOString(), file: null, error: '', detail: '', speed: null, eta: null };
      this.jobs.unshift(job);
      added.push(job.id);
    }
    this.save(); this.notify();
    this.pump();
    return { count: added.length, ids: added };
  }
  pump() {
    if (this.running || this.closing) return;
    const job = [...this.jobs].reverse().find(item => item.status === 'queued');
    if (job) this.run(job);
  }
  run(job) {
    job.status = 'preparing'; job.error = ''; job.detail = ''; job.progress = 0;
    const session = { job, child: null, cancelled: false, file: null, lines: [], closed: false };
    this.running = session;
    this.save(); this.notify();
    let child;
    try {
      fs.mkdirSync(job.downloadDir, { recursive: true });
      child = this.spawn(this.executable, downloadArgs(job, { ...this.options, downloadDir: job.downloadDir }), { windowsHide: true, shell: false, cwd: job.downloadDir, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
      session.child = child;
    } catch (error) { this.finish(session, 1, error.message); return; }
    const handle = line => {
      if (session.cancelled || session.closed) return;
      if (line.startsWith('KTY_META:')) {
        try {
          const meta = JSON.parse(line.slice(9));
          job.title = typeof meta.title === 'string' ? meta.title : job.title;
          job.channel = typeof meta.channel === 'string' ? meta.channel : 'YouTube';
          job.duration = Number(meta.duration) || 0;
          job.height = Number(meta.height) || 0;
          job.status = 'downloading';
          this.save(); this.notify();
        } catch {}
      } else if (line.startsWith('KTY_PROGRESS:')) {
        try {
          const p = JSON.parse(line.slice(13));
          const total = Number(p.total_bytes || p.total_bytes_estimate);
          const bytes = Number(p.downloaded_bytes) || 0;
          job.progress = total > 0 ? Math.min(99.5, bytes / total * 100) : 0;
          job.downloadedBytes = bytes; job.totalBytes = total || null;
          job.speed = Number(p.speed) || null; job.eta = Number.isFinite(Number(p.eta)) && p.eta != null ? Number(p.eta) : null;
          job.status = p.status === 'finished' ? 'processing' : 'downloading';
          this.notify(false);
        } catch {}
      } else if (line.startsWith('KTY_FILE:')) {
        try { session.file = JSON.parse(line.slice(9)); } catch {}
      } else {
        session.lines.push(line.slice(0, 2000));
        if (session.lines.length > 30) session.lines.shift();
        if (/^\[(Merger|VideoRemuxer|Metadata|Fixup)/.test(line)) { job.status = 'processing'; this.notify(); }
      }
    };
    readline.createInterface({ input: child.stdout }).on('line', handle);
    readline.createInterface({ input: child.stderr }).on('line', handle);
    child.on('error', error => this.finish(session, 1, error.message));
    child.on('close', code => this.finish(session, code));
  }
  finish(session, code, problem = '') {
    if (session.closed) return;
    session.closed = true;
    const { job } = session;
    if (session.cancelled || this.closing) {
      job.status = this.closing ? 'queued' : 'cancelled';
      job.speed = null; job.eta = null;
    } else if (code === 0 && typeof session.file === 'string' && contained(job.downloadDir, session.file) && /\.mp4$/i.test(session.file) && fs.existsSync(session.file) && fs.statSync(session.file).size > 0) {
      job.status = 'completed'; job.progress = 100; job.file = session.file;
      job.completedAt = new Date().toISOString(); job.size = fs.statSync(session.file).size;
      job.speed = null; job.eta = null;
      this.emit('completed', { ...job });
    } else {
      job.status = 'failed';
      job.detail = [problem, ...session.lines].filter(Boolean).join('\n').slice(-16000);
      job.error = friendlyError(job.detail);
      job.speed = null; job.eta = null;
    }
    if (this.running === session) this.running = null;
    this.save(); this.notify(); this.pump();
  }
  stopProcess(session) {
    if (!session.child?.pid) return;
    if (process.platform === 'win32') execFile('taskkill.exe', ['/PID', String(session.child.pid), '/T', '/F'], { windowsHide: true }, error => { if (error) session.child.kill(); });
    else session.child.kill('SIGTERM');
  }
  cancel(id) {
    const job = this.jobs.find(item => item.id === id);
    if (!job || !ACTIVE.has(job.status)) return;
    if (this.running?.job.id === id) { this.running.cancelled = true; job.status = 'cancelled'; this.stopProcess(this.running); }
    else job.status = 'cancelled';
    this.save(); this.notify();
  }
  retry(id) {
    const job = this.jobs.find(item => item.id === id);
    if (!job || !['failed', 'cancelled'].includes(job.status)) return;
    if (this.running?.job.id === id) throw new Error('İndirme durduruluyor. Bir saniye sonra yeniden dene.');
    if (this.jobs.some(item => item.id !== id && item.videoId === job.videoId && ACTIVE.has(item.status))) throw new Error('Bu video zaten kuyrukta.');
    job.status = 'queued'; job.error = ''; job.detail = ''; job.progress = 0;
    this.save(); this.notify(); this.pump();
  }
  setDirectory(directory) {
    const { writableDirectory } = require('./settings.cjs');
    this.options.downloadDir = writableDirectory(directory);
    this.notify();
  }
  clearCompleted() { return this.clearHistory(); }
  clearHistory() {
    const previous = this.jobs.length;
    this.jobs = this.jobs.filter(job => ACTIVE.has(job.status) || this.running?.job.id === job.id);
    this.save(); this.notify();
    return { count: previous - this.jobs.length };
  }
  removeHistory(id) {
    const job = this.jobs.find(item => item.id === id);
    if (!job) return;
    if (ACTIVE.has(job.status) || this.running?.job.id === id) throw new Error('Devam eden indirme geçmişten silinemez.');
    this.jobs = this.jobs.filter(item => item.id !== id);
    this.save(); this.notify();
  }
  async shutdown() {
    this.closing = true;
    if (this.running) {
      const session = this.running;
      session.job.status = 'queued';
      this.stopProcess(session);
      await new Promise(resolve => { session.child?.once('close', resolve); setTimeout(resolve, 3500).unref(); });
    }
    this.save();
  }
  async updateEngine() {
    // Güncelleme başarısızsa paket içindeki motor çalışmaya devam eder.
    const dir = path.join(this.options.dataDir, 'motor');
    fs.mkdirSync(dir, { recursive: true });
    const stamp = path.join(dir, 'surum.json');
    let previous;
    try {
      previous = JSON.parse(fs.readFileSync(stamp, 'utf8'));
      const candidate = previous.bundled ? path.join(this.options.vendorDir, 'yt-dlp.exe') : path.join(dir, previous.name);
      if ((previous.bundled || contained(dir, candidate)) && fs.existsSync(candidate) && crypto.createHash('sha256').update(fs.readFileSync(candidate)).digest('hex') === previous.hash) this.executable = candidate;
      else previous = null;
    } catch {}
    if (previous && Date.now() - previous.checked < 86400000) return;
    this.engineState = 'updating'; this.notify();
    try {
      const headers = { 'User-Agent': `KutaryaVideo/${this.options.version || require('../package.json').version}` };
      const response = await fetch('https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest', { headers, signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error('Sürüm servisi yanıt vermedi.');
      const release = await response.json();
      const asset = release.assets.find(item => item.name === 'yt-dlp.exe');
      if (!asset?.digest?.startsWith('sha256:') || !/^[\d.]+$/.test(release.tag_name)) throw new Error('Motor doğrulanamadı.');
      const hash = asset.digest.slice(7);
      const bundledHash = crypto.createHash('sha256').update(fs.readFileSync(path.join(this.options.vendorDir, 'yt-dlp.exe'))).digest('hex');
      if (hash !== bundledHash && hash !== previous?.hash) {
        const file = await fetch(asset.browser_download_url, { headers, signal: AbortSignal.timeout(90000) });
        if (!file.ok) throw new Error('Motor indirilemedi.');
        const bytes = Buffer.from(await file.arrayBuffer());
        if (bytes.length !== asset.size || crypto.createHash('sha256').update(bytes).digest('hex') !== hash) throw new Error('Motor SHA doğrulaması başarısız.');
        const name = `yt-dlp-${release.tag_name}.exe`;
        fs.writeFileSync(path.join(dir, name), bytes);
        this.executable = path.join(dir, name);
      }
      fs.writeFileSync(stamp, JSON.stringify({ name: path.basename(this.executable), bundled: this.executable === path.join(this.options.vendorDir, 'yt-dlp.exe'), hash, checked: Date.now() }));
    } catch (error) { this.emit('engine-warning', error.message); }
    this.engineState = 'ready'; this.notify();
  }
}
module.exports = { DownloadManager, parseLinks, friendlyError, contained, downloadArgs, ACTIVE };
