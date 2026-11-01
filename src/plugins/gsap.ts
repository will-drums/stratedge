import type { App, InjectionKey } from 'vue';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export interface GsapContextValue {
  gsap: typeof gsap;
  ScrollTrigger: typeof ScrollTrigger;
}

export const GSAP_INJECTION_KEY: InjectionKey<GsapContextValue> = Symbol('gsap');

export const gsapPlugin = {
  install(app: App) {
    gsap.registerPlugin(ScrollTrigger);
    ScrollTrigger.config({
      ignoreMobileResize: true,
    });

    app.config.globalProperties.$gsap = gsap;
    app.config.globalProperties.$ScrollTrigger = ScrollTrigger;
    app.provide(GSAP_INJECTION_KEY, { gsap, ScrollTrigger });
  },
};

export { gsap, ScrollTrigger };
