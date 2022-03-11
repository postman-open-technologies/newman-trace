#!/usr/bin/env node

import path from "node:path";
import { main } from "./main";

(async function cli() {
  const traceHelp = process.argv.indexOf("--trace-help") > -1;
  if (traceHelp) {
    printHelp();

    return;
  }

  const { harFilePath, isTracingPrevented } = parseOptions(process.argv);

  const timestamp = new Date().toISOString().replace(/[^\d]+/g, "-");
  const ensuredHarFilePath =
    harFilePath || path.join("newman", `newman-trace-${timestamp}0.har`);

  await main(ensuredHarFilePath, isTracingPrevented);
})();

function parseOptions(args: string[]) {
  const isTracingPrevented = args.indexOf("--no-trace") > -1;

  if (isTracingPrevented) {
    process.argv.splice(args.indexOf("--no-trace"), 1);
  }

  const traceExportOption = "--trace-export";
  let harFilePath: string = null;
  for (const [index, option] of args.entries()) {
    if (option === traceExportOption) {
      harFilePath = args[index + 1];
      process.argv.splice(index, 2);
      break;
    }

    if (option.startsWith(traceExportOption)) {
      const parts = option.split("=");
      if (parts.length > 1) {
        harFilePath = parts[1];
        process.argv.splice(index, 1);
      }
      break;
    }
  }
  return { isTracingPrevented, harFilePath };
}

function printHelp() {
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
}
