import eslintConfigPrettier from 'eslint-config-prettier';
import pluginVue from 'eslint-plugin-vue';
import tseslint from 'typescript-eslint';

const baseIgnores = {
  ignores: [
    'dist/**',
    '.output/**',
    '.nuxt/**',
    'coverage/**',
    'node_modules/**',
    'playwright-report/**',
    'test-results/**',
  ],
};

const base = tseslint.config(baseIgnores, ...tseslint.configs.recommended, eslintConfigPrettier);

/** 纯 TypeScript 项目（api / worker / utils / types / ui） */
export const typescript = base;

/** Vue + TypeScript 项目（web / blog / ui 组件） */
export const vue = tseslint.config(
  ...base,
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
      },
    },
  },
  {
    // Vue Router / Nuxt 约定文件名（index.vue / default.vue）豁免单字命名规则
    files: ['**/pages/**/*.vue', '**/layouts/**/*.vue'],
    rules: {
      'vue/multi-word-component-names': 'off',
    },
  },
  {
    // 纯格式规则交给 Prettier 管理（eslint-config-prettier 未覆盖的 Vue 规则）
    rules: {
      'vue/html-self-closing': 'off',
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-indent': 'off',
    },
  },
);

export default vue;
