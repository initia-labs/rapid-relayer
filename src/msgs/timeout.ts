import { MsgTimeout } from '@initia/initia.js/dist/core/ibc/core/channel/msgs'
import { Height } from 'cosmjs-types/ibc/core/client/v1/client'
import { Uint64 } from '@cosmjs/math'
import { Transfrom } from 'src/lib/transform'
import { Packet } from '@initia/initia.js'
import { getRawProof } from 'src/lib/rawProof'
import { convertProofsToIcs23 } from './ack'
import { delay } from 'bluebird'
import { ChainWorker } from 'src/workers/chain'
import { PacketTimeoutTable } from 'src/types'
import { packetTableToPacket } from 'src/db/utils'

export async function generateMsgTimeout(
  dstChain: ChainWorker,
  packetTable: PacketTimeoutTable,
  proofHeight: Height,
  executorAddress: string
): Promise<MsgTimeout> {
  const packet = packetTableToPacket(packetTable)
  const sequence = await getNextSequenceRecv(packet, dstChain, proofHeight)
  const proof = await getTimeoutProof(dstChain, packet, proofHeight)

  return new MsgTimeout(
    packet,
    proof,
    Transfrom.height(proofHeight),
    sequence,
    executorAddress
  )
}

async function getNextSequenceRecv(
  packet: Packet,
  dstChain: ChainWorker,
  headerHeight: Height
) {
  const key = new Uint8Array(
    Buffer.from(
      `nextSequenceRecv/ports/${packet.destination_port}/channels/${packet.destination_channel}`
    )
  )

  let { value } = await dstChain.rpc.abciQuery({
    path: `/store/ibc/key`,
    data: key,
    prove: true,
    height: Number(headerHeight.revisionHeight),
  })

  let count = 0
  while (value.length === 0 && count < 5) {
    const result = await dstChain.rpc.abciQuery({
      path: `/store/ibc/key`,
      data: key,
      prove: true,
      height: Number(headerHeight.revisionHeight),
    })
    count++
    await delay(100)
    value = result.value
  }

  const nextSequenceReceive = Uint64.fromBytes([...value], 'be').toBigInt()

  return Number(nextSequenceReceive)
}

async function getTimeoutProof(
  dstChain: ChainWorker,
  packet: Packet,
  headerHeight: Height
): Promise<string> {
  const queryKey = new Uint8Array(
    Buffer.from(
      `receipts/ports/${packet.destination_port}/channels/${packet.destination_channel}/sequences/${packet.sequence}`
    )
  )
  const proof = await getRawProof(dstChain, queryKey, headerHeight)

  const ics23Proof = convertProofsToIcs23(proof)
  return Buffer.from(ics23Proof).toString('base64')
}
