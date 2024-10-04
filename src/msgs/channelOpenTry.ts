import { Channel, ChannelCounterparty, State } from '@initia/initia.js'
import { MsgChannelOpenTry } from '@initia/initia.js/dist/core/ibc/core/channel/msgs'
import { Height } from 'cosmjs-types/ibc/core/client/v1/client'
import { getChannelProof } from 'src/lib/proof'
import { ChainWorker } from 'src/workers/chain'
import { Transfrom } from 'src/lib/transform'

export async function generateMsgChannelOpenTry(
  srcChain: ChainWorker,
  srcPortId: string,
  srcChannelId: string,
  dstConnectionId: string,
  dstPortId: string,
  height: Height,
  msgExecutor: string
): Promise<MsgChannelOpenTry> {
  const {
    channel: { ordering, version },
  } = await srcChain.lcd.ibc.channel(srcPortId, srcChannelId)

  const channel = new Channel(
    State.STATE_TRYOPEN,
    ordering,
    new ChannelCounterparty(srcPortId, srcChannelId),
    [dstConnectionId],
    version
  )

  return new MsgChannelOpenTry(
    dstPortId,
    '',
    channel,
    version,
    await getChannelProof(srcChain, srcPortId, srcChannelId, height),
    Transfrom.height(height),
    msgExecutor
  )
}