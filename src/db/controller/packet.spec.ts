import { Bool, PacketEvent, PacketSendTable } from 'src/types'
import { DB } from '..'
import { select } from '../utils'
import { PacketController } from './packet'
import { mockServers } from 'src/test/testSetup'

describe('channel controler', () => {
  test('packet send e2e', async () => {
    const [mockServer1] = mockServers
    // test send_packet
    {
      // create mock events
      const events: PacketEvent[] = [
        {
          type: 'send_packet',
          packetInfo: {
            height: 100,
            sequence: 1,
            connectionId: 'connection-1',
            srcPort: 'transfer',
            srcChannel: 'channel-1',
            dstPort: 'transfer',
            data: 'e2RhdGE6IG51bGx9',
            dstChannel: 'channel-2',
            timeoutHeight: 0,
            timeoutTimestamp: 1731051545,
            timeoutHeightRaw: '0-0',
            timeoutTimestampRaw: '1731051545000000000',
          },
        },
      ]

      // create feed functions
      const fns = await PacketController.feedEvents(
        mockServer1.rest.client(),
        mockServer1.rest.chainId,
        events
      )

      // execute feed functions
      fns()

      // check db insertion
      const res = select(DB, PacketController.tableNamePacketSend)
      const expectVal: PacketSendTable[] = [
        {
          dst_chain_id: 'chain-2',
          dst_connection_id: 'connection-2',
          dst_channel_id: 'channel-2',
          sequence: 1,
          in_progress: Bool.FALSE,
          is_ordered: Bool.FALSE,
          height: 100,
          dst_port: 'transfer',
          src_chain_id: 'chain-1',
          src_connection_id: 'connection-1',
          src_port: 'transfer',
          src_channel_id: 'channel-1',
          packet_data: 'e2RhdGE6IG51bGx9',
          timeout_height: 0,
          timeout_timestamp: 1731051545,
          timeout_height_raw: '0-0',
          timeout_timestamp_raw: '1731051545000000000',
        },
      ]

      expect(res).toEqual(expectVal)
    }
  })
})
