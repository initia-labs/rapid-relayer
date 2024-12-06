export interface ClientState {
  client_state: {
    chain_id: string
    trusting_period: string
    latest_height: {
      revision_height: string
    }
  }
}

export interface ConnectionInfo {
  connection: {
    client_id: string
    counterparty: {
      client_id: string
      connection_id: string
    }
  }
}
