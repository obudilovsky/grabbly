// Lists a profile's posts by scrolling the real profile page in the logged-in hidden window.
// Each grid tile carries an icon label (Clip / Carousel / none), which gives us the media kind up front.

const EXTRACT = `[...document.querySelectorAll('a[href*="/reel/"],a[href*="/p/"]')].map(a => {
  const m = (a.getAttribute('href') || '').match(/\\/(reel|p)\\/([\\w-]+)/);
  if (!m) return null;
  const labels = [...a.querySelectorAll('svg')].map(s => (s.getAttribute('aria-label') || '').toLowerCase());
  const img = a.querySelector('img');
  let thumb = img ? img.src : null;
  if (!thumb) {
    for (const el of a.querySelectorAll('*')) {
      const bg = getComputedStyle(el).backgroundImage.match(/url\\("?([^")]+)"?\\)/);
      if (bg) { thumb = bg[1]; break; }
    }
  }
  return { code: m[2], isReel: m[1] === 'reel', labels, thumbnail: thumb, title: img ? img.alt || '' : '' };
}).filter(Boolean)`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Tile -> 'video' | 'carousel' | 'photo' | 'unknown' (pinned /p/ tiles hide their real icon).
function kindFromTile(t) {
  const has = (w) => t.labels.some((l) => l.includes(w));
  if (t.isReel || has('clip') || has('video') || has('reel')) return 'video';
  if (has('carousel') || has('album')) return 'carousel';
  if (t.labels.every((l) => l.includes('pinned'))) return t.labels.length ? 'unknown' : 'photo';
  return 'photo';
}

function toEntry(t, username) {
  return {
    id: t.code,
    code: t.code,
    username,
    story: false,
    type: t.isReel ? 'reel' : 'post',
    kind: kindFromTile(t),
    url: `https://www.instagram.com/${t.isReel ? 'reel' : 'p'}/${t.code}/`,
    title: (t.title || '').split('\n')[0].slice(0, 140),
    thumbnail: t.thumbnail || null,
    count: 1,
    files: null, // resolved lazily, only for what the user actually downloads
  };
}

// only: 'reel' | 'post' | undefined (all). Reels are read from the dedicated /reels/ tab, posts from the main grid.
async function scrapeProfile({ api, username, limit, onEntry, only, isCancelled = () => false }) {
  const win = await api.open(`https://www.instagram.com/${encodeURIComponent(username)}/${only === 'reel' ? 'reels/' : ''}`);
  const seen = new Set();
  let idle = 0;
  for (let round = 0; round < 500 && seen.size < limit && idle < 6 && !isCancelled(); round++) {
    await sleep(1500);
    if (/\/accounts\/login/.test(win.webContents.getURL())) throw new Error('Not logged in. Click "Log in to Instagram" first.');
    let added = 0;
    for (const t of await win.webContents.executeJavaScript(EXTRACT)) {
      if (seen.has(t.code) || seen.size >= limit) continue;
      if (only === 'post' && t.isReel) continue; // reels show up in the main grid too
      seen.add(t.code);
      onEntry(toEntry(t, username));
      added++;
    }
    idle = added ? 0 : idle + 1;
    await win.webContents.executeJavaScript('window.scrollTo(0, document.body.scrollHeight)');
  }
  return { count: seen.size, firstCode: seen.values().next().value };
}

module.exports = { scrapeProfile, kindFromTile };
