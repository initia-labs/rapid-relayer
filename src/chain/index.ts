import {
  LCDClient,
  Wallet,
  Key,
  Packet,
  Msg,
  APIRequester,
} from "@initia/initia.js";
import { delay } from "bluebird";
import { info, warn, error, debug } from "src/lib/logger";
import * as http from "http";
import * as https from "https";

import * as fs from "fs";
import { Ack, generateMsgAck } from "src/msgs/ack";
import { parseSendPacketEvent, parseWriteAckEvent } from "src/lib/eventParser";
import { WalletManager } from "./wallet";
import { generateMsgUpdateClient } from "src/msgs/updateClient";
import { generateMsgRecvPacket } from "src/msgs/recvPacket";
import { generateMsgTimeout } from "src/msgs/timeout";
import { RPCClient } from "src/lib/rpcClient";

export class Chain {
  private syncInfo: {
    height: number;
    txIndex: number;
  };
  public latestHeight: number;
  public fedheight: number;
  public latestTimestamp: number;
  private packetsToHandle: PacketEventWithIndex[];
  private counterpartyChain: Chain;
  public clientId: string;
  // worker name => latest heartbeat
  private workers: Record<string, number>;

  private constructor(
    public lcd: LCDClient,
    public rpc: RPCClient,
    public wallet: WalletManager,
    public connectionId: string
  ) {
    this.packetsToHandle = [];
    this.workers = {};
  }

  // initializer

  static async init(config: ChainConfig): Promise<Chain> {
    const lcd = new LCDClient(
      config.lcdUri,
      {
        chainId: config.chainId,
        gasPrices: config.gasPrice,
      },
      new APIRequester(config.lcdUri, {
        httpAgent: new http.Agent({ keepAlive: true }),
        httpsAgent: new https.Agent({ keepAlive: true }),
      })
    );
    const rpc = new RPCClient(config.rpcUri);
    const wallet = new Wallet(lcd, config.key);
    const walletManager = new WalletManager(wallet, config.bech32Prefix);

    const chain = new Chain(lcd, rpc, walletManager, config.connectionId);
    chain.clientId = (await lcd.ibc.connection(config.connectionId)).client_id;

    const syncInfo = fs.existsSync(chain.syncFilePath());
    const dir = fs.existsSync("./.syncInfo");
    if (!dir) {
      fs.mkdirSync("./.syncInfo");
    }
    if (!syncInfo) {
      chain.updatesyncInfo(config.syncInfo ?? { height: 1, txIndex: 0 });
    }
    chain.syncInfo = JSON.parse(
      fs.readFileSync(chain.syncFilePath()).toString()
    );
    chain.fedheight =
      chain.syncInfo.txIndex == -1
        ? chain.syncInfo.height
        : chain.syncInfo.height - 1;

    chain.validateConfig(config);

    return chain;
  }

  public registerCounterpartyChain(counterpartyChain: Chain) {
    if (this.counterpartyChain) {
      throw Error("already has counterpartyChain");
    }

    this.debug("register counterparty chain");
    this.counterpartyChain = counterpartyChain;
    this.latestHeightWorker();
    this.handlePackets();
    this.feedEvents();
  }

  // workers

