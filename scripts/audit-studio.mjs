/* global document, localStorage, Storage */
import { readFile } from 'node:fs/promises';

const rules = JSON.parse(await readFile(new URL('../shared/makeup-rules.json', import.meta.url), 'utf8'));

export async function playGuestStudio(browser, origin, check, artifactDir, engine) {
  const context = await browser.newContext({ hasTouch: true, isMobile: true, reducedMotion: 'reduce', viewport: { width: 390, height: 850 } });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.name));
    await page.goto(origin + '/estudio');
    const portrait = page.locator('canvas.portrait');
    await page.locator('.apply-actions .primary:enabled').waitFor();
    for (const width of [320, 360, 390, 430, 768, 1440]) {
      await page.setViewportSize({ width, height: 850 });
      check('estudio cabe a ' + width + ' px', await page.evaluate(expected => document.documentElement.scrollWidth <= expected + 1, width));
    }
    await page.setViewportSize({ width: 390, height: 850 });
    const tools = page.getByRole('group', { name: 'Herramientas de maquillaje' });
    for (const [name, x, y] of [['Labial', 495, 650], ['Sombras', 402, 423], ['Rubor', 371, 529]]) {
      await tools.getByRole('button', { name }).tap();
      await portrait.scrollIntoViewIfNeeded();
      const size = await portrait.boundingBox();
      await portrait.tap({ position: { x: size.width * x / 960, y: size.height * y / 1060 } });
      await page.getByText(name + ' aplicado.', { exact: false }).waitFor();
      check('invitado aplica ' + name + ' por tacto', await page.getByRole('button', { name: 'Quitar capa' }).isEnabled());
    }
    await portrait.screenshot({ path: artifactDir + '/' + engine + '-estudio-movil.png' });
    await page.getByRole('button', { name: 'Reiniciar' }).tap();
    await page.locator('.finish-button:disabled').waitFor();
    await tools.getByRole('button', { name: 'Labial' }).tap();
    const product = page.locator('.studio-product img').first();
    await product.scrollIntoViewIfNeeded();
    await product.evaluate(img => img.decode());
    check('la imagen del producto carga al desplazarse', await product.evaluate(img => img.naturalWidth > 0));
    await page.evaluate(() => localStorage.setItem('by-jers.studio.look.v1', 'corrupto'));
    const avatarRoute = '**/img/avatar-jers/neutral.webp';
    const productsRoute = '**/api/studio/products';
    await page.route(avatarRoute, route => route.abort());
    await page.route(productsRoute, route => route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }));
    await page.reload();
    await page.getByText(/El look guardado no era válido/).waitFor();
    await page.getByRole('button', { name: 'Reintentar rostro' }).waitFor();
    check('avisa sobre guardado corrupto y bloquea aplicar sin retrato', await page.locator('.apply-actions .primary').isDisabled());
    await page.unroute(avatarRoute);
    await page.getByRole('button', { name: 'Reintentar rostro' }).tap();
    await page.locator('.apply-actions .primary:enabled').waitFor();
    await page.locator('.apply-actions .primary').tap();
    await page.locator('.finish-button:enabled').waitFor();
    check('el juego sigue disponible con el catálogo caído', await page.getByRole('button', { name: 'Reintentar catálogo' }).isVisible());
    await page.unroute(productsRoute);
    await page.getByRole('button', { name: 'Reintentar catálogo' }).tap();
    await page.locator('.studio-product').first().waitFor();
    await page.addInitScript(() => {
      const setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === 'by-jers.studio.look.v1') throw new DOMException('Almacenamiento bloqueado', 'SecurityError');
        return setItem.call(this, key, value);
      };
    });
    await page.reload();
    await page.locator('.apply-actions .primary:enabled').tap();
    await page.getByRole('button', { name: 'Guardar look', exact: true }).tap();
    await page.getByText(/No se pudo guardar/).waitFor();
    check('se puede terminar aunque guardar esté bloqueado', await page.locator('.finish-button').isEnabled());
    check('estudio de invitado sin excepciones', errors.length === 0);
  } finally {
    await context.close();
  }
}

export async function playStudio(page, origin, check, artifactDir, engine) {
  await page.goto(origin + '/estudio');
  const button = name => page.getByRole('button', { name });
  const finish = page.locator('.finish-button');
  const portrait = page.locator('canvas.portrait');
  await button(/Aplicar labial/).waitFor();
  await page.waitForFunction(() => !document.querySelector('.apply-actions button').disabled);
  check('modo libre vacío impide terminar', await finish.isDisabled());
  await page.setViewportSize({ width: 390, height: 850 });
  await portrait.scrollIntoViewIfNeeded();
  const size = await portrait.boundingBox();
  const lipPixel = () => portrait.evaluate(canvas => [...canvas.getContext('2d').getImageData(495, 650, 1, 1).data].join(','));
  const before = await lipPixel();
  await portrait.click({ position: { x: size.width * 495 / 960, y: size.height * 650 / 1060 } });
  check('tocar los labios cambia el color del retrato', await lipPixel() !== before);
  await button(/Antes \/ después/).click();
  check('comparación muestra el color original', await lipPixel() === before);
  await button(/Ver mi look/).click();
  await button(/Deshacer/).click();
  check('deshacer restaura los labios', await lipPixel() === before && await finish.isDisabled());
  await portrait.press('Enter');
  await button('Guardar look').click();
  await page.reload();
  await page.getByText(/Recuperamos tu look guardado/).waitFor();
  await finish.click();
  await page.getByRole('heading', { name: 'Tu look está listo.' }).waitFor();
  check('modo libre se recupera y termina', await lipPixel() !== before);
  const downloaded = page.waitForEvent('download');
  await button(/Descargar PNG/).click();
  const download = await downloaded;
  const png = await readFile(await download.path());
  check('exportación PNG de 960 por 1060', png.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' && png.readUInt32BE(16) === 960 && png.readUInt32BE(20) === 1060);
  await button('Borrar look guardado').click();
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const challenge of rules.challenges) {
    await button(new RegExp(challenge.name)).click();
    for (const step of challenge.steps) {
      const tool = rules.categories.find(c => c.id === step.category);
      const shade = rules.shades.find(c => c.id === step.shades[0]);
      await page.getByRole('group', { name: 'Herramientas de maquillaje' }).getByRole('button', { name: tool.name }).click();
      await page.getByRole('button', { name: shade.name, exact: true }).click();
      const slider = page.getByRole('slider');
      const target = Math.round((step.min + step.max) / 2);
      const offset = target - Number(await slider.inputValue());
      for (let move = 0; move < Math.abs(offset); move++) {
        await slider.press(offset > 0 ? 'ArrowRight' : 'ArrowLeft');
      }
      await button(new RegExp('Aplicar ' + tool.name.toLowerCase())).click();
    }
    await page.locator('.finish-button:enabled').waitFor();
    await button('Quitar capa').click();
    await page.locator('.finish-hint').waitFor();
    check(challenge.name + ' bloquea el reto incompleto', await finish.isDisabled());
    await button(/Deshacer/).click();
    await finish.click();
    await page.getByRole('heading', { name: '¡Reto completado!' }).waitFor();
    check(challenge.name + ' concede o conserva los dos premios', await page.locator('.earned').count() === 2);
  }
  await page.locator('.studio-grid').screenshot({ path: artifactDir + '/' + engine + '-estudio-escritorio.png' });
  await page.locator('.result').screenshot({ path: artifactDir + '/' + engine + '-estudio-resultado.png' });
}
