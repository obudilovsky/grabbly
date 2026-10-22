const $ = (id) => document.getElementById(id);
const grid = $('grid');
const items = new Map(); // id -> record
let dir = '';
let mode = 'idle'; // idle | listing | downloading
let batch = []; // records being downloaded
let source = ['all', 'posts', 'reels', 'stories'].includes(localStorage.getItem('source')) ? localStorage.getItem('source') : 'all';
let mediaType = localStorage.getItem('mediaType') || 'both';
let editing = false; // search panel re-opened by hand while cards are shown

if (new URLSearchParams(location.search).get('platform') === 'darwin') document.body.classList.add('mac');

const busy = () => mode !== 'idle';
// A tile is visible unless the photo/video filter rules it out (carousels and unknown kinds always stay).
const visible = (r) => !(mediaType === 'photos' && r.entry.kind === 'video') && !(mediaType === 'videos' && r.entry.kind === 'photo');
const selected = () => [...items.values()].filter((i) => i.sel && visible(i));

function setMsg(text, isErr) {
  const m = $('msg');
  m.textContent = text || '';
  m.classList.toggle('err', Boolean(isErr));
  m.title = text || '';
}

function setTask(text, pct) {
  const show = mode !== 'idle';
  $('task').hidden = !show;
  $('cancel').hidden = !show;
  if (!show) return;
  $('taskText').textContent = text;
  const indeterminate = pct == null;
  $('taskBar').parentElement.classList.toggle('indeterminate', indeterminate);
  $('taskBar').style.width = indeterminate ? '' : `${pct}%`;
  $('taskPct').textContent = indeterminate ? '' : `${Math.round(pct)}%`;
}

function refresh() {
  const sel = selected().length;
  $('count').textContent = `${sel} selected`;
  $('download').disabled = busy() || !sel || !dir;
  $('download').textContent = sel ? `Download ${sel} post${sel > 1 ? 's' : ''}` : 'Download selected';
  $('load').disabled = busy();
    $('clear').disabled = busy() || items.size === 0;
  const vis = [...items.values()].filter(visible).length;
  const allOn = vis > 0 && sel === vis;
  $('all').textContent = allOn ? 'Deselect all' : 'Select all';
  $('all').setAttribute('aria-pressed', allOn);
  $('all').disabled = busy() || vis === 0;
  $('empty').hidden = items.size > 0 || mode === 'listing';
  document.body.classList.toggle('has-cards', items.size > 0 && !editing); // phone: search + filters fold into a one-line summary
  if (items.size > 0) {
    const labels = { all: 'All', posts: 'Posts', reels: 'Reels', stories: 'Stories' };
    const types = { both: 'Photos + Videos', photos: 'Photos', videos: 'Videos' };
    $('summaryText').textContent = `@${$('url').value.trim().replace(/^@/, '')} · ${labels[source]} · ${types[mediaType]}`;
  }
}

function setSelected(rec, on) {
  rec.sel = on;
  rec.el.classList.toggle('sel', on);
}

const ICON = {
  play: '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M8 5.5v13a1 1 0 001.5.86l11-6.5a1 1 0 000-1.72l-11-6.5A1 1 0 008 5.5z"/></svg>',
  layers: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><rect x="8" y="3" width="13" height="13" rx="3"/><path d="M5 8H4a1 1 0 00-1 1v10a2 2 0 002 2h10a1 1 0 001-1v-1" stroke-linecap="round"/></svg>',
};
// Small corner mark: ▶ for videos, stacked squares for carousels. Static, no playback.
function kindMark(entry) {
  if (entry.kind !== 'video' && entry.kind !== 'carousel') return null;
  const el = document.createElement('div');
  el.className = 'kind';
  el.innerHTML = entry.kind === 'video' ? ICON.play : ICON.layers + (entry.count > 1 ? entry.count : '');
  el.title = entry.kind === 'video' ? 'Video' : 'Carousel';
  return el;
}

