import { RPCClient } from './rpcClient'
import { logger } from './logger'
import nock from 'nock'

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

    // Set request timeout environment variable to 1 second
    process.env.RPC_REQUEST_TIMEOUT = '1000'

    // Spy on logger.error to capture timeout error logging
    const loggerSpy = jest.spyOn(logger, 'error')
    const client = new RPCClient(mockRpcUris)
    const result = await client.abciInfo()

    // Expect to get response from second (faster) endpoint
    expect(result.data).toBe('ok')
    // Expect error log mentioning the first endpoint failure due to timeout
    expect(loggerSpy).toHaveBeenCalledWith(
      expect.stringContaining(`[RPC] Failed to request to ${mockRpcUris[0]} - abci_info`)
    )

    // Clean up environment variable
    delete process.env.RPC_REQUEST_TIMEOUT
  }, 10000)
})
