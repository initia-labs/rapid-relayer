import { Packet } from '@initia/initia.js'
import { MsgRecvPacket } from '@initia/initia.js/dist/core/ibc/core/channel/msgs'
import { Height } from 'cosmjs-types/ibc/core/client/v1/client'
import { Chain } from 'src/chain'
import { Transfrom } from 'src/lib/transform'
import { getRawProof } from 'src/lib/rawProof'
import { convertProofsToIcs23 } from './ack'

export async function generateMsgRecvPacket(
  srcChain: Chain,
  destChain: Chain,
  packet: Packet,
  height: Height
) {
  const proof = await getPacketProof(destChain, packet, height)
  const msg = new MsgRecvPacket(
    packet,
    proof,
    Transfrom.height(height),
    srcChain.wallet.address()
  )

  return msg
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
  )
  const proof = await getRawProof(destChain, key, headerHeight)

  const ics23Proof = convertProofsToIcs23(proof)

  return Buffer.from(ics23Proof).toString('base64')
}