function addCard(entry) {
  if (items.has(entry.id)) return;
  const el = document.createElement('div');
  el.className = 'card';
  el.dataset.kind = entry.kind;
  const thumb = document.createElement('div');
  thumb.className = 'thumb';
  if (entry.thumbnail) {
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    img.onload = () => (thumb.style.backgroundImage = `url("${entry.thumbnail}")`);
    img.src = entry.thumbnail;
  }
  const cap = document.createElement('div');
  cap.className = 'cap';
  cap.textContent = (entry.story ? 'Story' : '') + (entry.story && entry.title ? ' · ' : '') + (entry.title || '');
  const tick = document.createElement('div');
  tick.className = 'tick';
  const bar = document.createElement('div');
  bar.className = 'bar';
  el.append(thumb, cap, tick, bar);
  const mark = kindMark(entry);
  if (mark) el.append(mark);
  const rec = { entry, el, bar, sel: false, badge: null, percent: 0, status: 'idle' };
  el.onclick = () => {
    if (busy()) return;
    setSelected(rec, !rec.sel);
    refresh();
  };
  items.set(entry.id, rec);
  grid.append(el);
  if (mode === 'listing') {
    setTask(`Loading videos… ${items.size} found`, null);
    $('empty').hidden = true;
  }
}

function setBadge(rec, text, cls) {
  if (!rec.badge) {
    rec.badge = document.createElement('div');
    rec.el.append(rec.badge);
  }
  rec.badge.className = `badge ${cls || ''}`;
  rec.badge.textContent = text;
}

function updateOverall() {
  if (mode !== 'downloading' || !batch.length) return;
  const done = batch.filter((r) => ['done', 'error', 'cancelled', 'skipped'].includes(r.status)).length;
  const pct = batch.reduce((a, r) => a + (r.status === 'idle' ? 0 : r.percent), 0) / batch.length;
  setTask(`Downloading ${Math.min(done + 1, batch.length)} of ${batch.length}`, pct);
}

window.api.onEntry(addCard);
window.api.onProgress(({ id, status, percent, error, counts }) => {
  const rec = items.get(id);
  if (!rec) return;
  rec.status = status;
  if (counts) rec.counts = counts;
  if (percent != null) rec.percent = percent;
  rec.bar.style.width = `${rec.percent}%`;
  if (status === 'downloading') setBadge(rec, `${Math.round(rec.percent)}%`);
  else if (status === 'done') { rec.percent = 100; setBadge(rec, 'Done', 'done'); }
  else if (status === 'skipped') { rec.percent = 100; setBadge(rec, 'Skipped', 'skipped'); rec.el.title = 'Nothing matched the photo/video filter'; }
  else if (status === 'error') { setBadge(rec, 'Error', 'error'); rec.el.title = error || ''; }
  else setBadge(rec, 'Cancelled');
  updateOverall();
});

$('load').onclick = async () => {
  const url = $('url').value.trim();
  if (!url) return;
  items.clear();
  grid.textContent = '';
  editing = false;
  mode = 'listing';
  setMsg('');
  setTask('Loading videos…', null);
  refresh();
  try {
    const { count, cancelled } = await window.api.list({ url, limit: Number($('limit').value) || 30, source });
    setMsg(cancelled ? `Stopped, ${count} loaded` : count ? `${count} posts loaded` : 'Nothing found');
  } catch (e) {
    setMsg(`${e.message.replace(/^Error invoking remote method '\w+': (Error: )?/, '')}`, true);
  }
  mode = 'idle';
  setTask();
  refresh();
};
$('edit').onclick = () => { editing = true; refresh(); };

const settings = $('settings');
$('menu').onclick = () => { settings.hidden = false; };
$('settingsClose').onclick = () => { settings.hidden = true; };
settings.onclick = (e) => { if (e.target === settings) settings.hidden = true; };
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') settings.hidden = true; });

$('url').addEventListener('keydown', (e) => e.key === 'Enter' && !busy() && $('load').click());

$('all').onclick = () => {
  if (busy()) return;
  const on = $('all').getAttribute('aria-pressed') !== 'true';
  for (const rec of items.values()) setSelected(rec, on && visible(rec));
  refresh();
};

$('clear').onclick = () => {
  if (busy()) return;
  items.clear();
  grid.textContent = '';
  editing = false;
  $('url').value = '';
  setMsg('');
  $('scroller').scrollTop = 0;
  refresh();
};

