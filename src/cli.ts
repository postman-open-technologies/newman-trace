#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { patch } from "./http-client-patch";

const newmanPath =
  process.env.NEWMANTRACE_NEWMAN_PATH ||
  path.join(require.resolve("newman"), "..", "bin", "newman");

const entries = [];
patch(entries);

const noTrace = process.argv.indexOf("--no-trace") > -1;

if (noTrace) {
  process.argv.splice(process.argv.indexOf("--no-trace"), 1);
}

let traceExport = null;

const traceExportOption = "--trace-export";
for (const [index, option] of process.argv.entries()) {
  if (option === traceExportOption) {
    traceExport = process.argv[index + 1];
    process.argv.splice(index, 2);
    break;
  }

  if (option.startsWith(traceExportOption)) {
    const parts = option.split("=");
    if (parts.length > 1) {
      traceExport = parts[1];
      process.argv.splice(index, 1);
    }
    break;
  }
}
const traceHelp = process.argv.indexOf("--trace-help") > -1;
process.on("exit", (code) => {
  if (code !== 0 || noTrace || traceHelp) {
    return;
  }

  const report = {
    log: {
      version: "1.2",
      creator: {
        name: "newman-trace",
        version: "1.0.0",
      },
      pages: [],
      entries,
    },
  };

  if (!traceExport) {
    const timestamp = new Date().toISOString().replace(/[^\d]+/g, "-");
    traceExport = path.join("newman", `newman-trace-${timestamp}.har`);
  }

  const dir = path.dirname(traceExport);
  try {
    fs.statSync(dir);
  } catch {
    fs.mkdirSync(dir, { recursive: true });
  }

  const contents = JSON.stringify(report, null, 2);
  fs.writeFileSync(traceExport, contents);
});

if (traceHelp) {
  console.log(
    "Usage: newman-trace run <collection> [newman-options] [newman-trace-options]"
  );
  console.log();
  console.log("Options:");
  console.log("  --no-trace              Disable tracing");
  console.log(
    "  --trace-export <path>   Specify a location for the trace file"
  );
  console.log("  --trace-help            Displays this message");
  process.exit();
}

(async function main() {
  const newman = (await import(newmanPath)).default;
  newman(process.argv, (err) => {
    if (err) {
      console.error(err);
    }
  });
})();
