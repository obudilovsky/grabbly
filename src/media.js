// Pure helpers: URL classification, shortcode -> media id, turning Instagram API items into downloadable files.
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function shortcodeToId(code) {
  let id = 0n;
  for (const ch of code) id = id * 64n + BigInt(ALPHA.indexOf(ch));
  return id.toString();
}

const RESERVED = new Set(['p', 'reel', 'reels', 'tv', 'stories', 'explore', 'accounts', 'direct']);

// -> {type:'post', code} | {type:'stories', username, storyId} | {type:'profile', username} | null
function parseUrl(url) {
  let u;
  const raw = String(url).trim();
  // A bare username ("name" or "@name") is the normal input; links keep working too.
  const bare = raw.replace(/^@/, '');
  if (!/instagram\.com/i.test(raw) && /^[A-Za-z0-9._]{1,30}$/.test(bare) && !RESERVED.has(bare.toLowerCase())) return { type: 'profile', username: bare };
  try { u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`); } catch { return null; } // scheme is optional
  if (!/(^|\.)instagram\.com$/.test(u.hostname)) return null;
  const parts = u.pathname.split('/').filter(Boolean);
  if (!parts.length) return null;
  if (['p', 'reel', 'tv'].includes(parts[0]) && parts[1]) return { type: 'post', code: parts[1] };
  if (parts[0] === 'stories' && parts[1]) return { type: 'stories', username: parts[1], storyId: parts[2] || null };
  if (RESERVED.has(parts[0])) return null;
  // /user/, /user/reels/, /user/p/CODE/, /user/reel/CODE/
  if (['p', 'reel', 'tv'].includes(parts[1]) && parts[2]) return { type: 'post', code: parts[2] };
  if (parts.length > 1 && !['reels', 'tagged'].includes(parts[1])) return null;
  return { type: 'profile', username: parts[0] };
}

const area = (o) => (o.width || 0) * (o.height || 0);
const best = (list) => (list || []).reduce((b, c) => (!b || area(c) > area(b) ? c : b), null);

// One image/video node -> {type, url, ext} or null.
function singleMedia(node) {
  if (node.media_type === 2 || (node.video_versions && node.video_versions.length)) {
    const v = best(node.video_versions);
    return v ? { type: 'video', url: v.url, ext: 'mp4' } : null;
  }
  const img = best(node.image_versions2 && node.image_versions2.candidates);
  return img ? { type: 'photo', url: img.url, ext: 'jpg' } : null;
}

// Post/story item -> files, each with its position in the carousel.
function mediaOf(item) {
  const nodes = item.media_type === 8 && item.carousel_media ? item.carousel_media : [item];
  return nodes.map((n, i) => ({ ...singleMedia(n), index: i })).filter((m) => m.url);
}

function kindOf(item) {
  if (item.media_type === 8) return 'carousel';
  return item.media_type === 2 ? 'video' : 'photo';
}

function thumbOf(item) {
  const src = item.media_type === 8 && item.carousel_media ? item.carousel_media[0] : item;
  const c = (src.image_versions2 && src.image_versions2.candidates) || [];
  // mid-sized candidate is plenty for a thumbnail
  return (c.find((x) => x.width <= 480 && x.width >= 240) || c[c.length - 1] || {}).url || null;
}

// API item -> list entry. `files` is pre-resolved so downloading needs no further API calls.
function entryFromItem(item, { username, story = false } = {}) {
  const user = username || (item.user && item.user.username) || 'instagram';
  const code = item.code || String(item.pk || item.id).split('_')[0];
  const caption = (item.caption && item.caption.text) || '';
  return {
    id: story ? `story_${item.pk || item.id}` : code,
    code,
    username: user,
    story,
    type: story ? 'story' : item.product_type === 'clips' ? 'reel' : 'post',
    kind: kindOf(item),
    url: story ? `https://www.instagram.com/stories/${user}/${item.pk || item.id}/` : `https://www.instagram.com/p/${code}/`,
    title: caption.split('\n')[0].slice(0, 140),
    thumbnail: thumbOf(item),
    count: item.media_type === 8 && item.carousel_media ? item.carousel_media.length : 1,
    takenAt: item.taken_at || null,
    files: mediaOf(item),
  };
}

// Apply the photo/video filter to a list of files.
function filterFiles(files, mode) {
  if (mode === 'photos') return files.filter((f) => f.type === 'photo');
  if (mode === 'videos') return files.filter((f) => f.type === 'video');
  return files;
}

function fileName(entry, file, total) {
  const base = entry.story ? `${entry.username}_${entry.id}` : `${entry.username}_${entry.code}`;
  return total > 1 ? `${base}_${file.index + 1}.${file.ext}` : `${base}.${file.ext}`;
}

module.exports = { shortcodeToId, parseUrl, mediaOf, singleMedia, kindOf, entryFromItem, filterFiles, fileName };
