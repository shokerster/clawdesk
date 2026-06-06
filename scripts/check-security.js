const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

const pkg = JSON.parse(read('package.json'));
const main = read('main.js');
const preload = read('preload.js');
const html = read('index.html');
const readme = read('README.md');

check(!String(pkg.devDependencies?.electron || '').includes('31.'), 'Electron must not regress to the unsupported 31.x line.');
check(!String(pkg.devDependencies?.['electron-builder'] || '').includes('24.'), 'electron-builder must not regress to the old 24.x line.');
check(Boolean(pkg.scripts?.['check:security']), 'package.json must expose npm run check:security.');

check(html.includes('Content-Security-Policy'), 'index.html must define a Content Security Policy.');
check(html.includes("script-src 'self'"), 'CSP must restrict scripts to self.');
check(!html.includes("'unsafe-eval'"), 'CSP must not allow unsafe-eval.');
check(!/<script\b(?![^>]*\bsrc=)/i.test(html), 'index.html must not contain inline script tags.');

check(main.includes('contextIsolation: true'), 'BrowserWindow must keep contextIsolation enabled.');
check(main.includes('nodeIntegration: false'), 'BrowserWindow must keep nodeIntegration disabled.');
check(main.includes('sandbox: true'), 'BrowserWindow should enable renderer sandboxing.');
check(main.includes('setWindowOpenHandler'), 'BrowserWindow must explicitly handle new windows.');
check(main.includes("action: 'deny'"), 'New windows must be denied by default.');
check(main.includes("will-navigate"), 'BrowserWindow must guard unexpected navigation.');
check(main.includes('openAllowedPath'), 'openPath IPC must go through an allowlist helper.');
check(main.includes('isLoopbackHttpUrl'), 'External URL opens must be limited to local loopback URLs.');

check(preload.includes('cleanMessagePayload'), 'preload must sanitize send-message payloads.');
check(preload.includes('cleanString(targetPath'), 'preload must sanitize openPath arguments.');

check(readme.includes('verified on macOS'), 'README must state current platform verification honestly.');
check(!readme.includes('Linux .deb'), 'README must not advertise a Linux .deb artifact.');

if (failures.length) {
  console.error('Security/package checks failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Security/package checks passed.');
