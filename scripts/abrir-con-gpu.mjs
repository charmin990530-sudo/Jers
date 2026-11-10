import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, closeSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Un perfil separado garantiza que la petición no se entregue a un navegador
// ya abierto con Intel. PRIME selecciona NVIDIA solo para este proceso.
const navegador = ['/usr/bin/brave-browser', '/usr/bin/google-chrome', '/usr/bin/chromium']
  .find(ruta => existsSync(ruta));
if (process.platform !== 'linux' || !navegador) {
  console.error('Este comando necesita Linux con NVIDIA y Brave, Chrome o Chromium instalado.');
  process.exit(1);
}
const destino = new URL(process.argv[2] || 'http://127.0.0.1:3000/');
if (!['http:', 'https:'].includes(destino.protocol)) {
  console.error('La vista previa debe ser una dirección HTTP o HTTPS.');
  process.exit(1);
}
const carpeta = join(homedir(), '.cache', 'by-jers-gpu-preview');
mkdirSync(carpeta, { recursive: true });
const log = openSync(join(carpeta, 'navegador.log'), 'a', 0o600);
const hijo = spawn(navegador, [
  `--user-data-dir=${join(carpeta, 'perfil-nvidia')}`,
  '--use-angle=gl', '--ozone-platform=x11',
  '--no-first-run', '--no-default-browser-check', destino.href,
], {
  detached: true,
  stdio: ['ignore', log, log],
  env: {
    ...process.env,
    __NV_PRIME_RENDER_OFFLOAD: '1',
    __GLX_VENDOR_LIBRARY_NAME: 'nvidia',
    __VK_LAYER_NV_optimus: 'NVIDIA_only',
    ...(existsSync('/usr/share/glvnd/egl_vendor.d/10_nvidia.json') ? {
      __EGL_VENDOR_LIBRARY_FILENAMES: '/usr/share/glvnd/egl_vendor.d/10_nvidia.json',
    } : {}),
  },
});
hijo.on('error', error => {
  console.error(`No se pudo abrir el navegador: ${error.message}`);
  process.exitCode = 1;
});
hijo.on('spawn', () => console.log(`Vista previa con NVIDIA solicitada: ${destino.href}`));
hijo.unref();
closeSync(log);
