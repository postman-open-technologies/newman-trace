//import path from "path";
//import { fork } from "child_process";
import { Proxy } from "./proxy";

const originalProxyURL = process.env.HTTP_PROXY || process.env.http_proxy;
const proxy = new Proxy({
  host: "127.0.0.1",
  port: 3000,
  systemProxyURL: originalProxyURL ? new URL(originalProxyURL) : null,
});

async function main() {
  console.log("listening:", proxy.listening);
  const address = await proxy.listen();
  console.log(JSON.stringify(address));
  console.log("listening:", proxy.listening);
  /*
  const newmanPath = path.join(
    require.resolve("newman"),
    "..",
    "bin",
    "newman"
  );

  const args = process.argv.length > 2 ? process.argv.slice(2) : [];
  fork(newmanPath, args, {
    env: {
      ...process.env,
      NODE_DEBUG: "https,http",
    },
    //silent: true,
    stdio: "inherit",
  });
  */

  //child.stderr.on("data", (chunk) => {
  //const log = chunk.toString("utf8");
  //if (log.startsWith("HTTP")) {
  //console.log(chunk.toString("utf8"));
  //}
  //});

  /*https.get("https://quotable.apilab.io", (res) => {
  console.log(res.statusCode);
});*/
}

(async function () {
  await main();
})();