const mobileUi = document.documentElement.classList.contains('mobile');
if (mobileUi) {
  // phone: − / + change how many cards sit side by side (1–4), more columns = smaller cards
  let cols = Math.min(4, Math.max(1, Number(localStorage.getItem('cols')) || 2));
  const applyCols = () => {
    $('grid').style.setProperty('--cols', cols);
    localStorage.setItem('cols', cols);
    $('zoomOut').disabled = cols >= 4;
    $('zoomIn').disabled = cols <= 1;
  };
  $('zoomOut').onclick = () => { cols = Math.min(4, cols + 1); applyCols(); };
  $('zoomIn').onclick = () => { cols = Math.max(1, cols - 1); applyCols(); };
  applyCols();
} else {
  const apply = () => {
    document.documentElement.style.setProperty('--size', `${$('zoom').value}px`);
    localStorage.setItem('zoom', $('zoom').value);
    $('zoomOut').disabled = Number($('zoom').value) <= Number($('zoom').min);
    $('zoomIn').disabled = Number($('zoom').value) >= Number($('zoom').max);
  };
  const nudge = (d) => { $('zoom').value = Number($('zoom').value) + d * Number($('zoom').step); apply(); };
  $('zoom').oninput = apply;
  $('zoomOut').onclick = () => nudge(-1);
  $('zoomIn').onclick = () => nudge(1);
  if (localStorage.getItem('zoom')) $('zoom').value = localStorage.getItem('zoom');
  apply();
}

async function refreshLogin() {
  const ok = await window.api.loginStatus();
  $('loginLabel').textContent = mobileUi ? (ok ? 'Log out' : 'Log in') : ok ? 'Logged in · Log out' : 'Log in to Instagram';
  $('login').classList.toggle('on', ok);
}
$('login').onclick = async () => {
  if (await window.api.loginStatus()) await window.api.logout();
  else await window.api.login();
  refreshLogin();
};
refreshLogin();

$('dir').onclick = async () => {
  const d = await window.api.chooseDir();
  if (d) setDir(d, true);
};
function setDir(d, remember) {
  dir = d;
  $('dirName').textContent = d; // full path; CSS ellipsis only kicks in when space runs out
  $('dirName').title = d;
  if (remember) localStorage.setItem('dir', d);
  refresh();
}
$('open').onclick = () => dir && window.api.openDir(dir);

$('download').onclick = async () => {
  batch = selected();
  for (const r of batch) { r.status = 'idle'; r.percent = 0; r.bar.style.width = '0'; if (r.badge) r.badge.remove(), (r.badge = null); }
  mode = 'downloading';
  setMsg('');
  updateOverall();
  refresh();
  await window.api.download({ items: batch.map((r) => r.entry), dir, concurrency: Number($('conc').value), mediaFilter: mediaType });
  const doneRecs = batch.filter((r) => r.status === 'done');
  const photos = doneRecs.reduce((a, r) => a + ((r.counts && r.counts.photos) || 0), 0);
  const videos = doneRecs.reduce((a, r) => a + ((r.counts && r.counts.videos) || 0), 0);
  const skipped = batch.filter((r) => r.status === 'skipped').length;
  const failed = batch.filter((r) => r.status === 'error').length;
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const parts = [`${plural(doneRecs.length, 'post', 'posts')} downloaded (${plural(photos, 'photo', 'photos')}, ${plural(videos, 'video', 'videos')})`];
  if (skipped) parts.push(`${skipped} skipped`);
  if (failed) parts.push(`${failed} failed`);
  mode = 'idle';
  setTask();
  setMsg(`Finished: ${parts.join(', ')}`, failed > 0);
  refresh();
};

$('cancel').onclick = () => {
  if (mode === 'listing') window.api.cancelList();
  else if (mode === 'downloading') window.api.cancel();
};

function bindSeg(id, get, set) {
  const seg = $(id);
  const paint = () => seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === get()));
  seg.querySelectorAll('button').forEach((b) => (b.onclick = () => { if (busy()) return; set(b.dataset.v); paint(); }));
  paint();
}
bindSeg('source', () => source, (v) => { source = v; localStorage.setItem('source', v); });
bindSeg('mediaType', () => mediaType, (v) => {
  mediaType = v;
  localStorage.setItem('mediaType', v);
  document.body.dataset.media = v;
  for (const rec of items.values()) if (!visible(rec)) setSelected(rec, false);
  refresh();
});
document.body.dataset.media = mediaType;

window.api.defaultDir().then((d) => setDir(localStorage.getItem('dir') || d));
refresh();
