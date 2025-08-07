import { getSignedHeader } from './signedHeader'
import { MsgUpdateClient } from '@initia/initia.js'
import { Header } from 'cosmjs-types/ibc/lightclients/tendermint/v1/tendermint'
import {
  ValidatorSet,
  Validator,
} from 'cosmjs-types/tendermint/types/validator'
import { Height } from 'cosmjs-types/ibc/core/client/v1/client'
import { setTimeout as delay } from 'timers/promises'
import { ChainWorker } from 'src/workers/chain'
import { BlockIDFlag, SignedHeader } from 'cosmjs-types/tendermint/types/types'

// generateMsgUpdateClient generates a MsgUpdateClient message
// which is used to update the client state on the destination chain
// with the latest header from the source chain and the latest validator set.
export async function generateMsgUpdateClient(
  srcChain: ChainWorker,
  dstChain: ChainWorker,
  dstClientId: string,
  executorAddress: string
): Promise<{
  msg: MsgUpdateClient
  height: Height
}> {
  const lastRevisionHeight = Number(
    ((await dstChain.rest.ibc.clientState(dstClientId)) as ClientState)
      .client_state.latest_height.revision_height
  )

  let signedHeader = await getSignedHeader(srcChain)

  const header = signedHeader.header
  if (header === undefined) {
    throw Error('Header not found')
  }
  const currentHeight = Number(header.height)
  const validatorSet = await getValidatorSet(srcChain, currentHeight)
  const trustedHeight = getRevisionHeight(lastRevisionHeight, header.chainId)
  const trustedValidators = await getValidatorSet(
    srcChain,
    lastRevisionHeight + 1
  )

  // Keep querying until there is enough voting power
  // Retry up to MAX_RETRY times in case the current height doesn't have sufficient voting power
  const MAX_RETRY = 30
  for (let i = 0; i < MAX_RETRY; i++) {
    if (verifyVotingPower(signedHeader, validatorSet, trustedValidators)) break
    signedHeader = await getSignedHeader(srcChain, currentHeight)
    await delay(500)
  }

  const tmHeader = {
    typeUrl: '/ibc.lightclients.tendermint.v1.Header',
    value: Header.encode(
      Header.fromPartial({
        signedHeader,
        validatorSet,
        trustedHeight,
        trustedValidators,
      })
    ).finish(),
  }

  const revisionHeight = getRevisionHeight(currentHeight, header.chainId)

  return {
    msg: new MsgUpdateClient(dstClientId, tmHeader, executorAddress),
    height: revisionHeight,
  }
}

const regexRevNum = new RegExp('-([1-9][0-9]*)$')

export function parseRevisionNumber(chainId: string): bigint {
  const match = chainId.match(regexRevNum)
  if (match && match.length >= 2) {
    return BigInt(match[1])
  }
  return BigInt(0)
}

export function getRevisionHeight(height: number, chainId: string): Height {
  return Height.fromPartial({
    revisionHeight: BigInt(height),
    revisionNumber: parseRevisionNumber(chainId),
  })
}

async function getValidatorSet(
  chain: ChainWorker,
  height: number
): Promise<ValidatorSet> {
  let header = await chain.rpc.header(height).catch(() => undefined)
  let count = 0
  while (header === undefined) {
    header = await chain.rpc.header(height).catch((e) => {
      if (count > 5) {
        throw e
      }
      return undefined
    })
    await delay(100)
    count++
  }
  const proposerAddress = header.header.proposer_address
  // we need to query the header to find out who the proposer was, and pull them out
  const validators = await chain.rpc.validatorsAll(height)
  let totalVotingPower = BigInt(0)
  const mappedValidators: Validator[] = validators.validators.map((val) => {
    const validator = {
      address: val.address,
      pubKey: val.pubkey
        ? val.pubkey?.algorithm === 'ed25519'
          ? {
              ed25519: val.pubkey.data,
            }
          : {
              secp256k1: val.pubkey.data,
            }
        : {},
      votingPower: val.votingPower,
      proposerPriority: val.proposerPriority
        ? BigInt(val.proposerPriority)
        : BigInt(0),
    }

    totalVotingPower = totalVotingPower + val.votingPower
    return validator
  })

  const proposer: Validator | undefined = mappedValidators.find(
    (val) =>
      Buffer.from(val.address).toString('hex').toLowerCase() ===
      proposerAddress.toLowerCase()
  )

  return ValidatorSet.fromPartial({
    validators: mappedValidators,
    totalVotingPower,
    proposer,
  })
}

function verifyVotingPower(
  signedHeader: SignedHeader,
  validatorSet: ValidatorSet,
  trustedValidators: ValidatorSet
): boolean {
  function bigIntMulDivCeil(a: bigint, b: bigint, c: bigint): bigint {
    const mul = a * b
    return mul / c + (mul % c === 0n ? 0n : 1n)
  }

  function hexAddr(addr: Uint8Array): string {
    return Buffer.from(addr).toString('hex')
  }

  // calculate target voting power
  const targetVotingPower = bigIntMulDivCeil(
    trustedValidators.totalVotingPower,
    2n,
    3n
  )

  // calculate voting power
  const signatures = signedHeader.commit?.signatures ?? []
  const votingPower = validatorSet.validators.reduce((p, c) => {
    const validatorAddr = hexAddr(c.address)

    const isTrusted = trustedValidators.validators.find(
      (validator) => hexAddr(validator.address) === validatorAddr
    )

    // if validator is not in trusted validator
    if (!isTrusted) {
      return p
    }

    const signature = signatures.find(
      (sig) => hexAddr(sig.validatorAddress) === validatorAddr
    )

    // if signature not found
    if (!signature) {
      return p
    }

    // if not commit
    if (signature.blockIdFlag !== BlockIDFlag.BLOCK_ID_FLAG_COMMIT) {
      return p
    }

    return p + c.votingPower
  }, 0n)

  return votingPower >= targetVotingPower
}

interface ClientState {
  client_state: {
    latest_height: {
      revision_height: string
    }
  }
}
