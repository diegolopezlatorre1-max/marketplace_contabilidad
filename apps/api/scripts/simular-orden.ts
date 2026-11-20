import 'dotenv/config';
import { parseArgs } from 'node:util';
import { MockOrdersGateway } from '../src/infrastructure/integration/orders/MockOrdersGateway';

/**
 * Simulador del módulo de Órdenes (HU-CON-01): envía eventos orden.confirmada a la
 * API en ejecución (npm run dev:api) con el token de servicio mock-sistema.
 *
 *   npm run simular:orden                               una orden aleatoria
 *   npm run simular:orden -- --vendedores V-1,V-2       orden multi-vendedor
 *   npm run simular:orden -- --valores 100000,50000     valores brutos por vendedor
 *   npm run simular:orden -- --estado PENDIENTE         caso IGNORADO
 *   npm run simular:orden -- --repetir 2                reenvía el mismo evento (YA_PROCESADO)
 *   npm run simular:orden -- --cantidad 5               cinco órdenes distintas
 */
const { values } = parseArgs({
  options: {
    url: { type: 'string', default: `http://localhost:${process.env.PORT ?? 3000}` },
    token: { type: 'string', default: 'mock-sistema' },
    orden: { type: 'string' },
    vendedores: { type: 'string' },
    valores: { type: 'string' },
    estado: { type: 'string' },
    fecha: { type: 'string' },
    repetir: { type: 'string', default: '1' },
    cantidad: { type: 'string', default: '1' },
  },
});

const lista = (v?: string) =>
  v
    ?.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
const gateway = new MockOrdersGateway();
const endpoint = `${values.url}/api/v1/contabilidad/eventos/orden-confirmada`;

for (let i = 0; i < Number(values.cantidad); i++) {
  const vendedores = lista(values.vendedores);
  const valores = lista(values.valores);
  const evento = gateway.generarOrdenConfirmada({
    ...(values.orden && Number(values.cantidad) === 1 ? { numeroOrden: values.orden } : {}),
    ...(vendedores ? { vendedores } : {}),
    ...(valores ? { valores } : {}),
    ...(values.estado ? { estado: values.estado } : {}),
    ...(values.fecha ? { fecha: new Date(values.fecha) } : {}),
  });

  for (let intento = 1; intento <= Number(values.repetir); intento++) {
    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${values.token}` },
        body: JSON.stringify(evento),
      });
    } catch {
      console.error(`No se pudo conectar a ${endpoint}. ¿Está corriendo npm run dev:api?`);
      process.exit(1);
    }
    const lineas = evento.lineas.map((l) => `${l.vendedorId}=${l.valorBruto}`).join(', ');
    console.log(
      `${evento.numeroOrden} [${evento.estado}] ${lineas} -> HTTP ${res.status}`,
      JSON.stringify(await res.json()),
    );
  }
}
