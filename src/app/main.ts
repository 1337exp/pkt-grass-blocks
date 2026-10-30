import { createApp } from 'vue';
import { localeRu, setTaoLocale } from '@1337exp/taoui';
import '@1337exp/taoui/styles.css';
import App from './App.vue';
import './index.css';

setTaoLocale(localeRu);
createApp(App).mount('#app');
