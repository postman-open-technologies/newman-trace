// A reverse proxy that captures incoming HTTP traffic and sends it
// through Postman's forward proxy, which forwards traffic to the
// specified target in process.env.TARGET.

// request
// client -> this-proxy -> postman-proxy --|
//                                         |
//                                       target
// response                                |
// client <- this-proxy <- postman-proxy --|

import http from "http";

export interface ProxyOptions {
  systemProxyURL: URL;
}

export class Proxy {
  constructor(private options: ProxyOptions) {}
  proxy(options) {
    const { systemProxyURL } = this.options;
    const target = options.target;

    const server = http.createServer((req, res) => {
      try {
        let forwardedFor = (req.headers["x-forwarded-for"] as string) || "";
        const ff = forwardedFor.split(",");
        ff.push(req.socket.remoteAddress);
        forwardedFor = ff.map((h) => h.trim()).join(", ");

        const options = {
          headers: Object.assign({}, req.headers, {
            host: target,
            "x-forwarded-proto": "http",
            "x-forwarded-host": req.headers.host,
            "x-forwarded-for": forwardedFor,
          }),
          host: systemProxyURL.hostname,
          port: systemProxyURL.port,
          method: req.method,
          path: `http://${target}${req.url}`, // convert to forward proxy style
        };

        const client = http.request(options, (reply) => {
          res.statusCode = reply.statusCode;
          for (const [name, value] of Object.entries(reply.headers)) {
            res.setHeader(name, value);
          }
          reply.pipe(res);
        });

        log(`Forwarding request to ${options.path}`);

        req.pipe(client);
      } catch (ex) {
        console.error(ex);
      }
    });

    server.on("connect", (_req, clientSocket, _head) => {
      // HTTP tunneling not supported.
      log("Client attempted to use an HTTP tunnel, sending 502 Bad Gateway.");
      clientSocket.end("HTTP/1.1 502 Bad Gateway\r\n\rn");
    });

    server.on("listening", () => {
      log(`Proxy listening on ${JSON.stringify(server.address())}`);
    });

    server.listen(process.env.PORT || 3100);

    const log = (msg) => {
      console.log(new Date(), `=> ${msg}`);
    };
  }
}
