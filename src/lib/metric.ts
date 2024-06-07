import { Registry, Counter, collectDefaultMetrics } from "prom-client";

export const registery = new Registry();

collectDefaultMetrics({ register: registery });

export const metrics = {
  chain: createChainMetric(),
  rpcClient: register(
    new Counter({
      labelNames: ["uri", "path"],
      name: "rpc_client_query",
      help: "rpc client query counter",
    })
  ),
};

function createChainMetric(): ChainMetric {
  const labelNames = ["chainId", "connectionId"];
  return {
    latestHeightWorker: register(
      new Counter({
        labelNames,
        name: "latest_height_worker",
        help: "latest height worker counter",
      })
    ),

    eventFeederWorker: {
      sendPacket: register(
        new Counter({
          labelNames,
          name: "send_packet_event_feed",
          help: "send packet event feed counter",
        })
      ),
      writeAck: register(
        new Counter({
          labelNames,
          name: "write_acknowledgement_event_feed",
          help: "write acknowledgement event feed counter",
        })
      ),
    },

    handlePacketWorker: {
      updateClientMsg: register(
        new Counter({
          labelNames,
          name: "update_client_msg",
          help: "update client msg counter",
        })
      ),
      recvMsg: register(
        new Counter({
          labelNames,
          name: "recv_msg",
          help: "recv msg counter",
        })
      ),
      timeoutMsg: register(
        new Counter({
          labelNames,
          name: "timeout_msg",
          help: "timeout msg counter",
        })
      ),
      ackMsg: register(
        new Counter({
          labelNames,
          name: "ack_msg",
          help: "ack msg counter",
        })
      ),
    },
  };
}

interface ChainMetric {
  latestHeightWorker: Counter;
  eventFeederWorker: {
    sendPacket: Counter;
    writeAck: Counter;
  };
  handlePacketWorker: {
    updateClientMsg: Counter;
    recvMsg: Counter;
    timeoutMsg: Counter;
    ackMsg: Counter;
  };
}

function register(metric: any): any {
  registery.registerMetric(metric);
  return metric;
}
