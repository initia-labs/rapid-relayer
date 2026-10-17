import { ClientTable } from 'src/types'
import { DB } from '..'
import { insert } from '../utils'
import { mockServers } from 'src/test/testSetup'
import { ClientController } from './client'

describe('client controller', () => {
  void mockServers // to set set config file
  test('client controller e2e', () => {
    const currentTimestamp = Math.floor(new Date().valueOf() / 1000)
    // add clients for test
    const testClients: ClientTable[] = [
      {
        chain_id: 'chain-1',
        client_id: 'client-1',
        counterparty_chain_id: 'chain-2',
        revision_height: 1,
        trusting_period: 3000,
        last_update_time: currentTimestamp - 2500, // need update
      },

      {
        chain_id: 'chain-1',
        client_id: 'client-2',
        counterparty_chain_id: 'chain-2',
        revision_height: 1,
        trusting_period: 3000,
        last_update_time: currentTimestamp - 500, // do not need to update
      },

      {
        chain_id: 'chain-1',
        client_id: 'client-3',
        counterparty_chain_id: 'chain-2',
        revision_height: 1,
        trusting_period: 3000,
        last_update_time: currentTimestamp - 3500, // expired
      },
    ]

    testClients.map((client) => {
      insert(DB, ClientController.tableName, client)
    })

    // get clients to update
    const clientsToUpdate = ClientController.getClientsToUpdate('chain-1', [
      'chain-2',
    ])

    // check clients to update
    expect(clientsToUpdate.map((v) => v.client_id)).toEqual(['client-1'])
  })

  test('non-tendermint client is registered as untracked', async () => {
    const rest = mockServers[0].rest.client()

    // tendermint client still resolves fully
    const tm = await ClientController.addClient(
      rest,
      'chain-1',
      '07-tendermint-1'
    )
    expect(tm.counterparty_chain_id).toEqual('chain-2')
    expect(tm.trusting_period).toEqual(3000)

    // solo machine client: lastConsensusState would 4xx; must not throw
    const sm = await ClientController.addClient(
      rest,
      'chain-1',
      '06-solomachine-1'
    )
    expect(sm).toEqual({
      chain_id: 'chain-1',
      client_id: '06-solomachine-1',
      counterparty_chain_id: '',
      trusting_period: 0,
      revision_height: 0,
      last_update_time: 0,
    })

    // and it never shows up as a client to update for any configured chain
    const clientsToUpdate = ClientController.getClientsToUpdate('chain-1', [
      'chain-2',
      '',
    ])
    expect(clientsToUpdate.map((v) => v.client_id)).not.toContain(
      '06-solomachine-1'
    )
  })
})
