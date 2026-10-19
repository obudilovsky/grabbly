// Manual e2e against a real account. Export cookies first (see README), then:
//   COOKIE_FILE=/path/cookies.txt npx electron test/e2e.js <username>
const { app, session } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const media = require('../src/media');
const { ApiClient } = require('../src/api');
const { scrapeProfile } = require('../src/scraper');
const { downloadFile } = require('../src/downloader');

const out = (...a) => fs.appendFileSync(process.env.E2E_LOG || '/tmp/e2e.out', a.join(' ') + '\n');
const username = process.argv.find((a) => /^[\w.]+$/.test(a) && !/electron|e2e/.test(a)) || 'instagram';
app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  try {
    const ses = session.fromPartition('e2e');
    ses.setUserAgent(ses.getUserAgent(), 'en-US,en;q=0.9');
    for (const l of fs.readFileSync(process.env.COOKIE_FILE, 'utf8').split('\n')) {
      const t = l.replace('#HttpOnly_', '').split('\t');
      if (t.length < 7 || !t[0].includes('instagram.com')) continue;
      await ses.cookies.set({ url: 'https://www.instagram.com', name: t[5], value: t[6], domain: t[0], path: t[2], secure: t[3] === 'TRUE', httpOnly: l.startsWith('#HttpOnly_') });
    }
    const api = new ApiClient(ses);
    const entries = [];
    const r = await scrapeProfile({ api, username, limit: 24, onEntry: (e) => entries.push(e) });
    out('LISTED', r.count, 'kinds', JSON.stringify(entries.reduce((a, e) => ((a[e.kind] = (a[e.kind] || 0) + 1), a), {})), 'thumbs', entries.filter((e) => e.thumbnail).length);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-dl-'));
    // pick one of each kind that exists
    const picks = ['video', 'carousel', 'photo'].map((k) => entries.find((e) => e.kind === k)).filter(Boolean);
    for (const p of picks) {
      const full = media.entryFromItem(await api.mediaInfo(p.code), { username });
      out('RESOLVED', p.code, 'grid-kind', p.kind, 'api-kind', full.kind, 'files', JSON.stringify(full.files.map((f) => f.type)));
      for (const mode of ['both', 'photos', 'videos']) {
        const fl = media.filterFiles(full.files, mode);
        out('  FILTER', mode, '->', fl.length);
      }
      for (const f of media.filterFiles(full.files, 'both')) {
        const name = media.fileName(full, f, full.files.length);
        const res = await downloadFile(f.url, path.join(dir, name));
        out('  SAVED', name, res, fs.statSync(path.join(dir, name)).size);
      }
    }
    // stories
    try {
      const st = await api.stories(username, r.firstCode);
      out('STORIES', st.length, JSON.stringify(st.map((s) => s.kind)));
      for (const s of st.slice(0, 2)) {
        const f = s.files[0];
        const name = media.fileName(s, f, 1);
        out('  STORY SAVED', name, await downloadFile(f.url, path.join(dir, name)));
      }
    } catch (e) { out('STORIES ERR', e.message); }
    api.close();
    out('DIR', dir);
  } catch (e) { out('E2E ERROR', e.stack || e.message); }
  app.exit(0);
});
