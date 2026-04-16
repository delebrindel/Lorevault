import dotenv from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { collection } from "./routes/collection.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === "production";

// In production, .env is at the repo root; in dev, at server/.env
const envPath = isProduction
  ? resolve(__dirname, "../../.env")
  : resolve(__dirname, "../.env");

if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

if (!process.env.MOXFIELD_TOKEN) {
  console.error("MOXFIELD_TOKEN env variable is required.");
  process.exit(1);
}

const app = new Hono();

app.use("*", logger());

// CORS is only needed in dev when the client runs on a separate origin
if (!isProduction) {
  const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:5173";
  app.use(
    "*",
    cors({
      origin: CORS_ORIGIN,
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type"],
    })
  );
}

// --- API routes ---
app.route("/api/collection", collection);
app.get("/api/health", (c) => c.json({ status: "ok" }));

// --- Static file serving (production only) ---
if (isProduction) {
  const clientDistPath = resolve(__dirname, "../../client/dist");

  app.use(
    "/*",
    serveStatic({ root: clientDistPath, rewriteRequestPath: (path) => path })
  );

  // SPA fallback: serve index.html for any non-API route that didn't match a file
  app.get("*", (c) => {
    const indexPath = resolve(clientDistPath, "index.html");
    const html = readFileSync(indexPath, "utf-8");
    return c.html(html);
  });
}

const PORT = Number(process.env.PORT) || 3001;

const server = serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(
    `Server running on http://localhost:${info.port} (${isProduction ? "production" : "development"})`
  );
});
