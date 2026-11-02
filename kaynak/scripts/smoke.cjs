const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..'), mode = process.argv.includes('--portable') ? 'portable' : process.argv.includes('--unpacked') ? 'unpacked' : 'development';
const testDir = path.join(root, 'Kanitlar', `${mode}-${Date.now()}`); fs.mkdirSync(testDir, { recursive: true });
const shared = 'D:/KutaryaJenerikYeni/kaynak/node_modules/electron/dist/electron.exe';
const developmentExe = fs.existsSync(path.resolve('node_modules/electron/dist/electron.exe')) ? path.resolve('node_modules/electron/dist/electron.exe') : shared;
const version = require('../package.json').version;
const exe = mode === 'portable' ? path.join(root, `Paketler/Kutarya-Video-Portable-${version}.exe`) : mode === 'unpacked' ? path.join(root, 'Paketler/win-unpacked/KutaryaVideo.exe') : developmentExe;
const args = [...(mode === 'development' ? ['.'] : []), `--kty-test-dir=${testDir}`];
if (process.argv.includes('--real')) args.push('--kty-test-url=https://www.youtube.com/watch?v=YE7VzlLtp-4');
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(exe, args, { cwd: path.resolve(__dirname, '..'), windowsHide: true, stdio: 'ignore', env, shell: false });
const watchdog = setTimeout(() => { child.kill(); console.error('Kabul 7 dakika içinde bitmedi.'); }, 420000);
child.on('error', error => { clearTimeout(watchdog); console.error(error.message); process.exitCode = 1; });
child.on('exit', code => {
  clearTimeout(watchdog);
  try { const report = JSON.parse(fs.readFileSync(path.join(testDir, 'kabul.json'), 'utf8')); console.log(JSON.stringify({ testDir, passed: report.passed, mode, checks: report.checks.length, download: report.download && { title: report.download.title, file: report.download.file, size: report.download.size }, media: report.media, failure: report.failure }, null, 2)); process.exitCode = report.passed ? 0 : 1; }
  catch { console.error(`Kabul raporu bulunamadı: ${testDir}; çıkış ${code}`); const fail = path.join(testDir, 'failure.txt'); if (fs.existsSync(fail)) console.error(fs.readFileSync(fail, 'utf8')); process.exitCode = 1; }
});