  private async handlePackets() {
    // to prevent rerun
    if (
      (this.workers["packet_handler"] ?? 0) >
      new Date().valueOf() - 5 * 60 * 1000
    ) {
      return;
    }

    this.debug("Activate packet handler");

    while (true) {
      try {
        const packets = this.packetsToHandle.slice(0, 50); // TODO make this configurable
        if (packets.length === 0) {
          this.updatesyncInfo({ height: this.fedheight, txIndex: -1 });
          continue;
        }

        // wait until next height
        if (packets[packets.length - 1].height >= this.latestHeight) {
          continue;
        }

        const syncInfo = {
          height: packets[packets.length - 1].height,
          txIndex: packets[packets.length - 1].txIndex,
        };

        const sendPackets: SendPacketEventWithIndex[] = packets.filter(
          (packet) => packet.type === "send_packet"
        ) as SendPacketEventWithIndex[];
        const writeAcks: WriteAckEventWithIndex[] = packets.filter(
          (packet) => packet.type === "write_acknowledgement"
        ) as WriteAckEventWithIndex[];
        this.info(
          `Found events. Send packets - ${sendPackets.length}. Recv packets - ${writeAcks.length}`
        );

        const { timeoutPackets, recvPackets } = await this.splitSendPackets(
          sendPackets
        );

        const acks = await this.filterAckPackets(writeAcks);

        this.info(
          `Filtered events. Message to generate: timeout - ${timeoutPackets.length}. recvPacket - ${recvPackets.length}. ack - ${acks.length}`
        );

        // nothing to do
        if (timeoutPackets.length + recvPackets.length + acks.length === 0) {
          this.updatesyncInfo(syncInfo);
          this.packetsToHandle = this.packetsToHandle.slice(50);
          continue;
        }

        // generate msgs

        // counterparty msgs
        const counterpartyMsgs: Msg[] = [];
        if (recvPackets.length + acks.length !== 0) {
          const { msg: msgUpdateClient, height } =
            await generateMsgUpdateClient(this, this.counterpartyChain);
          counterpartyMsgs.push(msgUpdateClient);

          const msgRecvPackets = await Promise.all(
            recvPackets.map(async (packet) =>
              generateMsgRecvPacket(
                this.counterpartyChain,
                this,
                packet.packetData,
                height
              )
            )
          );
          counterpartyMsgs.push(...msgRecvPackets);

          const msgAcks = await Promise.all(
            acks.map(async (ack) =>
              generateMsgAck(
                this.counterpartyChain,
                this,
                ack.packetData,
                height
              )
            )
          );
          counterpartyMsgs.push(...msgAcks);
        }

        // chain msgs
        const thisMsgs: Msg[] = [];
        if (timeoutPackets.length !== 0) {
          const { msg: msgUpdateClient, height } =
            await generateMsgUpdateClient(this.counterpartyChain, this);
          thisMsgs.push(msgUpdateClient);

          const msgTimeouts = await Promise.all(
            timeoutPackets.map(async (packet) =>
              generateMsgTimeout(
                this,
                this.counterpartyChain,
                packet.packetData,
                height
              )
            )
          );
          thisMsgs.push(...msgTimeouts);
        }

        this.info(
          `Request handle packet to wallet manager. This chain - ${thisMsgs.length}. Counterparty chain - ${counterpartyMsgs.length}`
        );

        const [thisResult, counterpartyResult] = await Promise.all([
          this.wallet.request(thisMsgs),
          this.counterpartyChain.wallet.request(counterpartyMsgs),
        ]);

        this.info(
          `Packet Handled. This chain - ${thisResult.txhash} (code - ${thisResult.code}). Counterparty chain - ${counterpartyResult.txhash} (code - ${counterpartyResult.code})`
        );

        // All must succeed to update syncinfo or retry
        if (thisResult.code === 0 && counterpartyResult.code === 0) {
          this.updatesyncInfo(syncInfo);
          this.packetsToHandle = this.packetsToHandle.slice(50);
        }
      } catch (e) {
        this.error(`Fail to handle packet. resonse - ${e}`);
      } finally {
        this.workers["packet_handler"] = new Date().valueOf();
        await delay(1000);
      }
    }
  }

  private async feedEvents() {
    // to prevent rerun
    if (
      (this.workers["event_feeder"] ?? 0) >
      new Date().valueOf() - 5 * 60 * 1000
    ) {
      return;
    }

    this.debug("Activate event feeder");

    while (true) {
      try {
        if (this.packetsToHandle.length > 1000) continue;

        // height to fetch
        const heights = Array.from(
          { length: 20 },
          (_, i) => i + this.fedheight + 1
        ).filter((height) => height <= this.latestHeight);

        if (heights.length === 0) continue;

        const blockResults = await Promise.all(
          heights.map((height) => this.fetchBlockResult(height))
        );

        this.debug(`Fetched block results for heights (${heights})`);
        const results: PacketEventWithIndex[] = [];

        for (const events of blockResults) {
          results.push(...events);
        }

        this.debug(`push packets to packet to handle (${results.length})`);
        this.packetsToHandle.push(...results);
        this.fedheight = heights[heights.length - 1];
      } catch (e) {
        this.error(
          `Fail to fecth block result. resonse - ${JSON.stringify(e)}`
        );
      } finally {
        this.workers["event_feeder"] = new Date().valueOf();
        await delay(100);
      }
    }
  }

