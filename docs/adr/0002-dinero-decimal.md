# ADR 0002 — Representación del dinero

- Estado: Aceptada (regla de redondeo provisional, ver D-02)
- Fecha: 2026-10-05

## Decisión

- Dominio: value object `Money` sobre `decimal.js` con redondeo HALF_UP. Nunca `number`.
- `Money.of()` rechaza más de 2 decimales; el redondeo solo ocurre en operaciones
  explícitas (`percentage()`).
- El valor neto se calcula por resta (`bruto − comisión`) para que siempre se cumpla
  `bruto = comisión + neto`.
- PostgreSQL: `NUMERIC(18,2)` para montos y `NUMERIC(7,4)` para porcentajes;
  `pg` devuelve NUMERIC como string (parser configurado en `pool.ts`).
- API/JSON: montos como string decimal (`"100000.00"`), validados por
  `montoSchema` en `packages/contracts`.
- Frontend: solo formatea montos (`formatearMoneda`); no hace aritmética.

## Consecuencias

No hay errores de coma flotante en ningún punto de la cadena (evento → BD → reporte → Excel).
