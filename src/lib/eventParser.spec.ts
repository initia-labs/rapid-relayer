import { parsePacketEvent } from './eventParser'

describe('event parser', () => {
  test('packet parser', () => {
    // test send packet
    {
      const packetInfo = parsePacketEvent(sendPacket, 123)
      const expectValue = {
        height: 123,
        connectionId: 'connection-1559',
        sequence: 293662,
        srcPort: 'transfer',
        srcChannel: 'channel-259',
        dstPort: 'transfer',
        dstChannel: 'channel-3',
        data: 'eyJkZW5vbSI6InRyYW5zZmVyL2NoYW5uZWwtMjU5L3VrdWppIiwiYW1vdW50IjoiMTQ5NjY5MDEiLCJzZW5kZXIiOiJvc21vMTd5cDN5dmE3ZXhnMHJ1MnlsMndhZXdjZ2RzdzlhYzNmMm00M3VrZ2Q3ZDM5ZTA0NHlyNnF6d2t5ZDMiLCJyZWNlaXZlciI6Imt1amlyYTE1M3o5YTkwZjA5NzdwMnFkZTI4bTBjc3h1YXZxdXlhdGVmOXh0cCJ9',
        timeoutHeight: 0,
        timeoutTimestamp: 1730462659,
        timeoutHeightRaw: '0-0',
        timeoutTimestampRaw: '1730462659929766700',
        ordering: 'ORDER_UNORDERED',
        ack: undefined,
      }

      expect(expectValue).toEqual(packetInfo)
    }

    // test wirte ack
    {
      const packetInfo = parsePacketEvent(writeAck, 123)
      const expectValue = {
        height: 123,
        connectionId: 'connection-2566',
        sequence: 399171,
        srcPort: 'transfer',
        srcChannel: 'channel-2',
        dstPort: 'transfer',
        dstChannel: 'channel-19774',
        data: 'eyJhbW91bnQiOiIzNzAwMDAwMDAwMDAwMDAwMDAwMCIsImRlbm9tIjoiYWR5bSIsIm1lbW8iOiJ7XCJ3YXNtXCI6e1wiY29udHJhY3RcIjpcIm9zbW8xZThwbGQ4ZnQ1cmMzcW03OGhjbGR5MnAwNXJqcmZ6YWVlYTUwbXAwenY1YzI5NHBsMnB5cWs1anJuZFwiLFwibXNnXCI6e1wic3dhcF9hbmRfYWN0aW9uXCI6e1widXNlcl9zd2FwXCI6e1wic3dhcF9leGFjdF9hc3NldF9pblwiOntcInN3YXBfdmVudWVfbmFtZVwiOlwib3Ntb3Npcy1wb29sbWFuYWdlclwiLFwib3BlcmF0aW9uc1wiOlt7XCJwb29sXCI6XCIxNDQ5XCIsXCJkZW5vbV9pblwiOlwiaWJjLzlBNzZDREYwQ0JDRUYzNzkyM0YzMjUxOEZBMTVFNURDOTJCOUY1NjEyODI5MkJDNEQ2M0M0QUVBNzZDQkIxMTBcIixcImRlbm9tX291dFwiOlwidW9zbW9cIn1dfX0sXCJtaW5fYXNzZXRcIjp7XCJuYXRpdmVcIjp7XCJkZW5vbVwiOlwidW9zbW9cIixcImFtb3VudFwiOlwiMTI5Mjc5MjY0XCJ9fSxcInRpbWVvdXRfdGltZXN0YW1wXCI6MTczMDQ2MjY1NDg5NzQxNjAyMCxcInBvc3Rfc3dhcF9hY3Rpb25cIjp7XCJ0cmFuc2ZlclwiOntcInRvX2FkZHJlc3NcIjpcIm9zbW8xdXl4ZHJxeWt0cWZ6Z3o0bWpyajg4ZWV3ZzUyOTh1NTQwZjAzN3hcIn19LFwiYWZmaWxpYXRlc1wiOlt7XCJiYXNpc19wb2ludHNfZmVlXCI6XCI2MFwiLFwiYWRkcmVzc1wiOlwib3NtbzFteTR0azQyMGdqbWhnZ3F3dnZoYTZleTkzOTBncXdmcmVlMnA0dVwifSx7XCJiYXNpc19wb2ludHNfZmVlXCI6XCIxNVwiLFwiYWRkcmVzc1wiOlwib3NtbzE0Z2Y2eHNsd2U5cGhuMno5NjV0NGRjdTd2Y2hodGhmZ3YybGh5eVwifV19fX19IiwicmVjZWl2ZXIiOiJvc21vMWU4cGxkOGZ0NXJjM3FtNzhoY2xkeTJwMDVyanJmemFlZWE1MG1wMHp2NWMyOTRwbDJweXFrNWpybmQiLCJzZW5kZXIiOiJkeW0xYXkyY2t4NHM4dm5oY3l2MzZoaDVxNnNxNDR2MDJ2aGNyYXdyYXYifQ==',
        timeoutHeight: 23278545,
        timeoutTimestamp: 0,
        timeoutHeightRaw: '1-23278545',
        timeoutTimestampRaw: '0',
        ordering: 'ORDER_UNORDERED',
        ack: 'eyJyZXN1bHQiOiJleUpqYjI1MGNtRmpkRjl5WlhOMWJIUWlPbTUxYkd3c0ltbGlZMTloWTJzaU9pSmxlVXA1V2xoT01XSklVV2xQYVVwQ1ZWUXdPVWx1TUQwaWZRPT0ifQ==',
      }

      expect(expectValue).toEqual(packetInfo)
    }

    // test send packet (base64 encoded events)
    {
      const packetInfo = parsePacketEvent(sendPacketBase64, 123)
      const expectValue = {
        height: 123,
        connectionId: 'connection-61',
        sequence: 15598,
        srcPort: 'transfer',
        srcChannel: 'channel-39',
        dstPort: 'transfer',
        dstChannel: 'channel-45',
        data: 'eyJhbW91bnQiOiIzNDczMDAwMDAwIiwiZGVub20iOiJ1dXNkYyIsInJlY2VpdmVyIjoic2VpMWt3Z25lY3lzcTVxeGhnMmg4NmNwN2cwNWU2enN6dHJjZzAzOWg2Iiwic2VuZGVyIjoibm9ibGUxcGswYzB4MGxtdjVtbTgweXJtcmNtMno1eTgzZjN2bXV2dmNqNHgifQ==',
        timeoutHeight: 14691118,
        timeoutTimestamp: 0,
        timeoutHeightRaw: '14691018-14691118',
        timeoutTimestampRaw: '0',
        ordering: 'ORDER_UNORDERED',
        ack: undefined,
      }

      expect(expectValue).toEqual(packetInfo)
    }

    // test wirte ack (base64 encoded events)
    {
      const packetInfo = parsePacketEvent(writeAckBase64, 123)
      const expectValue = {
        height: 123,
        connectionId: 'connection-34',
        sequence: 30288,
        srcPort: 'transfer',
        srcChannel: 'channel-30',
        dstPort: 'transfer',
        dstChannel: 'channel-18',
        data: 'eyJhbW91bnQiOiIyMDAzNDU4NTciLCJkZW5vbSI6InRyYW5zZmVyL2NoYW5uZWwtMzAvdXVzZGMiLCJyZWNlaXZlciI6Im5vYmxlMTZlbjlhdGVxNTU2NWM0bjI2ZWQwd3lrbW5xaGQwdGhwYzU3dG1oIiwic2VuZGVyIjoibmV1dHJvbjE2ZW45YXRlcTU1NjVjNG4yNmVkMHd5a21ucWhkMHRocDVnenBlNyJ9',
        timeoutHeight: 0,
        timeoutTimestamp: 1730467768,
        timeoutHeightRaw: '0-0',
        timeoutTimestampRaw: '1730467768229000000',
        ordering: undefined,
        ack: 'eyJyZXN1bHQiOiJBUT09In0=',
      }

      expect(expectValue).toEqual(packetInfo)
    }
  })
})

