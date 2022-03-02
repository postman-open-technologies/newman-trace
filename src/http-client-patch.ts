import { Entry } from "har-format";
import hook from "require-in-the-middle";
import shimmer from "shimmer";
import { har } from "./http-tracer";
import { TraceOptions, ProtocolModule, RequestFunc } from "./types";

export function patch(storage) {
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
  return function trace(options: TraceOptions, callback) {
    if (!options) {
      return request.apply(this, [options, callback]);
    }

    options.defaultProtocol = defaultProtocol;
    return har(this, storage, request, options, callback);
  };
}
