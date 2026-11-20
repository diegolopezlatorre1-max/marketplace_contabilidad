import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

/**
 * Reglas de capas de la arquitectura hexagonal (ver docs/adr/0001).
 * domain      -> no depende de nada externo al dominio.
 * application -> solo depende de domain.
 * infrastructure / bootstrap -> pueden depender de todo.
 */
const LIBRERIAS_DE_INFRAESTRUCTURA = [
  'express',
  'pg',
  'pino',
  'pino-http',
  'helmet',
  'cors',
  'swagger-ui-express',
  'dotenv',
  'exceljs',
];

export default tseslint.config(
  { ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**', 'docs/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['apps/api/src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: LIBRERIAS_DE_INFRAESTRUCTURA,
          patterns: [
            {
              group: ['**/application/**', '**/infrastructure/**', '**/bootstrap/**'],
              message: 'El dominio no puede depender de otras capas.',
            },
            { group: ['@contabilidad/contracts'], message: 'El dominio no conoce los contratos.' },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/api/src/application/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: LIBRERIAS_DE_INFRAESTRUCTURA,
          patterns: [
            {
              group: ['**/infrastructure/**', '**/bootstrap/**'],
              message: 'La aplicación solo depende del dominio y de sus puertos.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
);
