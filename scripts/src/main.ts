import { mountDiagrams } from "./diagram.ts";
import { mountPage } from "./page.ts";

function boot(): void {
  mountPage();
  mountDiagrams();
}

if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", boot);
else boot();
