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
