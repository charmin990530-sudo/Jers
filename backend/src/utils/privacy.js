/** No conservar cuerpos, cookies, cabeceras, consultas ni variables en telemetría. */
export const sanitizeTelemetryEvent = event => ({
  event_id: event.event_id,
  timestamp: event.timestamp,
  platform: event.platform,
  level: event.level,
  release: event.release,
  environment: event.environment,
  exception: event.exception ? { values: event.exception.values?.map(value => ({
    type: value.type,
    value: 'Error de aplicación; detalles de petición excluidos',
    stacktrace: value.stacktrace ? { frames: value.stacktrace.frames?.map(frame => ({
      filename: frame.filename?.split('?')[0],
      function: frame.function,
      module: frame.module,
      lineno: frame.lineno,
      colno: frame.colno,
      in_app: frame.in_app,
    })) } : undefined,
  })) } : undefined,
});
