import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createHead } from '@unhead/vue/client';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { gsapPlugin } from './plugins/gsap';
import App from './App.vue';
import './index.css';

// Register GSAP core plugins at application bootstrap
gsap.registerPlugin(ScrollTrigger);

const app = createApp(App);
const pinia = createPinia();
const head = createHead();

app.use(pinia);
app.use(head);
app.use(gsapPlugin);
app.mount('#root');
