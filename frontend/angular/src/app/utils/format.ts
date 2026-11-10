export function formatearPrecio(valor: number | string | null | undefined): string {
  const numero = typeof valor === 'string' ? Number(valor) : valor;
  if (typeof numero !== 'number' || !Number.isFinite(numero)) return '—';
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(numero));
}

export function formatearFecha(valor: string | Date | null | undefined): string {
  if (!valor) return '—';
  const fecha = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(fecha.getTime())) return '—';
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(fecha);
}

const ETIQUETAS_ESTADO: Record<string, string> = {
  pendiente: 'Pendiente',
  confirmado: 'Confirmado',
  procesando: 'Procesando',
  enviado: 'Enviado',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
  reembolsado: 'Reembolsado',
};

export function etiquetaEstado(estado: string | null | undefined): string {
  if (!estado) return '—';
  return ETIQUETAS_ESTADO[estado] ?? estado;
}

export function mensajeError(respuesta: { msg?: string; data?: any }, porDefecto: string): string {
  return respuesta?.msg || respuesta?.data?.message || porDefecto;
}
