import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const carpeta = fileURLToPath(new URL('../frontend/angular/', import.meta.url));
const cli = fileURLToPath(new URL('../frontend/angular/node_modules/@angular/cli/bin/ng.js', import.meta.url));
const env = { ...process.env };
if (!env.CHROME_BIN && process.platform === 'linux') {
  env.CHROME_BIN = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/brave-browser'].find(existsSync);
}
const hijo = spawn(process.execPath, [cli, 'test', '--watch=false', '--browsers=ChromeHeadless', '--reporters=dots', ...process.argv.slice(2)], { cwd: carpeta, env, stdio: 'inherit' });
hijo.on('error', error => { console.error(error.message); process.exitCode = 1; });
hijo.on('exit', code => { process.exitCode = code ?? 1; });
