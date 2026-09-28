/**
 * run.js - Lanzador de los tests que no depende de dónde esté node_modules
 *
 * QUE FALLABA ANTES
 * -----------------
 * El script de test era `node --experimental-vm-modules node_modules/jest/bin/jest.js`
 * ejecutado desde `backend/`. Eso funcionaba mientras cada carpeta tuviera su
 * propio `node_modules`. Al declarar `workspaces: ["backend"]` en el package.json
 * de la raiz, npm hoistea las dependencias a la raiz del repositorio y
 * `backend/node_modules/jest` deja de existir:
 *
 *   Error: Cannot find module '.../backend/node_modules/jest/bin/jest.js'
 *
 * El bug era el mismo que el del puerto en el frontend: una ruta absoluta
 * escrita a mano que solo es cierta en un tipo concreto de instalación.
 *
 * QUE HACE ESTE
 * -------------
 * Resuelve `jest` con el algoritmo de Node (createRequire), que sube por los
 * directorios hasta encontrarlo, y lo lanza como proceso hijo. Da igual que jest
 * este en la raiz (workspaces), en backend/node_modules (instalacion suelta) o
 * en cualquier sitio del arbol de resolucion.
 */

import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

const require = createRequire(import.meta.url);

// El campo "exports" de jest declara "./bin/jest" SIN la extension, asi que
// pedir "jest/bin/jest.js" falla con ERR_PACKAGE_PATH_NOT_EXPORTED aunque el
// archivo exista. Se prueban las dos formas y, como ultimo recurso, el shim que
// npm crea en .bin.
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
    jestBin = require.resolve('../node_modules/jest/bin/jest.js');
  } catch {
    ultimoError = ultimoError ?? new Error('jest no encontrado');
  }
}

if (!jestBin) {
  console.error(
    '\nNo se encontro jest. Instala las dependencias antes de correr los tests:\n\n' +
    '  npm install\n\n' +
    'Detalle: ' + ultimoError?.message + '\n',
  );
  process.exit(1);
}

// `--experimental-vm-modules` es obligatorio para que Jest cargue ESM nativo.
// Se pasa como flag del proceso hijo en vez de por variable de entorno, para no
// depender de la sintaxis de shell (que cambia entre Unix y Windows).
const hijo = spawn(
  process.execPath,
  ['--experimental-vm-modules', jestBin, ...process.argv.slice(2)],
  { stdio: 'inherit' },
);

hijo.on('error', error => {
  console.error('No se pudo lanzar jest:', error.message);
  process.exit(1);
});

hijo.on('exit', (code, signal) => {
  process.exit(signal ? 1 : code ?? 0);
});
