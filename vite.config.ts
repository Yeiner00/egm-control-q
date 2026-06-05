import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import type { IncomingMessage, ServerResponse } from "node:http";

const readRequestBody = (request: IncomingMessage) =>
  new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });

const buildRequestHeaders = (request: IncomingMessage) => {
  const headers = new Headers();
  Object.entries(request.headers).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => headers.append(key, item));
    } else if (value) {
      headers.set(key, value);
    }
  });
  return headers;
};

const sendFetchResponse = async (serverResponse: ServerResponse, response: Response) => {
  serverResponse.statusCode = response.status;
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() !== "content-encoding") {
      serverResponse.setHeader(key, value);
    }
  });
  const body = Buffer.from(await response.arrayBuffer());
  serverResponse.end(body);
};

const reportImportDevApi = (): Plugin => ({
  name: "report-import-dev-api",
  apply: "serve",
  configureServer(server: ViteDevServer) {
    server.middlewares.use(async (request, response, next) => {
      const host = request.headers.host || "localhost";
      const url = new URL(request.url || "/", `http://${host}`);
      const routeModule = url.pathname === "/api/report-imports"
        ? "/api/report-imports.ts"
        : /^\/api\/report-imports\/[^/]+\/confirm$/.test(url.pathname)
          ? "/api/report-imports/[id]/confirm.ts"
          : null;

      if (!routeModule) {
        next();
        return;
      }

      try {
        const method = request.method || "GET";
        const canHaveBody = method !== "GET" && method !== "HEAD";
        const body = canHaveBody ? new Uint8Array(await readRequestBody(request)) : undefined;
        const fetchRequest = new Request(url.toString(), {
          method,
          headers: buildRequestHeaders(request),
          body,
        });
        const module = await server.ssrLoadModule(routeModule) as {
          default?: { fetch?: (request: Request) => Response | Promise<Response> };
        };
        const fetchHandler = module.default?.fetch;
        if (!fetchHandler) {
          await sendFetchResponse(response, Response.json({ error: "API route has no fetch handler" }, { status: 500 }));
          return;
        }
        await sendFetchResponse(response, await fetchHandler(fetchRequest));
      } catch (error) {
        await sendFetchResponse(
          response,
          Response.json(
            { error: error instanceof Error ? error.message : "Error ejecutando API local" },
            { status: 500 },
          ),
        );
      }
    });
  },
});

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  Object.entries(env).forEach(([key, value]) => {
    if (process.env[key] === undefined) process.env[key] = value;
  });

  return {
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
    },
    plugins: [reportImportDevApi(), react(), mode === "development" && componentTagger()].filter(Boolean),
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return;

            if (
              id.includes("/react/") ||
              id.includes("/react-dom/") ||
              id.includes("/react-router/") ||
              id.includes("/react-router-dom/")
            ) {
              return "react-vendor";
            }

            if (id.includes("/@supabase/")) {
              return "supabase-vendor";
            }

            if (
              id.includes("/@radix-ui/") ||
              id.includes("/cmdk/") ||
              id.includes("/sonner/") ||
              id.includes("/lucide-react/")
            ) {
              return "ui-vendor";
            }
          },
        },
      },
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
      dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
    },
  };
});
