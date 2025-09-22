import { Registry, Counter, collectDefaultMetrics, Gauge } from 'prom-client'

export const registry = new Registry()

collectDefaultMetrics({ register: registry })

export const metrics = {
  chain: createChainMetric(),
  rpcClient: register(
    new Counter({
      labelNames: ['uri', 'path'],
      name: 'relayer_rpc_client_query',
      help: 'rpc client query counter',
    })
  ),
}

function createChainMetric(): ChainMetric {
  const labelNames = ['chainId', 'connectionId']
  return {
    heights: {
      latestHeight: register(
        new Gauge({
          labelNames: ['chainId'],
          name: 'relayer_latest_height',
          help: 'fetched latest height',
        })
      ),
      lastSyncedHeight: register(
        new Gauge({
          labelNames: ['chainId'],
          name: 'relayer_last_synced_height',
          help: 'highest indexed height among the sync infos',
        })
      ),
    },
    latestHeightWorker: register(
      new Counter({
        labelNames,
        name: 'relayer_latest_height_worker',
        help: 'latest height worker counter',
      })
    ),

    eventFeederWorker: {
      sendPacket: register(
        new Counter({
          labelNames,
          name: 'relayer_send_packet_event_feed',
          help: 'send packet event feed counter',
        })
      ),
      writeAck: register(
        new Counter({
          labelNames,
          name: 'relayer_write_acknowledgement_event_feed',
          help: 'write acknowledgement event feed counter',
        })
      ),
    },

    handlePacketWorker: {
      updateClientMsg: register(
        new Counter({
          labelNames,
          name: 'relayer_update_client_msg',
          help: 'update client msg counter',
        })
      ),
      recvMsg: register(
        new Counter({
          labelNames,
          name: 'relayer_recv_msg',
          help: 'recv msg counter',
        })
      ),
      timeoutMsg: register(
        new Counter({
          labelNames,
          name: 'relayer_timeout_msg',
          help: 'timeout msg counter',
        })
      ),
      ackMsg: register(
        new Counter({
          labelNames,
          name: 'relayer_ack_msg',
          help: 'ack msg counter',
        })
      ),
    },
  }
}

interface ChainMetric {
  heights: {
    latestHeight: Gauge
    lastSyncedHeight: Gauge // highest synced height among the sync infos
  }
  latestHeightWorker: Counter
  eventFeederWorker: {
    sendPacket: Counter
    writeAck: Counter
  }
  handlePacketWorker: {
    updateClientMsg: Counter
    recvMsg: Counter
    timeoutMsg: Counter
    ackMsg: Counter
  }
}

function register<T extends Gauge | Counter>(metric: T): T {
  registry.registerMetric(metric)
  return metric
}
