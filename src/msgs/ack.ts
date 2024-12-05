import { Packet } from '@initia/initia.js'
import { MsgAcknowledgement } from '@initia/initia.js/dist/core/ibc/core/channel/msgs'
import { Height } from 'cosmjs-types/ibc/core/client/v1/client'
import { ProofOps } from 'cosmjs-types/tendermint/crypto/proof'
import { CommitmentProof } from 'cosmjs-types/cosmos/ics23/v1/proofs'
import { MerkleProof } from 'cosmjs-types/ibc/core/commitment/v1/commitment'
import { Chain } from 'src/chain'
import { Transform } from 'src/lib/transform'
import { getRawProof } from 'src/lib/rawProof'

export async function generateMsgAck(
  srcChain: Chain,
  destChain: Chain,
  ack: Ack,
  height: Height
) {
  const proof = await getAckProof(destChain, ack, height)
  const msg = new MsgAcknowledgement(
    ack.packet,
    ack.acknowledgement,
    proof,
    Transform.height(height),
    srcChain.wallet.address()
  )

  return msg
}

async function getAckProof(
  destChain: Chain,
  ack: Ack,
  headerHeight: Height
): Promise<string> {
  const packet = ack.packet
  const key = new Uint8Array(
    Buffer.from(
      `acks/ports/${packet.destination_port}/channels/${packet.destination_channel}/sequences/${packet.sequence}`
    )
  )

  const proof = await getRawProof(destChain, key, headerHeight)

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
