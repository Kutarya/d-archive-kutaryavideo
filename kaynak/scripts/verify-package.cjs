const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const Module = require('node:module');
const { execFileSync } = require('node:child_process');
const modules = fs.existsSync(path.resolve('node_modules/@electron/asar')) ? path.resolve('node_modules') : 'D:/KutaryaJenerikYeni/kaynak/node_modules';
const asar = require(path.join(modules, '@electron/asar'));
const root = path.resolve(__dirname, '../..'), meta = require('../package.json');
const archive = path.join(root, 'Paketler/win-unpacked/resources/app.asar');
const hash = b => crypto.createHash('sha256').update(b).digest('hex').toUpperCase();
const sourceFiles = ['package.json', ...fs.readdirSync('electron').map(n => 'electron/' + n), ...fs.readdirSync('ui').map(n => 'ui/' + n)];
const files = [];
for (const name of sourceFiles) {
  const bytes = asar.extractFile(archive, name.replaceAll('/', path.sep));
  if (name === 'package.json') { const packed = JSON.parse(bytes); for (const key of ['name', 'version', 'main', 'license']) assert.equal(packed[key], meta[key]); }
  else assert(fs.readFileSync(name).equals(bytes), name + ': paket kaynağı güncel değil.');
  files.push({ name, sha256: hash(bytes) });
}
const vendorFiles = fs.readdirSync('vendor', { recursive: true }).filter(n => fs.statSync(path.join('vendor', n)).isFile()).map(n => {
  const input = fs.readFileSync(path.join('vendor', n)), packed = fs.readFileSync(path.join(root, 'Paketler/win-unpacked/resources/vendor', n)); assert(input.equals(packed), n); return { name: n.replaceAll('\\', '/'), bytes: input.length, sha256: hash(input) };
});
const baseline = asar.extractFile(path.join(root, 'Kurtarilan-1.0.0/resources/app.asar'), path.normalize('electron/downloads.cjs')).toString('utf8');
const original = new Module(path.join(root, 'Kurtarilan-1.0.0/downloads.cjs')); original.filename = path.join(root, 'Kurtarilan-1.0.0/downloads.cjs'); original.paths = module.paths; original._compile(baseline, original.filename);
const options = { vendorDir: path.join(root, 'kaynak/vendor'), downloadDir: path.join(root, 'Kanitlar/argv-check') }, job = { url: 'https://www.youtube.com/watch?v=YE7VzlLtp-4' };
assert.deepEqual(require('../electron/downloads.cjs').downloadArgs(job, options), original.exports.downloadArgs(job, options), 'İndirme motorunun 1.0 komut sözleşmesi değişmiş.');
const artifacts = ['installer', 'portable'].map(role => { const name = `Kutarya-Video-${role === 'installer' ? 'Setup' : 'Portable'}-${meta.version}.exe`, file = path.join(root, 'Paketler', name), bytes = fs.readFileSync(file); assert(bytes.length > 100000000 && bytes.subarray(0,2).toString() === 'MZ'); return { name, role, platform: 'windows', bytes: bytes.length, sha256: hash(bytes) }; });
const setupDir = path.join(root, 'Kanitlar/setup-payload-' + meta.version); fs.mkdirSync(setupDir, { recursive: true });
const seven = 'C:/Users/yunus/AppData/Local/electron-builder/Cache/7zip@1.0.0/7zip-win-x64-a34pt/bin/7za.exe';
execFileSync(seven, ['x', path.join(root, 'Paketler', artifacts[0].name), '-o' + setupDir, '-y', '-bso0', '-bsp0'], { windowsHide: true });
const payload = fs.readdirSync(path.join(root, 'Paketler/win-unpacked'), { recursive: true }).filter(n => fs.statSync(path.join(root, 'Paketler/win-unpacked', n)).isFile());
for (const name of payload) assert.equal(hash(fs.readFileSync(path.join(root, 'Paketler/win-unpacked', name))), hash(fs.readFileSync(path.join(setupDir, name))), 'Setup içeriği: ' + name);
const prior = JSON.parse(fs.readFileSync('D:/Kutarya/KutaryaWeb/artifacts/kutarya-video/paket-bilgisi-1.0.0.json', 'utf8'));
for (const f of prior.artifacts) assert.equal(hash(fs.readFileSync(path.join('D:/Kutarya/KutaryaWeb/artifacts/kutarya-video', f.name))), f.sha256, 'Eski yayımlanmış paket değişmiş.');
const report = { at: new Date().toISOString(), version: meta.version, passed: true, sourceFiles: files, vendorFiles, artifacts, setupPayloadFiles: payload.length, oldArtifactsPreserved: true, originalDownloadArgumentsUnchanged: true, installationTested: false, codeSigned: false };
fs.writeFileSync(path.join(root, 'Kanitlar/release-' + meta.version + '.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ passed: true, version: meta.version, sourceFiles: files.length, vendorFiles: vendorFiles.length, setupPayloadFiles: payload.length, artifacts }, null, 2));
