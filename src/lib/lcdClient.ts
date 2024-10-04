import {
  APIRequester,
  Channel,
  IbcAPI as IbcAPI_,
  LCDClientConfig,
  LCDClient as LCDClient_,
} from '@initia/initia.js'
import { Order, State } from '@initia/initia.proto/ibc/core/channel/v1/channel'
import { ClientState, ConnectionInfo } from 'src/types'

export class LCDClient extends LCDClient_ {
  public ibc: IbcAPI
  constructor(
    URL: string,
    config?: LCDClientConfig,
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

  async getConnection(connectionId: string): Promise<ConnectionInfo> {
    return this.c.get<ConnectionInfo>(
      `/ibc/core/connection/v1/connections/${connectionId}`
    )
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
  }
  proof: null | string
  proof_height: {
    revision_number: number
    revision_height: number
  }
}
