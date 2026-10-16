import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ChangeEvent, type FormEvent } from 'react';
import type {
  ConciliacionDto,
  ConciliarPagoRequest,
  EstadoConciliacion,
  EstadoPagoRecibido,
  ImportacionPagosResponse,
  PagoRecibidoDto,
} from '@contabilidad/contracts';
import { useModulo, useTieneRol } from '../../shared/auth/ModuloContext';
import '../contabilidad/contabilidad.css';
import { formatoCOP } from '../contabilidad/lib/formato';
import { esMontoValido, normalizarMonto, vistaPrevia } from './calculos';

type Vista = 'pagos' | 'conciliaciones';

const ETIQUETA_PAGO: Record<EstadoPagoRecibido, string> = {
  SIN_CONCILIAR: 'Sin conciliar',
  CONCILIADO: 'Conciliado',
  PENDIENTE: 'Con diferencia',
};

const CLASE_ESTADO: Record<EstadoPagoRecibido | EstadoConciliacion, string> = {
  SIN_CONCILIAR: 'cp-badge cp-badge--neutro',
  CONCILIADO: 'cp-badge cp-badge--pagado',
  CONCILIADA: 'cp-badge cp-badge--pagado',
  PENDIENTE: 'cp-badge cp-badge--pendiente',
};

const fecha = (iso: string) =>
  new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Bogota',
  }).format(new Date(iso));

/** HU-CON-04: bandeja de pagos recibidos, asistente de conciliación y semáforo. */
export function ConciliacionesPage() {
  const puedeConciliar = useTieneRol('CONTADOR');
  const [vista, setVista] = useState<Vista>('pagos');
  const [seleccionado, setSeleccionado] = useState<PagoRecibidoDto | null>(null);

  return (
    <section className="cp-panel">
      <header className="cp-header">
        <h1>Conciliación de pagos</h1>
        <p>
          Relacione cada pago recibido de la pasarela con las órdenes que paga. Si el pago y las
          órdenes no coinciden, la conciliación queda pendiente con la diferencia visible.
        </p>
      </header>

      <div className="cp-barra">
        <div className="cp-tabs">
          <button type="button" aria-pressed={vista === 'pagos'} onClick={() => setVista('pagos')}>
            Pagos recibidos
          </button>
          <button
            type="button"
            aria-pressed={vista === 'conciliaciones'}
            onClick={() => setVista('conciliaciones')}
          >
            Conciliaciones
          </button>
        </div>
      </div>

      {seleccionado && (
        <AsistenteConciliacion
          pago={seleccionado}
          onCancelar={() => setSeleccionado(null)}
          onListo={() => {
            setSeleccionado(null);
            setVista('conciliaciones');
          }}
        />
      )}

      {vista === 'pagos' ? (
        <BandejaPagos puedeConciliar={puedeConciliar} onConciliar={(p) => setSeleccionado(p)} />
      ) : (
        <ListaConciliaciones />
      )}

      {puedeConciliar && vista === 'pagos' && <ImportarCsv />}
    </section>
  );
}

