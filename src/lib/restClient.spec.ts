import nock from 'nock'
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
})
