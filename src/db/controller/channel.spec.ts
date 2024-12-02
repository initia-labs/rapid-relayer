import {
  Bool,
  ChannelOpenCloseEvent,
  ChannelOpenCloseTable,
  ChannelState,
} from 'src/types'
import { ChannelController } from './channel'
import { DB } from '..'
import { insert, select } from '../utils'
import { mockServers } from 'src/test/testSetup'

describe('channel controller', () => {
  test('channel open e2e', async () => {
    const [mockServer1, mockServer2] = mockServers
    // test channel_open_init
    {
      // create mock events
      const events: ChannelOpenCloseEvent[] = [
        {
          type: 'channel_open_init',
          channelOpenCloseInfo: {
            height: 100,
            srcConnectionId: 'connection-1',
            srcPortId: 'transfer',
            srcChannelId: 'channel-1',
            dstConnectionId: '',
            dstPortId: '',
            dstChannelId: '',
          },
        },
      ]

      // create feed functions
      const fns = await ChannelController.feedEvents(
        mockServer1.rest.client(),
        mockServer1.rest.chainId,
        events
      )

      // execute feed functions
      fns()

      // check db insertion
      const res = select(DB, ChannelController.tableName)
      const expectVal: ChannelOpenCloseTable[] = [
        {
          id: 1,
          in_progress: Bool.FALSE,
          height: 100,
          state: ChannelState.INIT,
          chain_id: mockServer2.rest.chainId, // counterparty's chain id
          connection_id: 'connection-2',
          port_id: '',
          channel_id: '',
          counterparty_chain_id: mockServer1.rest.chainId,
          counterparty_connection_id: 'connection-1',
          counterparty_port_id: 'transfer',
          counterparty_channel_id: 'channel-1',
        },
      ]
      expect(res).toEqual(expectVal)
    }

    // test channel_open_try
    {
      // create mock events
      const events: ChannelOpenCloseEvent[] = [
        {
          type: 'channel_open_try',
          channelOpenCloseInfo: {
            height: 100,
            srcConnectionId: 'connection-2',
            srcPortId: 'transfer',
            srcChannelId: 'channel-1',
            dstConnectionId: 'connection-2',
            dstPortId: 'transfer',
            dstChannelId: 'channel-2',
          },
        },
      ]

      // create feed functions
      const fns = await ChannelController.feedEvents(
        mockServer2.rest.client(),
        mockServer2.rest.chainId,
        events
      )

      // execute feed functions
      fns()

      // check deletion and insertion
      const res = select(DB, ChannelController.tableName)
      // id 1 must be removed
      const expectVal: ChannelOpenCloseTable[] = [
        {
          id: 2,
          in_progress: Bool.FALSE,
          height: 100,
          state: ChannelState.TRYOPEN,
          chain_id: mockServer1.rest.chainId, // counterparty's chain id
          connection_id: 'connection-1',
          port_id: 'transfer',
          channel_id: 'channel-1',
          counterparty_chain_id: mockServer2.rest.chainId,
          counterparty_connection_id: 'connection-2',
          counterparty_port_id: 'transfer',
          counterparty_channel_id: 'channel-2',
        },
      ]
      expect(res).toEqual(expectVal)
    }

    // test channel_open_ack
    {
      // create mock events
      const events: ChannelOpenCloseEvent[] = [
        {
          type: 'channel_open_ack',
          channelOpenCloseInfo: {
            height: 100,
            srcConnectionId: 'connection-1',
            srcPortId: 'transfer',
            srcChannelId: 'channel-1',
            dstConnectionId: 'connection-2',
            dstPortId: 'transfer',
            dstChannelId: 'channel-2',
          },
        },
      ]

      // to check deletion of open init, insert
      insert(DB, ChannelController.tableName, {
        id: 1,
        in_progress: Bool.FALSE,
        height: 100,
        state: ChannelState.INIT,
        chain_id: mockServer2.rest.chainId, // counterparty's chain id
        connection_id: 'connection-2',
        port_id: '',
        channel_id: '',
        counterparty_chain_id: mockServer1.rest.chainId,
        counterparty_connection_id: 'connection-1',
        counterparty_port_id: 'transfer',
        counterparty_channel_id: 'channel-1',
      })

      // create feed functions
      const fns = await ChannelController.feedEvents(
        mockServer1.rest.client(),
        mockServer1.rest.chainId,
        events
      )

      // execute feed functions
      fns()

      // check deletion and insertion
      const res = select(DB, ChannelController.tableName)
      // id 1 and 2 must be removed
      const expectVal: ChannelOpenCloseTable[] = [
        {
          id: 3,
          in_progress: Bool.FALSE,
          height: 100,
          state: ChannelState.ACK,
          chain_id: mockServer2.rest.chainId, // counterparty's chain id
          connection_id: 'connection-2',
          port_id: 'transfer',
          channel_id: 'channel-2',
          counterparty_chain_id: mockServer1.rest.chainId,
          counterparty_connection_id: 'connection-1',
          counterparty_port_id: 'transfer',
          counterparty_channel_id: 'channel-1',
        },
      ]
      expect(res).toEqual(expectVal)
    }

    // test channel_open_confirm
    {
      // create mock events
      const events: ChannelOpenCloseEvent[] = [
        {
          type: 'channel_open_confirm',
          channelOpenCloseInfo: {
            height: 100,
            srcConnectionId: 'connection-1',
            srcPortId: 'transfer',
            srcChannelId: 'channel-1',
            dstConnectionId: 'connection-2',
            dstPortId: 'transfer',
            dstChannelId: 'channel-2',
          },
        },
      ]

      // to check deletion of open try_open, insert
      insert(DB, ChannelController.tableName, {
        id: 2,
        in_progress: Bool.FALSE,
        height: 100,
        state: ChannelState.TRYOPEN,
        chain_id: mockServer1.rest.chainId, // counterparty's chain id
        connection_id: 'connection-1',
        port_id: 'transfer',
        channel_id: 'channel-1',
        counterparty_chain_id: mockServer2.rest.chainId,
        counterparty_connection_id: 'connection-2',
        counterparty_port_id: 'transfer',
        counterparty_channel_id: 'channel-2',
      })

      // create feed functions
      const fns = await ChannelController.feedEvents(
        mockServer2.rest.client(),
        mockServer2.rest.chainId,
        events
      )

      // execute feed functions
      fns()

      // check deletions
      const res = select(DB, ChannelController.tableName)
      // id 2 and 3 must be removed and noting remain
      const expectVal: ChannelOpenCloseTable[] = []
      expect(res).toEqual(expectVal)
    }
  })

  test('channel close e2e', async () => {
    const [mockServer1, mockServer2] = mockServers
    {
      // create mock events
      const events: ChannelOpenCloseEvent[] = [
        {
          type: 'channel_close',
          channelOpenCloseInfo: {
            height: 100,
            srcConnectionId: 'connection-1',
            srcPortId: 'transfer',
            srcChannelId: 'channel-1',
            dstConnectionId: 'connection-2',
            dstPortId: 'transfer',
            dstChannelId: 'channel-2',
          },
        },
      ]

      // create feed functions
      const fns = await ChannelController.feedEvents(
        mockServer1.rest.client(),
        mockServer1.rest.chainId,
        events
      )

      // execute feed functions
      fns()

      // check db insertion
      const res = select(DB, ChannelController.tableName)
      const expectVal: ChannelOpenCloseTable[] = [
        {
          id: 4,
          in_progress: Bool.FALSE,
          height: 100,
          state: ChannelState.CLOSE,
          chain_id: mockServer2.rest.chainId, // counterparty's chain id
          connection_id: 'connection-2',
          port_id: 'transfer',
          channel_id: 'channel-2',
          counterparty_chain_id: mockServer1.rest.chainId,
          counterparty_connection_id: 'connection-1',
          counterparty_port_id: 'transfer',
          counterparty_channel_id: 'channel-1',
        },
      ]
      expect(res).toEqual(expectVal)
    }

    {
      // create mock events
      const events: ChannelOpenCloseEvent[] = [
        {
          type: 'channel_close_confirm',
          channelOpenCloseInfo: {
            height: 100,
            srcConnectionId: 'connection-1',
            srcPortId: 'transfer',
            srcChannelId: 'channel-1',
            dstConnectionId: 'connection-2',
            dstPortId: 'transfer',
            dstChannelId: 'channel-2',
          },
        },
      ]

      // create feed functions
      const fns = await ChannelController.feedEvents(
        mockServer2.rest.client(),
        mockServer2.rest.chainId,
        events
      )

      // execute feed functions
      fns()

      // check db deletion
      const res = select(DB, ChannelController.tableName)
      const expectVal: ChannelOpenCloseTable[] = []
      expect(res).toEqual(expectVal)
    }
  })
})
