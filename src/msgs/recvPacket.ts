import { Packet } from '@initia/initia.js'
import { MsgRecvPacket } from '@initia/initia.js'
import { Height } from 'cosmjs-types/ibc/core/client/v1/client'
import { Transform } from 'src/lib/transform'
import { convertProofsToIcs23, getRawProof } from 'src/lib/proof'
import { ChainWorker } from 'src/workers/chain'
import { PacketSendTable } from 'src/types'
import { packetTableToPacket } from 'src/db/utils'

export async function generateMsgRecvPacket(
  srcChain: ChainWorker,
  packetSend: PacketSendTable,
  height: Height,
  msgExecutor: string
): Promise<MsgRecvPacket> {
  const packet = packetTableToPacket(packetSend)
  const proof = await getPacketProof(srcChain, packet, height)

  const msg = new MsgRecvPacket(
    packet,
    proof,
    Transform.height(height),
    msgExecutor
  )

  return msg
}

async function getPacketProof(
  dstChain: ChainWorker,
  packet: Packet,
  headerHeight: Height
): Promise<string> {
  const key = new Uint8Array(
    Buffer.from(
      `commitments/ports/${packet.source_port}/channels/${packet.source_channel}/sequences/${packet.sequence}`
    )
  )
  const proof = await getRawProof(dstChain, key, headerHeight)
  const ics23Proof = convertProofsToIcs23(proof)

  return Buffer.from(ics23Proof).toString('base64')
}
