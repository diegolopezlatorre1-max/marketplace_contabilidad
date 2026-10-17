import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { ContabilidadApi } from './data/contabilidadApi';
import { formatoCOP, sumar } from './lib/formato';
import type { AjusteDeVenta, ComisionFila } from './types';
import './contabilidad.css';

const mensajeDe = (e: unknown) =>
  e instanceof Error && e.message ? e.message : 'No se pudieron cargar los ajustes.';

/** Hoy en hora de Colombia (AAAA-MM-DD). */
function hoyContable(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
}

interface Props {
  api: ContabilidadApi;
  /** Ruta del detalle de una venta, donde se registra el ajuste. */
  rutaVenta: (id: string) => string;
}

/**
 * HU-CON-06: historial de ajustes de todas las ventas y acceso para registrar uno nuevo.
 * El registro se hace desde el detalle de la venta, que muestra cuánto queda por ajustar.
 */
export function AjustesPage({ api, rutaVenta }: Props) {
  const hoy = hoyContable();
  const [desde, setDesde] = useState(`${hoy.slice(0, 7)}-01`);
  const [hasta, setHasta] = useState(hoy);
  const [vendedorId, setVendedorId] = useState('');
  const [ajustes, setAjustes] = useState<AjusteDeVenta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let activo = true;
    setCargando(true);
    setError(null);
    api
      .buscarAjustes({
        desde: desde || undefined,
        hasta: hasta || undefined,
        vendedorId: vendedorId.trim() || undefined,
      })
      .then((a) => activo && setAjustes(a))
      .catch((e: unknown) => activo && setError(mensajeDe(e)))
      .finally(() => activo && setCargando(false));
    return () => {
      activo = false;
    };
  }, [api, desde, hasta, vendedorId]);

  return (
    <section className="cp-panel">
      <header className="cp-header">
        <h1>Ajustes por devoluciones y cancelaciones</h1>
        <p>
          Un ajuste no modifica la venta: revierte su comisión y su neto con el % original y
          descuenta el saldo pendiente del vendedor.
        </p>
      </header>

      <BuscarVenta api={api} rutaVenta={rutaVenta} />

      <h2 className="cp-subtitulo">Historial de ajustes</h2>
      <div className="cp-barra">
        <label className="cp-filtro">
          Desde
          <input type="date" max={hasta} value={desde} onChange={(e) => setDesde(e.target.value)} />
        </label>
        <label className="cp-filtro">
          Hasta
          <input type="date" min={desde} value={hasta} onChange={(e) => setHasta(e.target.value)} />
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

      {!cargando && !error && (
        <>
          <dl className="cp-desglose">
            <div className="cp-tarjeta">
              <dt className="cp-etiqueta">Valor ajustado ({ajustes.length})</dt>
              <dd className="cp-destacado">{formatoCOP(sumar(ajustes.map((a) => a.valor)))}</dd>
            </div>
            <div className="cp-tarjeta">
              <dt className="cp-etiqueta">Comisión revertida</dt>
              <dd className="cp-destacado">
                {formatoCOP(sumar(ajustes.map((a) => a.comisionRevertida)))}
              </dd>
            </div>
            <div className="cp-tarjeta">
              <dt className="cp-etiqueta">Neto revertido a vendedores</dt>
              <dd className="cp-destacado">
                {formatoCOP(sumar(ajustes.map((a) => a.netoRevertido)))}
              </dd>
            </div>
          </dl>

          {ajustes.length === 0 ? (
            <p className="cp-vacio">No hay ajustes en el rango.</p>
          ) : (
            <div className="cp-scroll">
              <table className="cp-tabla">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Orden</th>
                    <th>Vendedor</th>
                    <th>Tipo</th>
                    <th>Motivo</th>
                    <th className="cp-num">Valor</th>
                    <th className="cp-num">Comisión revertida</th>
                    <th className="cp-num">Neto revertido</th>
                    <th>Origen</th>
                  </tr>
                </thead>
                <tbody>
                  {ajustes.map((a) => (
                    <tr key={a.id}>
                      <td>{a.fechaContable}</td>
                      <td>
                        <Link className="cp-enlace" to={rutaVenta(a.ventaId)}>
                          {a.numeroOrden}
                        </Link>
                      </td>
                      <td>{a.vendedorId}</td>
                      <td>{a.tipo === 'DEVOLUCION' ? 'Devolución' : 'Cancelación'}</td>
                      <td>{a.motivo}</td>
                      <td className="cp-num">{formatoCOP(a.valor)}</td>
                      <td className="cp-num">{formatoCOP(a.comisionRevertida)}</td>
                      <td className="cp-num">{formatoCOP(a.netoRevertido)}</td>
                      <td>{a.origen === 'MANUAL' ? 'Manual' : 'Módulo de Órdenes'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}

/** Busca la venta por número de orden para abrir su detalle y registrar el ajuste allí. */
function BuscarVenta({ api, rutaVenta }: Props) {
  const [orden, setOrden] = useState('');
  const [resultado, setResultado] = useState<ComisionFila[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function buscar(e: FormEvent) {
    e.preventDefault();
    const texto = orden.trim().toUpperCase();
    if (!texto) return;
    setBuscando(true);
    setError(null);
    try {
      const ventas = await api.listarComisiones();
      setResultado(ventas.filter((v) => v.numeroOrden.toUpperCase().includes(texto)));
    } catch (err) {
      setError(mensajeDe(err));
    } finally {
      setBuscando(false);
    }
  }

  return (
    <>
      <h2 className="cp-subtitulo">Registrar un ajuste</h2>
      <form className="cp-barra cp-form" onSubmit={buscar} aria-label="Buscar venta">
        <label className="cp-filtro">
          Número de orden
          <input placeholder="ORD-1001" value={orden} onChange={(e) => setOrden(e.target.value)} />
        </label>
        <button type="submit" className="cp-boton" disabled={buscando || !orden.trim()}>
          {buscando ? 'Buscando…' : 'Buscar venta'}
        </button>
      </form>
      {error && (
        <p role="alert" className="cp-error">
          {error}
        </p>
      )}
      {resultado &&
        (resultado.length === 0 ? (
          <p className="cp-vacio">No hay ventas con ese número de orden.</p>
        ) : (
          <div className="cp-scroll">
            <table className="cp-tabla">
              <thead>
                <tr>
                  <th>Orden</th>
                  <th>Vendedor</th>
                  <th>Fecha</th>
                  <th className="cp-num">Valor bruto</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {resultado.map((v) => (
                  <tr key={v.id}>
                    <td>{v.numeroOrden}</td>
                    <td>{v.vendedorNombre}</td>
                    <td>{v.fecha}</td>
                    <td className="cp-num">{formatoCOP(v.valorBruto)}</td>
                    <td>
                      <Link className="cp-enlace" to={rutaVenta(v.id)}>
                        Registrar ajuste
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </>
  );
}
