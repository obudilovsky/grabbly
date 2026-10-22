// Instagram client for the mobile apps. Everything runs inside a hidden, logged-in instagram.com webview, like the
// desktop app: the profile grid is read by scrolling the real page, and post details come from the web API.
import { InAppBrowser } from '@capgo/capacitor-inappbrowser';
import { shortcodeToId, entryFromItem } from '../src/media';
import { toEntry, EXTRACT, NOT_FOUND, notFound, postJson } from '../src/scraper';

const APP_ID = '936619743392459';
const IG = 'https://www.instagram.com/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Requests run *inside* a hidden, logged-in instagram.com webview (same origin, real cookies and headers), exactly like
// the desktop app. Instagram rejects the same calls from a plain native HTTP client (HTTP 429), so there is no shortcut.
export class ApiClient {
  constructor() {
    this.id = null;
    this.last = 0;
    this.seq = 0;
    this.pending = new Map(); // reqId -> {resolve, reject}
    this.handles = [];
  }

  async open(url = IG) {
    if (this.id) return;
    const loaded = new Set();
    this.handles.push(await InAppBrowser.addListener('browserPageLoaded', (e) => loaded.add(e.id)));
    this.handles.push(await InAppBrowser.addListener('messageFromWebview', (e) => {
      const d = e.detail || {};
      const p = this.pending.get(d.reqId);
      if (!p) return;
      this.pending.delete(d.reqId);
      p.resolve(d);
    }));
    const { id } = await InAppBrowser.openWebView({ url, hidden: true });
    this.id = id;
    for (let i = 0; i < 80 && !loaded.has(id); i++) await sleep(250); // wait for the real page load, up to 20 s
    await sleep(500);
  }

  async close() {
    this.handles.forEach((h) => h.remove());
    this.handles = [];
    if (this.id) await InAppBrowser.close({ id: this.id }).catch(() => {});
    this.id = null;
  }

  // Evaluate an async JS expression inside the page and return its (JSON) value.
  async evalInPage(expr) {
    await this.open();
    for (let attempt = 0; ; attempt++) {
      const reqId = `r${++this.seq}`;
      const reply = new Promise((resolve, reject) => {
        this.pending.set(reqId, { resolve, reject });
        setTimeout(() => { if (this.pending.delete(reqId)) reject(new Error('Instagram did not answer in time.')); }, 20000);
      });
      await InAppBrowser.executeScript({
        id: this.id,
        code: `(async () => {
          const send = (d) => window.mobileApp.postMessage({ detail: Object.assign({ reqId: ${JSON.stringify(reqId)} }, d) });
          try { send({ value: await (${expr}) }); } catch (e) { send({ error: String(e) }); }
        })()`,
      });
      try {
        const res = await reply;
        if (res.error) throw new Error(res.error);
        return res.value;
      } catch (e) {
        if (attempt >= 1 || !/in time/.test(e.message)) throw e;
      }
    }
  }

  // GET a JSON endpoint from inside the page, at most ~2 requests per second.
  async get(pathAndQuery) {
    const wait = this.last + 500 - Date.now();
    if (wait > 0) await sleep(wait);
    this.last = Date.now();
    const res = await this.evalInPage(`(async () => {
      const csrf = (document.cookie.match(/csrftoken=([^;]+)/) || [])[1] || '';
      const r = await fetch(${JSON.stringify(pathAndQuery)}, { credentials: 'include', headers: { 'x-ig-app-id': '${APP_ID}', 'x-csrftoken': csrf, 'x-requested-with': 'XMLHttpRequest', 'x-asbd-id': '129477' } });
      return { status: r.status, body: await r.text() };
    })()`);
    if (res.status === 429) throw new Error('Instagram rate limit hit. Wait a few minutes and try again.');
    let json = null;
    try { json = JSON.parse(res.body); } catch { /* not JSON */ }
    if (!json) throw new Error('Instagram answered with a login page instead of data. Log out and log in again.');
    if (res.status >= 400) throw new Error(`Instagram returned HTTP ${res.status}`);
    return json;
  }

  // Lists a profile's posts by scrolling the real profile page (reels come from the /reels/ tab).
  async scrapeProfile({ username, limit, only, onEntry, isCancelled }) {
    await this.open(`${IG}${encodeURIComponent(username)}/${only === 'reel' ? 'reels/' : ''}`);
    const seen = new Set();
    let idle = 0;
    for (let round = 0; round < 500 && seen.size < limit && idle < 6 && !isCancelled(); round++) {
      await sleep(1500);
      const { href, tiles, missing } = await this.evalInPage(`({ href: location.href, tiles: ${EXTRACT}, missing: ${NOT_FOUND} })`);
      if (/\/accounts\/login/.test(href)) throw new Error('Not logged in. Tap "Log in to Instagram" first.');
      if (missing) throw notFound(username);
      let added = 0;
      for (const t of tiles) {
        if (seen.has(t.code) || seen.size >= limit) continue;
        if (only === 'post' && t.isReel) continue; // reels show up in the main grid too
        seen.add(t.code);
        onEntry(toEntry(t, username));
        added++;
      }
      idle = added ? 0 : idle + 1;
      await this.evalInPage('window.scrollTo(0, document.body.scrollHeight)');
    }
    return { count: seen.size, firstCode: seen.values().next().value };
  }

  // Opens the post page and reads the media item it embeds; falls back to the API call.
  async mediaFromPage(code) {
    try {
      await this.open(`${IG}p/${code}/`);
      for (let i = 0; i < 8; i++) {
        const item = await this.evalInPage(postJson(code));
        if (item) return item;
        await sleep(1000);
      }
    } catch { /* fall back below */ }
    return this.mediaInfo(code);
  }

  async mediaInfo(code) {
    const j = await this.get(`/api/v1/media/${shortcodeToId(code)}/info/`);
    if (!j.items || !j.items.length) throw new Error('Post not found or not accessible');
    return j.items[0];
  }

  // Prefer a known post of the profile (cheap, rarely throttled); fall back to the profile-info call.
  async userId(username, hintCode) {
    if (hintCode) {
      try { return String((await this.mediaInfo(hintCode)).user.pk); } catch { /* fall through */ }
    }
    const j = await this.get(`/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`);
    if (j.data && j.data.user && j.data.user.id) return j.data.user.id;
    throw new Error(`Could not find user "${username}"`);
  }

  async stories(username, hintCode) {
    const id = await this.userId(username, hintCode);
    const j = await this.get(`/api/v1/feed/reels_media/?reel_ids=${id}`);
    const reel = (j.reels_media && j.reels_media[0]) || (j.reels && j.reels[id]);
    return ((reel && reel.items) || []).map((it) => entryFromItem(it, { username, story: true }));
  }
}
