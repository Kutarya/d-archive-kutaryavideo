const fs = require('node:fs');
const path = require('node:path');

const THEMES = new Set(['light', 'dark', 'vivid', 'system']);
function writableDirectory(directory) {
  if (typeof directory !== 'string' || !path.isAbsolute(directory)) throw new Error('Geçerli bir kayıt klasörü seç.');
  if (!fs.statSync(directory).isDirectory()) throw new Error('Kayıt yeri bir klasör olmalı.');
  fs.accessSync(directory, fs.constants.W_OK);
  return fs.realpathSync.native(directory);
}
class SettingsStore {
  constructor(dataDir, defaultDownloadDir) {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.mkdirSync(defaultDownloadDir, { recursive: true });
    this.file = path.join(dataDir, 'ayarlar.json');
    this.value = { theme: 'light', downloadDir: defaultDownloadDir };
    this.warning = '';
    try {
      const saved = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (THEMES.has(saved.theme)) this.value.theme = saved.theme;
      if (saved.downloadDir) {
        try { this.value.downloadDir = writableDirectory(saved.downloadDir); }
        catch { this.warning = 'Önceki kayıt klasörüne erişilemiyor. Varsayılan klasör seçildi; başka bir klasör seçebilirsin.'; }
      }
    } catch {}
  }
  save() {
    fs.writeFileSync(this.file + '.tmp', JSON.stringify(this.value, null, 2), 'utf8');
    fs.renameSync(this.file + '.tmp', this.file);
  }
  setTheme(theme) {
    if (!THEMES.has(theme)) throw new Error('Geçerli bir tema seç.');
    this.value.theme = theme; this.save();
    return { ...this.value };
  }
  setDirectory(directory) {
    this.value.downloadDir = writableDirectory(directory);
    this.warning = ''; this.save();
    return this.value.downloadDir;
  }
}
module.exports = { SettingsStore, THEMES, writableDirectory };
