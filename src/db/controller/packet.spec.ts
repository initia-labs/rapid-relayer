import { FeeType, PacketFeeTable } from 'src/types'
import { DB } from '..'
import { select } from '../utils'
import { mockServers } from 'src/test/testSetup'
import { parsePacketFeeEvent } from 'src/lib/eventParser'
import { PacketFeeController } from './packetFee'

describe('packet controler', () => {
  test('packet send e2e', async () => {
    const [mockServer1, _] = mockServers

    const event = parsePacketFeeEvent({
      type: 'incentivized_ibc_packet',
      attributes: [
        {
          key: 'port_id',
          value: 'transfer',
        },
        {
          key: 'channel_id',
          value: 'channel-1',
        },
        {
          key: 'packet_sequence',
          value: '1',
        },
        {
          key: 'recv_fee',
          value: '100tokena,200tokenb',
        },
        {
          key: 'ack_fee',
          value: '200tokena,100tokenb',
        },
        {
          key: 'timeout_fee',
          value: '300tokena,300tokenb',
        },
        {
          key: 'msg_index',
          value: '0',
        },
      ],
    })

    // create feed functions
    const fns = PacketFeeController.feedEvents(mockServer1.rest.chainId, [
      event,
    ])

    // execute feed functions
    fns()

    // check db insertion
    const res = select(DB, PacketFeeController.tableName)
    const expectVal: PacketFeeTable[] = [
      {
        chain_id: mockServer1.rest.chainId,
        channel_id: 'channel-1',
        sequence: event.sequence,
        fee_type: FeeType.RECV,
        denom: 'tokena',
        amount: 100,
      },
      {
        chain_id: mockServer1.rest.chainId,
        channel_id: 'channel-1',
        sequence: event.sequence,
        fee_type: FeeType.RECV,
        denom: 'tokenb',
        amount: 200,
      },
      {
        chain_id: mockServer1.rest.chainId,
        channel_id: 'channel-1',
        sequence: event.sequence,
        fee_type: FeeType.ACK,
        denom: 'tokena',
        amount: 200,
      },
      {
        chain_id: mockServer1.rest.chainId,
        channel_id: 'channel-1',
        sequence: event.sequence,
        fee_type: FeeType.ACK,
        denom: 'tokenb',
        amount: 100,
      },
      {
        chain_id: mockServer1.rest.chainId,
        channel_id: 'channel-1',
        sequence: event.sequence,
        fee_type: FeeType.TIMEOUT,
        denom: 'tokena',
        amount: 300,
      },
      {
        chain_id: mockServer1.rest.chainId,
        channel_id: 'channel-1',
        sequence: event.sequence,
        fee_type: FeeType.TIMEOUT,
        denom: 'tokenb',
        amount: 300,
      },
    ]
    expect(res).toEqual(expectVal)
  })
})
