# IBC Relayer
This is a repo for the IBC Relayer that does not use the `tx_search` query and handles packets from several blocks at once. The Initia Team modified Hermes, only using the necessary function for packet handling. 

### Problems We Faced
- For example, on Tucana (Minitia), some accounts generated packets every block. Heremes handled the batch but only for the packets in a single block. 
- New packets were generated every block at a 500ms interval.
- Hermes handled them sequentially that unprocessed packets kept accumulating.
- If Hermes stops, uprocessed packets will be accumulated more. 
- Hermes uses the `tx_search` query to handle these but this takes a significant amount of time.
- In cases of spamming, this can be a problem because the query becomes very slow.

### How We Fix This
- We removed the `tx_search` query, and parallelly handles packets from several blocks at once. 
- This is done by using two components: packet handler and event feeder. The event feeder feeds the packet from new blocks to cache and the packet handler fetches packets from it. This way, even if the packet handler stops, the event feeder will feed the packets to handle. 


## Installation

### 1. Clone the repository

```bash
git clone https://github.com/initia-labs/ibc-relayer.git
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

## SyncInfo

IBC-relayer checks events and stores processed information in `.syncInfo`. To move migrate relayer to other, please copy `.syncInfo`
