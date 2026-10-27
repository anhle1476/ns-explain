import { mountComments } from "./comments.ts";
import { mountDiagrams } from "./diagram.ts";
import { mountPage } from "./page.ts";

function boot(): void {
  mountPage();
  mountDiagrams();
  mountComments();
}

if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", boot);
else boot();
