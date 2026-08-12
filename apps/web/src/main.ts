import { VueQueryPlugin } from '@tanstack/vue-query';
import { createPinia } from 'pinia';
import { createApp } from 'vue';

import App from './App.vue';
import { queryClient } from './app/query-client';
import router from './router';
import { useThemeStore } from './stores/theme';

import './assets/main.css';
import './assets/transitions.css';

const app = createApp(App);

const pinia = createPinia();
app.use(pinia);
app.use(router);
app.use(VueQueryPlugin, { queryClient });

// 挂载前应用全局主题（localStorage 持久化，全站生效）
useThemeStore(pinia).apply();

app.mount('#app');
