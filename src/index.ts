import { Chain } from "./chain";
import * as express from "express";
import { runPair } from "./lib/chainPair";
import { config } from "./lib/config";
import { ChainStatus } from "./chain/types";
import { registery } from "./lib/metric";
import { info } from "./lib/logger";

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

  const metricApp = express();

  metricApp.get("/metrics", async (req, res) => {
    res.setHeader("content-type", registery.contentType);
    res.send(await registery.metrics());
  });

  app.listen(config.port);
  info(`status app listen to port ${config.port}`);
  metricApp.listen(config.metricPort);
  info(`metric app listen to port ${config.metricPort}`);
}

main();
