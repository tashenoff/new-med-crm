module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
  plugins: ['react-hooks'],
  extends: ['eslint:recommended', 'plugin:react-hooks/recommended'],
  rules: { 'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z]' }] },
};