// Real data from chains for test
const sendPacketBase64 = {
  type: 'send_packet',
  attributes: [
    {
      key: 'cGFja2V0X2RhdGE=', // packet data
      value:
        'eyJhbW91bnQiOiIzNDczMDAwMDAwIiwiZGVub20iOiJ1dXNkYyIsInJlY2VpdmVyIjoic2VpMWt3Z25lY3lzcTVxeGhnMmg4NmNwN2cwNWU2enN6dHJjZzAzOWg2Iiwic2VuZGVyIjoibm9ibGUxcGswYzB4MGxtdjVtbTgweXJtcmNtMno1eTgzZjN2bXV2dmNqNHgifQ==',
    }, // '{"amount":"3473000000","denom":"uusdc","receiver":"sei1kwgnecysq5qxhg2h86cp7g05e6zsztrcg039h6","sender":"noble1pk0c0x0lmv5mm80yrmrcm2z5y83f3vmuvvcj4x"}'
    {
      key: 'cGFja2V0X2RhdGFfaGV4', // packet data hex
      value:
        'N2IyMjYxNmQ2Zjc1NmU3NDIyM2EyMjMzMzQzNzMzMzAzMDMwMzAzMDMwMjIyYzIyNjQ2NTZlNmY2ZDIyM2EyMjc1NzU3MzY0NjMyMjJjMjI3MjY1NjM2NTY5NzY2NTcyMjIzYTIyNzM2NTY5MzE2Yjc3Njc2ZTY1NjM3OTczNzEzNTcxNzg2ODY3MzI2ODM4MzY2MzcwMzc2NzMwMzU2NTM2N2E3MzdhNzQ3MjYzNjczMDMzMzk2ODM2MjIyYzIyNzM2NTZlNjQ2NTcyMjIzYTIyNmU2ZjYyNmM2NTMxNzA2YjMwNjMzMDc4MzA2YzZkNzYzNTZkNmQzODMwNzk3MjZkNzI2MzZkMzI3YTM1NzkzODMzNjYzMzc2NmQ3NTc2NzY2MzZhMzQ3ODIyN2Q=',
    }, // '7b22616d6f756e74223a2233343733303030303030222c2264656e6f6d223a227575736463222c227265636569766572223a22736569316b77676e656379737135717868673268383663703767303565367a737a747263673033396836222c2273656e646572223a226e6f626c6531706b30633078306c6d76356d6d383079726d72636d327a357938336633766d757676636a3478227d
    {
      key: 'cGFja2V0X3RpbWVvdXRfaGVpZ2h0', // packet timeout height
      value: 'MTQ2OTEwMTgtMTQ2OTExMTg=', // 14691018-14691118 ?
    },
    { key: 'cGFja2V0X3RpbWVvdXRfdGltZXN0YW1w', value: 'MA==' }, // packet timeout, 0
    { key: 'cGFja2V0X3NlcXVlbmNl', value: 'MTU1OTg=' }, // packet sequence, 15598
    { key: 'cGFja2V0X3NyY19wb3J0', value: 'dHJhbnNmZXI=' }, // packet src port, transfer
    { key: 'cGFja2V0X3NyY19jaGFubmVs', value: 'Y2hhbm5lbC0zOQ==' }, // packet src channel, channel-39
    { key: 'cGFja2V0X2RzdF9wb3J0', value: 'dHJhbnNmZXI=' }, // packet dst port, transfer
    { key: 'cGFja2V0X2RzdF9jaGFubmVs', value: 'Y2hhbm5lbC00NQ==' }, // packet dst channel, channel-45
    {
      key: 'cGFja2V0X2NoYW5uZWxfb3JkZXJpbmc=', // packet channel ordering
      value: 'T1JERVJfVU5PUkRFUkVE', // , ORDER_UNORDERED
    },
    { key: 'cGFja2V0X2Nvbm5lY3Rpb24=', value: 'Y29ubmVjdGlvbi02MQ==' }, // packet connection, connection-61
  ],
}
const writeAckBase64 = {
  type: 'write_acknowledgement',
  attributes: [
    {
      key: 'cGFja2V0X2RhdGE=', // packet data
      value:
        'eyJhbW91bnQiOiIyMDAzNDU4NTciLCJkZW5vbSI6InRyYW5zZmVyL2NoYW5uZWwtMzAvdXVzZGMiLCJyZWNlaXZlciI6Im5vYmxlMTZlbjlhdGVxNTU2NWM0bjI2ZWQwd3lrbW5xaGQwdGhwYzU3dG1oIiwic2VuZGVyIjoibmV1dHJvbjE2ZW45YXRlcTU1NjVjNG4yNmVkMHd5a21ucWhkMHRocDVnenBlNyJ9',
    }, // {"amount":"200345857","denom":"transfer/channel-30/uusdc","receiver":"noble16en9ateq5565c4n26ed0wykmnqhd0thpc57tmh","sender":"neutron16en9ateq5565c4n26ed0wykmnqhd0thp5gzpe7"}
    {
      key: 'cGFja2V0X2RhdGFfaGV4', // packet data hex
      value:
        'N2IyMjYxNmQ2Zjc1NmU3NDIyM2EyMjMyMzAzMDMzMzQzNTM4MzUzNzIyMmMyMjY0NjU2ZTZmNmQyMjNhMjI3NDcyNjE2ZTczNjY2NTcyMmY2MzY4NjE2ZTZlNjU2YzJkMzMzMDJmNzU3NTczNjQ2MzIyMmMyMjcyNjU2MzY1Njk3NjY1NzIyMjNhMjI2ZTZmNjI2YzY1MzEzNjY1NmUzOTYxNzQ2NTcxMzUzNTM2MzU2MzM0NmUzMjM2NjU2NDMwNzc3OTZiNmQ2ZTcxNjg2NDMwNzQ2ODcwNjMzNTM3NzQ2ZDY4MjIyYzIyNzM2NTZlNjQ2NTcyMjIzYTIyNmU2NTc1NzQ3MjZmNmUzMTM2NjU2ZTM5NjE3NDY1NzEzNTM1MzYzNTYzMzQ2ZTMyMzY2NTY0MzA3Nzc5NmI2ZDZlNzE2ODY0MzA3NDY4NzAzNTY3N2E3MDY1MzcyMjdk',
    }, // 7b22616d6f756e74223a22323030333435383537222c2264656e6f6d223a227472616e736665722f6368616e6e656c2d33302f7575736463222c227265636569766572223a226e6f626c653136656e39617465713535363563346e323665643077796b6d6e71686430746870633537746d68222c2273656e646572223a226e657574726f6e3136656e39617465713535363563346e323665643077796b6d6e7168643074687035677a706537227d
    { key: 'cGFja2V0X3RpbWVvdXRfaGVpZ2h0', value: 'MC0w' }, // packet timeout height, 0-0
    {
      key: 'cGFja2V0X3RpbWVvdXRfdGltZXN0YW1w', // packet timeout timestamp
      value: 'MTczMDQ2Nzc2ODIyOTAwMDAwMA==', // 1730467768229000000
    },
    { key: 'cGFja2V0X3NlcXVlbmNl', value: 'MzAyODg=' }, // packet sequence 30288
    { key: 'cGFja2V0X3NyY19wb3J0', value: 'dHJhbnNmZXI=' }, // packet src port, transfer
    { key: 'cGFja2V0X3NyY19jaGFubmVs', value: 'Y2hhbm5lbC0zMA==' }, // packet src channel, channel-30
    { key: 'cGFja2V0X2RzdF9wb3J0', value: 'dHJhbnNmZXI=' }, // packet dst port, transfer
    { key: 'cGFja2V0X2RzdF9jaGFubmVs', value: 'Y2hhbm5lbC0xOA==' }, // packet dst channel, channel-18
    { key: 'cGFja2V0X2Fjaw==', value: 'eyJyZXN1bHQiOiJBUT09In0=' }, // packet ack, {"result":"AQ=="}
    {
      key: 'cGFja2V0X2Fja19oZXg=', // packet ack hex
      value: 'N2IyMjcyNjU3Mzc1NmM3NDIyM2EyMjQxNTEzZDNkMjI3ZA==', // 7b22726573756c74223a2241513d3d227d
    },
    { key: 'cGFja2V0X2Nvbm5lY3Rpb24=', value: 'Y29ubmVjdGlvbi0zNA==' }, // packet connection, connection-34
  ],
}

