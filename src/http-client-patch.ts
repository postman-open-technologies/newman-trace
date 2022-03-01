import hook from "require-in-the-middle";
import shimmer from "shimmer";
import { har } from "./http-tracer";

export function patch(storage) {
  hook(["http", "https"], (moduleExports) => {
    for (const functionName of ["request", "get"]) {
      shimmer.wrap(moduleExports, functionName, (request) =>
        createTrace(moduleExports, storage, request)
      );
    }
    return moduleExports;
  });
}

function createTrace(moduleExports, storage, request) {
  const defaultProtocol = moduleExports.globalAgent?.protocol || "http:";
  return function trace(options, callback) {
    if (!options) {
      return request.apply(this, [options, callback]);
    }

    options.defaultProtocol = defaultProtocol;
    return har(this, storage, request, options, callback);
  };
}
