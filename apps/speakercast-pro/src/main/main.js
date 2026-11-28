import { app, BrowserWindow, protocol, net, session, desktopCapturer, ipcMain, powerSaveBlocker, systemPreferences, shell } from 'electron';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const rendererRoot = path.resolve(here, '..', 'renderer');

// Audio must never be starved because the window is hidden or the Mac thinks
// the app is idle. These keep the renderer's timers (drift control, meters)
// and audio threads at full priority.
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
// Playback starts from the app's own Play button; never block it.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

let blockerId = null;

function serveRenderer() {
  protocol.handle('app', async (request) => {
    const { pathname } = new URL(request.url);
    const file = path.resolve(rendererRoot, '.' + decodeURIComponent(pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(rendererRoot + path.sep)) return new Response('Not found', { status: 404 });
    const res = await net.fetch(pathToFileURL(file).toString());
    const headers = new Headers(res.headers);
    // Cross-origin isolation: enables SharedArrayBuffer and high-resolution
    // timers for the audio engine.
    headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
    headers.set('Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob: mediastream:; connect-src 'self' blob:; font-src 'self'");
    return new Response(res.body, { status: res.status, headers });
  });
}

function permissions() {
  const allowed = new Set(['media', 'speaker-selection', 'display-capture']);
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(allowed.has(permission)));
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => allowed.has(permission));
  // "System audio" source: capture what the Mac is playing (macOS 13+ via
  // ScreenCaptureKit loopback). Video is required by the API and dropped at once.
  session.defaultSession.setDisplayMediaRequestHandler(async (_req, cb) => {
    try {
      const [screen] = await desktopCapturer.getSources({ types: ['screen'] });
      cb(screen ? { video: screen, audio: 'loopback' } : {});
    } catch {
      cb({});
    }
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 980,
    minHeight: 640,
    title: 'SpeakerCast Pro',
    backgroundColor: '#0B0D10',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 18, y: 20 },
    webPreferences: {
      preload: path.join(here, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.loadURL('app://speakercast/index.html');
}

ipcMain.handle('power:playing', (_e, playing) => {
  if (playing && blockerId == null) blockerId = powerSaveBlocker.start('prevent-app-suspension');
  if (!playing && blockerId != null) { powerSaveBlocker.stop(blockerId); blockerId = null; }
  return true;
});

ipcMain.handle('mic:ask', async () => {
  if (process.platform !== 'darwin') return true;
  if (systemPreferences.getMediaAccessStatus('microphone') === 'granted') return true;
  return systemPreferences.askForMediaAccess('microphone');
});

ipcMain.handle('app:info', () => ({ version: app.getVersion(), platform: process.platform }));

app.whenReady().then(() => {
  serveRenderer();
  permissions();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
