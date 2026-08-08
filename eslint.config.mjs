// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
export default tseslint.config(eslint.configs.recommended, tseslint.configs.strictTypeChecked, {
    languageOptions: {
        parserOptions: {
            projectService: true,
            tsconfigRootDir: process.cwd(),
        },
    },
}, {
    ignores: ['**/dist/**', '**/coverage/**', 'svelte.config.js'],
}, {
    files: ['packages/**/src/**/*.ts', 'packages/**/tests/**/*.ts'],
    rules: {
        '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
        '@typescript-eslint/restrict-template-expressions': [
            'error',
            { allowNumber: true, allowBoolean: true },
        ],
    },
}, {
    ignores: ['**/assets/**/*'],
}, {
    files: ['**/tailwind.config.js'],
    rules: {},
}, {
    files: ['**/postcss.config.cjs'],
    languageOptions: {
        globals: {
            require: 'readonly',
            module: 'readonly',
            exports: 'readonly',
            process: 'readonly',
            console: 'readonly',
        },
    },
});