const sendPacket = {
  type: 'send_packet',
  attributes: [
    { key: 'connection_id', value: 'connection-1559' },
    { key: 'packet_channel_ordering', value: 'ORDER_UNORDERED' },
    { key: 'packet_connection', value: 'connection-1559' },
    {
      key: 'packet_data',
      value:
        '{"denom":"transfer/channel-259/ukuji","amount":"14966901","sender":"osmo17yp3yva7exg0ru2yl2waewcgdsw9ac3f2m43ukgd7d39e044yr6qzwkyd3","receiver":"kujira153z9a90f0977p2qde28m0csxuavquyatef9xtp"}',
    },
    {
      key: 'packet_data_hex',
      value:
        '7b2264656e6f6d223a227472616e736665722f6368616e6e656c2d3235392f756b756a69222c22616d6f756e74223a223134393636393031222c2273656e646572223a226f736d6f31377970337976613765786730727532796c327761657763676473773961633366326d3433756b67643764333965303434797236717a776b796433222c227265636569766572223a226b756a6972613135337a396139306630393737703271646532386d306373787561767175796174656639787470227d',
    },
    { key: 'packet_dst_channel', value: 'channel-3' },
    { key: 'packet_dst_port', value: 'transfer' },
    { key: 'packet_sequence', value: '293662' },
    { key: 'packet_src_channel', value: 'channel-259' },
    { key: 'packet_src_port', value: 'transfer' },
    { key: 'packet_timeout_height', value: '0-0' },
    { key: 'packet_timeout_timestamp', value: '1730462659929766700' },
    { key: 'msg_index', value: '1' },
  ],
}

