// electron-builder afterPack hook: ad-hoc sign the whole macOS bundle.
// Without it only the main binary carries a signature, the bundle seal is missing,
// and Gatekeeper reports "Grabbly is damaged" for a downloaded copy.
const { execFileSync } = require('child_process');
const path = require('path');

exports.default = async (context) => {
  if (context.electronPlatformName !== 'darwin') return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
};
