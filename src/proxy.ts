// A reverse proxy that captures incoming HTTP traffic and sends it
// through Postman's forward proxy, which forwards traffic to the
// specified target in process.env.TARGET.

// request
// client -> this-proxy -> postman-proxy --|
//                                         |
//                                       target
// response                                |
// client <- this-proxy <- postman-proxy --|

import { createServer, request, Server as HTTPServer } from "http";
import { AddressInfo, connect, Server as NetServer } from "net";
import parser from "http-string-parser";
import { PassThrough } from "stream";

const log = (msg: string) => {
  console.log(new Date(), `=> ${msg}`);
};

export interface ProxyOptions {
  host?: string;
  port?: number;
  systemProxyURL?: URL;
}

export class Proxy {
  private httpServer: HTTPServer;
  private proxyConnectErrorNotifier: (err: Error) => void;

  constructor(private proxyOptions: ProxyOptions) {
    this.httpServer = createServer();
  }

  public get listening() {
    return this.httpServer.listening;
  }

  public onServerError(callback: (err: Error) => void) {
    this.httpServer.on("error", callback);
  }

  public onProxyConnectError(callback: (err: Error) => void) {
    this.proxyConnectErrorNotifier = callback;
  }

  public onClose(callback: () => void) {
    this.httpServer.on("close", callback);
  }

  listen(): Promise<AddressInfo> {
    const { host = "127.0.0.1", port = 0, systemProxyURL } = this.proxyOptions;
    return new Promise((resolve) => {
      this.httpServer.on("request", (req, res) => {
        console.log("in request:", req.url);
        try {
          let forwardedFor = (req.headers["x-forwarded-for"] as string) || "";
          const ff = forwardedFor.split(",");
          ff.push(req.socket.remoteAddress);
          forwardedFor = ff.map((h) => h.trim()).join(", ");

          const options = {
            headers: Object.assign({}, req.headers, {
              "x-forwarded-proto": "http",
              "x-forwarded-host": req.headers.host,
              "x-forwarded-for": forwardedFor,
            }),
            host: systemProxyURL.hostname,
            port: systemProxyURL.port,
            method: req.method,
            path: req.url,
            //path: `http://${target}${req.url}`, // convert to forward proxy style
          };

          const client = request(options, (reply) => {
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

      this.httpServer.on("connect", (req, clientSocket, _head) => {
        const [host, port] = req.url.split(":");
        console.log(req.headers);
        const conn = connect(Number(port), host, () => {
          log("Client attempted to use an HTTP tunnel.");
          clientSocket.write("HTTP/1.1 200 OK\r\n\r\n");
          const requestPassthrough = new PassThrough();
          const chunks = [];
          requestPassthrough.on("readable", () => {
            let chunk: Buffer;
            while ((chunk = requestPassthrough.read())) {
              console.log(chunk.toString("utf8"));
              chunks.push(chunk);
            }
          });
          requestPassthrough.on("end", () => {
            //console.log(Buffer.concat(chunks).toString("utf8"));
          });

          clientSocket.pipe(requestPassthrough).pipe(conn);
          conn.pipe(clientSocket);
        });
      });

      this.httpServer.listen(port, host, () => {
        //log(`Proxy listening on ${JSON.stringify(server.address())}`);
        resolve((this.httpServer as NetServer).address() as AddressInfo);
      });
    });
  }
}
