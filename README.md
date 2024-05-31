# IBC Relayer

IBC relayer without tx search

## Installation

clone the repository

```bash
git clone https://github.com/initia-labs/ibc-relayer.git
```

install dependencies

```bash
npm install
```

## Usage

### 1. set config

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

### 2. run relayer

```bash
npm start
```

## SyncInfo

IBC-relayer checks events and stores processed information in `.syncInfo`. If you want to move migrate relayer to other, you have to copy `.syncInfo`
