import { getSignedHeader } from './signedHeader'
import { MsgUpdateClient } from '@initia/initia.js/dist/core/ibc/core/client/msgs'
import { Header } from 'cosmjs-types/ibc/lightclients/tendermint/v1/tendermint'
import {
  ValidatorSet,
  Validator,
} from 'cosmjs-types/tendermint/types/validator'
import { Height } from 'cosmjs-types/ibc/core/client/v1/client'
import { delay } from 'bluebird'
import { ChainWorker } from 'src/workers/chain'

export async function generateMsgUpdateClient(
  srcChain: ChainWorker,
  dstChain: ChainWorker,
  dstClientId: string,
  executorAddress: string
): Promise<{
  msg: MsgUpdateClient
  height: Height
}> {
  const latestHeight = Number(
    ((await dstChain.lcd.ibc.clientState(dstClientId)) as ClientState)
      .client_state.latest_height.revision_height
  )
  const signedHeader = await getSignedHeader(srcChain)
  const header = signedHeader.header
  if (header === undefined) {
    throw Error('Header not found')
  }
  const currentHeight = Number(header.height)
  const validatorSet = await getValidatorSet(srcChain, currentHeight)
  const trustedHeight = getRevisionHeight(latestHeight, header.chainId)
  const trustedValidators = await getValidatorSet(srcChain, latestHeight + 1)

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
  let block = await chain.lcd.tendermint
    .blockInfo(height)
    .catch(() => undefined)
  let count = 0
  while (block === undefined) {
    block = await chain.lcd.tendermint.blockInfo(height).catch((e) => {
      if (count > 5) {
        throw e
      }
      return undefined
    })
    await delay(100)
    count++
  }
  const proposerAddress = block.block.header.proposer_address
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
    (val) => Buffer.from(val.address).toString('base64') === proposerAddress
  )

  return ValidatorSet.fromPartial({
    validators: mappedValidators,
    totalVotingPower,
    proposer,
  })
}

interface ClientState {
  client_state: {
    latest_height: {
      revision_height: string
    }
  }
}
