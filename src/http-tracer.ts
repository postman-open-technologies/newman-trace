export function har(self, storage, request, options, callback) {
  const method = options.method || "GET";
  const url =
    options instanceof String
      ? options
      : new URL(
          (options.protocol ||
            options.agent?.protocol ||
            options.defaultProtocol) +
            "//" +
            (options.hostname || options.host || "localhost") +
            ":" +
            (options.port || "80") +
            (options.path || options.pathname || "/")
        ).toString();
  const headers = options.headers || {};

  const start = Date.now();
  const entry = {
    startedDateTime: new Date(start).toISOString(),
    time: 0,
    timings: {
      blocked: -1,
      dns: -1,
      connect: -1,
      send: 0,
      wait: 0,
      receive: 0,
      ssl: -1,
    },
    serverIPAddress: "",
    connection: "",
    request: {
      method,
      url,
      headers: headers,
    },
    response: {
      headers: {},
      body: {},
    },
  };
  storage.push(entry);
  const req = request.call(self, options, callback);

  req.on("response", (res) => {
    const requestHeaders = Object.fromEntries(
      Object.entries(headers).map(([key, val]) => {
        return [key.toLowerCase(), val];
      })
    );

    if (requestHeaders["content-length"]) {
      // has request body
      // might not work in all cases
    }

    entry.response.headers = res.headers;
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
      //responseBody = Buffer.concat(chunks);
    });

    if (callback) {
      callback();
    }
  });

  req.on("finish", () => {
    const dns = entry.timings.dns === -1 ? 0 : entry.timings.dns;
    const connect = entry.timings.connect === -1 ? 0 : entry.timings.connect;
    const ssl = entry.timings.ssl === -1 ? 0 : entry.timings.ssl;
    entry.timings.send = Date.now() - (start + dns + connect + ssl);
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
