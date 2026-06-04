import nock from 'nock'
import { Order, State } from '@initia/initia.proto/ibc/core/channel/v1/channel'
import { RESTClient } from './restClient'
import { logger } from './logger'

const mockRestUris = [
  'http://doi-rest-1.com',
  'http://moro-rest-2.com',
  'http://rene-rest-3.com',
]

describe('RESTClient', () => {
  afterEach(() => {
    nock.cleanAll()
    jest.restoreAllMocks()
  })

  it('should use the first endpoint successfully', async () => {
    nock(mockRestUris[0]).get('/cosmos/base/node/v1beta1/config').reply(200, {
      minimum_gas_price: '0.01uinit',
    })

    const client = new RESTClient(mockRestUris)
    const result = await client.apiRequester.get<{ minimum_gas_price: string }>(
      '/cosmos/base/node/v1beta1/config'
    )

    expect(result.minimum_gas_price).toBe('0.01uinit')
  })

  it('should fallback to the next endpoint if the first one fails', async () => {
    nock(mockRestUris[0]).get('/cosmos/base/node/v1beta1/config').reply(500)
    nock(mockRestUris[1]).get('/cosmos/base/node/v1beta1/config').reply(200, {
      minimum_gas_price: '0.02uinit',
    })

    const loggerSpy = jest.spyOn(logger, 'error')
    const client = new RESTClient(mockRestUris)
    const result = await client.apiRequester.get<{ minimum_gas_price: string }>(
      '/cosmos/base/node/v1beta1/config'
    )

    expect(result.minimum_gas_price).toBe('0.02uinit')
    expect(loggerSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        `[REST] Failed to request to ${mockRestUris[0]} - /cosmos/base/node/v1beta1/config`
      )
    )
  })

  it('should not fallback on client errors', async () => {
    nock(mockRestUris[0]).get('/cosmos/base/node/v1beta1/config').reply(404)
    const fallback = nock(mockRestUris[1])
      .get('/cosmos/base/node/v1beta1/config')
      .reply(200, {
        minimum_gas_price: '0.02uinit',
      })

    const client = new RESTClient(mockRestUris)

    await expect(
      client.apiRequester.get('/cosmos/base/node/v1beta1/config')
    ).rejects.toThrow()
    expect(fallback.isDone()).toBe(false)
  })

  it('should prefer the last successful endpoint for later requests', async () => {
    nock(mockRestUris[0]).get('/cosmos/base/node/v1beta1/config').reply(500)
    nock(mockRestUris[1]).get('/cosmos/base/node/v1beta1/config').reply(200, {
      minimum_gas_price: '0.02uinit',
    })
    nock(mockRestUris[1]).get('/cosmos/base/node/v1beta1/config').reply(200, {
      minimum_gas_price: '0.03uinit',
    })

    const client = new RESTClient(mockRestUris)

    await client.apiRequester.get('/cosmos/base/node/v1beta1/config')
    const result = await client.apiRequester.get<{ minimum_gas_price: string }>(
      '/cosmos/base/node/v1beta1/config'
    )

    expect(result.minimum_gas_price).toBe('0.03uinit')
  })

  const mockChannel = (state: string, ordering: string) =>
    nock(mockRestUris[0])
      .get('/ibc/core/channel/v1/channels/channel-0/ports/transfer')
      .reply(200, {
        channel: {
          state,
          ordering,
          counterparty: { port_id: 'transfer', channel_id: 'channel-1' },
          connection_hops: ['connection-0'],
          version: 'ics20-1',
        },
        proof: null,
        proof_height: { revision_number: 0, revision_height: 100 },
      })

  // Covers every channel state the relayer branches on (wallet.ts / index.ts
  // compare against STATE_CLOSED / STATE_INIT / STATE_TRYOPEN), so the
  // string→enum conversion stays locked against future refactors.
  it.each([
    ['STATE_INIT', State.STATE_INIT],
    ['STATE_TRYOPEN', State.STATE_TRYOPEN],
    ['STATE_OPEN', State.STATE_OPEN],
    ['STATE_CLOSED', State.STATE_CLOSED],
  ])('maps channel state %s to the proto enum', async (raw, expected) => {
    mockChannel(raw, 'ORDER_UNORDERED')

    const client = new RESTClient(mockRestUris)
    const res = await client.ibc.channel('transfer', 'channel-0')

    expect(res.channel.state).toBe(expected)
  })

  it.each([
    ['ORDER_UNORDERED', Order.ORDER_UNORDERED],
    ['ORDER_ORDERED', Order.ORDER_ORDERED],
  ])('maps channel ordering %s to the proto enum', async (raw, expected) => {
    mockChannel('STATE_OPEN', raw)

    const client = new RESTClient(mockRestUris)
    const res = await client.ibc.channel('transfer', 'channel-0')

    expect(res.channel.ordering).toBe(expected)
  })

  it('passes counterparty, connection_hops and version through unchanged', async () => {
    mockChannel('STATE_OPEN', 'ORDER_UNORDERED')

    const client = new RESTClient(mockRestUris)
    const res = await client.ibc.channel('transfer', 'channel-0')

    expect(res.channel.version).toBe('ics20-1')
    expect(res.channel.connection_hops).toEqual(['connection-0'])
    expect(res.channel.counterparty).toEqual({
      port_id: 'transfer',
      channel_id: 'channel-1',
    })
  })

  it('falls back to UNRECOGNIZED for unknown channel state/ordering', async () => {
    mockChannel('STATE_GARBAGE', 'ORDER_GARBAGE')

    const client = new RESTClient(mockRestUris)
    const res = await client.ibc.channel('transfer', 'channel-0')

    expect(res.channel.state).toBe(State.UNRECOGNIZED)
    expect(res.channel.ordering).toBe(Order.UNRECOGNIZED)
  })
})
