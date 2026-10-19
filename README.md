# Grabbly

**Bulk media downloader for social profiles.**

Desktop app for macOS and Windows. Paste an Instagram link, see every post as a thumbnail, tick what you want and save it in bulk.

## Screenshots

![Start screen](docs/screenshot-empty.png)

![Posts loaded and selected (sample data)](docs/screenshot-loaded.png)

The second screenshot uses generated placeholder thumbnails, not real posts.

## What it downloads

- **Posts & Reels** from a profile: photos, videos, carousels (every slide is saved as its own file).
- **Stories** (active ones, they live 24 hours) from a profile or a story link.
- A single **post / reel / story** link.
- Choose **Photos + Videos**, **Photos** or **Videos**. The filter also applies inside carousels.

Thumbnails: ▶ marks a video, stacked squares mark a carousel (with the slide count), photos have no mark.

Files go to the chosen folder as `user_CODE.jpg|mp4`, carousels as `user_CODE_1.jpg`, `user_CODE_2.mp4`, stories as `user_story_ID.ext`. Existing files are skipped.

## Run

```
npm install
npm start
```

## Build installers

```
npm run dist:mac   # .dmg (Apple Silicon + Intel), run on macOS
npm run dist:win   # .exe installer + portable (x64)
```

## Releases

Pushing a tag like `v2.0.1` builds the macOS and Windows installers on GitHub Actions and attaches them to a GitHub Release automatically.

```
git tag v2.0.1 && git push origin v2.0.1
```

## Notes

- Log in once with **Log in to Instagram**. The session stays inside the app.
- v2.0 no longer needs yt-dlp or ffmpeg: it reads Instagram's own data from a hidden, logged-in page and downloads the files directly.
- Instagram may rate-limit large batches. The app paces its requests; if it says so, wait a few minutes.
- Download only content you have the right to save.

## Tests

`npm test` runs the unit tests. `test/e2e.js` runs against a real account (needs a cookies file, see the header of the script).

## Branding

The app icon (`build/icon.svg`, rendered to `build/icon.png`) uses the "g" glyph from **Lobster** by Impallari Type, licensed under the SIL Open Font License 1.1. The font file and license are in `assets/fonts/`.
