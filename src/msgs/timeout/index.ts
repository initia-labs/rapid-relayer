import { MsgTimeout } from "@initia/initia.js/dist/core/ibc/core/channel/msgs";
import { Height } from "cosmjs-types/ibc/core/client/v1/client";
import { ProofOps } from "cosmjs-types/tendermint/crypto/proof";
import { Uint64 } from "@cosmjs/math";
import { Chain } from "src/chain";
import { convertProofsToIcs23 } from "../recvPacket";
import { Transfrom } from "src/lib/transform";
import { Packet } from "@initia/initia.js";
import { tendermint34 } from "@cosmjs/tendermint-rpc";
import { ics23 } from "@confio/ics23";
import { getRawProof } from "src/lib/rawProof";

export async function generateMsgTimeout(
  srcChain: Chain,
  destChain: Chain,
  packet: Packet,
  proofHeight: Height
): Promise<MsgTimeout> {
  const sequence = await getNextSequenceRecv(packet, destChain, proofHeight);
  const proof = await getTimeoutProof(destChain, packet, proofHeight);

  return new MsgTimeout(
    packet,
    proof,
    Transfrom.height(proofHeight),
    sequence,
    srcChain.wallet.address()
  );
}

async function getNextSequenceRecv(
  packet: Packet,
  destChain: Chain,
  headerHeight: Height
) {
  const key = new Uint8Array(
    Buffer.from(
      `nextSequenceRecv/ports/${packet.destination_port}/channels/${packet.destination_channel}`
    )
  );

  const { value, proof: proofOps } = await destChain.rpc.abciQuery({
    path: `/store/ibc/key`,
    data: key,
    prove: true,
    height: Number(headerHeight.revisionHeight),
  });

  const nextSequenceReceive = Uint64.fromBytes([...value], "be").toBigInt();
  //   const proof = convertProofsToIcs23(proofOps as ProofOps);
  //   return {
  //     nextSequenceReceive,
  //     proof,
  //     headerHeight,
  //   };
  return Number(nextSequenceReceive);
}

async function getTimeoutProof(
  destChain: Chain,
  packet: Packet,
  headerHeight: Height
): Promise<string> {
  const queryKey = new Uint8Array(
    Buffer.from(
      `receipts/ports/${packet.destination_port}/channels/${packet.destination_channel}/sequences/${packet.sequence}`
    )
  );
  const proof = await getRawProof(destChain, queryKey, headerHeight);

  const ics23Proof = convertProofsToIcs23(proof);
  return Buffer.from(ics23Proof).toString("base64");
}
