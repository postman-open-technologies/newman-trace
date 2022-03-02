import { Entry } from "har-format";
import {
  ClientRequest,
  IncomingHttpHeaders,
  IncomingMessage,
  OutgoingHttpHeaders,
} from "node:http";
import { getEncoding } from "istextorbinary";
import { createEntry } from "./har";
import { RequestFunc, TraceOptions } from "./types";

export function instrument(
  self: unknown,
  storage: Entry[],
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

  const start = Date.now();
  const entry: Entry = createEntry(method, url, start);

  const { converted, size } = convertHeadersWithSize(headers);
  entry.request.headers = converted;
  entry.request.headersSize = size;

  for (const [name, value] of url.searchParams.entries()) {
    entry.request.queryString.push({ name, value });
  }

  storage.push(entry);
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
      const dns = entry.timings.dns === -1 ? 0 : entry.timings.dns;
      const connect = entry.timings.connect === -1 ? 0 : entry.timings.connect;
      const ssl = entry.timings.ssl === -1 ? 0 : entry.timings.ssl;
      entry.timings.wait =
        Date.now() - (start + dns + connect + ssl + entry.timings.send);
      chunks.push(chunk);
    });

    res.on("end", () => {
      const dns = entry.timings.dns === -1 ? 0 : entry.timings.dns;
      const connect = entry.timings.connect === -1 ? 0 : entry.timings.connect;
      const ssl = entry.timings.ssl === -1 ? 0 : entry.timings.ssl;
      entry.timings.receive =
        Date.now() -
        (start + dns + connect + ssl + entry.timings.send + entry.timings.wait);
      entry.time =
        dns +
        connect +
        ssl +
        entry.timings.send +
        entry.timings.wait +
        entry.timings.receive;

      const responseBody = Buffer.concat(chunks);
      entry.response.bodySize = entry.response.content.size =
        responseBody.length;

      entry.response.content.mimeType = res.headers["content-type"];
      const enc = getEncoding(responseBody);

      if (!enc) {
        return;
      } else if (enc === "utf8") {
        entry.response.content.text = responseBody.toString("utf8");
      } else if (enc === "binary") {
        entry.response.content.text = responseBody.toString("base64");
        entry.response.content.encoding = "base64";
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
    const dns = entry.timings.dns === -1 ? 0 : entry.timings.dns;
    const connect = entry.timings.connect === -1 ? 0 : entry.timings.connect;
    const ssl = entry.timings.ssl === -1 ? 0 : entry.timings.ssl;
    entry.timings.send = Date.now() - (start + dns + connect + ssl);

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
    socket.on("lookup", () => {
      entry.timings.dns = Date.now() - start;
    });

    socket.on("connect", () => {
      entry.timings.connect =
        entry.timings.dns !== -1
          ? Date.now() - (start + entry.timings.dns)
          : Date.now() - start;
    });

    socket.on("secureConnect", () => {
      const dns = entry.timings.dns === -1 ? 0 : entry.timings.dns;
      entry.timings.ssl = Date.now() - (start + dns + entry.timings.connect);
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
