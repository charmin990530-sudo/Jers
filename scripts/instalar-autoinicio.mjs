/**
 * scripts/instalar-autoinicio.mjs
 *
 * Instala el servicio systemd de usuario que deja el backend encendido
 * mientras trabajamos en local.
 *
 * Por que systemd y no un nohup: `Restart=always` reinicia el proceso si
 * muere, y `ExecStartPre` regenera `frontend/public/` en cada arranque, asi
 * que lo servido nunca queda desfasado del fuente.
 *
 * Uso:
 *   node scripts/instalar-autoinicio.mjs            instala y arranca
 *   node scripts/instalar-autoinicio.mjs --desinstalar
 *   node scripts/instalar-autoinicio.mjs --estado
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGEN = path.join(RAIZ, 'scripts', 'by-jers-dev.service');
const DESTINO_DIR = path.join(os.homedir(), '.config', 'systemd', 'user');
const DESTINO = path.join(DESTINO_DIR, 'by-jers-dev.service');
const SERVICIO = 'by-jers-dev.service';

const argumentos = process.argv.slice(2);
const desinstalar = argumentos.includes('--desinstalar');
const soloEstado = argumentos.includes('--estado');

/** Ejecuta systemctl --user y devuelve { ok, salida }. Nunca lanza. */
const systemctl = (...args) => {
  try {
    const salida = execFileSync('systemctl', ['--user', ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, salida: salida.trim() };
  } catch (error) {
    return {
      ok: false,
      salida: String(error.stderr || error.stdout || error.message).trim(),
    };
  }
};

const mostrarEstado = () => {
  const { ok, salida } = systemctl('status', SERVICIO, '--no-pager', '-n', '0');
  console.log(ok ? salida : `El servicio no esta activo.\n${salida}`);
  return ok;
};

// ---------------------------------------------------------------- -- estado
if (soloEstado) {
  process.exit(mostrarEstado() ? 0 : 1);
}

// ----------------------------------------------------------- desinstalar
if (desinstalar) {
  systemctl('stop', SERVICIO);
  systemctl('disable', SERVICIO);
  if (fs.existsSync(DESTINO)) fs.rmSync(DESTINO);
  systemctl('daemon-reload');
  console.log('Servicio desinstalado. El backend ya no se levanta solo.');
  process.exit(0);
}

// --------------------------------------------------------------- instalar
// `REPLACE_WITH_PROJECT_PATH` se sustituye por la ruta real del proyecto. Con
// una ruta con espacios (este repo las tiene) hay que entrecomillarla en el
// servicio, porque systemd no aplica shell al WorkingDirectory.
// La ruta va SIN comillas. systemd no interpreta el valor con reglas de shell:
// entrecomillarlo hace que las comillas se cuenten como parte de la ruta y el
// servicio se rechaza con "WorkingDirectory= path is not absolute". Los
// espacios se soportan tal cual, no hace falta escaparlos.
const contenido = fs
  .readFileSync(ORIGEN, 'utf8')
  .replace('REPLACE_WITH_PROJECT_PATH', RAIZ);

fs.mkdirSync(DESTINO_DIR, { recursive: true });
fs.writeFileSync(DESTINO, contenido);

const reload = systemctl('daemon-reload');
if (!reload.ok) {
  console.error('systemctl --user daemon-reload fallo. El servicio no quedo instalado.');
  console.error(reload.salida);
  process.exit(1);
}

const enable = systemctl('enable', '--now', SERVICIO);
if (!enable.ok) {
  console.error('El servicio se escribio pero no se pudo activar:');
  console.error(enable.salida);
  console.error('');
  console.error('Causa habitual: la sesion de systemd del usuario no esta activa.');
  console.error('Prueba con:  loginctl enable-linger ' + os.userInfo().username);
  process.exit(1);
}

console.log(`Servicio instalado y arrancado desde ${RAIZ}`);
console.log('');
console.log('  Ver estado:   systemctl --user status ' + SERVICIO);
console.log('  Ver logs:     journalctl --user -u ' + SERVICIO + ' -f');
console.log('  Detener:      systemctl --user stop ' + SERVICIO);
console.log('  Desinstalar:  node scripts/instalar-autoinicio.mjs --desinstalar');
console.log('');
mostrarEstado();