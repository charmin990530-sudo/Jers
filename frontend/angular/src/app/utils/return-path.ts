/** Solo rutas internas, sin consultas con correos o tokens ni destinos de acceso. */
export function returnPath(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020]/.test(value)) return '/tienda';
  const path = value.split(/[?#]/)[0];
  if (/^\/(?:login|register|recuperar|reset-password)(?:[/.]|$)/.test(path)) return '/tienda';
  return path;
}
