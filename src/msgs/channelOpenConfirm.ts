import { MsgChannelOpenConfirm } from '@initia/initia.js/dist/core/ibc/core/channel/msgs'
import { Height } from 'cosmjs-types/ibc/core/client/v1/client'
import { getChannelProof } from 'src/lib/proof'
import { ChainWorker } from 'src/workers/chain'
import { Transfrom } from 'src/lib/transform'

export async function generateMsgChannelOpenConfirm(
  srcChain: ChainWorker,
  srcPortId: string,
  srcChannelId: string,
  dstPortId: string,
  dstChannelId: string,
  height: Height,
  msgExecutor: string
): Promise<MsgChannelOpenConfirm> {
  return new MsgChannelOpenConfirm(
    dstPortId,
    dstChannelId,
    await getChannelProof(srcChain, srcPortId, srcChannelId, height),
    Transfrom.height(height),
    msgExecutor
  )
}