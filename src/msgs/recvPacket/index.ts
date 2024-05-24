import { Packet } from "@initia/initia.js";
import { MsgRecvPacket } from "@initia/initia.js/dist/core/ibc/core/channel/msgs";
import { Height } from "cosmjs-types/ibc/core/client/v1/client";
import { ProofOps } from "cosmjs-types/tendermint/crypto/proof";
import { CommitmentProof } from "cosmjs-types/cosmos/ics23/v1/proofs";
import { MerkleProof } from "cosmjs-types/ibc/core/commitment/v1/commitment";
import { Chain } from "src/chain";
import { Transfrom } from "src/lib/transform";
import { getRawProof } from "src/lib/rawProof";

export async function generateMsgRecvPacket(
  srcChain: Chain,
  destChain: Chain,
  packet: Packet,
  height: Height
) {
  const proof = await getPacketProof(destChain, packet, height);
  const msg = new MsgRecvPacket(
    packet,
    proof,
    Transfrom.height(height),
    srcChain.wallet.address()
  );

  return msg;
}

async function getPacketProof(
  destChain: Chain,
  packet: Packet,
  headerHeight: Height
): Promise<string> {
  const key = new Uint8Array(
    Buffer.from(
      `commitments/ports/${packet.source_port}/channels/${packet.source_channel}/sequences/${packet.sequence}`
    )
  );
  const proof = await getRawProof(destChain, key, headerHeight);

  const ics23Proof = convertProofsToIcs23(proof);

  return Buffer.from(ics23Proof).toString("base64");
}

export function convertProofsToIcs23(ops: ProofOps): Uint8Array {
  const proofs = ops.ops.map((op) => CommitmentProof.decode(op.data));
  const resp = MerkleProof.fromPartial({
    proofs,
  });
  return MerkleProof.encode(resp).finish();
}
