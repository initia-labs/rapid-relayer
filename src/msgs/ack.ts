import { Packet } from '@initia/initia.js'
import { MsgAcknowledgement } from '@initia/initia.js/dist/core/ibc/core/channel/msgs'
import { Height } from 'cosmjs-types/ibc/core/client/v1/client'
import { ProofOps } from 'cosmjs-types/tendermint/crypto/proof'
import { CommitmentProof } from 'cosmjs-types/cosmos/ics23/v1/proofs'
import { MerkleProof } from 'cosmjs-types/ibc/core/commitment/v1/commitment'

import { Transfrom } from 'src/lib/transform'
import { getRawProof } from 'src/lib/rawProof'
import { ChainWorker } from 'src/workers/chain'
import { PacketWriteAckTable } from 'src/types'
import { packetTableToPacket } from 'src/db/utils'

export async function generateMsgAck(
  dstChain: ChainWorker,
  ack: PacketWriteAckTable,
  height: Height,
  executorAddress: string
) {
  const packet = packetTableToPacket(ack)
  const proof = await getAckProof(dstChain, packet, height)
  const msg = new MsgAcknowledgement(
    packet,
    ack.ack,
    proof,
    Transfrom.height(height),
    executorAddress
  )

  return msg
}

async function getAckProof(
  dstChain: ChainWorker,
  packet: Packet,
  headerHeight: Height
): Promise<string> {
  const key = new Uint8Array(
    Buffer.from(
      `acks/ports/${packet.destination_port}/channels/${packet.destination_channel}/sequences/${packet.sequence}`
    )
  )

  const proof = await getRawProof(dstChain, key, headerHeight)

  const ics23Proof = convertProofsToIcs23(proof)

  return Buffer.from(ics23Proof).toString('base64')
}

export function convertProofsToIcs23(ops: ProofOps): Uint8Array {
  const proofs = ops.ops.map((op) => CommitmentProof.decode(op.data))
  const resp = MerkleProof.fromPartial({
    proofs,
  })
  return MerkleProof.encode(resp).finish()
}

export interface Ack {
  acknowledgement: string
  packet: Packet
}
