/* global document */
/** E2E con Playwright existente como herramienta externa; no instala dependencias.
 * AUDIT_PLAYWRIGHT_MODULE apunta a su index.mjs si no está en node_modules.
 * Pago manual: se verifica la conciliación por API, nunca se inicia un cobro real.
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { startAuditFixture } from './audit-fixture.mjs';

const { chromium, webkit } = await import(process.env.AUDIT_PLAYWRIGHT_MODULE || 'playwright');
const engine = process.env.AUDIT_BROWSER || 'chromium';
assert.ok(['chromium', 'webkit'].includes(engine));
const fixture = await startAuditFixture();
let browser;
const checks = [];
const check = (name, condition) => { assert.ok(condition, name); checks.push(name); };
const artifactDir = 'output/playwright/full-audit';
await mkdir(artifactDir, { recursive: true });
try {
  browser = await (engine === 'webkit' ? webkit : chromium).launch({ headless: true,
    ...(engine === 'chromium' ? { executablePath: process.env.CHROME_BIN || '/opt/brave.com/brave/brave' } : {}) });
  const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const exceptions = [];
  page.on('pageerror', error => exceptions.push(error.name));
  await page.addInitScript(() => {
    globalThis.auditVitals = { lcp: null, cls: 0 };
    if (typeof PerformanceObserver === 'undefined') return;
    for (const type of ['largest-contentful-paint', 'layout-shift']) {
      try {
        new PerformanceObserver(list => {
          for (const entry of list.getEntries()) {
            if (type === 'largest-contentful-paint') globalThis.auditVitals.lcp = entry.startTime;
            if (type === 'layout-shift' && !entry.hadRecentInput) globalThis.auditVitals.cls += entry.value;
          }
        }).observe({ type, buffered: true });
      } catch { /* Motor sin estas métricas: quedan sin verificar. */ }
    }
  });
  await page.goto(fixture.origin + '/register');
  const email = 'audit-client@example.com';
  const password = randomBytes(24).toString('base64url');
  for (const [name, value] of Object.entries({ nombre: 'Cliente', apellido: 'Ficticio', email, password })) {
    await page.locator(`[name="${name}"]`).fill(value);
  }
  await page.locator('[name="aceptoTerminos"]').check();
  await page.locator('[name="aceptoPrivacidad"]').check();
  const registered = page.waitForResponse(response => response.url().endsWith('/auth/register') && response.request().method() === 'POST');
  await page.locator('form button[type="submit"]').click();
  check('registro por interfaz', (await registered).status() === 201);
  const login = async (loginEmail, loginPassword) => {
    await page.goto(fixture.origin + '/login');
    await page.locator('[name="email"]').fill(loginEmail);
    await page.locator('[name="password"]').fill(loginPassword);
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL('**/tienda');
  };
  await login(email, password);
  check('login por interfaz', true);
  await page.goto(fixture.origin + '/catalogo/maquillaje');
  const search = page.locator('input[type="search"]');
  const searched = page.waitForResponse(response => response.url().includes('/products/categoria/maquillaje') && response.url().includes('search=Labial'));
  await search.fill('Labial');
  check('búsqueda ejecutada en API', (await searched).ok());
  await page.locator('.cardname a').first().waitFor();
  await page.locator('.cardname a').first().click();
  await page.locator('.titulo-producto').waitFor();
  check('búsqueda y ficha de producto', (await page.locator('h1').innerText()).includes('Labial'));
  check('precio describe el IVA aplicado por servidor', (await page.locator('.impuestos').innerText()).includes('antes de impuestos'));
  await page.getByRole('button', { name: 'Añadir al carrito', exact: true }).click();
  await page.getByText('Producto añadido al carrito.', { exact: false }).waitFor();
  await page.goto(fixture.origin + '/carrito');
  await page.locator('.carrito .item').first().waitFor();
  check('carrito persistente', (await page.locator('main').innerText()).includes('Labial'));
  // Se gana el premio con las mismas rutas HTTP que usa el estudio; no se crea en la BD.
  const reward = await page.evaluate(async () => {
    const csrf = (await (await fetch('/api/auth/csrf')).json()).csrfToken;
    const headers = { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf };
    const started = await fetch('/api/studio/attempts', { method: 'POST', headers, body: JSON.stringify({ challenge: 'libre' }) });
    const { attempt } = await started.json();
    const stepped = await fetch(`/api/studio/attempts/${attempt.id}/step`, { method: 'PATCH', headers,
      body: JSON.stringify({ revision: 0, category: 'labios', option: { category: 'labios', shade: 'nude', intensity: 40 } }) });
    if (!stepped.ok) throw new Error('STUDIO_STEP_FAILED');
    return (await (await fetch('/api/studio/rewards')).json()).rewards[0];
  });
  check('premio validado por el servidor', Boolean(reward.id));
  await page.goto(fixture.origin + '/checkout');
  await page.locator('#checkout-reward').selectOption(reward.id);
  await page.locator('.descuento-premio').waitFor();
  for (const [name, value] of Object.entries({ nombreCompleto: 'Cliente Ficticio', telefono: '3000000000', direccion: 'Calle Ficticia 10', ciudad: 'Bogotá', departamento: 'Cundinamarca' })) {
    await page.locator(`[name="${name}"]`).fill(value);
  }
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => document.fonts.ready);
    check(`checkout con datos sin desbordamiento ${width}px`, await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
    await page.screenshot({ path: `${artifactDir}/${engine}-checkout-${width}.png`, fullPage: true });
  }
  const submitted = page.waitForResponse(response => response.url().endsWith('/orders') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Confirmar pedido', exact: true }).click();
  const createdResponse = await submitted;
  check('checkout aceptado', createdResponse.status() === 201);
  const created = (await createdResponse.json()).order;
  await page.getByRole('heading', { name: '¡Pedido creado!' }).waitFor();
  check('descuento y total calculados en servidor', created.descuento === 5000 && created.total === 71400);
  check('confirmación manual, sin PII en WhatsApp', Boolean(created.whatsappUrl) && !decodeURIComponent(created.whatsappUrl).includes('Calle Ficticia'));
  await page.goto(fixture.origin + '/pedidos');
  await page.locator('.pedido-numero').waitFor();
  check('pedido en historial', (await page.locator('.pedido-numero').innerText()) === created.numeroOrden);
  const other = await browser.newContext();
  const forbidden = await other.request.get(fixture.origin + '/api/orders/' + created.id);
  check('pedido no accesible anónimamente', forbidden.status() === 401);
  await other.close();
  await page.goto(fixture.origin + '/admin');
  await page.getByRole('heading', { name: 'Acceso restringido' }).waitFor();
  check('panel bloqueado para cliente', true);
  await page.evaluate(async () => {
    const csrf = (await (await fetch('/api/auth/csrf')).json()).csrfToken;
    const response = await fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: '{}' });
    if (!response.ok) throw new Error('LOGOUT_FAILED');
  });
  await login(fixture.adminEmail, fixture.adminPassword);
  await page.goto(fixture.origin + '/admin');
  await page.getByRole('button', { name: 'Pedidos', exact: true }).click();
  await page.locator('.pedido-admin h3').waitFor();
  check('pedido recibido en panel administrador', (await page.locator('.pedido-admin h3').innerText()) === created.numeroOrden);
  // Conciliación MANUAL de prueba: no existe pasarela ni control de pago en el panel.
  const paid = await page.evaluate(async id => {
    const csrf = (await (await fetch('/api/auth/csrf')).json()).csrfToken;
    const response = await fetch('/api/admin/pedidos/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ estadoPago: 'pagado' }) });
    return { status: response.status, data: await response.json() };
  }, created.id);
  check('conciliación manual por API administrativa', paid.status === 200 && paid.data.order.estadoPago === 'pagado');
  await page.getByRole('button', { name: 'Resumen', exact: true }).click();
  await page.locator('.stats').waitFor();
  await page.waitForFunction(() => document.querySelector('.stat')?.textContent.includes('71.400'));
  check('ingresos tras conciliación', (await page.locator('.stat').first().innerText()).includes('71.400'));
  check('inventario descontado una vez', (await fixture.models.Product.findById(fixture.productId)).stock === 19);
  const responsive = [];
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['/tienda', '/catalogo/maquillaje', '/producto/' + fixture.productId, '/carrito', '/checkout', '/admin', '/no-existe-audit']) {
      await page.goto(fixture.origin + route);
      await page.locator('main h1').first().waitFor();
      await page.waitForLoadState('networkidle');
      await page.evaluate(() => document.fonts.ready);
      const metrics = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        unlabeledImages: document.querySelectorAll('img:not([alt])').length,
        vitals: globalThis.auditVitals,
      }));
      check(`sin desbordamiento ${route} ${width}px`, !metrics.overflow);
      check(`imágenes con alt ${route} ${width}px`, metrics.unlabeledImages === 0);
      responsive.push({ width, route, ...metrics });
    }
    await page.goto(fixture.origin + '/catalogo/maquillaje');
    await page.locator('.cardname').first().waitFor();
    await page.screenshot({ path: `${artifactDir}/${engine}-${width}.png`, fullPage: true });
  }
  check('sin excepciones JavaScript', exceptions.length === 0);
  await page.goto(fixture.origin + '/catalogo/maquillaje');
  await page.keyboard.press('Tab');
  check('enlace de salto accesible con teclado', await page.evaluate(() => document.activeElement?.classList.contains('skip-link')));
  const apiTimings = [];
  for (const route of ['/api/health', '/api/products', '/api/products/' + fixture.productId, '/api/products/categoria/maquillaje']) {
    const samples = [];
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      const response = await fetch(fixture.origin + route);
      await response.arrayBuffer();
      check(`respuesta HTTP ${route} ${i + 1}`, response.ok);
      samples.push(performance.now() - start);
    }
    samples.sort((a, b) => a - b);
    apiTimings.push({ route, medianMs: Math.round(samples[2] * 100) / 100, maxMs: Math.round(samples[4] * 100) / 100 });
  }
  const report = { engine, checks: checks.length, passed: checks, responsive, exceptions, apiTimings,
    limitations: ['Pago automático y SMTP real no verificados.', 'INP de campo y WCAG AA integral no verificados.', 'Viewport emulado; no dispositivo físico.'] };
  await writeFile(`${artifactDir}/${engine}-results.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ engine, passed: checks.length, exceptions: exceptions.length }));
} finally {
  if (browser) await browser.close();
  await fixture.stop();
}
