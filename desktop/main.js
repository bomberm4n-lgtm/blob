// Blob Desktop: abre o servidor Blob numa janela e libera microfone, notificações e captura de tela/áudio do PC.
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
// Sem HTTPS o Chromium bloqueia microfone/tela; o servidor do Blob é tratado como seguro.
if (serverUrl) app.commandLine.appendSwitch('unsafely-treat-insecure-origin-as-secure', serverUrl);
app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling');
// RestrictOwnAudio: permite capturar o som do PC SEM o som do próprio Blob (vozes da call não vão pra transmissão).
app.commandLine.appendSwitch('enable-features', 'WebRtcAllowInputVolumeAdjustment,RestrictOwnAudio');

let win;
let pendingSource = null; // { id, audio }

function createWindow() {
  win = new BrowserWindow({
    width: 1400, height: 860, minWidth: 940, minHeight: 560,
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

  const showConnect = (error) => win.loadFile(path.join(__dirname, 'connect.html'), { query: { error: error || '', server: serverUrl } });
  if (serverUrl) {
    win.loadFile(path.join(__dirname, 'connect.html'), { query: { loading: '1', server: serverUrl } });
    // Testa o servidor antes de abrir, pra nunca ficar numa tela preta.
    const tryServer = async () => {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 10000);
        await fetch(serverUrl + '/api/bootstrap', { signal: ctrl.signal });
        clearTimeout(t);
        win.loadURL(serverUrl);
      } catch {
        showConnect(`O servidor ${serverUrl.replace(/^https?:\/\//, '')} não respondeu. Confira: 1) a Tailscale está ligada e você aceitou o convite; 2) o servidor do Blob está aberto no PC do dono; 3) o firewall do servidor foi liberado.`);
      }
    };
    tryServer();
  } else showConnect();

  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    if (code === -3 || url.startsWith('file:')) return; // abortado / página local
    showConnect(`Não consegui conectar em ${url} (${desc})`);
  });

  // Links externos abrem no navegador
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

  // Captura de tela: usa a fonte que o usuário escolheu no seletor do Blob.
  ses.setDisplayMediaRequestHandler(async (_req, callback) => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
      const chosen = sources.find((s) => s.id === pendingSource?.id) || sources.find((s) => s.id.startsWith('screen'));
      if (!chosen) return callback({});
      // 'loopbackWithoutChrome' = todo o som do PC, menos o que o próprio Blob toca (vozes, soundboard).
      // No Windows, testado: som de outros programas entra e o do Blob fica de fora.
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

// ---------- Atualização automática (GitHub Releases) ----------
function checkUpdates() {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('error', (e) => console.warn('[update]', e?.message));
  autoUpdater.on('update-downloaded', async (info) => {
    // Se a pessoa não está numa call, atualiza na hora; se está, pergunta.
    let inCall = false;
    try { inCall = await win?.webContents.executeJavaScript('!!window.__blobVoice?.channelId'); } catch { /* página local */ }
    if (!inCall) return autoUpdater.quitAndInstall(true, true);
    const r = await dialog.showMessageBox(win, {
      type: 'info', buttons: ['Reiniciar e atualizar', 'Depois'], defaultId: 0, cancelId: 1,
      title: 'Atualização do Blob', message: `Blob ${info.version} baixado!`,
      detail: 'Reiniciar agora para atualizar? (Se escolher "Depois", atualiza quando você fechar o Blob.)',
    });
    if (r.response === 0) autoUpdater.quitAndInstall(true, true);
  });
  autoUpdater.checkForUpdates().catch(() => {});
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 30 * 60 * 1000);
}

app.on('window-all-closed', () => app.quit());
