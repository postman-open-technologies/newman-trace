import { ClientRequest, IncomingMessage } from "http";
import { getEncoding } from "istextorbinary";

export function har(self, storage, request, options, callback) {
  const method = options.method || "GET";
  const url =
    options instanceof String
      ? new URL(String(options))
      : new URL(
          (options.protocol ||
            options.agent?.protocol ||
            options.defaultProtocol) +
            "//" +
            (options.hostname || options.host || "localhost") +
            ":" +
            (options.port || "80") +
            (options.path || options.pathname || "/")
        );
  const headers = options.headers || {};

  const start = Date.now();
  const entry = {
    startedDateTime: new Date(start).toISOString(),
    time: 0,
    serverIPAddress: "",
    connection: "",
    request: {
      method,
      url: url.toString(),
      httpVersion: "HTTP/1.1",
      cookies: [],
      headers: Object.entries(headers).map(([name, value]) => {
        return { name, value };
      }),
      queryString: [],
      postData: undefined,
      headersSize: -1,
      bodySize: -1,
    },
    response: {
      status: 0,
      statusText: "",
      httpVersion: "",
      cookies: [],
      headers: {},
      content: {
        size: 0,
        mimeType: "",
        text: undefined,
        encoding: undefined,
      },
      redirectURL: "",
      headersSize: -1,
      bodySize: -1,
    },
    cache: {},
    timings: {
      blocked: -1,
      dns: -1,
      connect: -1,
      send: 0,
      wait: 0,
      receive: 0,
      ssl: -1,
    },
  };

  for (const [name, value] of url.searchParams.entries()) {
    entry.request.queryString.push({ name, value });
  }

  storage.push(entry);
  const req: ClientRequest = request.call(self, options, callback);

  let requestHeadersSize = 4; // ending \r\n\r\n
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
    : request
        .getHeader("cookie")
        .split("; ")
        .map((cookie) => {
          const [name, value] = cookie.split("=");
          return { name, value };
        });

  req.on("response", (res: IncomingMessage) => {
    const requestHeaders = Object.fromEntries(
      Object.entries(headers).map(([key, val]) => {
        return [key.toLowerCase(), val];
      })
    );

    if (requestHeaders["content-length"]) {
      // has request body
      // might not work in all cases
    }

    entry.response.status = res.statusCode;
    entry.response.statusText = res.statusMessage;
    entry.response.httpVersion = `HTTP/${res.httpVersion}`;
    entry.response.headers = Object.entries(res.headers).map(
      ([name, value]) => {
        return { name, value };
      }
    );
    entry.response.redirectURL = res.headers["location"] || "";

    // all header bytes + 4 for each header [':', ' ', '\r', '\n']
    // + 4 characters at the end, '\r\n\r\n'
    entry.response.headersSize =
      res.rawHeaders.join("").length + 4 * (res.rawHeaders.length / 2) + 4;

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

    //let responseBody: Buffer;
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
      }
      if (enc === "utf8") {
        entry.response.content.text = responseBody.toString("utf8");
      } else if (enc === "binary") {
        entry.response.content.text = responseBody.toString("base64");
        entry.response.content.encoding = "base64";
      }
    });

    if (callback) {
      callback();
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
      entry.request.postData.mimeType = ct;
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

      const enc = getEncoding(requestBody);

      if (enc === "utf8") {
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

  //const chunks = [];
  //req.on("data", (chunk) => {});

  return req;
}
