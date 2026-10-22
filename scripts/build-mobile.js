// Builds the web bundle (www/) that Capacitor ships inside the iOS and Android apps.
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..');
const www = path.join(root, 'www');
fs.rmSync(www, { recursive: true, force: true });
fs.mkdirSync(www, { recursive: true });

esbuild.buildSync({
  entryPoints: [path.join(root, 'mobile', 'entry.js')],
  bundle: true,
  format: 'iife',
  target: ['es2022', 'safari15', 'chrome100'],
  minify: true,
  outfile: path.join(www, 'app.js'),
});

fs.copyFileSync(path.join(root, 'src', 'renderer.js'), path.join(www, 'renderer.js'));
fs.copyFileSync(path.join(root, 'src', 'styles.css'), path.join(www, 'styles.css'));
fs.copyFileSync(path.join(root, 'mobile', 'mobile.css'), path.join(www, 'mobile.css'));
fs.copyFileSync(path.join(root, 'assets', 'icon.png'), path.join(www, 'icon.png'));
fs.mkdirSync(path.join(www, 'fonts'));
fs.copyFileSync(path.join(root, 'assets', 'fonts', 'Lobster-Regular.ttf'), path.join(www, 'fonts', 'Lobster-Regular.ttf'));

const css = fs.readFileSync(path.join(www, 'styles.css'), 'utf8').replace('../assets/fonts/', 'fonts/');
fs.writeFileSync(path.join(www, 'styles.css'), css);

const html = fs.readFileSync(path.join(root, 'src', 'index.html'), 'utf8')
  .replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover">')
  .replace('<link rel="stylesheet" href="styles.css">', '<link rel="stylesheet" href="styles.css">\n<link rel="stylesheet" href="mobile.css">')
  .replace('../assets/icon.png', 'icon.png')
  .replace('<script src="renderer.js"></script>', '<script src="app.js"></script>\n<script src="renderer.js"></script>');
fs.writeFileSync(path.join(www, 'index.html'), html);
console.log('www/ ready');
