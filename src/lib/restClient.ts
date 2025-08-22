import {
  APIRequester,
  Channel,
  ErrorReceipt,
  IbcAPI as IbcAPI_,
  RESTClientConfig,
  RESTClient as RESTClient_,
  Upgrade,
} from '@initia/initia.js'
import {
  Order,
  orderToJSON,
  State,
  stateToJSON,
} from '@initia/initia.proto/ibc/core/channel/v1/channel'
import { ClientState, ConnectionInfo } from 'src/types'

export class RESTClient extends RESTClient_ {
  public ibc: IbcAPI
  constructor(
    URL: string,
    config?: RESTClientConfig,
    apiRequester?: APIRequester
  ) {
    super(URL, config, apiRequester)

    this.ibc = new IbcAPI(this.apiRequester)
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
        state: stateToJSON(state),
        ordering: orderToJSON(ordering),
        counterparty: rawRes.channel.counterparty,
        connection_hops: rawRes.channel.connection_hops,
        version: rawRes.channel.version,
        upgrade_sequence: rawRes.channel.upgrade_sequence,
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

  async getUpgrade(portId: string, channelId: string): Promise<Upgrade> {
    return this.c.get<Upgrade>(
      `/ibc/core/channel/v1/channels/${channelId}/ports/${portId}/upgrade`
    )
  }

  async getUpgradeError(
    portId: string,
    channelId: string
  ): Promise<UpgradeErrorResponse> {
    return this.c.get<UpgradeErrorResponse>(
      `/ibc/core/channel/v1/channels/${channelId}/ports/${portId}/upgrade_error`
    )
  }
}

interface UpgradeErrorResponse {
  error_receipt: ErrorReceipt.Data
  proof: null | string
  proof_height: {
    revision_number: number
    revision_height: number
  }
}

interface ChannelResponse {
  channel: Channel.Data
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
    upgrade_sequence: string
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
