import { APIParams, APIRequester } from '@initia/initia.js'
import { Responses } from '@cosmjs/tendermint-rpc/build/comet38/adaptor/responses'
import { Params } from '@cosmjs/tendermint-rpc/build/comet38/adaptor/requests'
import { Method } from '@cosmjs/tendermint-rpc/build/comet38/requests'

import * as http from 'http'
import * as https from 'https'
import {
  JsonRpcSuccessResponse,
  isJsonRpcErrorResponse,
  parseJsonRpcResponse,
} from '@cosmjs/json-rpc'
import { metrics } from './metric'
import { getRequestTimeout } from './config'
import { logger } from './logger'

// Use custom rpc client instead of comet38Client to set keepAlive option
export class RPCClient {
  private rpcUris: string[]
  private requestTimeout: number
  private currentIndex = 0

  constructor(rpcUri: string | string[]) {
    this.rpcUris = Array.isArray(rpcUri) ? rpcUri : [rpcUri]
    this.requestTimeout = getRequestTimeout()
  }

  private getRequester(uri: string): APIRequester {
    return new APIRequester(uri, {
      httpAgent: new http.Agent({ keepAlive: true }),
      httpsAgent: new https.Agent({ keepAlive: true }),
      timeout: this.requestTimeout,
    })
  }

  private async request<T>(
    method: 'get' | 'post',
    path: string,
    params?: APIParams,
    retryCount = 0
  ): Promise<{ response: T; uri: string }> {
    const uri = this.rpcUris[this.currentIndex]
    const requester = this.getRequester(uri)
    logger.debug(`[RPC] Making request to ${uri} - ${path}`)

    try {
      let response: T
      if (method === 'post') {
        response = await requester.post(path, params)
      } else {
        response = await requester.get(path, params)
      }
      return { response, uri }
    } catch (error) {
      logger.error(`[RPC] Failed to request to ${uri} - ${path}: ${error}`)
      this.currentIndex = (this.currentIndex + 1) % this.rpcUris.length

      if (this.currentIndex === 0) {
        const backoff = Math.pow(2, retryCount) * 1000 // exponential backoff
        logger.info(`[RPC] All endpoints failed. Retrying in ${backoff}ms`)
        await new Promise((resolve) => setTimeout(resolve, backoff))
        return this.request(method, path, params, retryCount + 1)
      }

      logger.info(`[RPC] Fallback to ${this.rpcUris[this.currentIndex]}`)
      return this.request(method, path, params, retryCount)
    }
  }

  public async abciInfo() {
    const { response, uri } = await this.request<JsonRpcSuccessResponse>(
      'get',
      'abci_info'
    )
    metrics.rpcClient.labels({ uri, path: 'abci_info' }).inc()
    return Responses.decodeAbciInfo(response)
  }

  public async blockResults(height: number) {
    const { response, uri } = await this.request<JsonRpcSuccessResponse>(
      'get',
      'block_results',
      {
        height,
      }
    )
    metrics.rpcClient.labels({ uri, path: 'block_results' }).inc()
    return decodeBlockResults(response)
  }

  public async abciQuery(params: {
    path: string
    data: Uint8Array
    prove: boolean
    height: number
  }) {
    const query = Params.encodeAbciQuery({ method: Method.AbciQuery, params })
    // Convert JsonRpcRequest to APIParams by passing it as a JSON string
    const { response, uri } = await this.request('post', '', { jsonRequest: JSON.stringify(query) })
    metrics.rpcClient.labels({ uri, path: Method.AbciQuery }).inc()
    const parsedResponse = parseJsonRpcResponse(response)
    if (isJsonRpcErrorResponse(parsedResponse)) {
      throw new Error(JSON.stringify(parsedResponse.error))
    }

    return Responses.decodeAbciQuery(parsedResponse)
  }

