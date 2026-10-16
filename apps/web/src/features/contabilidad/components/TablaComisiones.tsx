import { Link } from 'react-router-dom';
import { formatoCOP, formatoPorcentaje, sumar } from '../lib/formato';
import type { ComisionFila } from '../types';

interface Props {
  filas: ComisionFila[];
  /** Ruta al detalle de una venta (HU-CON-02); sin ella la orden no es un enlace. */
  enlaceDetalle?: ((id: string) => string) | undefined;
}

export function TablaComisiones({ filas, enlaceDetalle }: Props) {
  if (filas.length === 0) return <p className="cp-vacio">No hay ventas en este periodo.</p>;
  return (
    <div className="cp-scroll">
      <table className="cp-tabla">
        <thead>
          <tr>
            <th>Orden</th>
            <th>Vendedor</th>
            <th>Fecha</th>
            <th className="cp-num">Valor bruto</th>
            <th className="cp-num">% aplicado</th>
            <th className="cp-num">Comisión</th>
            <th className="cp-num">Valor neto</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={`${f.numeroOrden}-${f.vendedorId}`}>
              <td>
                {enlaceDetalle ? (
                  <Link className="cp-enlace" to={enlaceDetalle(f.id)}>
                    {f.numeroOrden}
                  </Link>
                ) : (
                  f.numeroOrden
                )}
              </td>
              <td>{f.vendedorNombre}</td>
              <td>{f.fecha}</td>
              <td className="cp-num">{formatoCOP(f.valorBruto)}</td>
              <td className="cp-num">{formatoPorcentaje(f.porcentajeAplicado)}</td>
              <td className="cp-num">{formatoCOP(f.comision)}</td>
              <td className="cp-num">{formatoCOP(f.valorNeto)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3}>Totales</td>
            <td className="cp-num">{formatoCOP(sumar(filas.map((f) => f.valorBruto)))}</td>
            <td />
            <td className="cp-num">{formatoCOP(sumar(filas.map((f) => f.comision)))}</td>
            <td className="cp-num">{formatoCOP(sumar(filas.map((f) => f.valorNeto)))}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
