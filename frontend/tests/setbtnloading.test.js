/**
 * @jest-environment jsdom
 *
 * setBtnLoading: el helper que pone el estado de carga de TODOS los botones de
 * envío de la tienda.
 *
 * POR QUÉ ESTE TEST (B-22)
 * -----------------------
 * El helper tenía dos rutas: si el botón traía `<span class="btn-texto">` y
 * `<span class="btn-loader">` —como en login.html y register.html— cambiaba los
 * spans; y si no, no hacía nada visible. El formulario de contacto tiene
 * `<button class="contact-btn">Enviar</button>`, texto plano y sin spans, así que
 * el `disabled` se aplicaba pero el texto se quedaba en "Enviar": el usuario no
 * tenía ninguna señal de que su mensaje estuviera saliendo.
 *
 * El arreglo no fue añadir los spans a contacto.html, sino arreglar el helper,
 * porque el problema no era de ese botón sino del helper: cualquier botón nuevo
 * sin spans volvía a estar mudo.
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import { setBtnLoading } from '../js/auth.js';

const CON_SPANS = `
  <button type="submit" class="auth-btn" id="btnLogin">
    <span class="btn-texto">Iniciar sesión</span>
    <span class="btn-loader" hidden aria-hidden="true">⏳</span>
  </button>`;

const SIN_SPANS = '<button class="contact-btn" type="submit">Enviar</button>';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('setBtnLoading: botón con spans', () => {
  const montar = () => {
    document.body.innerHTML = CON_SPANS;
    return document.getElementById('btnLogin');
  };

  it('al cargar oculta el texto y muestra el loader', () => {
    const btn = montar();

    setBtnLoading(btn, true);

    expect(btn.querySelector('.btn-texto').hidden).toBe(true);
    expect(btn.querySelector('.btn-loader').hidden).toBe(false);
    expect(btn.disabled).toBe(true);
  });

  it('al terminar vuelve al estado inicial', () => {
    const btn = montar();

    setBtnLoading(btn, true);
    setBtnLoading(btn, false);

    expect(btn.querySelector('.btn-texto').hidden).toBe(false);
    expect(btn.querySelector('.btn-loader').hidden).toBe(true);
    expect(btn.disabled).toBe(false);
  });

  it('no toca el texto del botón', () => {
    const btn = montar();

    setBtnLoading(btn, true);

    expect(btn.textContent).toContain('Iniciar sesión');
  });
});

describe('setBtnLoading: botón con texto plano', () => {
  // Este es el caso de contacto.html, que era el bug.
  const montar = () => {
    document.body.innerHTML = SIN_SPANS;
    return document.querySelector('.contact-btn');
  };

  it('cambia el texto para que se vea que algo está pasando', () => {
    const btn = montar();

    setBtnLoading(btn, true);

    expect(btn.textContent).toBe('Enviando…');
    expect(btn.textContent).not.toBe('Enviar');
    expect(btn.disabled).toBe(true);
  });

  it('restaura la etiqueta original al terminar', () => {
    const btn = montar();

    setBtnLoading(btn, true);
    setBtnLoading(btn, false);

    expect(btn.textContent).toBe('Enviar');
    expect(btn.disabled).toBe(false);
  });

  it('no se come la etiqueta si se pulsa dos veces seguidas', () => {
    // El fallo clasico de guardar el "original" mal: la segunda vez se guardaba
    // "Enviando..." como original y al terminar el boton se quedaba en
    // "Enviando..." para siempre.
    const btn = montar();

    setBtnLoading(btn, true);
    setBtnLoading(btn, true);
    setBtnLoading(btn, false);

    expect(btn.textContent).toBe('Enviar');
  });

  it('marca aria-busy mientras carga y lo quita al terminar', () => {
    const btn = montar();

    setBtnLoading(btn, true);
    expect(btn.getAttribute('aria-busy')).toBe('true');

    setBtnLoading(btn, false);
    expect(btn.hasAttribute('aria-busy')).toBe(false);
  });

  it('no deja el atributo de la etiqueta original colgando', () => {
    const btn = montar();

    setBtnLoading(btn, true);
    setBtnLoading(btn, false);

    expect(btn.dataset.etapaOriginal).toBeUndefined();
  });
});