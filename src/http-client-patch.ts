import { Log } from "har-format";
import { IncomingMessage } from "node:http";
import hook from "require-in-the-middle";
import shimmer from "shimmer";
import { instrument } from "./http-tracer";
import { TraceOptions, ProtocolModule, RequestFunc } from "./types";

export function patch(log: Log) {
  hook(["http", "https"], (moduleExports) => {
    const modExp = moduleExports as unknown as ProtocolModule;
    shimmer.wrap(modExp, "request", (request) =>
      createTrace(modExp, log, request)
    );
    shimmer.wrap(modExp, "get", (request) => createTrace(modExp, log, request));
    return moduleExports;
  });
}

function createTrace(
  moduleExports: ProtocolModule,
  log: Log,
  request: RequestFunc
) {
  const defaultProtocol = moduleExports.globalAgent?.protocol || "http:";
  return function trace(
    options: TraceOptions,
    callback: (res: IncomingMessage) => void
  ) {
    if (!options) {
      return request.apply(this, [options, callback]);
    }

    options.defaultProtocol = defaultProtocol;
    return instrument(this, log, request, options, callback);
  };
}
