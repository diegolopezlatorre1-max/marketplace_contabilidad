import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { ContabilidadApi } from './data/contabilidadApi';
import { aCentavos, formatoCOP, formatoPorcentaje } from './lib/formato';
import type { VentaDetalle } from './types';
import './contabilidad.css';

const mensajeDe = (e: unknown) =>
  e instanceof Error && e.message ? e.message : 'No se pudo cargar la venta.';

interface Props {
  api: ContabilidadApi;
  /** Ruta del listado de ventas, para volver. */
  rutaVolver: string;
}

/** HU-CON-02: desglose de una venta (bruto, % aplicado, comisión y neto). */
export function DetalleVentaPage({ api, rutaVolver }: Props) {
  const { id = '' } = useParams();
  const [venta, setVenta] = useState<VentaDetalle | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let activo = true;
    setVenta(null);
    setError(null);
    api
      .obtenerVenta(id)
      .then((v) => activo && setVenta(v))
      .catch((e: unknown) => activo && setError(mensajeDe(e)));
    return () => {
      activo = false;
    };
  }, [api, id]);

  const cuadra =
    venta && aCentavos(venta.comision) + aCentavos(venta.valorNeto) === aCentavos(venta.valorBruto);

  return (
    <section className="cp-panel">
      <header className="cp-header">
        <p>
          <Link className="cp-enlace" to={rutaVolver}>
            ← Volver a ventas
          </Link>
        </p>
        <h1>{venta ? `Venta ${venta.numeroOrden}` : 'Detalle de venta'}</h1>
        {venta && (
          <p>
            {venta.vendedorNombre} · {venta.fecha} · quincena {venta.periodo}
          </p>
        )}
      </header>

      {error && (
        <p role="alert" className="cp-error">
          {error}
        </p>
      )}
      {!venta && !error && <p className="cp-vacio">Cargando…</p>}

      {venta && (
        <>
          <dl className="cp-desglose">
            <div className="cp-tarjeta">
              <dt className="cp-etiqueta">Valor bruto</dt>
              <dd className="cp-destacado">{formatoCOP(venta.valorBruto)}</dd>
            </div>
            <div className="cp-tarjeta">
              <dt className="cp-etiqueta">
                Comisión ({formatoPorcentaje(venta.porcentajeAplicado)})
              </dt>
              <dd className="cp-destacado">{formatoCOP(venta.comision)}</dd>
            </div>
            <div className="cp-tarjeta">
              <dt className="cp-etiqueta">Neto para el vendedor</dt>
              <dd className="cp-destacado">{formatoCOP(venta.valorNeto)}</dd>
            </div>
          </dl>

          <p className={cuadra ? 'cp-ok' : 'cp-error'} role="status">
            {cuadra
              ? 'Control: valor bruto = comisión + neto.'
              : 'Control: la comisión y el neto no suman el valor bruto.'}
          </p>
          <p className="cp-nota">
            El porcentaje es el que regía en la fecha de la venta; un cambio posterior no la altera.
            Estado de la orden: {venta.estadoOrigen}
            {venta.registradoEn &&
              ` · registrada el ${new Date(venta.registradoEn).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}`}
            .
          </p>
        </>
      )}
    </section>
  );
}
