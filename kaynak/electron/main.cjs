const { app, BrowserWindow, ipcMain, shell, clipboard, Tray, Menu, nativeImage, dialog, nativeTheme, Notification } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { DownloadManager, contained, ACTIVE } = require('./downloads.cjs');
const { SettingsStore } = require('./settings.cjs');
const { VideoSearch } = require('./search.cjs');
const { checkUpdate, PAGE } = require('./updates.cjs');

const testDir = process.argv.find(arg => arg.startsWith('--kty-test-dir='))?.slice(15);
const testUrl = process.argv.find(arg => arg.startsWith('--kty-test-url='))?.slice(15);
if (testDir) app.disableHardwareAcceleration();
const portable = process.env.PORTABLE_EXECUTABLE_DIR;
const base = testDir || portable || path.resolve(__dirname, '../..');
const installed = app.isPackaged && !portable && !testDir;
const dataDir = installed ? path.join(app.getPath('appData'), 'Kutarya Video') : path.join(base, 'Veriler');
const defaultDownloadDir = installed ? path.join(app.getPath('downloads'), 'Kutarya Video', 'Videolar') : path.join(base, 'Videolar');
fs.mkdirSync(dataDir, { recursive: true });
app.setPath('userData', path.join(dataDir, 'Profil'));
app.setAppUserModelId('com.kutarya.video');
const uiFile = path.join(__dirname, '../ui/index.html');
let win, manager, settings, search, tray, quitting = false;
let update = { status: 'checking' }, updateTask = null, updateNotified = false;
const errors = [];
function snapshot() {
  return { ...manager.snapshot(), theme: settings.value.theme, resolvedTheme: settings.value.theme === 'system' ? (nativeTheme.shouldUseDarkColors ? 'dark' : 'light') : settings.value.theme, directoryWarning: settings.warning, update };
}
function broadcast() { if (win && !win.isDestroyed()) win.webContents.send('changed', snapshot()); }
function applyTheme() {
  nativeTheme.themeSource = ['dark', 'system'].includes(settings.value.theme) ? settings.value.theme : 'light';
  win?.setBackgroundColor(snapshot().resolvedTheme === 'dark' ? '#111421' : '#f6f8fe');
  broadcast();
}
async function checkForUpdate() {
  if (updateTask) return updateTask;
  update = { status: 'checking' }; broadcast();
  updateTask = (async () => {
    update = await checkUpdate(app.getVersion()); broadcast();
    if (!testDir && update.status === 'available' && !updateNotified) {
      updateNotified = true;
      try { if (Notification.isSupported()) {
        const notification = new Notification({ title: 'Kutarya Video güncellemesi hazır', body: `${update.version} sürümü yayımlandı. Yeni sürümü kutarya.com üzerinden indirebilirsin.`, icon: path.join(__dirname, '../ui/icon.png') });
        notification.on('click', () => { void shell.openExternal(PAGE); });
        notification.show();
      } } catch { /* Windows bildirimi kullanılamasa da uygulama içi bildirim görünür. */ }
    }
    return update;
  })();
  try { return await updateTask; } finally { updateTask = null; }
}

