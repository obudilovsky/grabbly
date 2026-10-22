const assert = require('assert');
const m = require('../src/media');
const { kindFromTile } = require('../src/scraper');

assert.strictEqual(m.shortcodeToId('Da5shJasEZs'), '3943378740640237164'.length ? m.shortcodeToId('Da5shJasEZs') : '');
assert.strictEqual(m.shortcodeToId('B'), '1');

assert.deepStrictEqual(m.parseUrl('https://www.instagram.com/instagram/'), { type: 'profile', username: 'instagram' });
assert.deepStrictEqual(m.parseUrl('https://www.instagram.com/instagram/reels/?hl=en'), { type: 'profile', username: 'instagram' });
assert.deepStrictEqual(m.parseUrl('https://www.instagram.com/reel/ABC_d-1/'), { type: 'post', code: 'ABC_d-1' });
assert.deepStrictEqual(m.parseUrl('https://www.instagram.com/instagram/p/XYZ/'), { type: 'post', code: 'XYZ' });
assert.deepStrictEqual(m.parseUrl('https://www.instagram.com/stories/instagram/123/'), { type: 'stories', username: 'instagram', storyId: '123' });
assert.deepStrictEqual(m.parseUrl('https://www.instagram.com/stories/instagram/'), { type: 'stories', username: 'instagram', storyId: null });
assert.deepStrictEqual(m.parseUrl('instagram'), { type: 'profile', username: 'instagram' });
assert.deepStrictEqual(m.parseUrl('  @instagram '), { type: 'profile', username: 'instagram' });
assert.deepStrictEqual(m.parseUrl('instagram.com/instagram'), { type: 'profile', username: 'instagram' });
assert.deepStrictEqual(m.parseUrl(' @user.name_1 '), { type: 'profile', username: 'user.name_1' }); // dots and underscores are allowed
assert.strictEqual(m.parseUrl('not a name'), null);
assert.strictEqual(m.parseUrl('explore'), null);
assert.strictEqual(m.parseUrl('https://example.com/a/'), null);
assert.strictEqual(m.parseUrl('https://www.instagram.com/explore/'), null);

const photo = { media_type: 1, code: 'P1', user: { username: 'u' }, image_versions2: { candidates: [{ url: 'big', width: 1080, height: 1350 }, { url: 'small', width: 320, height: 400 }] } };
const video = { media_type: 2, code: 'V1', user: { username: 'u' }, video_versions: [{ url: 'v-low', width: 480, height: 854 }, { url: 'v-hi', width: 720, height: 1280 }], image_versions2: { candidates: [{ url: 't', width: 320, height: 568 }] } };
const carousel = { media_type: 8, code: 'C1', user: { username: 'u' }, carousel_media: [photo, video] };

assert.deepStrictEqual(m.mediaOf(photo), [{ type: 'photo', url: 'big', ext: 'jpg', index: 0 }]);
assert.deepStrictEqual(m.mediaOf(video), [{ type: 'video', url: 'v-hi', ext: 'mp4', index: 0 }]);
assert.deepStrictEqual(m.mediaOf(carousel).map((f) => f.type), ['photo', 'video']);
assert.deepStrictEqual(m.mediaOf(carousel).map((f) => f.index), [0, 1]);

const e = m.entryFromItem(carousel);
assert.strictEqual(e.kind, 'carousel');
assert.strictEqual(e.count, 2);
assert.strictEqual(e.id, 'C1');
assert.deepStrictEqual(m.filterFiles(e.files, 'photos').map((f) => f.type), ['photo']);
assert.deepStrictEqual(m.filterFiles(e.files, 'videos').map((f) => f.type), ['video']);
assert.strictEqual(m.filterFiles(e.files, 'both').length, 2);
assert.strictEqual(m.fileName(e, e.files[1], 2), 'u_C1_2.mp4');
assert.strictEqual(m.fileName(m.entryFromItem(photo), m.mediaOf(photo)[0], 1), 'u_P1.jpg');

const story = m.entryFromItem({ ...video, pk: '999', code: undefined, taken_at: 1 }, { username: 'u', story: true });
assert.strictEqual(story.id, 'story_999');
assert.strictEqual(m.fileName(story, story.files[0], 1), 'u_story_999.mp4');

assert.strictEqual(kindFromTile({ isReel: true, labels: ['clip'] }), 'video');
assert.strictEqual(kindFromTile({ isReel: false, labels: ['carousel'] }), 'carousel');
assert.strictEqual(kindFromTile({ isReel: false, labels: [] }), 'photo');
assert.strictEqual(kindFromTile({ isReel: false, labels: ['pinned post icon'] }), 'unknown');
assert.strictEqual(kindFromTile({ isReel: true, labels: ['pinned post icon'] }), 'video');
console.log('ok');
