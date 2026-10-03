/**
 * run-tests-frontend.mjs — lanzador de los tests del frontend.
 *
 * Es el mismo problema que resuelve `backend/tests/run.js`, y por eso la
 * solución es la misma: resolver `jest` con el algoritmo de Node
 * (`createRequire`), que sube por los directorios hasta encontrarlo, en vez de
 * escribir una ruta a mano.
 *
 * Por qué importa: `package.json` declara `workspaces: ["backend"]`, así que npm
 * sube las dependencias a la raíz del repositorio y `backend/node_modules/jest`
 * deja de existir. Un `node backend/node_modules/jest/bin/jest.js` escrito a mano
 * funciona hoy y falla en cuanto alguien reinstala. Ese fue el bug que dejó el
 * script de test del backend sin poder arrancar, y el mismo se repetiría aquí.
 */

import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// El campo "exports" de jest declara "./bin/jest" SIN la extension, asi que pedir
// "jest/bin/jest.js" falla con ERR_PACKAGE_PATH_NOT_EXPORTED aunque el archivo
// exista. Se prueban las dos formas y, como ultimo recurso, el shim de npm.
const CANDIDATOS = ['jest/bin/jest', 'jest/bin/jest.js'];
let jestBin = null;
let ultimoError;
for (const especificador of CANDIDATOS) {
  try {
    jestBin = require.resolve(especificador);
    break;
  } catch (error) {
    ultimoError = error;
  }
}
if (!jestBin) {
  try {
    jestBin = require.resolve(`${RAIZ}/node_modules/jest/bin/jest.js`);
  } catch {
    ultimoError = ultimoError ?? new Error('jest no encontrado');
  }
}

if (!jestBin) {
  console.error(
    '\nNo se encontro jest. Instala las dependencias antes de correr los tests:\n\n'
    + '  npm install\n\n'
    + `Detalle: ${ultimoError?.message}\n`,
  );
  process.exit(1);
}

// `--experimental-vm-modules` es obligatorio para que Jest cargue ESM nativo, y
// se pasa como flag del proceso hijo en vez de por variable de entorno, para no
// depender de la sintaxis de shell (que cambia entre Unix y Windows).
const hijo = spawn(
  process.execPath,
  [
    '--experimental-vm-modules',
    jestBin,
    '--config',
    resolve(RAIZ, 'tests/frontend/jest.config.js'),
    ...process.argv.slice(2),
  ],
  { stdio: 'inherit' },
);

hijo.on('error', error => {
  console.error('No se pudo lanzar jest:', error.message);
  process.exit(1);
});

hijo.on('exit', (code, signal) => {
  process.exit(signal ? 1 : code ?? 0);
});