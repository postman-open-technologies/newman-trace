import { IncomingMessage } from "node:http";
import hook from "require-in-the-middle";
import shimmer from "shimmer";
import { instrument } from "./http-client-instrumentation";
import { TraceOptions, ProtocolModule, RequestFunc, IExporter } from "./types";

export function patch(exporter: IExporter) {
  hook(["http", "https"], (moduleExports) => {
    const modExp = moduleExports as unknown as ProtocolModule;
    shimmer.wrap(modExp, "request", (request) =>
      createTrace(modExp, exporter, request)
    );
    shimmer.wrap(modExp, "get", (request) =>
      createTrace(modExp, exporter, request)
    );
    exporter.onInstrumented();
    return moduleExports;
  });
}

function createTrace(
  moduleExports: ProtocolModule,
  exporter: IExporter,
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
    return instrument(this, exporter, request, options, callback);
  };
}
