import { spawn } from "node:child_process";

// Start the server first
const server = spawn("npm", ["run", "dev:server"], {
  stdio: "inherit",
  shell: true,
});

// Poll the health endpoint until the server is ready
const HEALTH_URL = "http://localhost:3001/api/health";
const POLL_INTERVAL = 500;
const TIMEOUT = 30_000;

async function waitForServer() {
  const start = Date.now();
  while (Date.now() - start < TIMEOUT) {
    try {
      const res = await fetch(HEALTH_URL);
      if (res.ok) return;
    } catch {
      // Server not ready yet
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
  }
  throw new Error(`Server did not become ready within ${TIMEOUT}ms`);
}

console.log("[dev] Waiting for server to be ready...");

waitForServer()
  .then(() => {
    console.log("[dev] Server is ready, starting client...");
    spawn("npm", ["run", "dev:client"], {
      stdio: "inherit",
      shell: true,
    });
  })
  .catch((err) => {
    console.error(err.message);
    server.kill();
    process.exit(1);
  });

// Forward termination signals
process.on("SIGINT", () => {
  server.kill();
  process.exit();
});
process.on("SIGTERM", () => {
  server.kill();
  process.exit();
});
