/**
 * loader-boot.js - Arranque del splash screen (script clásico, sin módulos)
 *
 * Se carga de forma síncrona en el <head> para dos cosas:
 * 1. Inyectar el markup del splash apenas existe <body>, sin esperar a los
 *    módulos ES, que bloquean hasta que el backend responde.
 * 2. Programar su ocultación con respaldos, para que un fallo de red, de un
 *    módulo o de un script de terceros nunca deje la página tapada.
 *
 * Se incluye como <script src="js/loader-boot.js"></script> en el <head>.
 */

(function () {
  'use strict';

  var MINIMO_MS = 700;
  var MAXIMO_MS = 4000;
  var inicio = Date.now();
  var oculto = false;

  function construirMarca() {
    var marca = document.createElement('div');
    marca.className = 'loader-marca';

    var letras = ['J', 'e', 'r', 's'];
    for (var i = 0; i < letras.length; i++) {
      var letra = document.createElement('span');
      letra.className = 'loader-inicial';
      letra.style.setProperty('--i', i);
      letra.textContent = letras[i];
      marca.appendChild(letra);
    }

    var texto = document.createElement('span');
    texto.className = 'loader-texto';
    texto.textContent = 'By Jers';
    marca.appendChild(texto);

    var barra = document.createElement('span');
    barra.className = 'loader-barra';
    var progreso = document.createElement('span');
    progreso.className = 'loader-progreso';
    barra.appendChild(progreso);
    marca.appendChild(barra);

    return marca;
  }

  function crearLoader() {
    var loader = document.createElement('div');
    loader.id = 'page-loader';
    loader.className = 'page-loader';
    loader.setAttribute('role', 'status');
    loader.setAttribute('aria-label', 'Cargando By Jers');
    loader.appendChild(construirMarca());
    return loader;
  }

  function insertar() {
    if (!document.body) return false;
    if (document.getElementById('page-loader')) return true;
    document.body.insertBefore(crearLoader(), document.body.firstChild);
    return true;
  }

  function ocultar() {
    if (oculto) return;
    var loader = document.getElementById('page-loader');
    if (!loader) {
      oculto = true;
      return;
    }
    oculto = true;
    loader.className += ' page-loader--oculto';
    if (window.setTimeout) {
      window.setTimeout(function () {
        if (loader.parentNode) loader.parentNode.removeChild(loader);
      }, 500);
    }
  }

  function ocultarRespetandoMinimo() {
    var transcurrido = Date.now() - inicio;
    var restante = Math.max(0, MINIMO_MS - transcurrido);
    if (window.setTimeout) window.setTimeout(ocultar, restante);
    else ocultar();
  }

  // El markup se inserta en cuanto hay body, sin esperar a los módulos.
  if (!insertar() && document.addEventListener) {
    document.addEventListener('DOMContentLoaded', insertar, { once: true });
  }

  if (document.readyState === 'complete') {
    ocultarRespetandoMinimo();
  } else if (window.addEventListener) {
    window.addEventListener('load', ocultarRespetandoMinimo, { once: true });
  }

  // Red de seguridad: la página nunca puede quedar bloqueada.
  if (window.setTimeout) window.setTimeout(ocultar, MAXIMO_MS);
})();
