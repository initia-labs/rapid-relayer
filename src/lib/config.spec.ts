import * as fs from 'fs';
import * as path from 'path';
import { loadJsonConfig, loadEnvConfig, mergeConfigs, safeJsonParse, PacketFee } from './config';

describe('Configuration Loading', () => {
  const originalEnv = { ...process.env };
  const tempConfigFile = path.join(__dirname, 'temp-config.json');

  beforeEach(() => {
    process.env = { ...originalEnv };
    if (fs.existsSync(tempConfigFile)) {
      fs.unlinkSync(tempConfigFile);
    }
  });

  afterAll(() => {
    process.env = originalEnv;
    if (fs.existsSync(tempConfigFile)) {
      fs.unlinkSync(tempConfigFile);
    }
  });

  describe('safeJsonParse', () => {
    it('should parse valid JSON correctly', () => {
      const result = safeJsonParse('{"test": 123}', {});
      expect(result).toEqual({ test: 123 });
    });

    it('should return default value for invalid JSON', () => {
      const defaultValue = { default: true };
      const result = safeJsonParse('invalid json', defaultValue);
      expect(result).toBe(defaultValue);
    });
  });

  describe('loadJsonConfig', () => {
    it('should return empty object when config file does not exist', () => {
      process.env.CONFIGFILE = './nonexistent-file.json';
      const config = loadJsonConfig();
      expect(config).toEqual({});
    });

    it('should parse and return config from file', () => {
      const mockConfig = {
        port: 3000,
        metricPort: 9090,
        logLevel: 'info',
        chains: []
      };

      fs.writeFileSync(tempConfigFile, JSON.stringify(mockConfig));
      process.env.CONFIGFILE = tempConfigFile;

      const config = loadJsonConfig();
      expect(config).toEqual(mockConfig);
    });

    it('should throw error when JSON parsing fails', () => {
      fs.writeFileSync(tempConfigFile, 'invalid json');
      process.env.CONFIGFILE = tempConfigFile;

      expect(() => loadJsonConfig()).toThrow(/Error loading JSON config/);
    });
  });

  describe('loadEnvConfig', () => {
    it('should load top-level properties from environment variables', () => {
      process.env.PORT = '3000';
      process.env.METRIC_PORT = '9090';
      process.env.LOG_LEVEL = 'debug';
      process.env.RPC_REQUEST_TIMEOUT = '5000';
      process.env.DB_PATH = './data/db';

      const config = loadEnvConfig();

      expect(config).toEqual({
        port: 3000,
        metricPort: 9090,
        logLevel: 'debug',
        rpcRequestTimeout: 5000,
        dbPath: './data/db'
      });
    });

    it('should parse CHAINS env var if available', () => {
      const mockChains = [
        {
          chainId: 'test-chain-1',
          bech32Prefix: 'test',
          gasPrice: '0.01',
          restUri: 'http://localhost:1317',
          rpcUri: 'http://localhost:26657',
          wallets: [
            {
              key: {
                type: 'raw' as const,
                privateKey: 'testkey'
              }
            }
          ]
        }
      ];

      process.env.CHAINS = JSON.stringify(mockChains);

      const config = loadEnvConfig();

      expect(config.chains).toEqual(mockChains);
    });

    it('should parse individual chain configurations from env vars', () => {
      // Setup chain env vars
      process.env.CHAIN_1_CHAIN_ID = 'test-chain-1';
      process.env.CHAIN_1_BECH32_PREFIX = 'test';
      process.env.CHAIN_1_GAS_PRICE = '0.01';
      process.env.CHAIN_1_REST_URI = 'http://localhost:1317';
      process.env.CHAIN_1_RPC_URI = 'http://localhost:26657';

      // Setup wallet env vars
      process.env.CHAIN_1_WALLET_1_KEY_TYPE = 'raw';
      process.env.CHAIN_1_WALLET_1_KEY_PRIVATE_KEY = 'testkey';

      const config = loadEnvConfig();

      expect(config.chains).toHaveLength(1);
      expect(config.chains?.[0]).toEqual({
        chainId: 'test-chain-1',
        bech32Prefix: 'test',
        gasPrice: '0.01',
        restUri: 'http://localhost:1317',
        rpcUri: 'http://localhost:26657',
        wallets: [
          {
            key: {
              type: 'raw',
              privateKey: 'testkey'
            }
          }
        ]
      });
    });

    it('should parse RPC URI as array when formatted as JSON array', () => {
      process.env.CHAIN_1_CHAIN_ID = 'test-chain-1';
      process.env.CHAIN_1_BECH32_PREFIX = 'test';
      process.env.CHAIN_1_GAS_PRICE = '0.01';
      process.env.CHAIN_1_REST_URI = 'http://localhost:1317';
      process.env.CHAIN_1_RPC_URI = '["http://localhost:26657", "http://localhost:26658"]';

      // Setup wallet env vars
      process.env.CHAIN_1_WALLET_1_KEY_TYPE = 'raw';
      process.env.CHAIN_1_WALLET_1_KEY_PRIVATE_KEY = 'testkey';

      const config = loadEnvConfig();

      expect(config.chains?.[0].rpcUri).toEqual([
        'http://localhost:26657',
        'http://localhost:26658'
      ]);
    });

    it('should parse fee filter from env vars', () => {
      const feeFilter: PacketFee = {
        recvFee: [{ denom: 'token', amount: 100 }],
        ackFee: [{ denom: 'token', amount: 50 }]
      };

      process.env.CHAIN_1_CHAIN_ID = 'test-chain-1';
      process.env.CHAIN_1_BECH32_PREFIX = 'test';
      process.env.CHAIN_1_GAS_PRICE = '0.01';
      process.env.CHAIN_1_REST_URI = 'http://localhost:1317';
      process.env.CHAIN_1_RPC_URI = 'http://localhost:26657';
      process.env.CHAIN_1_FEE_FILTER = JSON.stringify(feeFilter);

      // Setup wallet env vars
      process.env.CHAIN_1_WALLET_1_KEY_TYPE = 'raw';
      process.env.CHAIN_1_WALLET_1_KEY_PRIVATE_KEY = 'testkey';

      const config = loadEnvConfig();

      expect(config.chains?.[0].feeFilter).toEqual(feeFilter);
    });

    it('should parse wallets from CHAIN_X_WALLETS env var', () => {
      const wallets = [
        {
          key: {
            type: 'raw' as const,
            privateKey: 'testkey1'
          },
          maxHandlePacket: 10
        },
        {
          key: {
            type: 'mnemonic' as const,
            privateKey: 'testkey2',
            options: {
              account: 0,
              index: 0
            }
          }
        }
      ];

      process.env.CHAIN_1_CHAIN_ID = 'test-chain-1';
      process.env.CHAIN_1_BECH32_PREFIX = 'test';
      process.env.CHAIN_1_GAS_PRICE = '0.01';
      process.env.CHAIN_1_REST_URI = 'http://localhost:1317';
      process.env.CHAIN_1_RPC_URI = 'http://localhost:26657';
      process.env.CHAIN_1_WALLETS = JSON.stringify(wallets);

      const config = loadEnvConfig();

      expect(config.chains?.[0].wallets).toEqual(wallets);
    });

    it('should parse individual wallet configurations from env vars', () => {
      process.env.CHAIN_1_CHAIN_ID = 'test-chain-1';
      process.env.CHAIN_1_BECH32_PREFIX = 'test';
      process.env.CHAIN_1_GAS_PRICE = '0.01';
      process.env.CHAIN_1_REST_URI = 'http://localhost:1317';
      process.env.CHAIN_1_RPC_URI = 'http://localhost:26657';

      // First wallet
      process.env.CHAIN_1_WALLET_1_KEY_TYPE = 'raw';
      process.env.CHAIN_1_WALLET_1_KEY_PRIVATE_KEY = 'testkey1';
      process.env.CHAIN_1_WALLET_1_MAX_HANDLE_PACKET = '10';
      process.env.CHAIN_1_WALLET_1_START_HEIGHT = '100';

      // Second wallet with options
      process.env.CHAIN_1_WALLET_2_KEY_TYPE = 'mnemonic';
      process.env.CHAIN_1_WALLET_2_KEY_PRIVATE_KEY = 'testkey2';
      process.env.CHAIN_1_WALLET_2_KEY_OPTIONS_ACCOUNT = '1';
      process.env.CHAIN_1_WALLET_2_KEY_OPTIONS_INDEX = '2';
      process.env.CHAIN_1_WALLET_2_KEY_OPTIONS_COIN_TYPE = '118';

      const config = loadEnvConfig();

      expect(config.chains?.[0].wallets).toHaveLength(2);
      expect(config.chains?.[0].wallets?.[0]).toEqual({
        key: {
          type: 'raw',
          privateKey: 'testkey1'
        },
        maxHandlePacket: 10,
        startHeight: 100
      });

      expect(config.chains?.[0].wallets?.[1]).toEqual({
        key: {
          type: 'mnemonic',
          privateKey: 'testkey2',
          options: {
            account: 1,
            index: 2,
            coinType: 118
          }
        }
      });
    });

    it('should parse wallet key options from JSON string', () => {
      const keyOptions = { account: 3, index: 4, coinType: 118 };

      process.env.CHAIN_1_CHAIN_ID = 'test-chain-1';
      process.env.CHAIN_1_BECH32_PREFIX = 'test';
      process.env.CHAIN_1_GAS_PRICE = '0.01';
      process.env.CHAIN_1_REST_URI = 'http://localhost:1317';
      process.env.CHAIN_1_RPC_URI = 'http://localhost:26657';

      process.env.CHAIN_1_WALLET_1_KEY_TYPE = 'mnemonic';
      process.env.CHAIN_1_WALLET_1_KEY_PRIVATE_KEY = 'testkey';
      process.env.CHAIN_1_WALLET_1_KEY_OPTIONS = JSON.stringify(keyOptions);

      const config = loadEnvConfig();

      expect(config.chains?.[0].wallets?.[0].key.options).toEqual(keyOptions);
    });

    it('should parse packet filter from env vars', () => {
      const packetFilter = { sourceChannel: 'channel-0' };

      process.env.CHAIN_1_CHAIN_ID = 'test-chain-1';
      process.env.CHAIN_1_BECH32_PREFIX = 'test';
      process.env.CHAIN_1_GAS_PRICE = '0.01';
      process.env.CHAIN_1_REST_URI = 'http://localhost:1317';
      process.env.CHAIN_1_RPC_URI = 'http://localhost:26657';

      process.env.CHAIN_1_WALLET_1_KEY_TYPE = 'raw';
      process.env.CHAIN_1_WALLET_1_KEY_PRIVATE_KEY = 'testkey';
      process.env.CHAIN_1_WALLET_1_PACKET_FILTER = JSON.stringify(packetFilter);

      const config = loadEnvConfig();

      expect(config.chains?.[0].wallets?.[0].packetFilter).toEqual(packetFilter);
    });

    it('should skip chains with missing required properties', () => {
      // Missing gasPrice
      process.env.CHAIN_1_CHAIN_ID = 'test-chain-1';
      process.env.CHAIN_1_BECH32_PREFIX = 'test';
      // No GAS_PRICE
      process.env.CHAIN_1_REST_URI = 'http://localhost:1317';
      process.env.CHAIN_1_RPC_URI = 'http://localhost:26657';

      process.env.CHAIN_1_WALLET_1_KEY_TYPE = 'raw';
      process.env.CHAIN_1_WALLET_1_KEY_PRIVATE_KEY = 'testkey';

      const config = loadEnvConfig();

      expect(config.chains).toBeUndefined();
    });
  });

  describe('mergeConfigs', () => {
    it('should merge json and env configs with env taking priority', () => {
      const jsonConfig = {
        port: 3000,
        metricPort: 9090,
        logLevel: 'info',
        dbPath: './data/db1',
        chains: [
          {
            chainId: 'test-chain-1',
            bech32Prefix: 'test',
            gasPrice: '0.01',
            restUri: 'http://localhost:1317',
            rpcUri: 'http://localhost:26657',
            wallets: [
              {
                key: {
                  type: 'raw' as const,
                  privateKey: 'testkey1'
                }
              }
            ]
          }
        ]
      };

      const envConfig = {
        port: 4000,
        dbPath: './data/db2',
        rpcRequestTimeout: 5000,
        chains: [
          {
            chainId: 'test-chain-2',
            bech32Prefix: 'test2',
            gasPrice: '0.02',
            restUri: 'http://localhost:1318',
            rpcUri: 'http://localhost:26658',
            wallets: [
              {
                key: {
                  type: 'raw' as const,
                  privateKey: 'testkey2'
                }
              }
            ]
          }
        ]
      };

      const mergedConfig = mergeConfigs(jsonConfig, envConfig);

      expect(mergedConfig).toEqual({
        port: 4000, // from env
        metricPort: 9090, // from json
        logLevel: 'info', // from json
        dbPath: './data/db2', // from env
        rpcRequestTimeout: 5000, // from env
        chains: envConfig.chains // from env
      });
    });

    it('should throw error when required properties are missing', () => {
      const jsonConfig = {
        port: 3000
      };

      const envConfig = {
        logLevel: 'info'
      };

      expect(() => mergeConfigs(jsonConfig, envConfig)).toThrow(
        /Missing required configuration properties/
      );
    });

    it('should not throw error when all required properties are present', () => {
      const config = {
        port: 3000,
        metricPort: 9090,
        logLevel: 'info',
        chains: [
          {
            chainId: 'test-chain-1',
            bech32Prefix: 'test',
            gasPrice: '0.01',
            restUri: 'http://localhost:1317',
            rpcUri: 'http://localhost:26657',
            wallets: [
              {
                key: {
                  type: 'raw' as const,
                  privateKey: 'testkey'
                }
              }
            ]
          }
        ]
      };

      expect(() => mergeConfigs(config, {})).not.toThrow();
    });
  });
});
