import { MnemonicKey, RawKey } from "@initia/initia.js";
import { Chain, SyncInfo } from "src/chain";

export async function runPair(
  config: ConfigPair
): Promise<{ name: string; chainA: Chain; chainB: Chain }> {
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

  await chainA.registerCounterpartyChain(chainB);
  await chainB.registerCounterpartyChain(chainA);

  return {
    name: config.name ?? `${config.chainA.chainId} - ${config.chainB.chainId}`,
    chainA,
    chainB,
  };
}

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
  syncInfo?: SyncInfo; // if syncInfo file exists, ignore start height
}

export interface ConfigPair {
  name?: string;
  chainA: ChainRawConfig;
  chainB: ChainRawConfig;
}
