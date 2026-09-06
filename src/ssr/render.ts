import { renderSSR } from "@scaflo/node-react-wrapper";
import App from "./App.js";

export interface RenderPageOptions {
  title?: string;
  cssPath?: string;
  jsPath?: string;
}

export function renderExplorerPage(options: RenderPageOptions = {}): string {
  return renderSSR({
    App,
    title: options.title ?? "Scaflo gRPC Example",
    cssPath: options.cssPath ?? "/styles.css",
    jsPath: options.jsPath ?? "/client.js",
  });
}