const writeAck = {
  type: 'write_acknowledgement',
  attributes: [
    {
      key: 'packet_data',
      value:
        '{"amount":"37000000000000000000","denom":"adym","memo":"{\\"wasm\\":{\\"contract\\":\\"osmo1e8pld8ft5rc3qm78hcldy2p05rjrfzaeea50mp0zv5c294pl2pyqk5jrnd\\",\\"msg\\":{\\"swap_and_action\\":{\\"user_swap\\":{\\"swap_exact_asset_in\\":{\\"swap_venue_name\\":\\"osmosis-poolmanager\\",\\"operations\\":[{\\"pool\\":\\"1449\\",\\"denom_in\\":\\"ibc/9A76CDF0CBCEF37923F32518FA15E5DC92B9F56128292BC4D63C4AEA76CBB110\\",\\"denom_out\\":\\"uosmo\\"}]}},\\"min_asset\\":{\\"native\\":{\\"denom\\":\\"uosmo\\",\\"amount\\":\\"129279264\\"}},\\"timeout_timestamp\\":1730462654897416020,\\"post_swap_action\\":{\\"transfer\\":{\\"to_address\\":\\"osmo1uyxdrqyktqfzgz4mjrj88eewg5298u540f037x\\"}},\\"affiliates\\":[{\\"basis_points_fee\\":\\"60\\",\\"address\\":\\"osmo1my4tk420gjmhggqwvvha6ey9390gqwfree2p4u\\"},{\\"basis_points_fee\\":\\"15\\",\\"address\\":\\"osmo14gf6xslwe9phn2z965t4dcu7vchhthfgv2lhyy\\"}]}}}}","receiver":"osmo1e8pld8ft5rc3qm78hcldy2p05rjrfzaeea50mp0zv5c294pl2pyqk5jrnd","sender":"dym1ay2ckx4s8vnhcyv36hh5q6sq44v02vhcrawrav"}',
    },
    {
      key: 'packet_data_hex',
      value:
        '7b22616d6f756e74223a223337303030303030303030303030303030303030222c2264656e6f6d223a226164796d222c226d656d6f223a227b5c227761736d5c223a7b5c22636f6e74726163745c223a5c226f736d6f316538706c6438667435726333716d373868636c647932703035726a72667a6165656135306d70307a763563323934706c327079716b356a726e645c222c5c226d73675c223a7b5c22737761705f616e645f616374696f6e5c223a7b5c22757365725f737761705c223a7b5c22737761705f65786163745f61737365745f696e5c223a7b5c22737761705f76656e75655f6e616d655c223a5c226f736d6f7369732d706f6f6c6d616e616765725c222c5c226f7065726174696f6e735c223a5b7b5c22706f6f6c5c223a5c22313434395c222c5c2264656e6f6d5f696e5c223a5c226962632f394137364344463043424345463337393233463332353138464131354535444339324239463536313238323932424334443633433441454137364342423131305c222c5c2264656e6f6d5f6f75745c223a5c22756f736d6f5c227d5d7d7d2c5c226d696e5f61737365745c223a7b5c226e61746976655c223a7b5c2264656e6f6d5c223a5c22756f736d6f5c222c5c22616d6f756e745c223a5c223132393237393236345c227d7d2c5c2274696d656f75745f74696d657374616d705c223a313733303436323635343839373431363032302c5c22706f73745f737761705f616374696f6e5c223a7b5c227472616e736665725c223a7b5c22746f5f616464726573735c223a5c226f736d6f31757978647271796b7471667a677a346d6a726a383865657767353239387535343066303337785c227d7d2c5c22616666696c69617465735c223a5b7b5c2262617369735f706f696e74735f6665655c223a5c2236305c222c5c22616464726573735c223a5c226f736d6f316d7934746b343230676a6d6867677177767668613665793933393067717766726565327034755c227d2c7b5c2262617369735f706f696e74735f6665655c223a5c2231355c222c5c22616464726573735c223a5c226f736d6f313467663678736c77653970686e327a393635743464637537766368687468666776326c6879795c227d5d7d7d7d7d222c227265636569766572223a226f736d6f316538706c6438667435726333716d373868636c647932703035726a72667a6165656135306d70307a763563323934706c327079716b356a726e64222c2273656e646572223a2264796d31617932636b78347338766e686379763336686835713673713434763032766863726177726176227d',
    },
    { key: 'packet_timeout_height', value: '1-23278545' },
    { key: 'packet_timeout_timestamp', value: '0' },
    { key: 'packet_sequence', value: '399171' },
    { key: 'packet_src_port', value: 'transfer' },
    { key: 'packet_src_channel', value: 'channel-2' },
    { key: 'packet_dst_port', value: 'transfer' },
    { key: 'packet_dst_channel', value: 'channel-19774' },
    {
      key: 'packet_ack',
      value:
        '{"result":"eyJjb250cmFjdF9yZXN1bHQiOm51bGwsImliY19hY2siOiJleUp5WlhOMWJIUWlPaUpCVVQwOUluMD0ifQ=="}',
    },
    {
      key: 'packet_ack_hex',
      value:
        '7b22726573756c74223a2265794a6a62323530636d466a644639795a584e31624851694f6d353162477773496d6c6959313968593273694f694a6c65557035576c684f4d574a4955576c5061557043565651774f556c754d44306966513d3d227d',
    },
    { key: 'packet_channel_ordering', value: 'ORDER_UNORDERED' },
    { key: 'packet_connection', value: 'connection-2566' },
    { key: 'connection_id', value: 'connection-2566' },
    { key: 'msg_index', value: '1' },
  ],
}
