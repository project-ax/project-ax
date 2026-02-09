import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import pluginSecurity from 'eslint-plugin-security';
import noSecrets from 'eslint-plugin-no-secrets';

export default tseslint.config(
  // Global ignores
  {
    ignores: ['dist/', 'node_modules/', 'data/', '.worktrees/'],
  },

  // Base JS recommended rules
  eslint.configs.recommended,

  // ── src/: full type-checked linting ──
  ...tseslint.configs.recommendedTypeChecked.map(config => ({
    ...config,
    files: ['src/**/*.ts'],
  })),
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Downgrade to warn: the codebase has intentional `any` flows for IPC,
      // SQLite adapters, and dynamic imports. These are worth seeing but not blocking.
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      // Many provider methods must be async per interface but have sync implementations
      '@typescript-eslint/require-await': 'warn',
      // Template expressions with unknown types are common in error messages
      '@typescript-eslint/restrict-template-expressions': 'warn',
      '@typescript-eslint/restrict-plus-operands': 'warn',
      // Allow underscore-prefixed unused vars (convention for intentionally unused params)
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      // Floating promises and misused promises are important but need gradual adoption
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-misused-promises': 'warn',
    },
  },

  // ── tests/: syntax-only TypeScript rules (no type-checking) ──
  ...tseslint.configs.recommended.map(config => ({
    ...config,
    files: ['tests/**/*.ts'],
  })),

  // ── Security plugin (all source + test files) ──
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    plugins: {
      security: pluginSecurity,
    },
    rules: {
      'security/detect-buffer-noassert': 'error',
      'security/detect-child-process': 'warn',
      'security/detect-disable-mustache-escape': 'error',
      'security/detect-eval-with-expression': 'error',
      'security/detect-new-buffer': 'error',
      'security/detect-no-csrf-before-method-override': 'error',
      'security/detect-non-literal-fs-filename': 'warn',
      'security/detect-non-literal-regexp': 'warn',
      'security/detect-non-literal-require': 'error',
      'security/detect-object-injection': 'warn',
      'security/detect-possible-timing-attacks': 'error',
      'security/detect-pseudoRandomBytes': 'error',
      'security/detect-unsafe-regex': 'error',
      'security/detect-bidi-characters': 'error',
    },
  },

  // ── No-secrets plugin (src/) ──
  {
    files: ['src/**/*.ts'],
    plugins: {
      'no-secrets': noSecrets,
    },
    rules: {
      'no-secrets/no-secrets': ['error', { tolerance: 4.5 }],
    },
  },

  // ── No-secrets plugin (tests/ — warn only, test fixtures may look like secrets) ──
  {
    files: ['tests/**/*.ts'],
    plugins: {
      'no-secrets': noSecrets,
    },
    rules: {
      'no-secrets/no-secrets': ['warn', { tolerance: 4.5 }],
    },
  },

  // ── src/registry.ts override: allow dynamic import (SC-SEC-002 static allowlist) ──
  {
    files: ['src/registry.ts'],
    rules: {
      'security/detect-non-literal-require': 'off',
    },
  },

  // ── Scanner patterns: regexes are the product, not a vulnerability ──
  {
    files: ['src/providers/scanner/*.ts'],
    rules: {
      'security/detect-unsafe-regex': 'off',
      'security/detect-non-literal-regexp': 'off',
    },
  },

  // ── Test file relaxations ──
  {
    files: ['tests/**/*.ts'],
    rules: {
      'security/detect-child-process': 'off',
      'security/detect-non-literal-fs-filename': 'off',
      'security/detect-non-literal-require': 'off',
      'security/detect-object-injection': 'off',
      'security/detect-unsafe-regex': 'off',
      'security/detect-non-literal-regexp': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-empty': 'off',
    },
  },
);
