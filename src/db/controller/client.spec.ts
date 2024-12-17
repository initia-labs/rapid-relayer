import { ClientTable } from 'src/types'
import { DB } from '..'
import { insert } from '../utils'
import { mockServers } from 'src/test/testSetup'
import { ClientController } from './client'

describe('client controller', () => {
  mockServers // to set set config file
  test('client controller e2e', async () => {
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
})
