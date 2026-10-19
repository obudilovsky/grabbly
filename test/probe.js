// Probe: does Instagram's JSON API work from inside a logged-in page? (cookies imported from Chrome via yt-dlp)
const fsx = require('fs'); const _log = console.log; console.log = (...a) => fsx.appendFileSync('/tmp/probe.out', a.join(' ') + '\n');
const { app, session, BrowserWindow } = require('electron');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  const f = process.env.COOKIE_FILE;
  const ses = session.fromPartition('probe');
  for (const l of fs.readFileSync(f, 'utf8').split('\n')) {
    const t = l.replace('#HttpOnly_', '').split('\t');
    if (t.length < 7 || !t[0].includes('instagram.com')) continue;
    await ses.cookies.set({ url: 'https://www.instagram.com', name: t[5], value: t[6], domain: t[0], path: t[2], secure: t[3] === 'TRUE', httpOnly: l.startsWith('#HttpOnly_') });
  }
  fs.rmSync(f, { force: true });
  console.log('COOKIES SET'); const win = new BrowserWindow({ show: false, webPreferences: { session: ses, backgroundThrottling: false } });
  await win.loadURL('https://www.instagram.com/'); console.log('LOADED');
  const call = (u) => win.webContents.executeJavaScript(`(async () => {
    const csrf = (document.cookie.match(/csrftoken=([^;]+)/) || [])[1] || '';
    const r = await fetch(${JSON.stringify(u)}, { headers: { 'x-ig-app-id': '936619743392459', 'x-csrftoken': csrf, 'x-requested-with': 'XMLHttpRequest', 'x-asbd-id': '129477' }, credentials: 'include' });
    const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {}
    return { status: r.status, json: j, head: j ? '' : t.slice(0, 120) };
  })()`);
  const show = (n, r) => console.log(n, r.status, r.json ? 'JSON ' + Object.keys(r.json).slice(0, 8).join(',') : 'HTML ' + r.head.slice(0, 60));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await win.loadURL('https://www.instagram.com/instagram/');
  await sleep(4000);
  const dom = await win.webContents.executeJavaScript(`(() => {
    const out = [...document.querySelectorAll('a[href*="/reel/"],a[href*="/p/"]')].slice(0, 14).map(a => ({
      h: a.getAttribute('href'), labels: [...a.querySelectorAll('svg')].map(s => s.getAttribute('aria-label')).join('|'), title: [...a.querySelectorAll('title')].map(t=>t.textContent).join('|')
    }));
    const html = document.documentElement.innerHTML;
    const ids = ['"profile_id":"(\\d+)"', '"user_id":"(\\d+)"', '"id":"(\\d{6,})","username":"instagram"', 'profilePage_(\\d+)'].map(r => { const m = html.match(new RegExp(r)); return m ? m[1] : null; });
    return { out, ids, lang: document.documentElement.lang };
  })()`);
  console.log('DOM', JSON.stringify(dom));
  const call2 = (u) => win.webContents.executeJavaScript(`(async () => {
    const csrf = (document.cookie.match(/csrftoken=([^;]+)/) || [])[1] || '';
    const r = await fetch(${JSON.stringify(u)}, { headers: { 'x-ig-app-id': '936619743392459', 'x-csrftoken': csrf, 'x-requested-with': 'XMLHttpRequest' }, credentials: 'include' });
    const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {}
    return { status: r.status, json: j, head: j ? '' : t.slice(0, 80) };
  })()`);
  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const idOf = (code) => { let id = 0n; for (const ch of code) id = id * 64n + BigInt(alpha.indexOf(ch)); return id; };
  const codes = dom.out.map((o) => (o.h.match(/\/(?:reel|p)\/([\w-]+)/) || [])[1]).slice(0, 4);
  const ids = codes.map((c) => idOf(c)).join(',');
  const bi = await call2(`/api/v1/media/infos/?media_ids=${ids}`);
  console.log('BATCH', bi.status, bi.head, bi.json && bi.json.items ? bi.json.items.map((i) => i.code + ':' + i.media_type + ':' + (i.product_type || '')).join(' ') : JSON.stringify(bi.json).slice(0, 150));
  const one = await call2(`/api/v1/media/${idOf(codes[1])}/info/`);
  const car = one.json && one.json.items && one.json.items[0];
  console.log('ONE', codes[1], car && car.media_type, car && car.carousel_media && car.carousel_media.length);
  app.exit(0);
});
