// Manual check of the All/Posts/Reels listing modes: COOKIE_FILE=... npx electron test/modes.js <username>
const { app, session } = require('electron');
const fs = require('fs');
const { ApiClient } = require('../src/api');
const { scrapeProfile } = require('../src/scraper');
const out = (...a) => fs.appendFileSync('/tmp/modes.out', a.join(' ') + '\n');
const username = process.argv.find((a) => /^[\w.]+$/.test(a) && !/electron|modes/.test(a)) || 'instagram';
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  try {
    const ses = session.fromPartition('modes');
    ses.setUserAgent(ses.getUserAgent(), 'en-US,en;q=0.9');
    for (const l of fs.readFileSync(process.env.COOKIE_FILE, 'utf8').split('\n')) {
      const t = l.replace('#HttpOnly_', '').split('\t');
      if (t.length < 7 || !t[0].includes('instagram.com')) continue;
      await ses.cookies.set({ url: 'https://www.instagram.com', name: t[5], value: t[6], domain: t[0], path: t[2], secure: t[3] === 'TRUE', httpOnly: l.startsWith('#HttpOnly_') });
    }
    for (const only of ['reel', 'post', undefined]) {
      const api = new ApiClient(ses);
      const got = [];
      await scrapeProfile({ api, username, limit: 15, only, onEntry: (e) => got.push(e) });
      api.close();
      const types = got.reduce((a, e) => ((a[e.type + '/' + e.kind] = (a[e.type + '/' + e.kind] || 0) + 1), a), {});
      out('MODE', only || 'all', 'count', got.length, JSON.stringify(types));
    }
  } catch (e) { out('ERR', e.stack); }
  app.exit(0);
});
