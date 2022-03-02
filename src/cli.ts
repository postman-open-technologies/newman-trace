import path from "path";
import { patch } from "./http-client-patch";

const newmanPath =
  process.env.NEWMANX_NEWMAN_PATH ||
  path.join(require.resolve("newman"), "..", "bin", "newman");

const entries = [];
patch(entries);

process.on("exit", () => {
  const report = {
    log: {
      version: "1.2",
      creator: {
        name: "newman-trace",
        version: "1.0.0",
      },
      pages: [],
      entries,
    },
  };

  console.log(JSON.stringify(report, null, 2));
});

(async function main() {
  const newman = (await import(newmanPath)).default;
  newman(process.argv, (err) => {
    if (err) {
      console.error(err);
    }
  });
})();
