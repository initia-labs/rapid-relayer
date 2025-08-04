# Rapid Relayer

Rapid Relayer is a fast, scalable, stateful IBC Relayer optimized for interwoven rollups.

Rapid Relayer does not use the `tx_search` query of Hermes to handle packets from several blocks at once. Initia Labs has developed this IBC Relayer to replace Hermes, only using the necessary functions for packet handling.

## Problems We Faced

- Minitia L2s generate blocks extremely quick at 500ms per block.
- Due to the interwoven nature of Initia, often many IBC packets are generated within blocks. Hermes can handle batches of packets but on a single block basis.
- Hermes handles these IBC packets sequentially leading to unprocessed packets accumulating very quickly when having fast blocktimes.
- If Hermes stops, unprocessed packets will continue to pile up.
- When Hermes misses a packet, it finds them using `tx_search` query on every sequence, this can take minutes for just a few hundred packets.
- We need something more rapid.

## How We Fix This

- We removed the `tx_search` query, and handle packets in parallel across several blocks at once.
- Keep track of `synced_height` and `latest_height`.
- Multi-threaded workers: packet handler and event feeder. The event feeder feeds the packet from new blocks to a cache and the packet handler fetches packets from it. This way, even if the packet handler stops, the event feeder will continue to operate.
- We remove the slow call of `tx_search`.

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/initia-labs/rapid-relayer.git
```

### 2. Install dependencies

```bash
npm install
```

## Usage

### 1. Set config

```json
{
  "$schema": "./config.schema.json",
  "port": 7010,
  "metricPort": 70001,
  "logLevel": "info",
  "rpcRequestTimeout": 5000,
  "chains": [
    {
      "bech32Prefix": "init",
      "chainId": "chain-1",
      "gasPrice": "0.15gas",
      "restUri": "https://rest.chain-1.com",
      "rpcUri": ["https://rpc.chain-1.com", "https://rpc.chain-1.com/fallback"],
      "wallets": [
        {
          "key": {
            "type": "raw",
            "privateKey": "123..."
          },
          "maxHandlePacket": 10,
          "startHeight": 0 // if empty start from the latest height
        },
        {
          "key": {
            "type": "mnemonic",
            "privateKey": "repair family apology column ..."
          },
          "maxHandlePacket": 10,
          "packetFilter": {
            "connections": [{ "connectionId": "conneciton-1" }]
          }
        }
      ],
      "feeFilter": {
        "recvFee": [{ "denom": "gas", "amount": 100 }],
        "timeoutFee": [{ "denom": "gas", "amount": 200 }],
        "ackFee": [{ "denom": "gas", "amount": 300 }]
      }
    },
    {
      "bech32Prefix": "init",
      "chainId": "chain-2",
      "gasPrice": "0umin",
      "restUri": "https://rest.chain-2.com",
      "rpcUri": ["https://rpc.chain-2.com", "https://rpc.chain-2.com/fallback"],
      "wallets": [
        {
          "key": {
            "type": "raw",
            "privateKey": "123..."
          },
          "maxHandlePacket": 10
        }
      ]
    }
  ]
}
```

### 2. Run relayer

```bash
npm start
```

## Install via docker

```bash
docker build -t  your-tag .
```

mount a volume called '/config' which contains your config.json
and a /syncInfo volume which will contain the state

```bash
docker run -it -v/tmp/rr/config:/config -v/tmp/rr/syncInfo:/syncInfo -d  rapid-relayer:latest
```

this should start the relayer in a docker container using your config, and placing the state in a separate volume

## RAFT-Based Cluster Mode

Rapid Relayer supports running in cluster mode using the RAFT consensus algorithm for high availability and leader election. This allows multiple relayer nodes to coordinate, ensuring only one leader node executes transactions, while all nodes stay in sync.

### 1. Brief Description
- **Cluster mode** uses RAFT for automatic leader election and failover.
- Only the leader node executes transactions; followers stay in sync and can take over if the leader fails.
- Supports both single-node and multi-node clusters.

### 2. How to Configure

Add a `raft` section to your config (example for single-node and multi-node):

#### Single Node (for development/testing)
```json
"raft": {
  "nodeId": "node1",
  "host": "127.0.0.1",
  "port": 4001,
  "peers": []
}
```

#### Multi-Node Cluster
Each node must have a unique `id`, its own `host`/`port`, and list all other nodes in `peers`:
```json
"raft": {
  "nodeId": "node1",
  "host": "10.0.0.1",
  "port": 4001,
  "peers": [
    { "id": "node2", "host": "10.0.0.2", "port": 4002 },
    { "id": "node3", "host": "10.0.0.3", "port": 4003 }
  ]
}
```
- Repeat for each node, changing `id`, `host`, and `port` accordingly.

### 3. How to Run
- Start each node with its own config (with correct `raft` section).
- Nodes will automatically discover each other, elect a leader, and synchronize.
- You can run a single node for development, or multiple nodes for production/high-availability.

#### Example (single node):
```bash
npm start
```

#### Example (multi-node, on different machines or ports):
```bash
# On node1
npm start -- --config config-node1.json
# On node2
npm start -- --config config-node2.json
# On node3
npm start -- --config config-node3.json
```

### 4. How to Test
- **Single node:** The node will elect itself as leader and process transactions normally.
- **Multi-node:**
  - Start all nodes. Check logs for messages like `became LEADER` and `heartbeat`.
  - Stop the leader node; another node should be elected as leader automatically.
  - All nodes should log their state and election/heartbeat events.
- You can check cluster status and leadership in the logs.

---
