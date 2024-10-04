import { MsgChannelOpenAck } from '@initia/initia.js/dist/core/ibc/core/channel/msgs'
import { Height } from 'cosmjs-types/ibc/core/client/v1/client'
import { getChannelProof } from 'src/lib/proof'
import { ChainWorker } from 'src/workers/chain'
import { Transfrom } from 'src/lib/transform'

export async function generateMsgChannelOpenAck(
  srcPortId: string,
  srcChannelId: string,
  dstChain: ChainWorker,
  dstPortId: string,
  dstChannelId: string,
  height: Height,
  msgExecutor: string
): Promise<MsgChannelOpenAck> {
  const {
    channel: { version },
  } = await dstChain.lcd.ibc.channel(dstPortId, dstChannelId)

  return new MsgChannelOpenAck(
    srcPortId,
    srcChannelId,
    dstChannelId,
    version,
    await getChannelProof(dstChain, dstPortId, dstChannelId, height),
    Transfrom.height(height),
    msgExecutor
  )
}