function BandejaPagos({
  puedeConciliar,
  onConciliar,
}: {
  puedeConciliar: boolean;
  onConciliar: (pago: PagoRecibidoDto) => void;
}) {
  const { api } = useModulo();
  const [estado, setEstado] = useState<EstadoPagoRecibido | ''>('SIN_CONCILIAR');
  const pagos = useQuery({
    queryKey: ['pagos-recibidos', estado],
    queryFn: () =>
      api.get<PagoRecibidoDto[]>(`/pagos-recibidos${estado ? `?estado=${estado}` : ''}`),
  });

  return (
    <>
      <div className="cp-barra">
        <label className="cp-filtro">
          Estado del pago
          <select
            value={estado}
            onChange={(e) => setEstado(e.target.value as EstadoPagoRecibido | '')}
          >
            <option value="">Todos</option>
            <option value="SIN_CONCILIAR">Sin conciliar</option>
            <option value="PENDIENTE">Con diferencia</option>
            <option value="CONCILIADO">Conciliados</option>
          </select>
        </label>
      </div>
      {pagos.isPending && <p className="cp-vacio">Cargando…</p>}
      {pagos.isError && (
        <p role="alert" className="cp-error">
          {pagos.error.message}
        </p>
      )}
      {pagos.data?.length === 0 && <p className="cp-vacio">No hay pagos con ese estado.</p>}
      {!!pagos.data?.length && (
        <div className="cp-scroll">
          <table className="cp-tabla">
            <thead>
              <tr>
                <th>Referencia</th>
                <th>Fecha</th>
                <th>Origen</th>
                <th className="cp-envolver">Órdenes informadas</th>
                <th className="cp-num">Valor</th>
                <th className="cp-num">Diferencia</th>
                <th>Estado</th>
                {puedeConciliar && <th />}
              </tr>
            </thead>
            <tbody>
              {pagos.data.map((p) => (
                <tr key={p.id}>
                  <td>{p.referenciaPasarela}</td>
                  <td>{fecha(p.fecha)}</td>
                  <td>{p.origen}</td>
                  <td className="cp-envolver">{p.ordenesInformadas.join(', ') || '—'}</td>
                  <td className="cp-num">{formatoCOP(p.valor)}</td>
                  <td className="cp-num">{p.diferencia ? formatoCOP(p.diferencia) : '—'}</td>
                  <td>
                    <span className={CLASE_ESTADO[p.estado]}>{ETIQUETA_PAGO[p.estado]}</span>
                  </td>
                  {puedeConciliar && (
                    <td>
                      {p.estado === 'SIN_CONCILIAR' && (
                        <button
                          type="button"
                          className="cp-boton cp-boton--chico"
                          onClick={() => onConciliar(p)}
                        >
                          Conciliar
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

interface FilaOrden {
  numeroOrden: string;
  valorAplicado: string;
}

function AsistenteConciliacion({
  pago,
  onCancelar,
  onListo,
}: {
  pago: PagoRecibidoDto;
  onCancelar: () => void;
  onListo: (c: ConciliacionDto) => void;
}) {
  const { api } = useModulo();
  const queryClient = useQueryClient();
  const [filas, setFilas] = useState<FilaOrden[]>(
    pago.ordenesInformadas.length
      ? pago.ordenesInformadas.map((numeroOrden) => ({ numeroOrden, valorAplicado: '' }))
      : [{ numeroOrden: '', valorAplicado: '' }],
  );

  const conciliar = useMutation({
    mutationFn: (body: ConciliarPagoRequest) => api.post<ConciliacionDto>('/conciliaciones', body),
    onSuccess: async (c) => {
      await queryClient.invalidateQueries({ queryKey: ['pagos-recibidos'] });
      await queryClient.invalidateQueries({ queryKey: ['conciliaciones'] });
      onListo(c);
    },
  });

  const cambiar = (i: number, campo: keyof FilaOrden, valor: string) =>
    setFilas((actual) => actual.map((f, j) => (j === i ? { ...f, [campo]: valor } : f)));
  const ordenesValidas = filas.filter((f) => f.numeroOrden.trim());
  const previa = vistaPrevia(
    pago.valor,
    ordenesValidas.map((f) => f.valorAplicado),
  );
  const valoresInvalidos = ordenesValidas.some(
    (f) => f.valorAplicado.trim() && !esMontoValido(f.valorAplicado),
  );

  function enviar(e: FormEvent) {
    e.preventDefault();
    conciliar.mutate({
      pagoId: pago.id,
      ordenes: ordenesValidas.map((f) => ({
        numeroOrden: f.numeroOrden.trim(),
        ...(f.valorAplicado.trim() ? { valorAplicado: normalizarMonto(f.valorAplicado) } : {}),
      })),
    });
  }

  return (
    <form className="cp-tarjeta" onSubmit={enviar} aria-label="Conciliar pago">
      <span className="cp-etiqueta">Conciliar pago {pago.referenciaPasarela}</span>
      <strong className="cp-destacado">{formatoCOP(pago.valor)}</strong>
      <p className="cp-nota">
        Indique las órdenes que paga. Si deja el valor vacío, se aplica el saldo pendiente de la
        orden.
      </p>

      {filas.map((f, i) => (
        <div key={i} className="cp-form cp-fila-orden">
          <label className="cp-filtro">
            Número de orden
            <input
              required={i === 0}
              placeholder="ORD-1001"
              value={f.numeroOrden}
              onChange={(e) => cambiar(i, 'numeroOrden', e.target.value)}
            />
          </label>
          <label className="cp-filtro">
            Valor aplicado (opcional)
            <input
              inputMode="decimal"
              placeholder="Saldo de la orden"
              value={f.valorAplicado}
              onChange={(e) => cambiar(i, 'valorAplicado', e.target.value)}
            />
          </label>
          {filas.length > 1 && (
            <button
              type="button"
              className="cp-boton cp-boton--secundario"
              onClick={() => setFilas((actual) => actual.filter((_, j) => j !== i))}
            >
              Quitar
            </button>
          )}
        </div>
      ))}

      <div className="cp-doc-acciones">
        <button
          type="button"
          className="cp-boton cp-boton--secundario"
          onClick={() => setFilas((actual) => [...actual, { numeroOrden: '', valorAplicado: '' }])}
        >
          Agregar orden
        </button>
      </div>

      <p className="cp-nota" aria-live="polite">
        {previa ? (
          <>
            Aplicado {formatoCOP(previa.aplicado)} · diferencia{' '}
            <strong>{formatoCOP(previa.diferencia)}</strong> ·{' '}
            <span className={CLASE_ESTADO[previa.estado]}>
              {previa.estado === 'CONCILIADA' ? 'Quedará conciliada' : 'Quedará pendiente'}
            </span>
          </>
        ) : (
          'La diferencia se calcula al guardar (hay órdenes sin valor indicado).'
        )}
      </p>

      {conciliar.isError && (
        <p role="alert" className="cp-error">
          {conciliar.error.message}
        </p>
      )}
      <div className="cp-doc-acciones">
        <button
          type="submit"
          className="cp-boton"
          disabled={conciliar.isPending || ordenesValidas.length === 0 || valoresInvalidos}
        >
          {conciliar.isPending ? 'Guardando…' : 'Guardar conciliación'}
        </button>
        <button type="button" className="cp-boton cp-boton--secundario" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function ListaConciliaciones() {
  const { api } = useModulo();
  const [estado, setEstado] = useState<EstadoConciliacion | ''>('');
  const conciliaciones = useQuery({
    queryKey: ['conciliaciones', estado],
    queryFn: () =>
      api.get<ConciliacionDto[]>(`/conciliaciones${estado ? `?estado=${estado}` : ''}`),
  });

  return (
    <>
      <div className="cp-barra">
        <label className="cp-filtro">
          Estado
          <select
            value={estado}
            onChange={(e) => setEstado(e.target.value as EstadoConciliacion | '')}
          >
            <option value="">Todas</option>
            <option value="CONCILIADA">Conciliadas</option>
            <option value="PENDIENTE">Pendientes (con diferencia)</option>
          </select>
        </label>
      </div>
      {conciliaciones.isPending && <p className="cp-vacio">Cargando…</p>}
      {conciliaciones.isError && (
        <p role="alert" className="cp-error">
          {conciliaciones.error.message}
        </p>
      )}
      {conciliaciones.data?.length === 0 && <p className="cp-vacio">No hay conciliaciones.</p>}
      {!!conciliaciones.data?.length && (
        <div className="cp-scroll">
          <table className="cp-tabla">
            <thead>
              <tr>
                <th>Estado</th>
                <th>Pago</th>
                <th className="cp-envolver">Órdenes</th>
                <th className="cp-num">Valor pago</th>
                <th className="cp-num">Aplicado</th>
                <th className="cp-num">Diferencia</th>
                <th>Conciliado por</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {conciliaciones.data.map((c) => (
                <tr key={c.id}>
                  <td>
                    <span className={CLASE_ESTADO[c.estado]}>
                      {c.estado === 'CONCILIADA' ? 'Conciliada' : 'Pendiente'}
                    </span>
                  </td>
                  <td>{c.referenciaPasarela}</td>
                  <td className="cp-envolver">
                    {c.detalles
                      .map((d) => `${d.numeroOrden} (${formatoCOP(d.valorAplicado)})`)
                      .join(', ')}
                  </td>
                  <td className="cp-num">{formatoCOP(c.valorPago)}</td>
                  <td className="cp-num">{formatoCOP(c.valorAplicado)}</td>
                  <td className="cp-num">
                    <strong>{formatoCOP(c.diferencia)}</strong>
                  </td>
                  <td>{c.usuario}</td>
                  <td>{fecha(c.fecha)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function ImportarCsv() {
  const { api } = useModulo();
  const queryClient = useQueryClient();
  const importar = useMutation({
    mutationFn: (contenido: string) =>
      api.postTexto<ImportacionPagosResponse>('/pagos-recibidos/importar', contenido, 'text/csv'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pagos-recibidos'] }),
  });

  async function elegir(e: ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (archivo) importar.mutate(await archivo.text());
  }

  return (
    <>
      <h2 className="cp-subtitulo">Importar pagos desde CSV</h2>
      <div className="cp-barra cp-form">
        <label className="cp-filtro">
          Archivo de la pasarela (referencia,fecha,valor,ordenes)
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={elegir}
            disabled={importar.isPending}
          />
        </label>
        <p className="cp-nota cp-form-nota">
          Órdenes separadas por punto y coma. Los pagos con órdenes se concilian automáticamente.
        </p>
        {importar.isError && (
          <p role="alert" className="cp-error">
            {importar.error.message}
          </p>
        )}
        {importar.data && (
          <p role="status" className="cp-ok">
            {importar.data.importados} importados · {importar.data.duplicados} duplicados ·{' '}
            {importar.data.errores} con error
          </p>
        )}
      </div>
      {!!importar.data?.filas.length && (
        <div className="cp-scroll">
          <table className="cp-tabla">
            <thead>
              <tr>
                <th>Línea</th>
                <th>Referencia</th>
                <th>Resultado</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {importar.data.filas.map((f) => (
                <tr key={f.linea}>
                  <td>{f.linea}</td>
                  <td>{f.referencia ?? '—'}</td>
                  <td>
                    {f.resultado}
                    {f.estado ? ` · ${ETIQUETA_PAGO[f.estado]}` : ''}
                  </td>
                  <td>{f.detalle ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
