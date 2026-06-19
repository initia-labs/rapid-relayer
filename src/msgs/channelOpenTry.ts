import { Channel, ChannelCounterparty } from '@initia/initia.js'
import { MsgChannelOpenTry } from '@initia/initia.js'
import { State } from '@initia/initia.proto/ibc/core/channel/v1/channel'
import { Height } from 'cosmjs-types/ibc/core/client/v1/client'
import { getChannelProof } from 'src/lib/proof'
import { ChainWorker } from 'src/workers/chain'
import { Transform } from 'src/lib/transform'

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
  } = await srcChain.rest.ibc.channel(srcPortId, srcChannelId)

  const channel = new Channel(
    State.STATE_TRYOPEN,
    ordering,
    new ChannelCounterparty(srcPortId, srcChannelId),
    [dstConnectionId],
    version,
    0 // upgrade_sequence: 0 for a freshly opened channel (initia.js@1.1.0)
  )

  return new MsgChannelOpenTry(
    dstPortId,
    '',
    channel,
    version,
    await getChannelProof(srcChain, srcPortId, srcChannelId, height),
    Transform.height(height),
    msgExecutor
  )
}
