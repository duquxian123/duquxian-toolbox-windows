import { net, protocol } from "electron";
import { extname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { assertPathWithin } from "./fs-utils";
import type { MediaRegistry } from "./media-registry";

const mimeTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

export function registerToolboxScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: "toolbox",
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ]);
}

export function installToolboxProtocol(options: {
  rendererRoot: string;
  media: MediaRegistry;
}): void {
  protocol.handle("toolbox", async (request) => {
    try {
      const url = new URL(request.url);
      let filePath: string;
      if (url.hostname === "app") {
        const relativePath =
          decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
        filePath = assertPathWithin(
          options.rendererRoot,
          join(options.rendererRoot, relativePath),
        );
      } else if (url.hostname === "media") {
        const pathname = decodeURIComponent(url.pathname).replace(/^\/+/, "");
        const [source, id, filename, ...rest] = pathname.split("/");
        if (!source || !id || !filename || rest.length > 0) {
          return new Response("Bad Request", { status: 400 });
        }
        const root = options.media.get(source);
        if (!root) {
          return new Response("Not Found", { status: 404 });
        }
        filePath = assertPathWithin(root, join(root, id, filename));
      } else {
        return new Response("Not Found", { status: 404 });
      }

      const response = await net.fetch(pathToFileURL(filePath).toString());
      if (!response.ok) {
        return new Response("Not Found", { status: 404 });
      }
      const headers = new Headers(response.headers);
      headers.set(
        "Content-Type",
        mimeTypes[extname(filePath).toLowerCase()] ?? "application/octet-stream",
      );
      headers.set("Cache-Control", "no-store");
      headers.set("X-Content-Type-Options", "nosniff");
      headers.set("Access-Control-Allow-Origin", "*");
      headers.set("Cross-Origin-Resource-Policy", "cross-origin");
      if (url.hostname === "app" && filePath.toLowerCase().endsWith(".html")) {
        headers.set(
          "Content-Security-Policy",
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
            "img-src 'self' data: blob: toolbox:; connect-src 'self' toolbox:; " +
            "object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
        );
      }
      return new Response(response.body, {
        status: 200,
        headers,
      });
    } catch {
      return new Response("Not Found", { status: 404 });
    }
  });
}