  public async validators(params: {
    height?: number
    page?: number
    per_page?: number
  }) {
    const { height, page, per_page } = params
    const { response, uri } = await this.request<JsonRpcSuccessResponse>(
      'get',
      'validators',
      {
        height,
        page,
        per_page,
      }
    )
    metrics.rpcClient.labels({ uri, path: 'validators' }).inc()
    return Responses.decodeValidators(response)
  }

  public async validatorsAll(height: number) {
    const validators = []
    let page = 1
    let done = false
    let blockHeight = height

    while (!done) {
      const response = await this.validators({
        per_page: 50,
        height: blockHeight,
        page: page,
      })
      validators.push(...response.validators)
      blockHeight = blockHeight || response.blockHeight
      if (validators.length < response.total) {
        page++
      } else {
        done = true
      }
    }

    return {
      // NOTE: Default value is for type safety but this should always be set
      blockHeight: blockHeight ?? 0,
      count: validators.length,
      total: validators.length,
      validators: validators,
    }
  }

  public async commit(height?: number) {
    const { response, uri } = await this.request<JsonRpcSuccessResponse>(
      'get',
      'commit',
      {
        height,
      }
    )
    metrics.rpcClient.labels({ uri, path: 'commit' }).inc()
    return Responses.decodeCommit(response)
  }

  public async header(height: number): Promise<Header> {
    const { response, uri } = await this.request<{ result: Header }>(
      'get',
      'header',
      {
        height,
      }
    )
    metrics.rpcClient.labels({ uri, path: 'header' }).inc()
    return response.result
  }
}

function decodeBlockResults(
  rpcBlockResult: JsonRpcSuccessResponseGeneric<RpcBlockResultsResponse>
) {
  if (rpcBlockResult.result.finalize_block_events) {
    const begin_block_events: RpcEvent[] = []
    const end_block_events: RpcEvent[] = []
    rpcBlockResult.result.finalize_block_events.map((event) => {
      if (event.attributes) {
        let attribute: RpcEventAttribute | undefined =
          event.attributes[event.attributes.length - 1]
        if (attribute.key !== 'mode') {
          attribute = event.attributes.find((a) => a.key === 'mode')
        }

        if (attribute) {
          if (attribute.value === 'BeginBlock') {
            begin_block_events.push(event)
          } else if (attribute.value === 'EndBlock') {
            end_block_events.push(event)
          } else {
            throw Error(`unknown mode ${JSON.stringify(attribute)}`)
          }
          // handle to support other versions of cometbft
        } else {
          end_block_events.push(event)
        }
      }
    })

    rpcBlockResult.result.begin_block_events = begin_block_events
    rpcBlockResult.result.end_block_events = end_block_events
  }

  return Responses.decodeBlockResults(rpcBlockResult)
}

interface Header {
  header: {
    version: {
      block: string
    }
    chain_id: string
    height: string
    time: string
    last_block_id: {
      hash: string
      parts: {
        total: 1
        hash: string
      }
    }
    last_commit_hash: string
    data_hash: string
    validators_hash: string
    next_validators_hash: string
    consensus_hash: string
    app_hash: string
    last_results_hash: string
    evidence_hash: string
    proposer_address: string
  }
}

interface JsonRpcSuccessResponseGeneric<T> {
  readonly jsonrpc: '2.0'
  readonly id: JsonRpcId
  readonly result: T
}

export type JsonRpcId = number | string

interface RpcBlockResultsResponse {
  height: string
  txs_results: RpcTxData[] | null
  begin_block_events: RpcEvent[] | null
  end_block_events: RpcEvent[] | null
  finalize_block_events: RpcEvent[] | null
}

interface RpcTxData {
  codespace?: string
  code?: number
  log?: string
  /** base64 encoded */
  data?: string
  events?: RpcEvent[]
  gas_wanted?: string
  gas_used?: string
}

interface RpcEvent {
  type: string
  /** Can be omitted (see https://github.com/cosmos/cosmjs/pull/1198) */
  attributes?: RpcEventAttribute[]
}

interface RpcEventAttribute {
  key: string
  value?: string
}