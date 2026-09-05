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

  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`API exited with code ${child.exitCode}.\n${output}`);
    }

    try {
      response = await fetch(`http://127.0.0.1:${port}/`);
      break;
    } catch {
      await delay(100);
    }
  }

  if (!response?.ok) {
    throw new Error(`API did not become healthy.\n${output}`);
  }

  const body = await response.text();
  if (body !== "Hello World!") {
    throw new Error(`Unexpected health response: ${body}`);
  }

  console.log("Production API smoke test passed");
} finally {
  child.kill("SIGTERM");
}
