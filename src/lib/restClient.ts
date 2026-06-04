import {
  APIRequester,
  IbcAPI as IbcAPI_,
  RESTClientConfig,
  RESTClient as RESTClient_,
} from '@initia/initia.js'
import { Order, State } from '@initia/initia.proto/ibc/core/channel/v1/channel'
import { logger } from './logger'
import { ClientState, ConnectionInfo } from 'src/types'

export type RESTUri = string | string[]

type APIRequesterConfig = ConstructorParameters<typeof APIRequester>[1]
type RESTParams = Parameters<APIRequester['get']>[1]
type RESTHeaders = Parameters<APIRequester['get']>[2]
type RESTData = Parameters<APIRequester['post']>[1]
type RESTRequesterOptions = APIRequester | APIRequesterConfig
interface RESTRequestState {
  restUris: string[]
  preferredIndex: number
  requesterConfig?: APIRequesterConfig
}

const MAX_RETRY = 10

const normalizeRestUris = (URL: RESTUri): string[] => {
  const restUris = (Array.isArray(URL) ? URL : [URL]).map((uri) => uri.trim())

  if (restUris.length === 0 || restUris.some((uri) => uri === '')) {
    throw new Error(
      'REST URI list must contain at least one non-empty endpoint'
    )
  }

  return restUris
}

const getHttpStatus = (error: unknown): number | undefined => {
  if (typeof error !== 'object' || error === null) {
    return undefined
  }

  const response = (error as { response?: { status?: unknown } }).response
  return typeof response?.status === 'number' ? response.status : undefined
}

export class RESTClient extends RESTClient_ {
  public ibc: IbcAPI

  constructor(
    URL: RESTUri,
    config?: RESTClientConfig,
    requesterOptions?: RESTRequesterOptions
  ) {
    const requestState: RESTRequestState = {
      restUris: normalizeRestUris(URL),
      preferredIndex: 0,
      requesterConfig:
        requesterOptions instanceof APIRequester ? undefined : requesterOptions,
    }
    const apiRequester =
      requesterOptions instanceof APIRequester
        ? requesterOptions
        : RESTClient.createApiRequester(requestState)

    super(requestState.restUris[0], config, apiRequester)

    this.ibc = new IbcAPI(this.apiRequester)
  }

  private static createApiRequester(state: RESTRequestState): APIRequester {
    const client = RESTClient.getRequester(state.restUris[0], state)

    client.getRaw = async <T>(
      endpoint: string,
      params?: RESTParams
    ): Promise<T> => {
      const { response } = await RESTClient.request<T>(
        state,
        'getRaw',
        endpoint,
        params
      )
      return response
    }

    client.get = async <T>(
      endpoint: string,
      params?: RESTParams,
      headers?: RESTHeaders
    ): Promise<T> => {
      const { response } = await RESTClient.request<T>(
        state,
        'get',
        endpoint,
        params,
        headers
      )
      return response
    }

    client.post = async <T>(endpoint: string, data?: RESTData): Promise<T> => {
      const { response } = await RESTClient.request<T>(
        state,
        'post',
        endpoint,
        data
      )
      return response
    }

    return client
  }

  private static getRequester(
    uri: string,
    state: RESTRequestState
  ): APIRequester {
    return new APIRequester(uri, state.requesterConfig)
  }

