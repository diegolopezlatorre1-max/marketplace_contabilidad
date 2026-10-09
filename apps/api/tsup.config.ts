import { defineConfig } from 'tsup';

export default defineConfig({
  // migrate y seed se empaquetan para ejecutarse sin tsx (contenedor Docker).
  entry: { main: 'src/bootstrap/main.ts', migrate: 'scripts/migrate.ts', seed: 'scripts/seed.ts' },
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // Los contratos son TypeScript fuente del monorepo: se empaquetan en el build.
  noExternal: ['@contabilidad/contracts'],
});
