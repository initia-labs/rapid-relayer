import { MnemonicKey, RawKey } from "@initia/initia.js";
import { Chain } from "./chain";
import * as fs from "fs";

const configs: { chainA: ChainRawConfig; chainB: ChainRawConfig }[] =
  JSON.parse(fs.readFileSync("./config.json").toString()); // TODO: get path of config

interface ChainRawConfig {
  bech32Prefix: string;
  chainId: string;
  gasPrice: string;
  lcdUri: string;
  rpcUri: string;
  key: {
    type: "raw" | "mnemonic";
    privateKey: string;
  };
  connectionId: string;
}

// TODO add metric and rest api to monitor

async function main(config: {
  chainA: ChainRawConfig;
  chainB: ChainRawConfig;
}) {
  const keyA =
    config.chainA.key.type === "mnemonic"
      ? new MnemonicKey({ mnemonic: config.chainA.key.privateKey })
      : new RawKey(Buffer.from(config.chainA.key.privateKey, "hex"));

  const keyB =
    config.chainB.key.type === "mnemonic"
      ? new MnemonicKey({ mnemonic: config.chainB.key.privateKey })
      : new RawKey(Buffer.from(config.chainB.key.privateKey, "hex"));

  const chainA = await Chain.init({
    ...config.chainA,
    key: keyA,
  });

  const chainB = await Chain.init({
    ...config.chainB,
    key: keyB,
  });

  chainA.registerCounterpartyChain(chainB);
  chainB.registerCounterpartyChain(chainA);
}

configs.map((config) => main(config));
