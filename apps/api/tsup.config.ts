import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { main: 'src/bootstrap/main.ts' },
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // Los contratos son TypeScript fuente del monorepo: se empaquetan en el build.
  noExternal: ['@contabilidad/contracts'],
});
