import { createApp } from "vue";
import ElementPlus from "element-plus";
import App from "./App.vue";
import { router } from "./router";
import { i18n } from "./i18n";
import { installLegacyDomI18n } from "./i18n/legacyDom";
import "element-plus/dist/index.css";
import "./styles.css";

createApp(App).use(router).use(i18n).use(ElementPlus).mount("#app");
installLegacyDomI18n();
