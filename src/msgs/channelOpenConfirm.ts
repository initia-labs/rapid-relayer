import { MsgChannelOpenConfirm } from '@initia/initia.js'
import { Height } from 'cosmjs-types/ibc/core/client/v1/client'
import { getChannelProof } from 'src/lib/proof'
import { ChainWorker } from 'src/workers/chain'
import { Transform } from 'src/lib/transform'

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
    Transform.height(height),
    msgExecutor
  )
}
