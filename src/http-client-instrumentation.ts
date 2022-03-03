import { ClientRequest, IncomingMessage } from "node:http";
import { IExporter, RequestFunc, TraceOptions } from "./types";

export function instrument(
  self: unknown,
  exporter: IExporter,
  request: RequestFunc,
  options: TraceOptions,
  callback?: (res: IncomingMessage) => void
) {
  const method = options.method || "GET";
  const url =
    options instanceof String
      ? new URL(String(options))
      : new URL(
          (options.protocol || options.defaultProtocol) +
            "//" +
            (options.hostname || options.host || "localhost") +
            ":" +
            (options.port || "80") +
            (options.path || "/")
        );

  const interceptor = exporter.createInterceptor(
    method,
    url,
    process.hrtime.bigint()
  );

  const req: ClientRequest = request.call(self, options, callback);
  interceptor.onRequestCall(req, process.hrtime.bigint());

  req.on("response", (res: IncomingMessage) => {
    interceptor.onResponseReceived(res, process.hrtime.bigint());

    res.once("data", () => {
      interceptor.onResponseFirstByte(process.hrtime.bigint());
    });

    const chunks: Buffer[] = [];
    res.on("data", (chunk) => {
      chunks.push(chunk);
    });

    res.on("end", () => {
      const responseBody = Buffer.concat(chunks);
      interceptor.onResponseEnd(res, responseBody, process.hrtime.bigint());
      interceptor.onComplete();
    });

    if (callback) {
      callback(res);
    }
  });

  req.once("data", () => {
    interceptor.onRequestFirstByte(process.hrtime.bigint());
  });

  const chunks: Buffer[] = [];
  req.on("data", (chunk) => {
    chunks.push(chunk);
  });

  req.on("finish", () => {
    const requestBody = Buffer.concat(chunks);
    interceptor.onRequestFinish(req, requestBody, process.hrtime.bigint());
  });

  req.on("socket", (socket) => {
    interceptor.onSocketCreate(socket, process.hrtime.bigint());
    socket.on("lookup", (_err, address) => {
      interceptor.onDNSLookup(address, process.hrtime.bigint());
    });

    socket.on("connect", () => {
      interceptor.onSocketConnect(socket, process.hrtime.bigint());
    });

    socket.on("secureConnect", () => {
      interceptor.onSecureConnect(socket, process.hrtime.bigint());
    });
  });

  return req;
}
