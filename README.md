# By Jers

Tienda de maquillaje y cuidado capilar hecha como proyecto de portafolio full stack. Tiene catálogo, carrito, cuentas, panel administrativo y un recorrido visual para la entrada de la boutique.

## Stack

Angular, TypeScript, Node.js, Express, MongoDB, Mongoose y Vercel.

## Qué incluye

- Catálogo con búsqueda, filtros y fichas de producto.
- Registro, inicio de sesión, carrito y pedidos.
- API con validación, protección CSRF y control de roles.
- Demo estática del frontend con recursos de muestra.

## Ejecutar

```bash
npm ci
npm ci --prefix frontend/angular
cp backend/.env.example backend/.env
npm start
```

Completa las variables privadas de `backend/.env`; nunca subas ese archivo.

## Demo

[Ver la demo visual](https://by-jers-demo-juan-david.brightmanta3.chatgpt.site/)

Los datos de la demo son ficticios y no hay pagos reales.
