module.exports = {
  root: true,
  // browser: frontend React; node: server.js, src/db/*, src/server/* (process, Buffer, etc.)
  env: { browser: true, node: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs'],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  settings: { react: { version: '18.2' } },
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    // Sem sistema de prop-types nem TypeScript: regra gera ruido, nao apanha bugs.
    'react/prop-types': 'off',
    // Aspas/apostrofos em texto JSX nao sao bug.
    'react/no-unescaped-entities': 'off',
    // catch {} vazio e idiomatico neste codebase (best-effort com fallback).
    'no-empty': ['error', { allowEmptyCatch: true }],
    // Variaveis nao usadas: aviso (limpeza), nao bloqueio. Ignora args com _ prefixo.
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    // Function declarations dentro de blocos: validas em strict mode/ESM. Aviso,
    // nao erro — reescreve-las arriscaria partir codigo de auth correcto (main.jsx).
    'no-inner-declarations': 'warn',
  },
}