  private async latestHeightWorker() {
    // to prevent rerun
    if (
      (this.workers["latest_height_worekr"] ?? 0) >
      new Date().valueOf() - 5 * 60 * 1000
    ) {
      return;
    }

    this.debug("Activate latest height worekr");

    // TODO add websocket options
    const MAX_RETRY = 10;
    let retried = 0;
    while (true) {
      try {
        const blockInfo = await this.lcd.tendermint.blockInfo();
        const height = blockInfo.block.header.height;
        const timestamp = blockInfo.block.header.time;
        this.latestHeight = Number(height);
        this.latestTimestamp = new Date(timestamp).valueOf();
        this.debug(
          `Set latest height. Height - ${height}, Timestamp - ${timestamp}`
        );
        retried = 0;
      } catch (e) {
        this.error(
          `[latestHeightWorker] Got error while fetching latest height (${JSON.stringify(
            e
          )})`
        );
        retried++;
        if (retried >= MAX_RETRY) {
          throw Error(
            `<${this.chainId()}> [latestHeightWorker] Max retry exceeded`
          );
        }
      } finally {
        this.workers["latest_height_worekr"] = new Date().valueOf();
        await delay(1000);
      }
    }
  }

  // filters

  // split and filter
  private async splitSendPackets(packets: SendPacketEventWithIndex[]): Promise<{
    timeoutPackets: SendPacketEventWithIndex[];
    recvPackets: SendPacketEventWithIndex[];
  }> {
    const cutoffHeight = this.counterpartyChain.latestHeight;
    const cutoffTime = this.counterpartyChain.latestTimestamp;

    let timeoutPackets = [];
    let recvPackets = [];

    for (const packet of packets) {
      const heightTimeout =
        packet.packetData.timeout_height.revision_height != 0 &&
        packet.packetData.timeout_height.revision_number != 0 &&
        cutoffHeight >= packet.packetData.timeout_height.revision_height;

      const timestampTimeout =
        Number(packet.packetData.timeout_timestamp) != 0 &&
        cutoffTime * 1000000 >= Number(packet.packetData.timeout_timestamp);

      if (!heightTimeout && !timestampTimeout) {
        recvPackets.push(packet);
      } else {
        timeoutPackets.push(packet);
      }
    }

    // filter timeout that already done.
    {
      // TODO: query once for same path
      let unrecivedSequences: number[] = [];

      // filter by unreceivedAcks
      await Promise.all(
        timeoutPackets.map(async (packet) => {
          const unrecivedPackets = await this.lcd.ibc.unreceivedAcks(
            packet.packetData.source_port,
            packet.packetData.source_channel,
            [packet.packetData.sequence]
          );

          if (unrecivedPackets.sequences.length !== 0) {
            unrecivedSequences.push(Number(unrecivedPackets.sequences[0]));
          }
        })
      );

      timeoutPackets = timeoutPackets.filter((packet) =>
        unrecivedSequences.includes(packet.packetData.sequence)
      );

      // filter by unreceivedPacket
      unrecivedSequences = [];
      await Promise.all(
        timeoutPackets.map(async (packet) => {
          const unrecivedPackets =
            await this.counterpartyChain.lcd.ibc.unreceivedPackets(
              packet.packetData.destination_port,
              packet.packetData.destination_channel,
              [packet.packetData.sequence]
            );

          if (unrecivedPackets.sequences.length !== 0) {
            unrecivedSequences.push(Number(unrecivedPackets.sequences[0]));
          }
        })
      );

      timeoutPackets = timeoutPackets.filter((packet) =>
        unrecivedSequences.includes(packet.packetData.sequence)
      );
    }

    {
      // TODO: query once for same path
      const unrecivedSequences: number[] = [];
      await Promise.all(
        recvPackets.map(async (packet) => {
          const unrecivedPackets =
            await this.counterpartyChain.lcd.ibc.unreceivedPackets(
              packet.packetData.destination_port,
              packet.packetData.destination_channel,
              [packet.packetData.sequence]
            );

          if (unrecivedPackets.sequences[0]) {
            unrecivedSequences.push(Number(unrecivedPackets.sequences[0]));
          }
        })
      );

      recvPackets = recvPackets.filter((packet) =>
        unrecivedSequences.includes(packet.packetData.sequence)
      );
    }

    return {
      timeoutPackets,
      recvPackets,
    };
  }

