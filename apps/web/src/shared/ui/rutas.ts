/**
 * Ruta absoluta dentro del módulo. Los enlaces relativos no sirven aquí: el módulo se
 * monta en una ruta splat (/contabilidad/*) y React Router 7 resuelve un enlace
 * relativo a partir de la URL completa, por lo que las rutas se acumulaban
 * (/contabilidad/ventas -> /contabilidad/ventas/configuracion/comision).
 */
export function rutaDelModulo(basePath: string, destino: string): string {
  const base = basePath.replace(/\/+$/, '');
  if (destino === '.' || destino === '') return base || '/';
  return `${base}/${destino.replace(/^\/+/, '')}`;
}

/** Ruta donde el host montó el módulo: la URL actual sin la parte capturada por el splat. */
export function basePathDesde(pathname: string, splat: string): string {
  const sinSplat = splat && pathname.endsWith(splat) ? pathname.slice(0, -splat.length) : pathname;
  return sinSplat.replace(/\/+$/, '');
}
