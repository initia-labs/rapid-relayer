import { Height as CosmjsHeight } from "cosmjs-types/ibc/core/client/v1/client";
import { Height as InitiajsHeight } from "@initia/initia.js";

export class Transfrom {
  static height(height: CosmjsHeight): InitiajsHeight;
  static height(height: InitiajsHeight): CosmjsHeight;

  static height(height: any): any {
    if (typeof height.revision_number === "number") {
      return CosmjsHeight.fromPartial({
        revisionHeight: BigInt(height.revisionHeight),
        revisionNumber: BigInt(height.revisionNumber),
      });
    } else {
      return new InitiajsHeight(
        Number(height.revisionNumber),
        Number(height.revisionHeight)
      );
    }
  }
}
