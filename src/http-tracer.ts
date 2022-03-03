import {
  ClientRequest,
  IncomingHttpHeaders,
  IncomingMessage,
  OutgoingHttpHeaders,
} from "node:http";
import { AddressInfo } from "node:net";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import { Entry, Log } from "har-format";
import { getEncoding } from "istextorbinary";
import { createEntry } from "./har";
import { RequestFunc, Timings, TraceOptions } from "./types";

export function instrument(
  self: unknown,
  log: Log,
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
  const headers = options.headers || {};

  const timings: Timings = {
    start: process.hrtime.bigint(),
    blocked: -1n,
    dns: -1n,
    connect: -1n,
    send: 0n,
    wait: 0n,
    receive: 0n,
    ssl: -1n,
  };

  const entry: Entry = createEntry(method, url, Date.now());

  const { converted, size } = convertHeadersWithSize(headers);
  entry.request.headers = converted;
  entry.request.headersSize = size;

  for (const [name, value] of url.searchParams.entries()) {
    entry.request.queryString.push({ name, value });
  }

  log.entries.push(entry);
  const req: ClientRequest = request.call(self, options, callback);

  let requestHeadersSize = 2; // ending \r\n
  for (const [name, value] of Object.entries(req.getHeaders())) {
    if (Array.isArray(value)) {
      requestHeadersSize +=
        name.length * value.length + value.join("").length + 4 * value.length;
      continue;
    }
    requestHeadersSize += name.length + 4 + String(value).length;
  }
  entry.request.headersSize = requestHeadersSize;

  entry.request.cookies = !req.getHeader("cookie")
    ? []
    : (req.getHeader("cookie") as string).split("; ").map((cookie) => {
        const [name, value] = cookie.split("=");
        return { name, value };
      });

  req.on("response", (res: IncomingMessage) => {
    entry.response.status = res.statusCode;
    entry.response.statusText = res.statusMessage;
    entry.response.httpVersion = `HTTP/${res.httpVersion}`;
    entry.response.redirectURL = res.headers["location"] || "";

    const { converted, size } = convertHeadersWithSize(res.headers);
    entry.response.headers = converted;
    entry.response.headersSize = size;

    let responseHeadersSize = 2; // ending \r\n
    for (const [name, value] of Object.entries(res.headers)) {
      if (Array.isArray(value)) {
        responseHeadersSize +=
          name.length * value.length + value.join("").length + 4 * value.length;
        continue;
      }
      responseHeadersSize += name.length + 4 + String(value).length;
    }
    entry.response.headersSize = responseHeadersSize;

    entry.response.cookies = !res.headers["cookie"]
      ? []
      : res.headers["set-cookie"].map((cookie) => {
          const cookieObj = {
            name: "",
            value: "",
            path: undefined,
            domain: undefined,
            expires: undefined,
            httpOnly: undefined,
            secure: undefined,
          };
          // fragile, cookies can contain semicolons in quoted values
          const parts = cookie.split(";");
          const [cookieName, cookieValue] = parts.shift().split("=");
          cookieObj.name = cookieName;
          cookieObj.value = cookieValue;

          for (const attr of parts) {
            const attrParts = attr.split("=");
            const attrName = attrParts[0].trim().toLowerCase();
            const attrValue = attrParts[1];
            switch (attrName) {
              case "path":
                cookieObj.path = attrValue;
                break;
              case "domain":
                cookieObj.domain = attrValue;
                break;
              case "expires":
                cookieObj.expires = attrValue;
                break;
              case "httponly":
                cookieObj.httpOnly = true;
                break;
              case "secure":
                cookieObj.secure = true;
            }
          }

          return cookieObj;
        });

    const chunks: Buffer[] = [];
    res.on("data", (chunk) => {
      const blocked = timings.blocked < 0n ? 0n : timings.blocked;
      const dns = timings.dns < 0n ? 0n : timings.dns;
      const connect = timings.connect < 0n ? 0n : timings.connect;
      const ssl = entry.timings.ssl < 0n ? 0n : timings.ssl;
      timings.wait =
        process.hrtime.bigint() -
        (timings.start + blocked + dns + connect + ssl + timings.send);
      entry.timings.wait = Number(timings.wait) / 1_000_000;

      chunks.push(chunk);
    });

    res.on("end", () => {
      const blocked = timings.blocked < 0n ? 0n : timings.blocked;
      const dns = timings.dns < 0n ? 0n : timings.dns;
      const connect = timings.connect < 0n ? 0n : timings.connect;
      const ssl = timings.ssl < 0n ? 0n : timings.ssl;
      timings.receive =
        process.hrtime.bigint() -
        (timings.start +
          blocked +
          dns +
          connect +
          ssl +
          timings.send +
          timings.wait);
      entry.timings.receive = Number(timings.receive) / 1_000_000;

      entry.time =
        Number(blocked) / 1_000_000 +
        Number(dns) / 1_000_000 +
        Number(connect) / 1_000_000 +
        Number(ssl) / 1_000_000 +
        entry.timings.send +
        entry.timings.wait +
        entry.timings.receive;

      entry.response.content.mimeType = res.headers["content-type"];

      const responseBody = Buffer.concat(chunks);
      entry.response.bodySize = responseBody.length;
      const ce = res.headers["content-encoding"];
      if (!ce) {
        entry.response.content.size = responseBody.length; // only if not compressed, bigger uncompressed

        const enc = getEncoding(responseBody);

        if (!enc) {
          return;
        } else if (enc === "utf8") {
          entry.response.content.text = responseBody.toString("utf8");
        } else if (enc === "binary") {
          entry.response.content.text = responseBody.toString("base64");
          entry.response.content.encoding = "base64";
        }
      } else {
        const decompress = new Map([
          ["gzip", createGunzip],
          ["br", createBrotliDecompress],
          ["deflate", createInflate],
        ]);
        if (decompress.has(ce)) {
          const deFunc = decompress.get(ce);
          const de = deFunc();
          de.end(responseBody);

          const chunks = [];
          de.on("readable", () => {
            let chunk: Buffer;
            while ((chunk = de.read())) {
              chunks.push(chunk);
            }
          });
          de.on("end", () => {
            const buf = Buffer.concat(chunks);
            entry.response.content.size = buf.length;
            entry.response.content.compression =
              buf.length - responseBody.length;

            const enc = getEncoding(buf);

            if (!enc) {
              return;
            } else if (enc === "utf8") {
              entry.response.content.text = buf.toString("utf8");
            } else if (enc === "binary") {
              entry.response.content.text = buf.toString("base64");
              entry.response.content.encoding = "base64";
            }
          });
        }
      }
    });

    if (callback) {
      callback(res);
    }
  });

  const chunks: Buffer[] = [];
  req.on("data", (chunk) => {
    chunks.push(chunk);
  });
  req.on("finish", () => {
    const blocked = timings.blocked < 0n ? 0n : timings.blocked;
    const dns = timings.dns < 0n ? 0n : timings.dns;
    const connect = timings.connect < 0n ? 0n : timings.connect;
    const ssl = timings.ssl < 0n ? 0n : timings.ssl;
    timings.send =
      process.hrtime.bigint() - (timings.start + blocked + dns + connect + ssl);
    entry.timings.send = Number(timings.send) / 1_000_000;

    const requestBody = Buffer.concat(chunks);
    entry.request.bodySize = requestBody.length;

    const ct = req.getHeader("content-type");
    if (ct) {
      entry.request.postData.mimeType = ct as string;
      if (ct === "application/x-wwww-form-urlencoded") {
        const params = new URLSearchParams(requestBody.toString("utf8"));
        entry.request.postData.params = [];
        for (const [name, value] of params.entries()) {
          entry.request.postData.params.push({ name, value });
        }
      }
      if (ct === "multipart/form-data") {
        entry.request.postData.params = []; // TODO ...or no?
      }

      if (getEncoding(requestBody) === "utf8") {
        entry.request.postData.text = requestBody.toString("utf8");
      }
    }
  });

  req.on("socket", (socket) => {
    timings.blocked = process.hrtime.bigint() - timings.start;
    entry.timings.blocked = Number(timings.blocked) / 1_000_000;
    const address = socket.address() as AddressInfo;
    if (address.port) {
      entry.connection = String(address.port);
    }

    socket.on("lookup", (_err, address) => {
      entry.serverIPAddress = address;
      const blocked = timings.blocked < 0n ? 0n : timings.blocked;
      timings.dns = process.hrtime.bigint() - (timings.start + blocked);
      entry.timings.dns = Number(timings.dns) / 1_000_000;
    });

    socket.on("connect", () => {
      const address = socket.address() as AddressInfo;
      if (address.port) {
        entry.connection = String(address.port);
      }
      const blocked = timings.blocked < 0n ? 0n : timings.blocked;
      const dns = timings.dns < 0n ? 0n : timings.dns;
      timings.connect =
        process.hrtime.bigint() - (timings.start + blocked + dns);
      entry.timings.connect = Number(timings.connect) / 1_000_000;
    });

    socket.on("secureConnect", () => {
      const blocked = timings.blocked < 0n ? 0n : timings.blocked;
      const dns = timings.dns < 0n ? 0n : timings.dns;
      timings.ssl =
        process.hrtime.bigint() -
        (timings.start + blocked + dns + timings.connect);
      entry.timings.ssl = Number(timings.ssl) / 1_000_000;
    });
  });

  return req;
}

function convertHeadersWithSize(
  headers: IncomingHttpHeaders | OutgoingHttpHeaders
) {
  return Object.entries(headers).reduce(
    (prev, [name, value]) => {
      if (Array.isArray(value)) {
        prev.size +=
          name.length * value.length + value.join("").length + 4 * value.length;
        for (const val of value) {
          prev.converted.push({ name, value: String(val) });
        }
      }

      prev.size += name.length + 4 + String(value).length;
      prev.converted.push({ name, value: String(value) });

      return prev;
    },
    {
      converted: [],
      size: 2,
    }
  );
}