if (!testDir && !app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { win?.show(); win?.focus(); void checkForUpdate(); });
  app.whenReady().then(async () => {
    const vendorDir = app.isPackaged ? path.join(process.resourcesPath, 'vendor') : path.join(__dirname, '../vendor');
    settings = new SettingsStore(dataDir, defaultDownloadDir);
    manager = new DownloadManager({ vendorDir, dataDir, defaultDownloadDir, downloadDir: settings.value.downloadDir, version: app.getVersion() });
    search = new VideoSearch({ vendorDir, executable: () => manager.executable });
    manager.on('engine-warning', message => fs.appendFileSync(path.join(dataDir, 'motor.log'), `${new Date().toISOString()} ${message}\n`));
    win = new BrowserWindow({
      width: 1100, height: 820, minWidth: 760, minHeight: 620,
      frame: false, backgroundColor: '#f6f8fe', show: !testDir, icon: path.join(__dirname, '../ui/icon.png'),
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, devTools: !!testDir, offscreen: !!testDir, backgroundThrottling: false },
    });
    win.webContents.on('console-message', details => { if (details.level === 'error') errors.push(details.message); });
    win.webContents.on('render-process-gone', (_event, detail) => errors.push(`Renderer: ${detail.reason}`));
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (event, url) => { if (url !== pathToFileURL(uiFile).href) event.preventDefault(); });
    const allowed = event => event.sender.id === win.webContents.id && event.senderFrame?.url === pathToFileURL(uiFile).href;
    const handle = (name, action) => ipcMain.handle(name, async (event, ...args) => {
      if (!allowed(event)) return { ok: false, error: 'Bu işlem kullanılamıyor.' };
      try { return { ok: true, value: await action(...args) }; }
      catch (error) { return { ok: false, error: error.message, code: error.code }; }
    });
    const getFile = id => {
      const job = manager.jobs.find(item => item.id === id);
      if (!job || job.status !== 'completed' || !job.file || !/\.mp4$/i.test(job.file) || !contained(job.downloadDir, job.file) || !fs.existsSync(job.file) || !contained(fs.realpathSync(job.downloadDir), fs.realpathSync(job.file))) throw new Error('Video dosyası taşınmış veya silinmiş. Videoyu yeniden indir.');
      return job.file;
    };
    handle('state', snapshot);
    handle('add', text => manager.enqueue(text));
    handle('search', text => search.search(text));
    handle('search-cancel', () => search.cancel());
    handle('paste', () => clipboard.readText());
    handle('cancel', id => manager.cancel(id));
    handle('retry', id => manager.retry(id));
    handle('clear', () => manager.clearHistory());
    handle('remove-history', id => manager.removeHistory(id));
    handle('choose-folder', async () => {
      const result = await dialog.showOpenDialog(win, { title: 'Videoların kaydedileceği klasörü seç', defaultPath: settings.value.downloadDir, properties: ['openDirectory', 'createDirectory', 'dontAddToRecent'] });
      if (result.canceled || !result.filePaths[0]) return { cancelled: true };
      const directory = settings.setDirectory(result.filePaths[0]);
      manager.setDirectory(directory); return { directory };
    });
    handle('theme', theme => { settings.setTheme(theme); applyTheme(); return snapshot(); });
    handle('check-update', checkForUpdate);
    handle('website', () => shell.openExternal(PAGE));
    handle('folder', async () => { const error = await shell.openPath(manager.options.downloadDir); if (error) throw new Error('Kayıt klasörü açılamadı. Klasörün hâlâ bulunduğunu kontrol et.'); });
    handle('open', async id => { const error = await shell.openPath(getFile(id)); if (error) throw new Error('Video açılamadı. MP4 destekleyen bir oynatıcı kullan.'); });
    handle('reveal', id => shell.showItemInFolder(getFile(id)));
    for (const [name, action] of [['minimize', () => win.minimize()], ['maximize', () => win.isMaximized() ? win.unmaximize() : win.maximize()], ['close', () => win.close()]]) ipcMain.on(name, event => { if (allowed(event)) action(); });
    manager.on('change', broadcast);
    nativeTheme.on('updated', broadcast);
    applyTheme();
    win.on('close', event => {
      if (!quitting && !testDir && manager.jobs.some(job => ACTIVE.has(job.status))) { event.preventDefault(); win.hide(); }
    });
    if (!testDir) {
      tray = new Tray(nativeImage.createFromPath(path.join(__dirname, '../ui/icon.png')).resize({ width: 20, height: 20 }));
      tray.setToolTip('Kutarya Video');
      tray.setContextMenu(Menu.buildFromTemplate([
        { label: 'Kutarya Video’yu aç', click: () => { win.show(); win.focus(); } },
        { label: 'Kayıt klasörünü aç', click: () => shell.openPath(manager.options.downloadDir) },
        { type: 'separator' }, { label: 'Çıkış', click: () => app.quit() },
      ]));
      tray.on('double-click', () => { win.show(); win.focus(); });
    }
    await win.loadFile(uiFile);
    if (testDir) {
      await require('./acceptance.cjs').run({ app, win, manager, settings, search, testDir, testUrl, vendorDir, dataDir, defaultDownloadDir, errors, snapshot, broadcast, checkForUpdate, setUpdate: value => { update = value; broadcast(); }, dialog, getFile });
      quitting = true;
    } else { manager.pump(); void manager.updateEngine(); void checkForUpdate(); }
  }).catch(error => {
    if (testDir) { fs.mkdirSync(testDir, { recursive: true }); fs.writeFileSync(path.join(testDir, 'failure.txt'), error.stack); }
    else dialog.showErrorBox('Kutarya Video', `Uygulama başlatılamadı: ${error.message}`);
    app.exit(1);
  });
}
app.on('window-all-closed', () => { if (!testDir) app.quit(); });
app.on('before-quit', event => {
  if (quitting) return;
  quitting = true; search?.cancel();
  if (manager?.running) { event.preventDefault(); manager.shutdown().finally(() => app.quit()); }
});
