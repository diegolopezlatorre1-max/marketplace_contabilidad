import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { EstadoBadge } from './components/EstadoBadge';
import type { ContabilidadApi } from './data/contabilidadApi';
import { formatoCOP } from './lib/formato';
import type { EstadoVendedor, SaldoVendedorFila } from './types';
import './contabilidad.css';

const mensajeDe = (e: unknown) =>
  e instanceof Error && e.message ? e.message : 'No se pudo cargar el estado del vendedor.';

/**
 * HU-CON-07: ficha del vendedor con total vendido, comisión, ajustes, pagado y pendiente por
 * quincenas, y la regla de control vendido − comisión − ajustes = pagado + pendiente.
 */
export function EstadoVendedorPage({ api }: { api: ContabilidadApi }) {
  const [params, setParams] = useSearchParams();
  const vendedorId = params.get('id') ?? '';
  const [vendedores, setVendedores] = useState<SaldoVendedorFila[]>([]);
  const [periodos, setPeriodos] = useState<string[]>([]);
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [estado, setEstado] = useState<EstadoVendedor | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let activo = true;
    Promise.all([api.resumirPorVendedor(), api.listarPeriodos()])
      .then(([saldos, lista]) => {
        if (!activo) return;
        setVendedores(saldos);
        setPeriodos([...lista].sort());
      })
      .catch((e: unknown) => activo && setError(mensajeDe(e)));
    return () => {
      activo = false;
    };
  }, [api]);

  useEffect(() => {
    setEstado(null);
    if (!vendedorId) return;
    let activo = true;
    setCargando(true);
    setError(null);
    api
      .obtenerEstadoVendedor(vendedorId, desde || undefined, hasta || undefined)
      .then((e) => activo && setEstado(e))
      .catch((e: unknown) => activo && setError(mensajeDe(e)))
      .finally(() => activo && setCargando(false));
    return () => {
      activo = false;
    };
  }, [api, vendedorId, desde, hasta]);

  const elegirVendedor = (id: string) => setParams(id ? { id } : {});
  const t = estado?.totales;

  return (
    <section className="cp-panel">
      <header className="cp-header">
        <h1>Estado por vendedor</h1>
        <p>
          Cuánto vendió cada vendedor, cuánto fue comisión del marketplace, cuánto se le ha pagado y
          cuánto se le debe, por quincena.
        </p>
      </header>

      <div className="cp-barra">
        <label className="cp-filtro">
          Vendedor
          <select value={vendedorId} onChange={(e) => elegirVendedor(e.target.value)}>
            <option value="">Seleccione…</option>
            {vendedores.map((v) => (
              <option key={v.vendedorId} value={v.vendedorId}>
                {v.vendedorNombre}
              </option>
            ))}
          </select>
        </label>
        <label className="cp-filtro">
          Desde
          <select value={desde} onChange={(e) => setDesde(e.target.value)}>
            <option value="">Primera quincena</option>
            {periodos
              .filter((p) => !hasta || p <= hasta)
              .map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
          </select>
        </label>
        <label className="cp-filtro">
          Hasta
          <select value={hasta} onChange={(e) => setHasta(e.target.value)}>
            <option value="">Última quincena</option>
            {periodos
              .filter((p) => !desde || p >= desde)
              .map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
          </select>
        </label>
      </div>

      {error && (
        <p role="alert" className="cp-error">
          {error}
        </p>
      )}
      {!vendedorId && !error && (
        <p className="cp-vacio">Seleccione un vendedor para ver su estado.</p>
      )}
      {cargando && !error && <p className="cp-vacio">Cargando…</p>}

      {estado && t && !cargando && !error && (
        <>
          <dl className="cp-desglose">
            <div className="cp-tarjeta">
              <dt className="cp-etiqueta">Total vendido ({t.ventas})</dt>
              <dd className="cp-destacado">{formatoCOP(t.vendido)}</dd>
            </div>
            <div className="cp-tarjeta">
              <dt className="cp-etiqueta">Comisión</dt>
              <dd className="cp-destacado">{formatoCOP(t.comision)}</dd>
            </div>
            <div className="cp-tarjeta">
              <dt className="cp-etiqueta">Ajustes (neto revertido)</dt>
              <dd className="cp-destacado">{formatoCOP(t.ajustes.netoRevertido)}</dd>
            </div>
            <div className="cp-tarjeta">
              <dt className="cp-etiqueta">Pagado</dt>
              <dd className="cp-destacado">{formatoCOP(t.pagado)}</dd>
            </div>
            <div className="cp-tarjeta">
              <dt className="cp-etiqueta">Pendiente</dt>
              <dd className="cp-destacado">{formatoCOP(t.pendiente)}</dd>
            </div>
          </dl>

          <p className={estado.control.cuadra ? 'cp-ok' : 'cp-error'} role="status">
            {estado.control.cuadra ? 'Cuadra: ' : 'No cuadra: '}
            vendido − comisión − ajustes ({formatoCOP(estado.control.generado)}) = pagado +
            pendiente ({formatoCOP(estado.control.liquidado)}).
            {Number(t.ajustes.saldoAFavor) > 0 &&
              ` De los ajustes, ${formatoCOP(t.ajustes.saldoAFavor)} eran de ventas ya pagadas y quedan a favor del marketplace.`}
          </p>
          {Number(estado.saldoAFavorDisponible) > 0 && (
            <p className="cp-vacio">
              Saldo a favor del marketplace por descontar en el próximo pago:{' '}
              {formatoCOP(estado.saldoAFavorDisponible)}.
            </p>
          )}

          <h2 className="cp-subtitulo">Movimientos por quincena</h2>
          {estado.periodos.length === 0 ? (
            <p className="cp-vacio">El vendedor no tiene movimientos en esas quincenas.</p>
          ) : (
            <div className="cp-scroll">
              <table className="cp-tabla">
                <thead>
                  <tr>
                    <th>Quincena</th>
                    <th className="cp-num">Ventas</th>
                    <th className="cp-num">Vendido</th>
                    <th className="cp-num">Comisión</th>
                    <th className="cp-num cp-envolver">Ajustes (neto)</th>
                    <th className="cp-num">Pagado</th>
                    <th className="cp-num">Pendiente</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {estado.periodos.map((p) => (
                    <tr key={p.periodo}>
                      <td>{p.periodo}</td>
                      <td className="cp-num">{p.ventas}</td>
                      <td className="cp-num">{formatoCOP(p.vendido)}</td>
                      <td className="cp-num">{formatoCOP(p.comision)}</td>
                      <td className="cp-num">{formatoCOP(p.ajustesNeto)}</td>
                      <td className="cp-num">{formatoCOP(p.pagado)}</td>
                      <td className="cp-num">{formatoCOP(p.pendiente)}</td>
                      <td>
                        <EstadoBadge estado={p.estado} />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Totales</td>
                    <td className="cp-num">{t.ventas}</td>
                    <td className="cp-num">{formatoCOP(t.vendido)}</td>
                    <td className="cp-num">{formatoCOP(t.comision)}</td>
                    <td className="cp-num">{formatoCOP(t.ajustes.netoRevertido)}</td>
                    <td className="cp-num">{formatoCOP(t.pagado)}</td>
                    <td className="cp-num">{formatoCOP(t.pendiente)}</td>
                    <td />
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
