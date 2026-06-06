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
const releaseNotes = read('RELEASE_NOTES.md');

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
check(readme.includes('How to Open on macOS') || readme.includes('How to open on macOS'), 'README must document how to open the unsigned macOS app.');
check(readme.includes('unsigned') && readme.includes('not notarized'), 'README must disclose that macOS release builds are unsigned and not notarized.');
check(readme.includes('unverified internal QA'), 'README must label Windows/Linux as unverified internal QA targets.');
check(!readme.includes('Linux .deb'), 'README must not advertise a Linux .deb artifact.');
check(!readme.includes('0.1.1'), 'README must not advertise stale v0.1.1 release assets.');

check(releaseNotes.includes(`ClawDesk v${pkg.version}`), 'RELEASE_NOTES must match package.json version.');
check(releaseNotes.includes('Developer Preview'), 'RELEASE_NOTES must identify this as a developer-preview release.');
check(releaseNotes.includes('npm run check:security') && releaseNotes.includes('npm audit'), 'RELEASE_NOTES must document release security checks.');
check(releaseNotes.includes('unverified internal QA'), 'RELEASE_NOTES must label Windows/Linux as unverified internal QA targets.');
check(!releaseNotes.includes('0.1.1'), 'RELEASE_NOTES must not advertise stale v0.1.1 release assets.');

if (failures.length) {
  console.error('Security/package checks failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Security/package checks passed.');
