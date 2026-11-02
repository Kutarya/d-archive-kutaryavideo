const { spawn, execFile } = require('node:child_process');
const path = require('node:path');
const { friendlyError } = require('./downloads.cjs');

function searchQuery(value) {
  if (typeof value !== 'string') throw new Error('Bulmak istediğin videonun adını yaz.');
  const query = value.replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/gu, ' ').trim();
  if (query.length < 2 || query.length > 200) throw new Error('Video adı 2–200 karakter arasında olmalı.');
  if (/https?:\/\/|(?:www\.)?(?:youtube\.com|youtu\.be)\//i.test(query)) throw new Error('Video adı yaz veya doğrudan video bağlantısını indirme alanına yapıştır.');
  return query;
}
function searchArgs(query, vendorDir) {
  return ['--ignore-config', '--no-color', '--encoding', 'utf-8', '--skip-download', '--flat-playlist',
    '--dump-single-json', '--no-warnings', '--socket-timeout', '12', '--extractor-retries', '1',
    '--js-runtimes', `deno:${path.join(vendorDir, 'deno.exe')}`, '--', `ytsearch6:${query}`];
}
function normalizeResults(json) {
  const seen = new Set();
  return (Array.isArray(json.entries) ? json.entries : []).filter(entry => {
    if (!entry || !/^[\w-]{11}$/.test(entry.id || '') || entry.is_live || seen.has(entry.id)) return false;
    seen.add(entry.id); return true;
  }).slice(0, 6).map(entry => ({
    videoId: entry.id, url: `https://www.youtube.com/watch?v=${entry.id}`,
    title: String(entry.title || 'YouTube videosu').slice(0, 500),
    channel: String(entry.channel || entry.uploader || 'YouTube').slice(0, 200),
    duration: Number(entry.duration) > 0 ? Number(entry.duration) : null,
    views: Number(entry.view_count) >= 0 ? Number(entry.view_count) : null,
    thumbnail: `https://i.ytimg.com/vi/${entry.id}/hqdefault.jpg`,
  }));
}
class VideoSearch {
  constructor(options) { this.options = options; this.spawn = options.spawn || spawn; this.pending = null; }
  cancel() { this.pending?.cancel(); }
  search(value) {
    const query = searchQuery(value);
    this.cancel();
    return new Promise((resolve, reject) => {
      let child, timer, settled = false, output = '', detail = '';
      const finish = (error, result) => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        if (this.pending === session) this.pending = null;
        error ? reject(error) : resolve({ query, results: result });
      };
      const stop = () => {
        if (!child?.pid) return;
        if (process.platform === 'win32') execFile('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, () => child.kill());
        else child.kill('SIGTERM');
      };
      const session = { cancel: () => { const error = new Error('Arama iptal edildi.'); error.code = 'SEARCH_CANCELLED'; stop(); finish(error); } };
      this.pending = session;
      try {
        child = this.spawn(this.options.executable(), searchArgs(query, this.options.vendorDir), { shell: false, windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
        child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
        child.stdout.on('data', chunk => {
          output += chunk;
          if (output.length > 2 * 1024 * 1024) { stop(); finish(new Error('Arama yanıtı çok büyük. Daha kısa bir video adıyla yeniden dene.')); }
        });
        child.stderr.on('data', chunk => { detail = (detail + chunk).slice(-4000); });
        child.on('error', () => finish(new Error('Video arama motoru başlatılamadı. Uygulamayı yeniden aç.')));
        child.on('close', code => {
          if (settled) return;
          if (code !== 0) return finish(new Error(friendlyError(detail)));
          try { finish(null, normalizeResults(JSON.parse(output))); }
          catch { finish(new Error('Arama sonuçları okunamadı. Yeniden dene.')); }
        });
        timer = setTimeout(() => { stop(); finish(new Error('Arama uzun sürdü. İnternetini kontrol edip yeniden dene.')); }, 40000);
        timer.unref();
      } catch { finish(new Error('Video arama motoru başlatılamadı.')); }
    });
  }
}
module.exports = { VideoSearch, searchArgs, searchQuery, normalizeResults };
