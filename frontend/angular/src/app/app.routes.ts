import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', title: 'Bienvenida al universo By Jers', loadComponent: () => import('./bienvenida/bienvenida').then((m) => m.Bienvenida) },
  { path: 'bienvenida', pathMatch: 'full', redirectTo: '' },
  { path: 'tienda', title: 'By Jers | Belleza y cuidado capilar', loadComponent: () => import('./home/home').then((m) => m.Home) },
  { path: 'estudio', title: 'Estudio de maquillaje | By Jers', loadComponent: () => import('./estudio/estudio').then(m => m.Estudio) },
  { path: 'admin', title: 'Administración | By Jers', loadComponent: () => import('./admin/admin').then((m) => m.Admin) },
  { path: 'catalogo', pathMatch: 'full', redirectTo: 'catalogo/maquillaje' },
  { path: 'catalogo/:slug', title: 'Catálogo | By Jers', loadComponent: () => import('./catalogo/catalogo').then((m) => m.Catalogo) },
  { path: 'producto', pathMatch: 'full', redirectTo: 'catalogo/maquillaje' },
  { path: 'producto/:id', title: 'Producto | By Jers', loadComponent: () => import('./producto/producto').then((m) => m.Producto) },
  { path: 'carrito', title: 'Carrito | By Jers', loadComponent: () => import('./carrito/carrito').then((m) => m.Carrito) },
  { path: 'checkout', title: 'Checkout | By Jers', loadComponent: () => import('./checkout/checkout').then((m) => m.Checkout) },
  { path: 'login', title: 'Ingresar | By Jers', data: { modo: 'login' }, loadComponent: () => import('./auth/auth').then((m) => m.Auth) },
  { path: 'pedidos', title: 'Mis pedidos | By Jers', loadComponent: () => import('./pedidos/pedidos').then((m) => m.Pedidos) },
  { path: 'looks', title: 'Lookbook | By Jers', loadComponent: () => import('./looks/looks').then((m) => m.Looks) },
  { path: 'perfil', title: 'Mi perfil | By Jers', data: { modo: 'perfil' }, loadComponent: () => import('./cuenta/cuenta').then(m => m.Cuenta) },
  { path: 'mis-datos', title: 'Mis datos | By Jers', loadComponent: () => import('./cuenta/datos').then(m => m.MisDatos) },
  { path: 'direcciones', title: 'Mis direcciones | By Jers', data: { modo: 'direcciones' }, loadComponent: () => import('./cuenta/cuenta').then(m => m.Cuenta) },
  { path: 'contacto', title: 'Contacto | By Jers', loadComponent: () => import('./contacto/contacto').then(m => m.Contacto) },
  { path: 'mi-perfil', pathMatch: 'full', redirectTo: 'perfil' },
  { path: 'mis-direcciones', pathMatch: 'full', redirectTo: 'direcciones' },
  { path: 'register', title: 'Crear cuenta | By Jers', data: { modo: 'registro' }, loadComponent: () => import('./auth/auth').then((m) => m.Auth) },
  // Recuperacion de contrasena. El enlace que llega por correo apunta a
  // `/reset-password?token=...` (ver authController.js): son las rutas del
  // router de Angular, no paginas sueltas.
  { path: 'recuperar', title: 'Recuperar acceso | By Jers', data: { modo: 'recuperar' }, loadComponent: () => import('./auth/auth').then((m) => m.Auth) },
  { path: 'reset-password', title: 'Nueva contraseña | By Jers', data: { modo: 'reset-password' }, loadComponent: () => import('./auth/auth').then((m) => m.Auth) },

  { path: 'maquillaje', pathMatch: 'full', redirectTo: 'catalogo/maquillaje' },
  { path: 'cabello', pathMatch: 'full', redirectTo: 'catalogo/cabello' },
  { path: 'maquillaje.html', pathMatch: 'full', redirectTo: 'catalogo/maquillaje' },
  { path: 'cabello.html', pathMatch: 'full', redirectTo: 'catalogo/cabello' },
  { path: 'index.html', pathMatch: 'full', redirectTo: '' },
  { path: 'login.html', pathMatch: 'full', redirectTo: 'login' },
  { path: 'register.html', pathMatch: 'full', redirectTo: 'register' },
  { path: 'checkout.html', pathMatch: 'full', redirectTo: 'checkout' },
  { path: 'carrito.html', pathMatch: 'full', redirectTo: 'carrito' },
  { path: 'mis-pedidos.html', pathMatch: 'full', redirectTo: 'pedidos' },
  { path: 'mi-perfil.html', pathMatch: 'full', redirectTo: 'perfil' },
  { path: 'mis-direcciones.html', pathMatch: 'full', redirectTo: 'direcciones' },
  // Enlaces antiguos que siguen vivos en correos ya enviados. El router
  // conserva los parametros de la query al redirigir, asi que el token del
  // enlace de recuperacion sigue llegando a la pantalla correcta.
  { path: 'reset-password.html', pathMatch: 'full', redirectTo: 'reset-password' },
  { path: 'recuperar.html', pathMatch: 'full', redirectTo: 'recuperar' },
  { path: 'producto.html', pathMatch: 'full', redirectTo: 'catalogo/maquillaje' },
  { path: 'resenas.html', pathMatch: 'full', redirectTo: '' },
  { path: 'contacto.html', pathMatch: 'full', redirectTo: 'contacto' },
  { path: 'bienvenida.html', pathMatch: 'full', redirectTo: '' },
  { path: 'admin/dashboard.html', pathMatch: 'full', redirectTo: 'admin' },
  { path: 'admin/productos.html', pathMatch: 'full', redirectTo: 'admin' },
  { path: 'admin/pedidos.html', pathMatch: 'full', redirectTo: 'admin' },
  { path: 'admin/usuarios.html', pathMatch: 'full', redirectTo: 'admin' },
  { path: 'admin/categorias.html', pathMatch: 'full', redirectTo: 'admin' },
  { path: 'admin/marcas.html', pathMatch: 'full', redirectTo: 'admin' },
  { path: '**', title: 'Página no encontrada | By Jers', loadComponent: () => import('./not-found/not-found').then((m) => m.NotFound) },
];
