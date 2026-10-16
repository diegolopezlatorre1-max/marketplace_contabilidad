import { useEffect, useState } from 'react';
import { TablaComisiones } from './components/TablaComisiones';
import { TablaCuentasPorPagar } from './components/TablaCuentasPorPagar';
import { contabilidadApiMock, type ContabilidadApi } from './data/contabilidadApi';
import type { ComisionFila, CuentaPorPagarFila, EstadoCuenta } from './types';
import './contabilidad.css';

type Vista = 'comisiones' | 'cuentas';

/** Quincena actual en hora de Colombia (AAAA-MM-Q1|Q2), para cuando aún no hay ventas. */
function periodoActual(): string {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
  return `${hoy.slice(0, 7)}-Q${Number(hoy.slice(8, 10)) <= 15 ? 1 : 2}`;
}

const mensajeDe = (e: unknown) =>
  e instanceof Error && e.message ? e.message : 'No se pudo cargar la información.';

interface ContabilidadPanelProps {
  api?: ContabilidadApi;
  vistaInicial?: Vista;
}

export function ContabilidadPanel({
  api = contabilidadApiMock,
  vistaInicial = 'comisiones',
}: ContabilidadPanelProps) {
  const [vista, setVista] = useState<Vista>(vistaInicial);
  const [periodos, setPeriodos] = useState<string[]>([]);
  const [periodo, setPeriodo] = useState<string>('');
  const [estado, setEstado] = useState<EstadoCuenta | ''>('');
  const [comisiones, setComisiones] = useState<ComisionFila[]>([]);
  const [cuentas, setCuentas] = useState<CuentaPorPagarFila[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Periodos con ventas, del más reciente al más antiguo.
  useEffect(() => {
    let activo = true;
    api
      .listarPeriodos()
      .then((lista) => {
        if (!activo) return;
        const ordenados = [...new Set([...lista, periodoActual()])].sort().reverse();
        setPeriodos(ordenados);
        setPeriodo(lista.length ? [...lista].sort().reverse()[0]! : periodoActual());
      })
      .catch((e: unknown) => {
        if (!activo) return;
        setError(mensajeDe(e));
        setCargando(false);
      });
    return () => {
      activo = false;
    };
  }, [api]);

  useEffect(() => {
    if (!periodo) return;
    let activo = true;
    setCargando(true);
    setError(null);

    const cargar = async () => {
      try {
        if (vista === 'comisiones') {
          const datos = await api.listarComisiones(periodo);
          if (activo) setComisiones(datos);
        } else {
          const datos = await api.listarCuentasPorPagar({
            periodo,
            estado: estado || undefined,
          });
          if (activo) setCuentas(datos);
        }
      } catch (e) {
        if (activo) setError(mensajeDe(e));
      } finally {
        if (activo) setCargando(false);
      }
    };

    void cargar();
    return () => {
      activo = false;
    };
  }, [api, vista, periodo, estado]);

  return (
    <section className="cp-panel">
      <header className="cp-header">
        <h1>Contabilidad</h1>
        <p>Comisiones del marketplace y cuentas por pagar a vendedores.</p>
      </header>

      <div className="cp-barra">
        <div className="cp-tabs">
          <button
            type="button"
            aria-pressed={vista === 'comisiones'}
            onClick={() => setVista('comisiones')}
          >
            Comisiones
          </button>
          <button
            type="button"
            aria-pressed={vista === 'cuentas'}
            onClick={() => setVista('cuentas')}
          >
            Cuentas por pagar
          </button>
        </div>

        <label className="cp-filtro">
          Periodo
          <select value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
            {periodos.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>

        {vista === 'cuentas' && (
          <label className="cp-filtro">
            Estado
            <select value={estado} onChange={(e) => setEstado(e.target.value as EstadoCuenta | '')}>
              <option value="">Todos</option>
              <option value="PENDIENTE">Pendiente</option>
              <option value="PAGADO">Pagado</option>
            </select>
          </label>
        )}
      </div>

      {error && (
        <p role="alert" className="cp-error">
          {error}
        </p>
      )}
      {cargando && !error && <p className="cp-vacio">Cargando…</p>}
      {!cargando && !error && vista === 'comisiones' && <TablaComisiones filas={comisiones} />}
      {!cargando && !error && vista === 'cuentas' && <TablaCuentasPorPagar filas={cuentas} />}
    </section>
  );
}