  private async filterAckPackets(
    packets: WriteAckEventWithIndex[]
  ): Promise<WriteAckEventWithIndex[]> {
    const unrecivedSequences: number[] = [];
    await Promise.all(
      packets.map(async (packet) => {
        const unrecivedPackets =
          await this.counterpartyChain.lcd.ibc.unreceivedAcks(
            packet.packetData.packet.source_port,
            packet.packetData.packet.source_channel,
            [packet.packetData.packet.sequence]
          );

        if (unrecivedPackets.sequences[0]) {
          unrecivedSequences.push(Number(unrecivedPackets.sequences[0]));
        }
      })
    );
    return packets.filter((packet) =>
      unrecivedSequences.includes(packet.packetData.packet.sequence)
    );
  }

  private validateConfig(config: ChainConfig) {}

  private updatesyncInfo(syncInfo: SyncInfo) {
    fs.writeFileSync(this.syncFilePath(), JSON.stringify(syncInfo));
    this.syncInfo = syncInfo;
  }

  private async fetchBlockResult(
    height: number
  ): Promise<PacketEventWithIndex[]> {
    this.debug(`Fecth new block results (height - ${height})`);
    const blockResult = await this.rpc.blockResults(height);
    const txData = [...blockResult.results];

    const packetEvents: PacketEventWithIndex[] = [];

    txData.map((data, i) => {
      for (const event of data.events) {
        const sendPacket = parseSendPacketEvent(event, this.connectionId);
        if (sendPacket) {
          packetEvents.push({
            height,
            txIndex: i,
            type: "send_packet",
            packetData: sendPacket,
          });
        }

        const writeAck = parseWriteAckEvent(event, this.connectionId);
        if (writeAck) {
          packetEvents.push({
            height,
            txIndex: i,
            type: "write_acknowledgement",
            packetData: writeAck,
          });
        }
      }
    });

    return packetEvents;
  }

  private syncFilePath(): string {
    return `./.syncInfo/${this.lcd.config.chainId}_${this.connectionId}.json`;
  }

  private chainId(): string {
    return this.lcd.config.chainId;
  }

  // logs

  private info(log: string) {
    info(`<${this.chainId()}/${this.connectionId}> ${log}`);
  }

  private error(log: string) {
    error(`<${this.chainId()}/${this.connectionId}> ${log}`);
  }

  private debug(log: string) {
    debug(`<${this.chainId()}/${this.connectionId}> ${log}`);
  }
}

export interface ChainConfig {
  bech32Prefix: string;
  chainId: string;
  gasPrice: string;
  lcdUri: string;
  rpcUri: string;
  key: Key;
  connectionId: string;
  syncInfo?: {
    height: number;
    txIndex: number;
  };
}

export interface SyncInfo {
  height: number;
  txIndex: number;
}

export type PacketEventWithIndex =
  | SendPacketEventWithIndex
  | WriteAckEventWithIndex;

interface SendPacketEventWithIndex {
  height: number;
  txIndex: number;
  type: "send_packet";
  packetData: Packet;
}

interface WriteAckEventWithIndex {
  height: number;
  txIndex: number;
  type: "write_acknowledgement";
  packetData: Ack;
}