  private static async request<T>(
    state: RESTRequestState,
    method: 'getRaw' | 'get' | 'post',
    endpoint: string,
    query?: RESTParams | RESTData,
    headers?: RESTHeaders
  ): Promise<{ response: T; uri: string }> {
    let retryCount = 0
    const startIndex = state.preferredIndex
    let currentIndex = startIndex

    while (true) {
      const uri = state.restUris[currentIndex]

      try {
        let response: T
        const requester = RESTClient.getRequester(uri, state)

        if (method === 'post') {
          response = await requester.post<T>(endpoint, query)
        } else if (method === 'getRaw') {
          response = await requester.getRaw<T>(endpoint, query as RESTParams)
        } else {
          response = await requester.get<T>(
            endpoint,
            query as RESTParams,
            headers
          )
        }

        state.preferredIndex = currentIndex
        return { response, uri }
      } catch (error) {
        const errorContext = `[REST] Failed to request to ${uri} - ${endpoint}`

        logger.error(`${errorContext}: ${String(error)}`)

        const httpStatus = getHttpStatus(error)
        if (httpStatus !== undefined && httpStatus >= 400 && httpStatus < 500) {
          throw error
        }

        currentIndex = (currentIndex + 1) % state.restUris.length

        if (currentIndex === startIndex) {
          let backoff = Math.pow(2, retryCount) * 1000
          if (backoff > 10000) {
            backoff = 10 * 1000
          }

          logger.info(`[REST] All endpoints failed. Retrying in ${backoff}ms`)
          await new Promise((resolve) => setTimeout(resolve, backoff))
          retryCount++
          if (retryCount > MAX_RETRY) {
            logger.error(`[REST] Max Retry Reached.`)
            throw error
          }
        } else {
          logger.info(`[REST] Fallback to ${state.restUris[currentIndex]}`)
        }
      }
    }
  }
}

class IbcAPI extends IbcAPI_ {
  constructor(c: APIRequester) {
    super(c)
  }

  async channel(portId: string, channelId: string): Promise<ChannelResponse> {
    const rawRes = await this.c.get<ChannelResponseRaw>(
      `/ibc/core/channel/v1/channels/${channelId}/ports/${portId}`
    )

    const state =
      State[rawRes.channel.state as keyof typeof State] || State.UNRECOGNIZED
    const ordering =
      Order[rawRes.channel.ordering as keyof typeof Order] || Order.UNRECOGNIZED

    return {
      channel: {
        state,
        ordering,
        counterparty: rawRes.channel.counterparty,
        connection_hops: rawRes.channel.connection_hops,
        version: rawRes.channel.version,
      },
      proof: rawRes.proof,
      proof_height: rawRes.proof_height,
    }
  }

  async getClientState(clientId: string): Promise<ClientState> {
    return this.c.get<ClientState>(
      `/ibc/core/client/v1/client_states/${clientId}`
    )
  }

  async lastConsensusState(clientId: string) {
    return this.c.get<ConsState>(
      `/ibc/core/client/v1/consensus_states/${clientId}/revision/0/height/0`,
      { latest_height: 'true' }
    )
  }

  async getConnection(connectionId: string): Promise<ConnectionInfo> {
    return this.c.get<ConnectionInfo>(
      `/ibc/core/connection/v1/connections/${connectionId}`
    )
  }

  async nextSequence(portId: string, channelId: string): Promise<NextSequence> {
    return this.c.get<NextSequence>(
      `/ibc/core/channel/v1/channels/${channelId}/ports/${portId}/next_sequence`
    )
  }
}

interface ChannelResponse {
  // initia.js@1.1.0 changed `Channel.Data.state`/`ordering` to `string`. We keep
  // proto enums here so downstream comparisons (e.g. `=== State.STATE_CLOSED`)
  // stay type-safe; the string→enum conversion happens in `channel()` above.
  channel: {
    state: State
    ordering: Order
    counterparty?: {
      port_id: string
      channel_id: string
    }
    connection_hops: string[]
    version: string
  }
  proof: null | string
  proof_height: {
    revision_number: number
    revision_height: number
  }
}

interface ChannelResponseRaw {
  channel: {
    state: string
    ordering: string
    counterparty?: {
      port_id: string
      channel_id: string
    }
    connection_hops: string[]
    version: string
  }
  proof: null | string
  proof_height: {
    revision_number: number
    revision_height: number
  }
}

interface NextSequence {
  next_sequence_receive: string
  proof: null | string
  proof_height: {
    revision_number: string
    revision_height: string
  }
}

interface ConsState {
  consensus_state: {
    '@type': string
    timestamp: string
    root: {
      hash: string
    }
    next_validators_hash: string
  }
  proof: null | string
  proof_height: {
    revision_number: string
    revision_height: string
  }
}
