import fs from "node:fs/promises";
import path from "node:path";
import { fork } from "child_process";

const newmanPath =
  process.env.NEWMANTRACE_NEWMAN_PATH ||
  path.join(require.resolve("newman"), "..", "bin", "newman");

export async function main(traceExport, isTracingPrevented) {
  const dir = path.dirname(traceExport);
  try {
    await fs.stat(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }

  fork(newmanPath, process.argv.slice(2), {
    env: {
      ...process.env,
      HAR_CREATOR_NAME: "newman-trace",
      HAR_CREATOR_VERSION: "1.0.0",
      HAR_EXPORT_PATH: traceExport,
    },
    execArgv: isTracingPrevented
      ? []
      : ["--require", path.join(__dirname, "instrument.js")],
  });
}
