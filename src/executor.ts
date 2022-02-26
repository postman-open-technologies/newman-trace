import newman from "newman";
import { Proxy, ProxyOptions } from "./proxy";

export async function execute(
  newmanOptions,
  proxyOptions: ProxyOptions
): Promise<boolean> {
  const proxy = new Proxy(proxyOptions);
  return new Promise((resolve, reject) => {
    newman.run(newmanOptions, function (err, summary) {
      if (err) {
        return reject(err);
        //console.error(`error: ${err.message || err}\n`);
        //err.friendly && console.error(`  ${err.friendly}\n`);
      }
      const runError = summary.run.error || summary.run.failures.length;
      resolve(runError);
    });
  });
}
