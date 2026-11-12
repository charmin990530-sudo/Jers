/** Codifica el render original y sus posters. Sin servicios ni recursos de pago. */
import { existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const frames = path.join(root, 'output/boutique/frames');
const missing = Array.from({ length: 241 }, (_, i) => i + 1).filter(n => !existsSync(path.join(frames, `${String(n).padStart(4, '0')}.png`)));
if (missing.length) throw new Error(`Faltan ${missing.length} fotogramas originales; no se exporta un video incompleto.`);
const videos = path.join(root, 'frontend/video');
const posters = path.join(root, 'frontend/img/boutique');
mkdirSync(videos, { recursive: true }); mkdirSync(posters, { recursive: true });
const run = args => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'warning', '-y', ...args], { stdio: 'inherit' });
const encoding = ['-an', '-c:v', 'libx264', '-preset', 'medium', '-threads', '3', '-g', '1', '-keyint_min', '1', '-sc_threshold', '0', '-bf', '0', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'];
const input = ['-framerate', '24', '-start_number', '1', '-i', path.join(frames, '%04d.png'), '-frames:v', '241'];
run([...input, ...encoding, '-crf', '21', path.join(videos, 'jers-store-entry-v1.mp4')]);
run([...input, '-vf', 'crop=456:810:(iw-456)/2:0,scale=540:960:flags=lanczos', ...encoding, '-crf', '22', path.join(videos, 'jers-store-entry-mobile-v1.mp4')]);
run([...input, '-vf', 'crop=608:810:(iw-608)/2:0,scale=720:960:flags=lanczos', ...encoding, '-crf', '21', path.join(videos, 'jers-store-entry-tablet-v1.mp4')]);
for (const [name, frame] of [['exterior', '0001'], ['interior', '0241']]) {
  run(['-i', path.join(frames, `${frame}.png`), '-frames:v', '1', '-c:v', 'libwebp', '-quality', '86', path.join(posters, `jers-${name}-v1.webp`)]);
  run(['-i', path.join(frames, `${frame}.png`), '-vf', 'crop=456:810:(iw-456)/2:0,scale=540:960:flags=lanczos', '-frames:v', '1', '-c:v', 'libwebp', '-quality', '86', path.join(posters, `jers-${name}-mobile-v1.webp`)]);
  run(['-i', path.join(frames, `${frame}.png`), '-vf', 'crop=608:810:(iw-608)/2:0,scale=720:960:flags=lanczos', '-frames:v', '1', '-c:v', 'libwebp', '-quality', '86', path.join(posters, `jers-${name}-tablet-v1.webp`)]);
}
const artifacts = ['jers-store-entry-v1.mp4', 'jers-store-entry-mobile-v1.mp4', 'jers-store-entry-tablet-v1.mp4'].map(file => ({ file: `/video/${file}`, bytes: statSync(path.join(videos, file)).size }));
writeFileSync(path.join(root, 'docs/BOUTIQUE-GENERACION.json'), JSON.stringify({
  date: '2026-11-11', status: 'render-original-exportado',
  design: 'Boutique conceptual JERS aprobada por el usuario en la conversación.',
  palette: ['#003D2F', '#F7F4E7', '#C8A36B'],
  sources: ['scripts/render-boutique.py', 'scripts/render-boutique-film.py', 'scripts/preparar-video-boutique.mjs'],
  renderer: 'Blender 3.6.23 LTS / Eevee / NVIDIA GeForce GTX 1050 / OpenGL PRIME',
  encoding: 'FFmpeg 6.1.1 / libx264 / fotogramas I independientes para seek; NVENC requiere un controlador posterior al instalado.',
  frameCount: 241, fps: 24, durationSeconds: 241 / 24,
  desktop: { width: 1440, height: 810 }, mobile: { width: 540, height: 960 }, tablet: {width: 720, height: 960},
  originalScene: 'output/boutique/jers-boutique.blend (local, no publicado)',
  externalGenerationServices: [], thirdPartyPaidAssets: [], artifacts,
}, null, 2) + '\n');
console.log(JSON.stringify({ ready: true, artifacts }));
