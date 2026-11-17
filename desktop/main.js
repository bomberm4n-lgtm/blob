// Blob Desktop: opens the Blob server in a window and enables microphone, notifications and screen/PC audio capture.
const { app, BrowserWindow, ipcMain, desktopCapturer, session, shell, Menu, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('node:path');
const fs = require('node:fs');

const cfgPath = path.join(app.getPath('userData'), 'blob-config.json');
const readCfg = () => { try { return JSON.parse(fs.readFileSync(cfgPath, 'utf8')); } catch { return {}; } };
const writeCfg = (c) => fs.writeFileSync(cfgPath, JSON.stringify(c, null, 2));
const cfg = readCfg();

function normalize(url) {
  url = String(url || '').trim();
  if (!url) return '';
  if (!/^https?:\/\//.test(url)) url = 'http://' + url;
  try {
    const u = new URL(url);
    if (!u.port && u.protocol === 'http:') u.port = '3000';
    return u.origin;
  } catch { return ''; }
}

const serverUrl = normalize(cfg.server);
// Without HTTPS Chromium blocks mic/screen access; the Blob server is treated as secure.
if (serverUrl) app.commandLine.appendSwitch('unsafely-treat-insecure-origin-as-secure', serverUrl);
app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling');
// RestrictOwnAudio: capture PC audio WITHOUT Blob's own audio (call voices don't leak into the stream).
app.commandLine.appendSwitch('enable-features', 'WebRtcAllowInputVolumeAdjustment,RestrictOwnAudio');

let win;
let pendingSource = null; // { id, audio }

function createWindow() {
  win = new BrowserWindow({
    width: 1400, height: 860, minWidth: 940, minHeight: 560,
    show: false, // shown maximized once ready (below)
    backgroundColor: '#18191c',
    title: 'Blob',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      backgroundThrottling: false,
    },
  });
  Menu.setApplicationMenu(null);
  // Open maximized so the intro and the app use the whole screen.
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  setTimeout(() => { if (win && !win.isVisible()) { win.maximize(); win.show(); } }, 3000);

  const showConnect = (error) => win.loadFile(path.join(__dirname, 'connect.html'), { query: { error: error || '', server: serverUrl } });
  if (serverUrl) {
    win.loadFile(path.join(__dirname, 'connect.html'), { query: { loading: '1', server: serverUrl } });
    // Probe the server before loading it, so we never sit on a black screen.
    const tryServer = async () => {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 10000);
        await fetch(serverUrl + '/api/bootstrap', { signal: ctrl.signal });
        clearTimeout(t);
        win.loadURL(serverUrl);
      } catch {
        showConnect(`The server ${serverUrl.replace(/^https?:\/\//, '')} did not respond. Check that: 1) Tailscale is on and you accepted the invite; 2) the Blob server is running on the owner's PC; 3) the server's firewall is open.`);
      }
    };
    tryServer();
  } else showConnect();

  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    if (code === -3 || url.startsWith('file:')) return; // aborted / local page
    showConnect(`Could not connect to ${url} (${desc})`);
  });

  // External links open in the browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(serverUrl)) shell.openExternal(url);
    return { action: url.startsWith(serverUrl) ? 'allow' : 'deny' };
  });

  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') win.webContents.toggleDevTools();
    if (input.type === 'keyDown' && input.key === 'F5') win.webContents.reload();
  });
}

app.whenReady().then(() => {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((_wc, permission, cb) => {
    cb(['media', 'notifications', 'fullscreen', 'clipboard-read', 'clipboard-sanitized-write', 'display-capture', 'speaker-selection'].includes(permission));
  });
  ses.setPermissionCheckHandler(() => true);

  // Screen capture: use the source the user picked in Blob's picker.
  ses.setDisplayMediaRequestHandler(async (_req, callback) => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
      const chosen = sources.find((s) => s.id === pendingSource?.id) || sources.find((s) => s.id.startsWith('screen'));
      if (!chosen) return callback({});
      // 'loopbackWithoutChrome' = all PC audio except what Blob itself plays (voices, soundboard).
      // Tested on Windows: other apps' audio is captured, Blob's own audio is excluded.
      const audio = process.platform === 'win32' ? 'loopbackWithoutChrome' : 'loopback';
      callback(pendingSource?.audio ? { video: chosen, audio } : { video: chosen });
    } catch (e) {
      console.error(e);
      callback({});
    }
  }, { useSystemPicker: false });

  ipcMain.handle('blob:get-sources', async () => {
    const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 384, height: 216 }, fetchWindowIcons: true });
    return sources
      .filter((s) => !s.name.startsWith('Blob'))
      .map((s) => ({ id: s.id, name: s.name, thumbnail: s.thumbnail.toDataURL(), appIcon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : null }));
  });
  ipcMain.handle('blob:select-source', (_e, id, audio) => { pendingSource = { id, audio }; return true; });
  ipcMain.handle('blob:get-server', () => serverUrl);
  ipcMain.handle('blob:set-server', (_e, url) => {
    const n = normalize(url);
    if (!n) return false;
    writeCfg({ ...readCfg(), server: n });
    app.relaunch();
    app.exit(0);
    return true;
  });

  createWindow();
  checkUpdates();
});

// ---------- Auto-update (GitHub Releases) ----------
function checkUpdates() {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('error', (e) => console.warn('[update]', e?.message));
  autoUpdater.on('update-downloaded', async (info) => {
    // Not in a call: update right away. In a call: ask first.
    let inCall = false;
    try { inCall = await win?.webContents.executeJavaScript('!!window.__blobVoice?.channelId'); } catch { /* local page */ }
    if (!inCall) return autoUpdater.quitAndInstall(true, true);
    const r = await dialog.showMessageBox(win, {
      type: 'info', buttons: ['Restart and update', 'Later'], defaultId: 0, cancelId: 1,
      title: 'Blob update', message: `Blob ${info.version} downloaded!`,
      detail: 'Restart now to update? (If you choose "Later", it updates when you close Blob.)',
    });
    if (r.response === 0) autoUpdater.quitAndInstall(true, true);
  });
  autoUpdater.checkForUpdates().catch(() => {});
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 30 * 60 * 1000);
}

app.on('window-all-closed', () => app.quit());
