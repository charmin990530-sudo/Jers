import { spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const carpeta = fileURLToPath(new URL('../frontend/angular/', import.meta.url));
const cli = fileURLToPath(new URL('../frontend/angular/node_modules/@angular/cli/bin/ng.js', import.meta.url));
const env = { ...process.env };
if (!env.CHROME_BIN && process.platform === 'linux') {
  // El lanzador shell de Brave deja vivo al navegador al terminar Karma.
  // Usar el binario permite cerrar el proceso y devolver el resultado a CI.
  env.CHROME_BIN = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/opt/brave.com/brave/brave', '/usr/bin/brave-browser'].find(existsSync);
}
const hijo = spawn(process.execPath, [cli, 'test', '--watch=false', '--browsers=ChromeHeadless', '--reporters=dots', ...process.argv.slice(2)], { cwd: carpeta, env, stdio: 'inherit' });
hijo.on('error', error => { console.error(error.message); process.exitCode = 1; });
hijo.on('exit', code => {
  // Karma deja bundles grandes por cada ejecución; conservar solo la salida de producción.
  rmSync(fileURLToPath(new URL('../frontend/angular/dist/test-out/', import.meta.url)), { recursive: true, force: true });
  process.exitCode = code ?? 1;
});
