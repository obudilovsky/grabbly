const { app, BrowserWindow, ipcMain, dialog, shell, session } = require('electron');
const fs = require('fs');
const path = require('path');
const media = require('./media');
const { ApiClient } = require('./api');
const { scrapeProfile } = require('./scraper');
const { downloadFile } = require('./downloader');

const igSession = () => {
  const ses = session.fromPartition('persist:instagram');
  ses.setUserAgent(ses.getUserAgent(), 'en-US,en;q=0.9'); // stable English UI labels for the scraper
  return ses;
};

async function isLoggedIn() {
  return (await igSession().cookies.get({ name: 'sessionid' })).length > 0;
}

let win;

function createWindow() {
  const mac = process.platform === 'darwin';
  const icon = path.join(__dirname, '..', 'build', 'icon.png');
  win = new BrowserWindow({
    width: 1180, height: 800, minWidth: 820, minHeight: 560,
    title: 'Grabbly',
    backgroundColor: '#0e0f13',
    icon,
    ...(mac ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 18, y: 18 } } : {}),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  win.loadFile(path.join(__dirname, 'index.html'), { query: { platform: process.platform } });
  if (mac && app.dock && !app.isPackaged) app.dock.setIcon(icon);
}

const send = (ch, payload) => win && !win.isDestroyed() && win.webContents.send(ch, payload);

ipcMain.handle('choose-dir', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('open-dir', (_e, dir) => { fs.mkdirSync(dir, { recursive: true }); return shell.openPath(dir); });
ipcMain.handle('default-dir', () => path.join(app.getPath('downloads'), 'Grabbly'));

ipcMain.handle('login-status', isLoggedIn);

ipcMain.handle('login', () => new Promise((resolve) => {
  const ses = igSession();
  const w = new BrowserWindow({ width: 480, height: 760, title: 'Log in to Instagram', parent: win, modal: true, webPreferences: { session: ses } });
  const closeSoon = () => setTimeout(() => { if (!w.isDestroyed()) w.close(); }, 1500); // let the remaining cookies flush
  // Close the window by itself as soon as Instagram sets the session cookie (i.e. login succeeded).
  const onCookie = (_e, cookie, _cause, removed) => {
    if (cookie.name === 'sessionid' && !removed && cookie.domain.includes('instagram.com')) closeSoon();
  };
  ses.cookies.on('changed', onCookie);
  // Fallback: after any in-page navigation, close if the session exists already.
  const onNav = async () => { if (await isLoggedIn()) closeSoon(); };
  w.webContents.on('did-navigate', onNav);
  w.webContents.on('did-navigate-in-page', onNav);
  w.loadURL('https://www.instagram.com/accounts/login/');
  w.on('closed', async () => {
    ses.cookies.removeListener('changed', onCookie);
    if (win && !win.isDestroyed()) win.focus();
    resolve(await isLoggedIn());
  });
}));

ipcMain.handle('logout', async () => {
  await igSession().clearStorageData();
  return true;
});

let listCtl = null; // {cancelled}

ipcMain.handle('list', async (_e, { url, limit, source }) => {
  const target = media.parseUrl(url);
  if (!target) throw new Error('Enter a valid Instagram username.');
  if (!(await isLoggedIn())) throw new Error('Not logged in. Click "Log in to Instagram" first.');
  const api = new ApiClient(igSession());
  const ctl = (listCtl = { cancelled: false });
  let n = 0;
  const onEntry = (entry) => { n++; send('entry', entry); };
  try {
    const wantStories = target.type === 'stories' || (target.type === 'profile' && (source === 'stories' || source === 'all'));
    const wantGrid = target.type === 'profile' && source !== 'stories';
    if (target.type === 'post') {
      onEntry(media.entryFromItem(await api.mediaInfo(target.code)));
    }
    let firstCode = null;
    if (wantGrid) {
      const only = source === 'reels' ? 'reel' : source === 'posts' ? 'post' : undefined;
      firstCode = (await scrapeProfile({ api, username: target.username, limit: limit || 30, onEntry, only, isCancelled: () => ctl.cancelled })).firstCode;
    }
    if (wantStories && !ctl.cancelled) {
      try {
        // fallback for the user-id lookup: any post of the profile
        if (!firstCode && target.type === 'profile') {
          firstCode = await scrapeProfile({ api, username: target.username, limit: 1, onEntry: () => {} }).then((r) => r.firstCode).catch((e) => { if (/does not exist/.test(e.message)) throw e; return null; });
        }
        const stories = await api.stories(target.username, firstCode);
        const only = target.storyId ? stories.filter((s) => s.id === `story_${target.storyId}`) : stories;
        only.slice(0, 100).forEach(onEntry);
        if (!only.length && source !== 'all') throw new Error('No active stories (they disappear after 24 hours).');
      } catch (e) {
        if (source !== 'all') throw e; // in "All" a missing story reel must not fail the whole load
      }
    }
  } catch (e) {
    if (!ctl.cancelled) throw e;
  } finally {
    api.close();
  }
  return { count: n, cancelled: ctl.cancelled };
});

ipcMain.handle('cancel-list', () => { if (listCtl) listCtl.cancelled = true; });

let dlCtl = null; // {abort}

ipcMain.handle('download', async (_e, { items, dir, concurrency, mediaFilter }) => {
  fs.mkdirSync(dir, { recursive: true });
  const ctl = (dlCtl = { abort: new AbortController() });
  const api = new ApiClient(igSession());
  const queue = [...items];
  const cancelled = () => ctl.abort.signal.aborted;
  const report = (id, status, percent, error, counts) => send('progress', { id, status, percent, error, counts });

  const worker = async () => {
    while (queue.length && !cancelled()) {
      const item = queue.shift();
      try {
        report(item.id, 'downloading', 0);
        // posts from the grid are resolved here (one API call each); stories/single posts arrive resolved
        const entry = item.files ? item : media.entryFromItem(await api.mediaFromPage(item.code), { username: item.username });
        const files = media.filterFiles(entry.files, mediaFilter);
        if (!files.length) { report(item.id, 'skipped', 100); continue; }
        for (let i = 0; i < files.length; i++) {
          const name = media.fileName(entry, files[i], entry.files.length);
          await downloadFile(files[i].url, path.join(dir, name), {
            signal: ctl.abort.signal,
            onProgress: (f) => report(item.id, 'downloading', ((i + f) / files.length) * 100),
          });
        }
        const counts = { photos: files.filter((f) => f.type === 'photo').length, videos: files.filter((f) => f.type === 'video').length };
        report(item.id, 'done', 100, undefined, counts);
      } catch (e) {
        report(item.id, cancelled() ? 'cancelled' : 'error', undefined, e.message);
      }
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(concurrency || 3, items.length) }, worker));
  } finally {
    api.close();
  }
  for (const item of queue) report(item.id, 'cancelled');
  return true;
});

ipcMain.handle('cancel', () => { if (dlCtl) dlCtl.abort.abort(); });

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
