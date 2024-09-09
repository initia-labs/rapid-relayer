# Rapid Relayer
Rapid Relayer is a fast, scalable, stateful IBC Relayer optimized for interwoven rollups.

Rapid Relayer does not use the `tx_search` query of Hermes to handle packets from several blocks at once. Initia Labs has developed this IBC Relayer to replace Hermes, only using the necessary functions for packet handling. 

### Problems We Faced
- Minitia L2s generate blocks extremely quick at 500ms per block.
- Due to the interwoven nature of Initia, often many IBC packets are generated within blocks. Hermes can handle batches of packets but on a single block basis.
- Hermes handles these IBC packets sequentially leading to unprocessed packets accumulating very quickly when having fast blocktimes.
- If Hermes stops, unprocessed packets will continue to pile up. 
- When Hermes misses a packet, it finds them using `tx_search` query on every sequence, this can take minutes for just a few hundred packets.
- We need something more rapid.

### How We Fix This
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
  "port": 3000,
  "logLevel": "info",
  "pairs": [
    {
      "name": "chainA - chainB", // default chainA.chainId - chainB.chainId
      "chainA": {
        "bech32Prefix": "init", // bech 32 prefix
        "chainId": "chain-1", // chainId
        "gasPrice": "0.2uinit", // gas price
        "lcdUri": "http://rest.chain-1.com", // lcd (rest) uri
        "rpcUri": "http://rpc.chain-1.com", // rpc uri
        "key": {
          "type": "raw", // raw | mnemonic
          "privateKey": "12af.." // for raw hex based private key, for mnemonic 12/24 words
        },
        "connectionId": "connection-1", // connection id to relay
        "syncInfo": {
          "height": 12345, // synced height
          "txIndex": 30 // synced tx index
        } // Optional, If a syncInfo file exists, this field is ignored.
      },
      "chainB": {
        "bech32Prefix": "init",
        "chainId": "chain-2",
        "gasPrice": "0umin",
        "lcdUri": "http://rest.chain-2.com",
        "rpcUri": "http://rpc.chain-2.com",
        "key": {
          "type": "mnemonic",
          "privateKey": "bus ..."
        },
        "connectionId": "connection-0"
      }
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
```bash
docker run -it -v/tmp/rr/config:/config -d  test
```
this should start the relayer in a docker container using your config.

## SyncInfo

rapid-relayer checks events and stores processed information in `.syncInfo`. To move migrate relayer to other, please copy `.syncInfo`
