# Grabbly design assets

Everything visual that ships with the apps, in one place. The files are copies: the app reads its own sources (`build/`, `assets/`, `mobile/icons/`, `android/`, `ios/`), so editing here changes nothing until it is copied back.

## Layout

| Folder | Contents |
|---|---|
| `app-icon/` | `icon.svg` (master) and `icon-1024.png`; `android/` adaptive icon layers (SVG) and the launcher PNGs for every density; `ios/` the 1024 px App Store icon and its SVG |
| `splash/` | Splash screen: SVG master, Android portrait xxxhdpi, iOS 2732 px |
| `ui/` | `logo-160.png` (header logo), `empty-state.svg`, `icons/` (download, menu, close, reset, folder, play, carousel, 24 px line icons using `currentColor`) |
| `fonts/` | `Lobster-Regular.ttf` and its SIL Open Font License |
| `screenshots/` | Phone screens: home, results with selection, settings. Made with synthetic thumbnails, no real accounts or people |

## Typography

- **Wordmark and icon glyph:** Lobster Regular (SIL OFL), a bold connected script. The "Grabbly" wordmark in the header and the "g" in the app icon are the same font. The icon glyph is converted to outlines in `icon.svg`.
- **Interface text:** the platform system font, so each app feels native: SF Pro Text on macOS and iOS, Segoe UI Variable on Windows, system-ui / Roboto on Android. Base size 13.5 px on desktop, 15 px on phones. Phone inputs are 16 px so iOS does not zoom on focus.

## Colour palette

Three main colours, the sunset gradient that runs through the icon, the buttons and the selection ring:

| | Name | Hex |
|---|---|---|
| 1 | Sunset orange | `#ff8a3d` |
| 2 | Hot pink | `#ff3d7f` |
| 3 | Violet | `#8a4dff` |

Brand gradient: `linear-gradient(135deg, #ff8a3d, #ff3d7f 55%, #8a4dff)`.

Supporting colours:

| Role | Dark | Light |
|---|---|---|
| Background | `#0e0f13` | `#f5f5f8` |
| Panel | `#16181f` | `#ffffff` |
| Panel, raised | `#1d2029` | `#eeeef3` |
| Text | `#eceef4` | `#16171c` |
| Muted text | `#8b90a0` | `#6b7080` |
| Success | `#34d399` | `#34d399` |
| Error | `#f87171` | `#f87171` |

The app follows the system light or dark setting. The app icon uses a longer version of the gradient (`#ffb347`, `#ff4b6e`, `#b13bd6`, `#5b4bff`) with a deep-violet sky (`#ff5d8f`, `#b13bd6`, `#3d2bd6`) inside the photo frame and a near-black badge (`#16102a`) for the download arrow.

## Style

- Warm sunset gradients on a quiet neutral surface, close to the Instagram look without copying its logo.
- Rounded everything: 9 to 16 px corners on controls and cards, full pills for chips and filters.
- Soft coloured glow under primary actions and selected cards (pink shadow), subtle blur on the footer and the check marks.
- Line icons, 2 px strokes, round caps and joins.
- The app icon is a tilted photo frame holding the Lobster "g", with a dark download badge in the corner.
