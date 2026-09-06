import { Router } from "express";
import path from "node:path";
import { renderExplorerPage } from "../../ssr/render.js";

export const webRouter: Router = Router();

// SSR Route (React Server-Side Rendering)
webRouter.get("/", (_req, res) => {
  const html = renderExplorerPage();
  res.send(html);
});

// Fallback to static schema reference page
webRouter.get("/static", (_req, res) => {
  res.sendFile(path.resolve(process.cwd(), "public/index.html"));
});
