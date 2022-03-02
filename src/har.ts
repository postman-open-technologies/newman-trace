import { Entry, Har } from "har-format";

export function createArchive(name: string, version: string): Har {
  return {
    log: {
      version: "1.2",
      creator: {
        name,
        version,
      },
      pages: [],
      entries: [],
    },
  };
}

export function createEntry(method: string, url: URL, start: number): Entry {
  return {
    startedDateTime: new Date(start).toISOString(),
    time: 0,
    serverIPAddress: "",
    connection: "",
    request: {
      method,
      url: url.toString(),
      httpVersion: "HTTP/1.1",
      cookies: [],
      headers: [],
      queryString: [],
      postData: undefined,
      headersSize: -1,
      bodySize: -1,
    },
    response: {
      status: 0,
      statusText: "",
      httpVersion: "HTTP/1.1",
      cookies: [],
      headers: [],
      content: {
        size: 0,
        mimeType: "",
      },
      redirectURL: "",
      headersSize: -1,
      bodySize: -1,
    },
    cache: {
      beforeRequest: null,
      afterRequest: null,
    },
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
}
