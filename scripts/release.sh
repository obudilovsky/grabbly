#!/usr/bin/env bash
# One way to ship a version: bump, build every installer, tag, publish a GitHub Release with all of them.
#   scripts/release.sh 2.0.3
# Needs: macOS with Xcode, JDK 21, Android SDK, gh (logged in). Old releases are kept; each run adds a new one.
set -euo pipefail

VERSION="${1:?usage: scripts/release.sh X.Y.Z}"
[[ "$VERSION" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]] || { echo "version must look like 2.0.3" >&2; exit 1; }
CODE=$(( BASH_REMATCH[1] * 10000 + BASH_REMATCH[2] * 100 + BASH_REMATCH[3] ))
TAG="v$VERSION"

cd "$(dirname "$0")/.."
[[ -z "$(git status --porcelain --untracked-files=no)" ]] || { echo "commit or stash your changes first" >&2; exit 1; }
git rev-parse "$TAG" >/dev/null 2>&1 && { echo "$TAG already exists" >&2; exit 1; }

export CSC_IDENTITY_AUTO_DISCOVERY=false
export JAVA_HOME="${JAVA_HOME:-$(/usr/libexec/java_home -v 21)}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"

npm test

# version everywhere: desktop package, Android, iOS
npm version "$VERSION" --no-git-tag-version --allow-same-version >/dev/null
sed -i '' -E "s/versionCode [0-9]+/versionCode $CODE/; s/versionName \"[^\"]*\"/versionName \"$VERSION\"/" android/app/build.gradle
sed -i '' -E "s/MARKETING_VERSION = [^;]+;/MARKETING_VERSION = $VERSION;/; s/CURRENT_PROJECT_VERSION = [^;]+;/CURRENT_PROJECT_VERSION = $CODE;/" ios/App/App.xcodeproj/project.pbxproj

OUT="dist/release"
rm -rf "$OUT" dist/*.dmg dist/*.exe
mkdir -p "$OUT"

# desktop: one electron-builder run per target (a combined mac run can fail at hdiutil)
npx electron-builder --mac dmg --arm64
npx electron-builder --mac dmg --x64
npx electron-builder --win nsis portable --x64
cp dist/Grabbly-arm64.dmg dist/Grabbly-x64.dmg dist/Grabbly-Setup.exe dist/Grabbly-Portable.exe "$OUT/"

# mobile: web bundle, then Android APK and the iOS app for the simulator
npm run mobile:build
(cd android && ./gradlew assembleDebug -q)
cp android/app/build/outputs/apk/debug/app-debug.apk "$OUT/Grabbly-android-debug.apk"
DD="$(mktemp -d)"
(cd ios/App && xcodebuild -project App.xcodeproj -scheme App -configuration Debug -destination 'generic/platform=iOS Simulator' -derivedDataPath "$DD" build -quiet)
ditto -c -k --keepParent "$DD/Build/Products/Debug-iphonesimulator/App.app" "$OUT/Grabbly-ios-simulator.zip"

# every installer must exist before anything is published
for f in Grabbly-arm64.dmg Grabbly-x64.dmg Grabbly-Setup.exe Grabbly-Portable.exe Grabbly-android-debug.apk Grabbly-ios-simulator.zip; do
  [[ -s "$OUT/$f" ]] || { echo "missing $OUT/$f" >&2; exit 1; }
done

PREV="$(git describe --tags --abbrev=0 2>/dev/null || true)"
{
  echo "## Downloads"
  echo
  echo "| Platform | File |"
  echo "|---|---|"
  echo "| macOS, Apple Silicon | \`Grabbly-arm64.dmg\` |"
  echo "| macOS, Intel | \`Grabbly-x64.dmg\` |"
  echo "| Windows, installer | \`Grabbly-Setup.exe\` |"
  echo "| Windows, portable | \`Grabbly-Portable.exe\` |"
  echo "| Android | \`Grabbly-android-debug.apk\` (debug build, enable installs from unknown sources) |"
  echo "| iOS | \`Grabbly-ios-simulator.zip\` (runs in the iOS Simulator only; a real iPhone needs signing with your Apple account) |"
  echo
  echo "The macOS and Windows builds are not code-signed, so macOS and Windows will ask you to confirm the first launch."
  echo
  echo "## Changes"
  echo
  git log ${PREV:+"$PREV"..HEAD} --no-merges --pretty='- %s' -n 30 | grep -v '^- Release v' || true
} > "$OUT/notes.md"

git add package.json package-lock.json android/app/build.gradle ios/App/App.xcodeproj/project.pbxproj
git commit -m "Release $TAG"
git tag "$TAG"
git push origin HEAD "$TAG"

gh release create "$TAG" --title "Grabbly $TAG" --notes-file "$OUT/notes.md" --latest \
  "$OUT"/Grabbly-arm64.dmg "$OUT"/Grabbly-x64.dmg "$OUT"/Grabbly-Setup.exe "$OUT"/Grabbly-Portable.exe \
  "$OUT"/Grabbly-android-debug.apk "$OUT"/Grabbly-ios-simulator.zip
echo "Published $TAG"
