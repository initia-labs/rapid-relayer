import { Packet, MsgAcknowledgement } from '@initia/initia.js'
import { Height } from 'cosmjs-types/ibc/core/client/v1/client'
import { Transfrom } from 'src/lib/transform'
import { convertProofsToIcs23, getRawProof } from 'src/lib/proof'
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

export interface Ack {
  acknowledgement: string
  packet: Packet
}
