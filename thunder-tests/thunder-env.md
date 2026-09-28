# Entorno de Thunder Client para By Jers
#
# Copia el contenido de "Client > Environment" y ponlo en tu entorno local.
# El servidor sirve la API y el sitio en el MISMO puerto, asi que baseUrl no
# lleva dos origenes distintos.

{
  "baseUrl": "http://localhost:3000",
  "email": "cliente@byjers.com",
  "password": "ClientePrueba2026!",
  "emailRegistro": "nuevo@byjers.com",
  "csrfToken": "",
  "claveIdempotencia": "thunder-manual-1",
  "itemId": "",
  "itemIdAjeno": "",
  "idPedidoAjeno": ""
}

# NOTAS
#
# - El puerto sale de PORT en backend/.env. Si cambiaste ese valor, ajusta
#   baseUrl. No hay ningun puerto escrito en el codigo del frontend.
#
# - csrfToken: ejecuta primero "Obtener token CSRF". Copia el valor de
#   response.body.csrfToken en la variable csrfToken. Todas las peticiones que
#   mutan (POST/PATCH/DELETE) necesitan la cookie jers_csrf Y la cabecera
#   X-CSRF-Token con el mismo valor.
#
# - Para las pruebas de autorizacion necesitas DOS clientes. Thunder mantiene una
#   sola cookie: haz el login como cliente, guarda el pedido ajeno que crees con
#   otro cliente (o con la variable idPedidoAjeno), y despues repite la peticion
#   para comprobar que responde 404.
#
# - El login es el unico que deja cookie de sesion. En Thunder no hace falta
#   pegar el token a mano: la cookie la gestiona el cliente.
