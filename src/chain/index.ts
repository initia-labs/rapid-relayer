import { LCDClient, Wallet, Msg, APIRequester } from "@initia/initia.js";
import { delay } from "bluebird";
import { info, warn, error, debug } from "src/lib/logger";
import * as http from "http";
import * as https from "https";

import * as fs from "fs";
import { parseSendPacketEvent, parseWriteAckEvent } from "src/lib/eventParser";
import { WalletManager } from "./wallet";
import {
  generateMsgUpdateClient,
  generateCounterpartyChainMessages,
  generateThisChainMessages,
} from "src/msgs";
import { RPCClient } from "src/lib/rpcClient";
import {
  ChainConfig,
  ChainStatus,
  PacketEventWithIndex,
  SendPacketEventWithIndex,
  SyncInfo,
  WriteAckEventWithIndex,
} from "./types";
import { metrics } from "src/lib/metric";
import { Counter } from "prom-client";

export class Chain {
  private syncInfo: {
    height: number;
    txIndex: number;
  };
  public latestHeight: number;
  private fedHeight: number;
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
        timeout: 60000,
      })
    );
    const rpc = new RPCClient(config.rpcUri);
    const wallet = new Wallet(lcd, config.key);
    const walletManager = new WalletManager(wallet, config.bech32Prefix);

    const chain = new Chain(lcd, rpc, walletManager, config.connectionId);
    chain.clientId = (await lcd.ibc.connection(config.connectionId)).client_id;

    await chain.updateLatestHeight();
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
    chain.fedHeight =
      chain.syncInfo.txIndex == -1
        ? chain.syncInfo.height
        : chain.syncInfo.height - 1;

    return chain;
  }

  public async registerCounterpartyChain(counterpartyChain: Chain) {
    if (this.counterpartyChain) {
      throw Error("already has counterpartyChain");
    }

    this.debug("register counterparty chain");
    this.counterpartyChain = counterpartyChain;
    await this.validateConfig();
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
          this.updatesyncInfo({ height: this.fedHeight, txIndex: -1 });
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

        // filter packets

        // get send packet events
        const sendPackets: SendPacketEventWithIndex[] = packets.filter(
          (packet) => packet.type === "send_packet"
        ) as SendPacketEventWithIndex[];

        // get write acknowledgement events
        const writeAcks: WriteAckEventWithIndex[] = packets.filter(
          (packet) => packet.type === "write_acknowledgement"
        ) as WriteAckEventWithIndex[];

        this.info(
          `Found events. Send packets - ${sendPackets.length}. Recv packets - ${writeAcks.length}`
        );

        // filter and split send packets
        const { timeoutPackets, recvPackets } = await this.splitSendPackets(
          sendPackets
        );

        // filter write ack
        const acks = await this.filterAckPackets(writeAcks);

        this.info(
          `Filtered events. Message to generate: timeout - ${timeoutPackets.length}. recvPacket - ${recvPackets.length}. ack - ${acks.length}`
        );

        // if nothing to do
        if (timeoutPackets.length + recvPackets.length + acks.length === 0) {
          this.updatesyncInfo(syncInfo);
          this.packetsToHandle = this.packetsToHandle.slice(packets.length);
          continue;
        }

        // generate msgs

        // counterparty msgs
        const counterpartyMsgs: Msg[] = await generateCounterpartyChainMessages(
          this,
          this.counterpartyChain,
          recvPackets,
          acks
        );

        this.info(
          `Request handle packet to wallet manager. This chain - ${
            timeoutPackets.length == 0 ? 0 : timeoutPackets.length + 1
          }. Counterparty chain - ${counterpartyMsgs.length}`
        );

        const [thisResult, counterpartyResult] = await Promise.all([
          this.delayedTimeout(timeoutPackets),
          this.counterpartyChain.wallet.request(counterpartyMsgs),
        ]);

        this.info(
          `Packet Handled. This chain - ${thisResult.txhash} (code - ${thisResult.code}, rawLog - ${thisResult.rawLog}). Counterparty chain - ${counterpartyResult.txhash} (code - ${counterpartyResult.code} rawLog - ${counterpartyResult.rawLog})`
        );

        // All must succeed to update syncinfo or retry
        if (thisResult.code === 0 && counterpartyResult.code === 0) {
          this.updatesyncInfo(syncInfo);
          this.packetsToHandle = this.packetsToHandle.slice(packets.length);
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
          (_, i) => i + this.fedHeight + 1
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
        this.fedHeight = heights[heights.length - 1];
      } catch (e) {
        this.error(`Fail to fecth block result. resonse - ${e}`);
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
        await this.updateLatestHeight();
        this.debug(
          `Set latest height. Height - ${this.latestHeight}, Timestamp - ${this.latestTimestamp}`
        );
        const needUpdateClient = await this.checkTrustPeriod();
        if (needUpdateClient) {
          const { msg: msgUpdateClient } = await generateMsgUpdateClient(
            this.counterpartyChain,
            this
          );
          const updateClientResult = await this.wallet.request([
            msgUpdateClient,
          ]);
          this.info(
            `Client Updated. txhash - ${updateClientResult.txhash} (code - ${updateClientResult.code}).`
          );
        }
        retried = 0;
      } catch (e) {
        this.error(
          `[latestHeightWorker] Got error while fetching latest height (${e})`
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
    const cutoffTime = this.counterpartyChain.latestTimestamp + 10000;

    // source path => packet
    let timeoutPackets: Record<string, SendPacketEventWithIndex[]> = {};
    let recvPackets: Record<string, SendPacketEventWithIndex[]> = {};

    for (const packet of packets) {
      const path = `${packet.packetData.source_port}/${packet.packetData.source_channel}`;
      const heightTimeout =
        packet.packetData.timeout_height.revision_height != 0 &&
        packet.packetData.timeout_height.revision_number != 0 &&
        cutoffHeight >= packet.packetData.timeout_height.revision_height;

      const timestampTimeout =
        Number(packet.packetData.timeout_timestamp) != 0 &&
        cutoffTime * 1000000 >= Number(packet.packetData.timeout_timestamp);

      if (!heightTimeout && !timestampTimeout) {
        if (recvPackets[path] === undefined) {
          recvPackets[path] = [];
        }
        recvPackets[path].push(packet);
      } else {
        if (timeoutPackets[path] === undefined) {
          timeoutPackets[path] = [];
        }
        timeoutPackets[path].push(packet);
      }
    }

    // filter timeout that already done.

    // filter by unreceivedAcks
    await Promise.all(
      Object.keys(timeoutPackets).map(async (path) => {
        if (timeoutPackets[path].length === 0) return;
        const unrecivedPackets = await this.lcd.ibc.unreceivedAcks(
          timeoutPackets[path][0].packetData.source_port,
          timeoutPackets[path][0].packetData.source_channel,
          timeoutPackets[path].map((packet) => packet.packetData.sequence)
        );

        const unrecivedSequences = unrecivedPackets.sequences.map((sequence) =>
          Number(sequence)
        );

        timeoutPackets[path] = timeoutPackets[path].filter((packet) =>
          unrecivedSequences.includes(packet.packetData.sequence)
        );
      })
    );

    // filter by unreceivedPacket
    await Promise.all(
      Object.keys(timeoutPackets).map(async (path) => {
        if (timeoutPackets[path].length === 0) return;
        const unrecivedPackets =
          await this.counterpartyChain.lcd.ibc.unreceivedPackets(
            timeoutPackets[path][0].packetData.destination_port,
            timeoutPackets[path][0].packetData.destination_channel,
            timeoutPackets[path].map((packet) => packet.packetData.sequence)
          );

        const unrecivedSequences = unrecivedPackets.sequences.map((sequence) =>
          Number(sequence)
        );

        timeoutPackets[path] = timeoutPackets[path].filter((packet) =>
          unrecivedSequences.includes(packet.packetData.sequence)
        );
      })
    );

    // filter recv packets that already done.

    await Promise.all(
      Object.keys(recvPackets).map(async (path) => {
        if (recvPackets[path].length === 0) return;
        const unrecivedPackets =
          await this.counterpartyChain.lcd.ibc.unreceivedPackets(
            recvPackets[path][0].packetData.destination_port,
            recvPackets[path][0].packetData.destination_channel,
            recvPackets[path].map((packet) => packet.packetData.sequence)
          );

        const unrecivedSequences = unrecivedPackets.sequences.map((sequence) =>
          Number(sequence)
        );

        recvPackets[path] = recvPackets[path].filter((packet) =>
          unrecivedSequences.includes(packet.packetData.sequence)
        );
      })
    );

    return {
      timeoutPackets: Object.values(timeoutPackets).flat(),
      recvPackets: Object.values(recvPackets).flat(),
    };
  }

  private async delayedTimeout(timeoutPackets: SendPacketEventWithIndex[]) {
    if (timeoutPackets.length === 0) {
      return this.wallet.request([]);
    }

    await delay(15000);
    // chain msgs
    const thisMsgs: Msg[] = await generateThisChainMessages(
      this,
      this.counterpartyChain,
      timeoutPackets
    );

    return this.wallet.request(thisMsgs);
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

  private async validateConfig() {
    // check connection mapping
    const counterpartyConnectionId = (
      await this.lcd.ibc.connection(this.connectionId)
    ).counterparty.connection_id;

    if (counterpartyConnectionId !== this.counterpartyChain.connectionId) {
      throw Error(
        `"${this.chainId()} - ${
          this.connectionId
        }" is not connected with "${this.counterpartyChain.chainId()} - ${
          this.counterpartyChain.connectionId
        }"`
      );
    }
  }

  // return true if it need update client
  private async checkTrustPeriod(): Promise<boolean> {
    const state = (await this.lcd.apiRequester.get(
      `/ibc/core/client/v1/client_states/${this.clientId}`
    )) as any;
    const trustingPeriod =
      Number(state.client_state.trusting_period.replace("s", "")) * 1000;
    const revisionHeight = Number(
      state.client_state.latest_height.revision_height
    );

    const header = await this.counterpartyChain.rpc.header(revisionHeight);
    const revisionTimestamp = new Date(header.header.time).valueOf();
    const timeDiff = new Date().valueOf() - revisionTimestamp;
    return timeDiff >= trustingPeriod * 0.66;
  }

  private updatesyncInfo(syncInfo: SyncInfo) {
    fs.writeFileSync(this.syncFilePath(), JSON.stringify(syncInfo));
    this.syncInfo = syncInfo;
  }

  private async updateLatestHeight() {
    const abciInfo = await this.rpc.abciInfo();
    if (!abciInfo.lastBlockHeight) {
      throw Error("Can not get last block height");
    }
    const height = abciInfo.lastBlockHeight;
    this.latestHeight = Number(height);
    this.latestTimestamp = new Date().valueOf(); // is it okay to use local timestamp?

    this.inc(metrics.chain.latestHeightWorker);
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

          this.inc(metrics.chain.eventFeederWorker.sendPacket);
        }

        const writeAck = parseWriteAckEvent(event, this.connectionId);
        if (writeAck) {
          packetEvents.push({
            height,
            txIndex: i,
            type: "write_acknowledgement",
            packetData: writeAck,
          });

          this.inc(metrics.chain.eventFeederWorker.writeAck);
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

  public chainStatus(): ChainStatus {
    return {
      chainId: this.chainId(),
      connectionId: this.connectionId,
      latestHeightInfo: {
        height: this.latestHeight,
        timestamp: new Date(this.latestTimestamp),
      },
      lastFeedHeight: this.fedHeight,
      syncInfo: { ...this.syncInfo },
    };
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

  // metrics

  public inc(counter: Counter, inc?: number) {
    counter
      .labels({
        chainId: this.chainId(),
        connectionId: this.connectionId,
      })
      .inc(inc);
  }
}
