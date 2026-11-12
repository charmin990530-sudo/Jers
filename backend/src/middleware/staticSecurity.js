/** Incluso una copia accidental dentro del build debe conservar privados estos archivos. */
export function isPrivateStaticPath(value) {
  let path;
  try { path = decodeURIComponent(value); } catch { return true; }
  return /(?:^|\/)\.[^/]*|(?:^|\/)node_modules(?:\/|$)|\.(?:env|log|lock|pem|key|p12|pfx|dump|bak|map|md)$|(?:^|\/)(?:package(?:-lock)?\.json|tsconfig[^/]*\.json|vercel\.json)$/i.test(path);
}
