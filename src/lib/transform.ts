import { Height as CosmjsHeight } from 'cosmjs-types/ibc/core/client/v1/client'
import { Height as InitiajsHeight } from '@initia/initia.js'

export class Transfrom {
  static height(height: CosmjsHeight): InitiajsHeight
  static height(height: InitiajsHeight): CosmjsHeight

  static height(
    height: InitiajsHeight | CosmjsHeight
  ): InitiajsHeight | CosmjsHeight {
    if (height instanceof InitiajsHeight) {
      return CosmjsHeight.fromPartial({
        revisionHeight: BigInt(height.revision_height),
        revisionNumber: BigInt(height.revision_number),
      })
    } else {
      return new InitiajsHeight(
        Number(height.revisionNumber),
        Number(height.revisionHeight)
      )
    }
  }
}
