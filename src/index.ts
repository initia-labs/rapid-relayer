import { Chain, ChainStatus } from "./chain";
import * as express from "express";
import { runPair } from "./lib/chainPair";
import { config } from "./lib/config";

async function main() {
  const pairs: Record<string, { chainA: Chain; chainB: Chain }> = {};
  await Promise.all(
    config.pairs.map(async (config) => {
      const pair = await runPair(config);
      pairs[pair.name] = { chainA: pair.chainA, chainB: pair.chainB };
    })
  );

  const app = express();

  app.get("/status", (req, res) => {
    const result: Record<string, { chainA: ChainStatus; chainB: ChainStatus }> =
      {};
    Object.keys(pairs).map((name) => {
      result[name] = {
        chainA: pairs[name].chainA.chainStatus(),
        chainB: pairs[name].chainB.chainStatus(),
      };
    });

    res.json(result);
  });

  app.listen(config.port);
}

main();
