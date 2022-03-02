import { Entry } from "har-format";
import { IncomingMessage } from "node:http";
import hook from "require-in-the-middle";
import shimmer from "shimmer";
import { instrument } from "./http-tracer";
import { TraceOptions, ProtocolModule, RequestFunc } from "./types";

export function patch(storage: Entry[]) {
  hook(["http", "https"], (moduleExports) => {
    const modExp = moduleExports as unknown as ProtocolModule;
    shimmer.wrap(modExp, "request", (request) =>
      createTrace(modExp, storage, request)
    );
    shimmer.wrap(modExp, "get", (request) =>
      createTrace(modExp, storage, request)
    );
    return moduleExports;
  });
}

function createTrace(
  moduleExports: ProtocolModule,
  storage: Entry[],
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
    return instrument(this, storage, request, options, callback);
  };
}
