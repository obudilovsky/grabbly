// Instagram web-API client. Requests run *inside* a hidden logged-in page (same origin, real cookies and
// headers), which is what makes them work; plain Node requests get blocked.
const { BrowserWindow } = require('electron');
const { shortcodeToId, entryFromItem } = require('./media');

const APP_ID = '936619743392459';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class ApiClient {
  constructor(session) {
    this.session = session;
    this.win = null;
    this.last = 0;
  }

  async open(url = 'https://www.instagram.com/') {
    if (!this.win) {
      this.win = new BrowserWindow({ show: false, width: 1280, height: 1000, webPreferences: { session: this.session, backgroundThrottling: false } });
    }
    await this.win.loadURL(url);
    if (/\/accounts\/login/.test(this.win.webContents.getURL())) throw new Error('Not logged in. Click "Log in to Instagram" first.');
    return this.win;
  }

  close() {
    if (this.win && !this.win.isDestroyed()) this.win.destroy();
    this.win = null;
  }

  // GET a JSON endpoint, at most ~2 requests per second.
  async get(pathAndQuery) {
    if (!this.win) await this.open();
    const wait = this.last + 500 - Date.now();
    if (wait > 0) await sleep(wait);
    this.last = Date.now();
    const res = await this.win.webContents.executeJavaScript(`(async () => {
      const csrf = (document.cookie.match(/csrftoken=([^;]+)/) || [])[1] || '';
      const r = await fetch(${JSON.stringify(pathAndQuery)}, { credentials: 'include', headers: { 'x-ig-app-id': '${APP_ID}', 'x-csrftoken': csrf, 'x-requested-with': 'XMLHttpRequest', 'x-asbd-id': '129477' } });
      const t = await r.text();
      let json = null; try { json = JSON.parse(t); } catch {}
      return { status: r.status, json };
    })()`);
    if (res.status === 429) throw new Error('Instagram rate limit hit. Wait a few minutes and try again.');
    if (!res.json) throw new Error('Instagram answered with a login page instead of data. Log out and log in again.');
    if (res.status >= 400) throw new Error(`Instagram returned HTTP ${res.status}`);
    return res.json;
  }

  // Reads the media item embedded in the post page (own hidden window); falls back to the API call.
  async mediaFromPage(code) {
    const { postJson } = require('./scraper');
    const w = new BrowserWindow({ show: false, width: 1280, height: 1000, webPreferences: { session: this.session, backgroundThrottling: false } });
    try {
      await w.loadURL(`https://www.instagram.com/p/${code}/`);
      for (let i = 0; i < 8; i++) {
        const item = await w.webContents.executeJavaScript(postJson(code));
        if (item) return item;
        await sleep(1000);
      }
    } catch { /* fall back below */ } finally {
      if (!w.isDestroyed()) w.destroy();
    }
    return this.mediaInfo(code);
  }

  async mediaInfo(code) {
    const j = await this.get(`/api/v1/media/${shortcodeToId(code)}/info/`);
    if (!j.items || !j.items.length) throw new Error('Post not found or not accessible');
    return j.items[0];
  }

  async userId(username, hintCode) {
    try {
      const j = await this.get(`/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`);
      if (j.data && j.data.user && j.data.user.id) return j.data.user.id;
    } catch { /* fall through to the post-based lookup */ }
    if (hintCode) return String((await this.mediaInfo(hintCode)).user.pk);
    throw new Error(`Could not find user "${username}"`);
  }

  async stories(username, hintCode) {
    const id = await this.userId(username, hintCode);
    const j = await this.get(`/api/v1/feed/reels_media/?reel_ids=${id}`);
    const reel = (j.reels_media && j.reels_media[0]) || (j.reels && j.reels[id]);
    return ((reel && reel.items) || []).map((it) => entryFromItem(it, { username, story: true }));
  }
}

module.exports = { ApiClient };
