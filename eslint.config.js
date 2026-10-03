import js from '@eslint/js';
import globals from 'globals';

// Flat config. El proyecto mezcla dos entornos que no se pueden mezclar en el
// mismo bloque de `languageOptions.globals`: el backend corre en Node (tiene
// `process`, `Buffer`, `__dirname` via createRequire) y el frontend en el
// navegador (tiene `window`, `document`, `localStorage`). Aplicar el set
// equivocado daria falsos positivos por todos lados, asi que van separados.
//
// Que no hubiera linter no era solo estilo: los bugs A-03 y A-08 de AUDITORIA.md
// (un `throw` sin catch y leer `.data` cuando la API devuelve un objeto) solo se
// ven cuando el JS se ejecuta en el navegador. `checkJs` los ve antes.

const ignores = [
  'node_modules/**',
  'public/**',        // build generado por scripts/preparar-estatico.mjs
  'backend/coverage/**',
  'thunder-tests/**',
  'video/**',
  'data/**',
  '.vercel/**',
];

const baseRules = {
  ...js.configs.recommended.rules,

  // El proyecto ya tiene sus propias utilidades de error en backend/src/utils y
  // avisar por consola esta prohibido en produccion (hay Sentry). No hay
  // exceptions today, asi que la regla puede activarse dura.
  'no-console': 'off',

  // Un `catch` que no nombra el error es casi siempre un `catch` que queria
  // loguearlo. Este proyecto lo hace bien, asi que la regla se queda.
  //
  // `next` se permite sin usar: Express reparte los argumentos por posicion, no
  // por nombre, asi que un `asyncHandler(async (req, res, next) => ...)` que no
  // llega a llamar a `next` es legitimo (resuelve con 4xx). Exigirlo obligaria a
  // escribir `async (req, res, _next)` por estetica, que es ruido.
  'no-unused-vars': ['error', {
    args: 'after-used',
    argsIgnorePattern: '^(_|next$)',
    varsIgnorePattern: '^_',
    caughtErrors: 'all',
    caughtErrorsIgnorePattern: '^_',
  }],

  // Los bloques `if (x) return;` sin llaves se usan mucho en el codigo actual y
  // no son un riesgo real de bug; no se imponen llaves.
  curly: 'off',

  // Firefox y Safari siguen sin soportar esto; el codigo ya evita
  // `Array.prototype.at` donde importa.
  'no-var': 'error',
  'prefer-const': ['error', { destructuring: 'all' }],

  // Zona muerta temporal. Es la clase de fallo que mas caro sale y mas invisible
  // es: una `const` usada antes de su declaracion no da error al escribir el
  // codigo, ni lo dan los tests si la funcion se invoca mas tarde, y solo
  // revienta cuando esa funcion se llama durante la evaluacion del modulo.
  // Pasó de verdad: `leerMeta` en js/config.js se llamaba desde
  // `obtenerApiBaseUrl`, que se invoca al cargar el modulo, y `config.js`
  // entero dejo de funcionar en el navegador mientras los 199 tests en verde.
  // `functions: false` a proposito: una `function` declarada esta izada, asi que
  // usarla antes de su declaracion NO falla nunca y solo es estilo. Lo que si
  // revienta es la zona muerta temporal de `const`/`let`, y eso es lo que se
  // comprueba aqui.
  'no-use-before-define': ['error', { functions: false, classes: false, variables: true }],

  eqeqeq: ['error', 'smart'],
  'no-implicit-coercion': 'off',
};

export default [
  { ignores },

  js.configs.recommended,

  // ---- Frontend: el navegador ----------------------------------------------
  {
    // Todo `js/` son modulos ES salvo los dos que los HTML cargan como scripts
    // clasicos (`<script src=...>` sin `type="module"`): son los que corren
    // antes de que exista el grafo de modulos, para que la pagina no se vea
    // rota mientras se descargan el resto.
    files: ['js/**/*.js'],
    ignores: ['js/fondo-textura.js', 'js/loader-boot.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.serviceworker,
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: true,
    },
    rules: baseRules,
  },

  // ---- Frontend: los dos scripts clasicos --------------------------------
  {
    // Se cargan con `<script src=...>` sin `type="module"`, asi que viven en
    // el ambito global de la pagina y no pueden usar import/export.
    files: ['js/fondo-textura.js', 'js/loader-boot.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'script',
      globals: {
        ...globals.browser,
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: true,
    },
    rules: baseRules,
  },

  // ---- Backend, la funcion serverless y los scripts: Node ---------------
  {
    files: ['backend/src/**/*.js', 'api/**/*.js', 'scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: true,
    },
    rules: baseRules,
  },

  // ---- Tests ---------------------------------------------------------------
  {
    files: ['backend/tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    rules: {
      ...baseRules,
      // Los fixtures de test declaran variables que no siempre se usan.
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrors: 'none',
      }],
    },
  },
];