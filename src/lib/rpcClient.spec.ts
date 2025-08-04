import { fromHex } from '@cosmjs/encoding'
import { RPCClient } from './rpcClient'
import { logger } from './logger'
import nock from 'nock'
import { config } from './config'

jest.mock('./config', () => ({
  config: {
    rpcRequestTimeout: 5000,
  },
}))

// We are already using MSW. However, we use Nock because it is easier to use and optimized for mocking HTTP requests in Node.js.
// We may consider migrating to MSW in the future if necessary.

// List of mock RPC endpoint URLs used in tests
const mockRpcUris = [
  'http://doi-rpc-1.com',
  'http://moro-rpc-2.com',
  'http://rene-rpc-3.com',
]

describe('RPCClient', () => {
  // Clean up all nock interceptors after each test to avoid interference
  afterEach(() => {
    nock.cleanAll()
  })

  // Test case: Successful response from the first RPC endpoint
  it('should use the first endpoint successfully', async () => {
    // Mock the first endpoint to reply with HTTP 200 and expected data
    nock(mockRpcUris[0])
      .get('/abci_info')
      .reply(200, { result: { response: { data: 'ok' } } })

    // Create RPCClient instance with the list of endpoints
    const client = new RPCClient(mockRpcUris)
    // Call abciInfo method and verify response data
    const result = await client.abciInfo()
    expect(result.data).toBe('ok')
  })

  // Test case: If first endpoint fails, client should fallback to the second endpoint
  it('should fallback to the next endpoint if the first one fails', async () => {
    // First endpoint returns HTTP 500 (error)
    nock(mockRpcUris[0]).get('/abci_info').reply(500)
    // Second endpoint returns successful response
    nock(mockRpcUris[1])
      .get('/abci_info')
      .reply(200, { result: { response: { data: 'ok' } } })

    // Spy on logger.error to check if error logging happens
    const loggerSpy = jest.spyOn(logger, 'error')
    const client = new RPCClient(mockRpcUris)
    const result = await client.abciInfo()

    // Expect successful response from second endpoint
    expect(result.data).toBe('ok')
    // Expect error log about first endpoint failure
    expect(loggerSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        `[RPC] Failed to request to ${mockRpcUris[0]} - abci_info`
      )
    )
  })

  // Test case: Retry with exponential backoff when all endpoints fail initially
  it('should retry with exponential backoff if all endpoints fail', async () => {
    // Mock all endpoints to fail with HTTP 500
    nock(mockRpcUris[0]).get('/abci_info').reply(500)
    nock(mockRpcUris[1]).get('/abci_info').reply(500)
    nock(mockRpcUris[2]).get('/abci_info').reply(500)

    // Spy on logger.info to detect retry logging
    const loggerSpy = jest.spyOn(logger, 'info')
    const client = new RPCClient(mockRpcUris)

    // Start the abciInfo request (which will initially fail)
    const abciPromise = client.abciInfo()

    // Wait a bit to allow retry logic to kick in
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Expect retry log message to be emitted
    expect(loggerSpy).toHaveBeenCalledWith(
      '[RPC] All endpoints failed. Retrying in 1000ms'
    )

    // After retry delay, mock first endpoint to succeed
    nock(mockRpcUris[0])
      .get('/abci_info')
      .reply(200, { result: { response: { data: 'ok' } } })

    // Await the original promise, which should now resolve successfully
    const result = await abciPromise
    expect(result.data).toBe('ok')
  }, 10000) // Test timeout set to 10 seconds

  // Test case: Timeout on first endpoint triggers fallback to next endpoint
  it('should respect the timeout and fallback to the next endpoint', async () => {
    // First endpoint delays response for 2 seconds (longer than timeout)
    nock(mockRpcUris[0])
      .get('/abci_info')
      .delay(2000)
      .reply(200, { result: { response: { data: 'slow' } } })

    // Second endpoint replies quickly with success
    nock(mockRpcUris[1])
      .get('/abci_info')
      .reply(200, { result: { response: { data: 'ok' } } })

    // Set request timeout to 1 second for this test
    const originalTimeout = config.rpcRequestTimeout
    config.rpcRequestTimeout = 1000

    // Spy on logger.error to capture timeout error logging
    const loggerSpy = jest.spyOn(logger, 'error')
    const client = new RPCClient(mockRpcUris)
    const result = await client.abciInfo()

    // Expect to get response from second (faster) endpoint
    expect(result.data).toBe('ok')
    // Expect error log mentioning the first endpoint failure due to timeout
    expect(loggerSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        `[RPC] Failed to request to ${mockRpcUris[0]} - abci_info`
      )
    )

    // Restore original timeout
    config.rpcRequestTimeout = originalTimeout
  }, 10000)

  // Test case: ABCI query with specific JSON request format
  it('should handle ABCI query with specific JSON request format', async () => {
    // The expected response format based on the issue description
    const mockResponse = {
      jsonrpc: '2.0',
      id: 248582674865,
      result: {
        response: {
          code: 0,
          log: '',
          info: '',
          index: '0',
          key: 'bmV4dFNlcXVlbmNlUmVjdi9wb3J0cy90cmFuc2Zlci9jaGFubmVscy9jaGFubmVsLTcx',
          value: 'AAAAAAAAAAE=',
          proofOps: {
            ops: [
              {
                type: 'ics23:iavl',
                key: 'bmV4dFNlcXVlbmNlUmVjdi9wb3J0cy90cmFuc2Zlci9jaGFubmVscy9jaGFubmVsLTcx',
                data: 'CrEHCjNuZXh0U2VxdWVuY2VSZWN2L3BvcnRzL3RyYW5zZmVyL2NoYW5uZWxzL2NoYW5uZWwtNzESCAAAAAAAAAABGg4IARgBIAEqBgACtLjhASIuCAESBwIEloqVAiAaISDVeO6LDft1Pn0O3Q/bhX3Lb7skVerdg5DLBfbZ+uZvySIsCAESKAQIloqVAiBAxSBhVBAcrEQVdn6z4oyJImve1Tr03XrKc7ZWscccGCAiLAgBEigGDJaKlQIgsumoVU5I3BRfTUZX7dIQf8qbIrgJ0iVBezqv60XQG2YgIiwIARIoCByWipUCIDGWtK5KZ0yFBy4/91tuXn1T8RmR61535evuoSLVdFSOICIsCAESKAooloqVAiDjumIlPcUBege4u8PPicQQjcC8gXUmOphmUwJcJyqniiAiLAgBEigMUJaKlQIg4+isiih97xBoyO42kswLDUfPnF7XD7DlfLL1P7hJu8ogIi8IARIIDqYBxobvAyAaISC0s2n/Mzz9XTSt2V7nOyVcSvsv/FrqYHzwguT5FQJsxiIvCAESCBKGA66HjwUgGiEg1991yk2aCI6niJCKTCuzJNb+jxlojjyQK4xk5sdJxZYiLwgBEggU8geuh48FIBohIJzKg9dlBdIr8sp8XDVMhLY2Vh0AUcTD9hQuuHRU46JuIi8IARIIFqgProePBSAaISCHoJ2WzRGYyz9YBaZZ+KFE/Q4ZZLNvyafgll7ajvHgHiIvCAESCBqyKa6HjwUgGiEgKVfzdPAObDkwySAOLkZDz/ancf/oCB76BL3vKPW2r00iLwgBEggcrEquh48FIBohICCKAi1FDvLbTRfDL/sZuYvgEP/aufe40669F9DxuQgYIi4IARIqIIbGAZKNjwUgzFUz83TR6/sZWBWzE8wBR67JS3LA/+WgOsvxOfBp18UgIjAIARIJIrbQApKNjwUgGiEg7KHk8xbdNEvsNuFZ4NNaJi51xgZFgcXd0E/LUKg7pfgiMAgBEgkk3N8Eko2PBSAaISBDD+2he8U0c0afBva88efLqINxXmA9zalgIx0knVZ3ByIwCAESCSbG0QeSjY8FIBohIE7PLExC3A73v4qNZeKrf7sl0WAxGgM+/QinrW/wejAfIi4IARIqKKyoEpKNjwUgX10ZfbhuoY3+k/z3xA5KWUkRjITVepqK65HuJ7xbzmAgIi4IARIqKsjRIpKNjwUgCKaSOoKTsBv3d3UWr2TwrDM+RNo7gmXXI2rHRpqkL+Qg',
              },
              {
                type: 'ics23:simple',
                key: 'aWJj',
                data: 'Cv0BCgNpYmMSIHm5awKBGxpZLlYoVVV8JTuRPKON2XaqytvWwrbHT6jtGgkIARgBIAEqAQAiJwgBEgEBGiAs2LUHAJUFRhgK2XkTWocIwuogmP/2reMbfkDrXc98BSInCAESAQEaIFfgJz1mx6LDaaUB+9+LYQwrJ4OFqe8HYFqY4dh5+TELIicIARIBARog0LUkJUcmM/OR1XRHH0BveMkvIHoBhw9aTKffG93j4QoiJwgBEgEBGiAgtVWuPvfkO9i5qj4asRzfPdkyIK5LWyNHQO7NTKwOOiIlCAESIQFcT2Z4klst8Eo/q8Ae3+EYQ63+MsL2jRZpZBfPjr6XXg==',
              },
            ],
          },
          height: '5366601',
          codespace: '',
        },
      },
    }

    // Mock the POST request for ABCI query
    nock(mockRpcUris[0])
      .post(
        '/',
        (
          body: nock.Body & {
            method: string
            params: {
              path: string
              prove: boolean
              data: string
              height: string
            }
          }
        ) => {
          // Verify that the request body contains the expected method and params
          return (body.method === 'abci_query' &&
            body.params.path === '/store/ibc/key' && body.params.prove)
        }
      )
      .reply(200, mockResponse)

    // Create RPCClient instance
    const client = new RPCClient(mockRpcUris)

    // Convert the hex data to Uint8Array
    const hexData =
      '6e65787453657175656e6365526563762f706f7274732f7472616e736665722f6368616e6e656c732f6368616e6e656c2d3731'
    const data = fromHex(hexData)

    // Make the ABCI query
    const result = await client.abciQuery({
      path: '/store/ibc/key',
      data,
      height: 5366601,
      prove: true,
    })

    // Verify the response is defined
    expect(result).toBeDefined()
  })
})
