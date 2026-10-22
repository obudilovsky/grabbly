// Mobile (Capacitor) implementation of the `window.api` bridge that the desktop app gets from Electron's preload.
// Same shape, so src/renderer.js runs unchanged on iOS and Android.
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';
import { Media } from '@capacitor-community/media';
import { InAppBrowser } from '@capgo/capacitor-inappbrowser';
import * as media from '../src/media';
import { ApiClient } from './ig';

const platform = Capacitor.getPlatform(); // 'ios' | 'android'
document.documentElement.classList.add('mobile', platform);
const ALBUM = 'Grabbly';
const IG = 'https://www.instagram.com/';
const COOKIE_KEY = 'ig-cookies';

const listeners = { entry: new Set(), progress: new Set() };
const emit = (ch, p) => listeners[ch].forEach((cb) => cb(p));
const subscribe = (ch) => (cb) => { listeners[ch].add(cb); return () => listeners[ch].delete(cb); };

async function loadCookies() {
  const { value } = await Preferences.get({ key: COOKIE_KEY });
  try { const c = JSON.parse(value); return c && c.sessionid ? c : null; } catch { return null; }
}

async function readWebviewCookies() {
  const c = await InAppBrowser.getCookies({ url: IG, includeHttpOnly: true });
  return c && c.sessionid ? { sessionid: c.sessionid, csrftoken: c.csrftoken || '', ds_user_id: c.ds_user_id || '' } : null;
}

function login() {
  return new Promise((resolve) => {
    let done = false;
    const handles = [];
    const finish = async (ok) => {
      if (done) return;
      done = true;
      handles.forEach((h) => h.remove());
      try { await InAppBrowser.close(); } catch { /* already closed */ }
      resolve(ok);
    };
    const check = async () => {
      const c = await readWebviewCookies().catch(() => null);
      if (c) { await Preferences.set({ key: COOKIE_KEY, value: JSON.stringify(c) }); setTimeout(() => finish(true), 800); }
    };
    (async () => {
      handles.push(await InAppBrowser.addListener('urlChangeEvent', check));
      handles.push(await InAppBrowser.addListener('browserPageLoaded', check));
      handles.push(await InAppBrowser.addListener('closeEvent', async () => finish(Boolean(await loadCookies()))));
      await InAppBrowser.openWebView({ url: `${IG}accounts/login/`, title: 'Log in to Instagram' });
    })().catch(() => finish(false));
  });
}

async function ensureAlbum() {
  const find = async () => {
    const { albums } = await Media.getAlbums();
    return albums.find((a) => a.name === ALBUM);
  };
  let album = await find();
  if (!album) { await Media.createAlbum({ name: ALBUM }); album = await find(); }
  return album && album.identifier;
}

const savedKey = 'saved-files';
async function savedSet() {
  const { value } = await Preferences.get({ key: savedKey });
  try { return new Set(JSON.parse(value) || []); } catch { return new Set(); }
}

let listCtl = null;
let dlCtl = null;

