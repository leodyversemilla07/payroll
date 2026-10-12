import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const apiDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = 42000 + Math.floor(Math.random() * 1000);
let output = "";

const child = spawn(process.execPath, ["dist/main.js"], {
  cwd: apiDirectory,
  env: {
    ...process.env,
    NODE_ENV: "test",
    PORT: String(port),
    DATABASE_URL:
      process.env.DATABASE_URL ??
      "postgresql://postgres:password@localhost:5432/payroll_db?schema=public",
    CORS_ORIGIN: "http://localhost:3000",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

child.stdout.on("data", (chunk) => {
  output += chunk.toString();
});
child.stderr.on("data", (chunk) => {
  output += chunk.toString();
});

try {
  let response;

  // Cold startup on slower machines can exceed four seconds. Keep the
  // overall wait bounded, and also bound each health request.
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`API exited with code ${child.exitCode}.\n${output}`);
    }

    try {
      response = await fetch(`http://127.0.0.1:${port}/`, {
        signal: AbortSignal.timeout(1_000),
      });
      if (response.ok) break;
    } catch {
      // Retry while the process is starting, up to the overall deadline.
    }
    await delay(100);
  }

  if (!response?.ok) {
    throw new Error(`API did not become healthy within 30 seconds.\n${output}`);
  }

  const body = await response.text();
  let info;
  try {
    info = JSON.parse(body);
  } catch {
    throw new Error(`Unexpected non-JSON health response: ${body}`);
  }
  if (info?.name !== "payroll-api" || info?.status !== "ok") {
    throw new Error(`Unexpected health response: ${body}`);
  }

  console.log("Production API smoke test passed");
} finally {
  child.kill("SIGTERM");
}
