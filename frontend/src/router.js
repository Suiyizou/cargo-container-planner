import { createRouter, createWebHistory } from "vue-router";

const PageStub = { render: () => null };

if (window.location.hash?.startsWith("#/")) {
  window.history.replaceState(null, "", window.location.hash.slice(1));
} else if (window.location.hash === "#admin") {
  window.history.replaceState(null, "", "/admin");
}

export const router = createRouter({
  history: createWebHistory("/"),
  routes: [
    { path: "/", redirect: "/home" },
    { path: "/home", name: "home", component: PageStub },
    { path: "/planner", name: "planner", component: PageStub },
    { path: "/algorithm", name: "algorithm", component: PageStub },
    { path: "/excel", name: "excel-template", component: PageStub },
    { path: "/admin", name: "admin", component: PageStub }
  ]
});
