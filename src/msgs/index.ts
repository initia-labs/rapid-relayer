import { Msg } from "@initia/initia.js";
import {
  SendPacketEventWithIndex,
  WriteAckEventWithIndex,
} from "src/chain/types";
import { generateMsgUpdateClient } from "./updateClient";
import { Chain } from "src/chain";
import { generateMsgRecvPacket } from "./recvPacet";
import { generateMsgAck } from "./ack";
import { generateMsgTimeout } from "./timeout";
import { metrics } from "src/lib/metric";

export * from "./ack";
export * from "./recvPacet";
export * from "./timeout";
export * from "./updateClient";

export async function generateThisChainMessages(
  thisChain: Chain,
  counterpartyChain: Chain,
  timeoutPackets: SendPacketEventWithIndex[]
): Promise<Msg[]> {
  const thisMsgs: Msg[] = [];
  if (timeoutPackets.length !== 0) {
    const { msg: msgUpdateClient, height } = await generateMsgUpdateClient(
      counterpartyChain,
      thisChain
    );
    thisMsgs.push(msgUpdateClient);
    thisChain.inc(metrics.chain.handlePacketWorker.updateClientMsg);

    const msgTimeouts = await Promise.all(
      timeoutPackets.map(async (packet) =>
        generateMsgTimeout(
          thisChain,
          counterpartyChain,
          packet.packetData,
          height
        )
      )
    );
    thisMsgs.push(...msgTimeouts);
    thisChain.inc(
      metrics.chain.handlePacketWorker.timeoutMsg,
      msgTimeouts.length
    );
  }

  return thisMsgs;
}

export async function generateCounterpartyChainMessages(
  thisChain: Chain,
  counterpartyChain: Chain,
  recvPackets: SendPacketEventWithIndex[],
  acks: WriteAckEventWithIndex[]
): Promise<Msg[]> {
  const counterpartyMsgs: Msg[] = [];
  if (recvPackets.length + acks.length !== 0) {
    const { msg: msgUpdateClient, height } = await generateMsgUpdateClient(
      thisChain,
      counterpartyChain
    );
    counterpartyMsgs.push(msgUpdateClient);
    counterpartyChain.inc(metrics.chain.handlePacketWorker.updateClientMsg);

    const msgRecvPackets = await Promise.all(
      recvPackets.map(async (packet) =>
        generateMsgRecvPacket(
          counterpartyChain,
          thisChain,
          packet.packetData,
          height
        )
      )
    );
    counterpartyMsgs.push(...msgRecvPackets);
    counterpartyChain.inc(
      metrics.chain.handlePacketWorker.recvMsg,
      msgRecvPackets.length
    );

    const msgAcks = await Promise.all(
      acks.map(async (ack) =>
        generateMsgAck(counterpartyChain, thisChain, ack.packetData, height)
      )
    );
    counterpartyMsgs.push(...msgAcks);
    counterpartyChain.inc(
      metrics.chain.handlePacketWorker.ackMsg,
      msgAcks.length
    );
  }
  return counterpartyMsgs;
}
