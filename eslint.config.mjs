import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";


import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";


// export default [
//   {languageOptions: { globals: globals.browser }},
//   pluginJs.configs.recommended,
//   ...tseslint.configs.recommended,
// ];

// export default [
//   {languageOptions: { globals: globals.browser }},// Recommended config applied to all files
//   // Override the recommended config
//   {
//       rules: {
//           indent: ["error", 2],
//           "no-unused-vars": "warn"
//       }
//       // ...other configuration
//   }
// ];
export default [
  
  {
 
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended'
  ],
  env: {
    browser: true,
    node: true,
    es6: true,
  },
  rules: {
   
    'eol-last': 'off',
    'quotes': ['error', 'single'],
    'indent': 'off',  // Default rule is disabled, customized below
    '@typescript-eslint/explicit-member-accessibility': 'off',
    'import/order': 'off',
    'max-len': ['error', { code: 150 }],
    '@typescript-eslint/member-ordering': 'off',
    'curly': 'off',
    '@typescript-eslint/naming-convention': 'off',
    '@typescript-eslint/no-empty-interface': 'off',
    'no-empty': 'off',
    'arrow-parens': 'off',
    'sort-keys': 'off',
    '@typescript-eslint/no-unused-expressions': 'off',
    '@typescript-eslint/no-var-requires': 'off',
    '@typescript-eslint/no-inferrable-types': 'off',
    'one-var': 'off',
    'one-var-declaration-per-line': 'off',
    'no-unused-vars': 'warn'
  },
  overrides: [
    {
      files: ['*.ts', '*.tsx'],
      rules: {
        'indent': ['error', 2],
      },
    },
  ],
  ignorePatterns: ['package.json'],
}]
