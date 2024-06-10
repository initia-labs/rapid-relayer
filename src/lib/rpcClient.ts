import { APIRequester } from "@initia/initia.js";
import { Responses } from "@cosmjs/tendermint-rpc/build/comet38/adaptor/responses";
import { Params } from "@cosmjs/tendermint-rpc/build/comet38/adaptor/requests";
import { Method } from "@cosmjs/tendermint-rpc/build/comet38/requests";

import * as http from "http";
import * as https from "https";
import { isJsonRpcErrorResponse, parseJsonRpcResponse } from "@cosmjs/json-rpc";
import { metrics } from "./metric";

// Use custom rpc client instead of comet38Client to set keepAlive option
export class RPCClient {
  public requester: APIRequester;
  public baseUri: string;
  constructor(rpcUri: string) {
    this.requester = new APIRequester(rpcUri, {
      httpAgent: new http.Agent({ keepAlive: true }),
      httpsAgent: new https.Agent({ keepAlive: true }),
      timeout: 60000,
    });
    this.baseUri = rpcUri;
  }

  public async abciInfo() {
    const rawResponse: any = await this.requester.get("abci_info");
    metrics.rpcClient.labels({ uri: this.baseUri, path: "abci_info" }).inc();
    return Responses.decodeAbciInfo(rawResponse);
  }

  public async blockResults(height: number) {
    const rawResponse: any = await this.requester.get("block_results", {
      height,
    });
    metrics.rpcClient
      .labels({ uri: this.baseUri, path: "block_results" })
      .inc();
    return Responses.decodeBlockResults(rawResponse);
  }

  public async abciQuery(params: {
    path: string;
    data: Uint8Array;
    prove: boolean;
    height: number;
  }) {
    const query = Params.encodeAbciQuery({ method: Method.AbciQuery, params });
    const response = parseJsonRpcResponse(await this.requester.post("", query));
    metrics.rpcClient
      .labels({ uri: this.baseUri, path: Method.AbciQuery })
      .inc();
    if (isJsonRpcErrorResponse(response)) {
      throw new Error(JSON.stringify(response.error));
    }

    return Responses.decodeAbciQuery(response);
  }

  public async validators(params: {
    height?: number;
    page?: number;
    per_page?: number;
  }) {
    const { height, page, per_page } = params;
    const rawResponse: any = await this.requester.get("validators", {
      height,
      page,
      per_page,
    });
    metrics.rpcClient.labels({ uri: this.baseUri, path: "validators" }).inc();

    return Responses.decodeValidators(rawResponse);
  }

  public async validatorsAll(height: number) {
    const validators = [];
    let page = 1;
    let done = false;
    let blockHeight = height;

    while (!done) {
      const response = await this.validators({
        per_page: 50,
        height: blockHeight,
        page: page,
      });
      validators.push(...response.validators);
      blockHeight = blockHeight || response.blockHeight;
      if (validators.length < response.total) {
        page++;
      } else {
        done = true;
      }
    }

    return {
      // NOTE: Default value is for type safety but this should always be set
      blockHeight: blockHeight ?? 0,
      count: validators.length,
      total: validators.length,
      validators: validators,
    };
  }

  public async commit(height: number) {
    const rawResponse: any = await this.requester.get("commit", {
      height,
    });
    metrics.rpcClient.labels({ uri: this.baseUri, path: "commit" }).inc();

    return Responses.decodeCommit(rawResponse);
  }

  public async header(height: number): Promise<Header> {
    const rawResponse: any = await this.requester.get("header", {
      height,
    });
    metrics.rpcClient.labels({ uri: this.baseUri, path: "header" }).inc();

    return rawResponse.result;
  }
}

interface Header {
  header: {
    version: {
      block: string;
    };
    chain_id: string;
    height: string;
    time: string;
    last_block_id: {
      hash: string;
      parts: {
        total: 1;
        hash: string;
      };
    };
    last_commit_hash: string;
    data_hash: string;
    validators_hash: string;
    next_validators_hash: string;
    consensus_hash: string;
    app_hash: string;
    last_results_hash: string;
    evidence_hash: string;
    proposer_address: string;
  };
}
