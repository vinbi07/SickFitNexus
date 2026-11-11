import { defineConfig } from "vitest/config";
import { loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * Serves the Vercel functions in /api from the Vite dev server, so `npm run dev` works without
 * `vercel dev`. Dev only; production uses Vercel's own function runtime.
 */
function vercelApiDevPlugin(): Plugin {
  const apiRoot = path.resolve(__dirname, "api");
  return {
    name: "vercel-api-dev",
    apply: "serve",
    configureServer(server) {
      if (process.env.VITEST) return;
      // Functions read server-side secrets (e.g. ANTHROPIC_API_KEY) from process.env, as on Vercel.
      const env = loadEnv(server.config.mode, __dirname, "");
      for (const [key, value] of Object.entries(env)) {
        if (process.env[key] === undefined) process.env[key] = value;
      }

      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const pathname = (req.url ?? "").split("?")[0];
        if (!pathname.startsWith("/api/")) return next();
        const file = path.resolve(__dirname, `.${pathname}.ts`);
        if (!file.startsWith(apiRoot + path.sep) || path.basename(file).startsWith("_") || !fs.existsSync(file)) {
          return next();
        }

        const sendJson = (status: number, payload: unknown) => {
          res.statusCode = status;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(payload));
        };

        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        const raw = Buffer.concat(chunks).toString("utf8");
        let body: unknown = raw;
        if (raw && String(req.headers["content-type"] ?? "").includes("application/json")) {
          try {
            body = JSON.parse(raw);
          } catch {
            return sendJson(400, { error: "Invalid JSON body." });
          }
        }

        const url = new URL(req.url ?? "/", "http://localhost");
        const vercelReq = Object.assign(req, { body, query: Object.fromEntries(url.searchParams), cookies: {} });
        const vercelRes = Object.assign(res, {
          status(code: number) {
            res.statusCode = code;
            return vercelRes;
          },
          json(payload: unknown) {
            sendJson(res.statusCode || 200, payload);
            return vercelRes;
          },
          send(payload: unknown) {
            res.end(typeof payload === "string" || Buffer.isBuffer(payload) ? payload : JSON.stringify(payload));
            return vercelRes;
          },
        });

        try {
          const mod = (await server.ssrLoadModule(file)) as { default?: (req: unknown, res: unknown) => unknown };
          if (typeof mod.default !== "function") return sendJson(500, { error: `${pathname} has no default export.` });
          await mod.default(vercelReq, vercelRes);
        } catch (error) {
          if (error instanceof Error) server.ssrFixStacktrace(error);
          server.config.logger.error(`[api] ${pathname} failed: ${error instanceof Error ? error.stack : String(error)}`);
          if (!res.headersSent) sendJson(500, { error: "API route crashed. See the dev server terminal." });
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), vercelApiDevPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
  },
});
