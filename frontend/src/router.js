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
    { path: "/planner", redirect: "/planner/config" },
    { path: "/planner/config", name: "planner-config", component: PageStub },
    { path: "/planner/cargos", name: "planner-cargos", component: PageStub },
    { path: "/planner/results", name: "planner-results", component: PageStub },
    { path: "/algorithm", name: "algorithm", component: PageStub },
    { path: "/excel", redirect: "/smart-import" },
    { path: "/smart-import", name: "smart-import", component: PageStub },
    { path: "/admin", name: "admin", component: PageStub }
  ]
});
