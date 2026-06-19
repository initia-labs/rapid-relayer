import { Order, State } from '@initia/initia.proto/ibc/core/channel/v1/channel'
import { Height } from 'cosmjs-types/ibc/core/client/v1/client'

jest.mock('src/lib/proof', () => ({
  getChannelProof: jest.fn().mockResolvedValue('proof-base64'),
}))

import { generateMsgChannelOpenTry } from './channelOpenTry'
import { ChainWorker } from 'src/workers/chain'

describe('generateMsgChannelOpenTry', () => {
  it('builds an OpenTry channel with TRYOPEN state, passthrough ordering and upgrade_sequence 0', async () => {
    const srcChain = {
      rest: {
        ibc: {
          channel: jest.fn().mockResolvedValue({
            channel: { ordering: Order.ORDER_UNORDERED, version: 'ics20-1' },
          }),
        },
      },
    } as unknown as ChainWorker

    const height = Height.fromPartial({
      revisionNumber: 1n,
      revisionHeight: 100n,
    })

    const msg = await generateMsgChannelOpenTry(
      srcChain,
      'transfer',
      'channel-0',
      'connection-1',
      'transfer',
      height,
      'init1executor'
    )

    expect(msg.channel?.state).toBe(State.STATE_TRYOPEN)
    expect(msg.channel?.ordering).toBe(Order.ORDER_UNORDERED)
    expect(msg.channel?.upgrade_sequence).toBe(0)
    expect(msg.channel?.connection_hops).toEqual(['connection-1'])
    expect(msg.counterparty_version).toBe('ics20-1')
  })
})
