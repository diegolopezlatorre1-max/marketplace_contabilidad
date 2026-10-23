import { useEffect, useState } from 'react';
import type { ContabilidadApi } from './data/contabilidadApi';
import { formatoCOP } from './lib/formato';
import type { ReporteIngresos } from './types';
import './contabilidad.css';

const mensajeDe = (e: unknown) =>
  e instanceof Error && e.message ? e.message : 'No se pudo generar el reporte.';

/** Hoy en hora de Colombia (AAAA-MM-DD): los días del reporte son días contables de Bogotá. */
function hoyContable(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
}

/**
 * HU-CON-05: ingresos y comisiones por rango de fechas. Los ajustes (HU-CON-06) se ubican
 * por la fecha del ajuste y se restan de las ventas; el control verifica bruto = comisión + neto.
 */
export function ReporteIngresosPage({ api }: { api: ContabilidadApi }) {
  const hoy = hoyContable();
  const [desde, setDesde] = useState(`${hoy.slice(0, 7)}-01`);
  const [hasta, setHasta] = useState(hoy);
  const [vendedorId, setVendedorId] = useState('');
  const [reporte, setReporte] = useState<ReporteIngresos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!desde || !hasta) return;
    let activo = true;
    setCargando(true);
    setError(null);
    api
      .obtenerReporte({ desde, hasta, vendedorId: vendedorId.trim() || undefined })
      .then((r) => activo && setReporte(r))
      .catch((e: unknown) => activo && setError(mensajeDe(e)))
      .finally(() => activo && setCargando(false));
    return () => {
      activo = false;
    };
  }, [api, desde, hasta, vendedorId]);

  return (
    <section className="cp-panel">
      <header className="cp-header">
        <h1>Reporte de ingresos y comisiones</h1>
        <p>
          Ventas y ajustes del rango, por día contable en hora de Colombia. Las devoluciones y
          cancelaciones se restan en la fecha en que se registraron.
        </p>
      </header>

      <div className="cp-barra">
        <label className="cp-filtro">
          Desde
          <input
            type="date"
            required
            max={hasta}
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
          />
        </label>
        <label className="cp-filtro">
          Hasta
          <input
            type="date"
            required
            min={desde}
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
          />
        </label>
        <label className="cp-filtro">
          Vendedor (opcional)
          <input
            placeholder="V-1"
            value={vendedorId}
            onChange={(e) => setVendedorId(e.target.value)}
          />
        </label>
      </div>

      {error && (
        <p role="alert" className="cp-error">
          {error}
        </p>
      )}
      {cargando && !error && <p className="cp-vacio">Cargando…</p>}

      {reporte && !cargando && !error && (
        <>
          <dl className="cp-desglose">
            <div className="cp-tarjeta">
              <dt className="cp-etiqueta">Ingresos brutos</dt>
              <dd className="cp-destacado">{formatoCOP(reporte.totales.valorBruto)}</dd>
            </div>
            <div className="cp-tarjeta">
              <dt className="cp-etiqueta">Comisión del marketplace</dt>
              <dd className="cp-destacado">{formatoCOP(reporte.totales.comision)}</dd>
            </div>
            <div className="cp-tarjeta">
              <dt className="cp-etiqueta">Neto para vendedores</dt>
              <dd className="cp-destacado">{formatoCOP(reporte.totales.valorNeto)}</dd>
            </div>
          </dl>
          <p className="cp-nota">
            {reporte.ventas.cantidad} ventas por {formatoCOP(reporte.ventas.valorBruto)} menos{' '}
            {reporte.ajustes.cantidad} ajustes por {formatoCOP(reporte.ajustes.valorBruto)}.
          </p>
          <p className={reporte.control.cuadra ? 'cp-ok' : 'cp-error'} role="status">
            Control: {reporte.control.detalle}.
          </p>

          <h2 className="cp-subtitulo">Detalle por día</h2>
          {reporte.porDia.length === 0 ? (
            <p className="cp-vacio">No hay ventas ni ajustes en el rango.</p>
          ) : (
            <div className="cp-scroll">
              <table className="cp-tabla">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th className="cp-num">Ventas</th>
                    <th className="cp-num">Valor bruto</th>
                    <th className="cp-num">Ajustes</th>
                    <th className="cp-num">Valor ajustado</th>
                    <th className="cp-num">Ingreso neto</th>
                    <th className="cp-num">Comisión</th>
                    <th className="cp-num">Neto vendedores</th>
                  </tr>
                </thead>
                <tbody>
                  {reporte.porDia.map((d) => (
                    <tr key={d.fecha}>
                      <td>{d.fecha}</td>
                      <td className="cp-num">{d.ventas.cantidad}</td>
                      <td className="cp-num">{formatoCOP(d.ventas.valorBruto)}</td>
                      <td className="cp-num">{d.ajustes.cantidad}</td>
                      <td className="cp-num">{formatoCOP(d.ajustes.valorBruto)}</td>
                      <td className="cp-num">{formatoCOP(d.totales.valorBruto)}</td>
                      <td className="cp-num">{formatoCOP(d.totales.comision)}</td>
                      <td className="cp-num">{formatoCOP(d.totales.valorNeto)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Totales</td>
                    <td className="cp-num">{reporte.ventas.cantidad}</td>
                    <td className="cp-num">{formatoCOP(reporte.ventas.valorBruto)}</td>
                    <td className="cp-num">{reporte.ajustes.cantidad}</td>
                    <td className="cp-num">{formatoCOP(reporte.ajustes.valorBruto)}</td>
                    <td className="cp-num">{formatoCOP(reporte.totales.valorBruto)}</td>
                    <td className="cp-num">{formatoCOP(reporte.totales.comision)}</td>
                    <td className="cp-num">{formatoCOP(reporte.totales.valorNeto)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