window.api = {
  chooseDir: async () => { // media goes to the photo library, there is no folder to pick
    const m = document.getElementById('msg');
    if (m) { m.className = 'msg'; m.textContent = 'Saved to the "Grabbly" album in your Photos.'; }
    return null;
  },
  openDir: async () => {},
  defaultDir: async () => `Photos · ${ALBUM} album`,
  loginStatus: async () => Boolean(await loadCookies()),
  login,
  logout: async () => {
    await Preferences.remove({ key: COOKIE_KEY });
    try { await InAppBrowser.clearAllCookies(); } catch { /* none to clear */ }
    return true;
  },
  cancelList: async () => { if (listCtl) listCtl.cancelled = true; },
  list: async ({ url, limit, source }) => {
    const target = media.parseUrl(url);
    if (!target) throw new Error('Enter a valid Instagram username.');
    const cookies = await loadCookies();
    if (!cookies) throw new Error('Not logged in. Tap "Log in to Instagram" first.');
    const api = new ApiClient();
    const ctl = (listCtl = { cancelled: false });
    let n = 0;
    const onEntry = (e) => { n++; emit('entry', e); };
    try {
      const wantStories = target.type === 'stories' || (target.type === 'profile' && (source === 'stories' || source === 'all'));
      const wantGrid = target.type === 'profile' && source !== 'stories';
      if (target.type === 'post') onEntry(media.entryFromItem(await api.mediaInfo(target.code)));
      let firstCode = null;
      if (wantGrid) {
        const only = source === 'reels' ? 'reel' : source === 'posts' ? 'post' : undefined;
        firstCode = (await api.scrapeProfile({ username: target.username, limit: limit || 30, onEntry, only, isCancelled: () => ctl.cancelled })).firstCode;
      }
      if (wantStories && !ctl.cancelled) {
        try {
          if (!firstCode && target.type === 'profile') {
            firstCode = await api.scrapeProfile({ username: target.username, limit: 1, onEntry: () => {}, isCancelled: () => false }).then((r) => r.firstCode).catch((e) => { if (/does not exist/.test(e.message)) throw e; return null; });
          }
          const stories = await api.stories(target.username, firstCode);
          const picked = target.storyId ? stories.filter((s) => s.id === `story_${target.storyId}`) : stories;
          picked.slice(0, 100).forEach(onEntry);
          if (!picked.length && source !== 'all') throw new Error('No active stories (they disappear after 24 hours).');
        } catch (e) {
          if (source !== 'all') throw e;
        }
      }
    } catch (e) {
      if (!ctl.cancelled) throw e;
    } finally {
      await api.close();
    }
    return { count: n, cancelled: ctl.cancelled };
  },
  download: async ({ items, concurrency, mediaFilter }) => {
    const api = new ApiClient();
    const ctl = (dlCtl = { cancelled: false });
    const albumId = await ensureAlbum();
    const saved = await savedSet();
    const queue = [...items];
    const retried = new Set();
    const report = (id, status, percent, error, counts) => emit('progress', { id, status, percent, error, counts });

    const worker = async () => {
      while (queue.length && !ctl.cancelled) {
        const item = queue.shift();
        try {
          report(item.id, 'downloading', 0);
          let entry = item;
          if (!item.files) {
            const page = new ApiClient(); // own hidden page per post, so parallel workers do not navigate each other away
            try { entry = media.entryFromItem(await page.mediaFromPage(item.code), { username: item.username }); } finally { await page.close(); }
          }
          const files = media.filterFiles(entry.files, mediaFilter);
          if (!files.length) { report(item.id, 'skipped', 100); continue; }
          for (let i = 0; i < files.length; i++) {
            const name = media.fileName(entry, files[i], entry.files.length);
            if (saved.has(name)) continue; // already in the album from an earlier run
            const tmp = `grabbly_${name}`; // flat: downloadFile does not create missing folders
            const { path } = await Filesystem.downloadFile({ url: files[i].url, path: tmp, directory: Directory.Cache, recursive: true });
            const opts = { path, albumIdentifier: albumId, fileName: name.replace(/\.[^.]+$/, '') };
            if (files[i].type === 'video') await Media.saveVideo(opts); else await Media.savePhoto(opts);
            await Filesystem.deleteFile({ path: tmp, directory: Directory.Cache }).catch(() => {});
            saved.add(name);
            await Preferences.set({ key: savedKey, value: JSON.stringify([...saved]) });
            report(item.id, 'downloading', ((i + 1) / files.length) * 100);
          }
          const counts = { photos: files.filter((f) => f.type === 'photo').length, videos: files.filter((f) => f.type === 'video').length };
          report(item.id, 'done', 100, undefined, counts);
        } catch (e) {
          if (!ctl.cancelled && !retried.has(item.id)) { retried.add(item.id); queue.push(item); continue; } // one automatic retry
          report(item.id, ctl.cancelled ? 'cancelled' : 'error', undefined, e.message || String(e));
        }
      }
    };
    try {
      await Promise.all(Array.from({ length: Math.min(concurrency || 3, items.length) }, worker));
    } finally {
      await api.close();
    }
    for (const item of queue) report(item.id, 'cancelled');
    return true;
  },
  cancel: async () => { if (dlCtl) dlCtl.cancelled = true; },
  onEntry: subscribe('entry'),
  onProgress: subscribe('progress'),
};
