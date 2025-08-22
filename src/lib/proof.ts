import { ics23 } from '@confio/ics23'
import { tendermint34 } from '@cosmjs/tendermint-rpc'
import { Height } from 'cosmjs-types/ibc/core/client/v1/client'
import { ProofOps } from 'cosmjs-types/tendermint/crypto/proof'
import { ChainWorker } from 'src/workers/chain'
import { CommitmentProof } from 'cosmjs-types/cosmos/ics23/v1/proofs'
import { MerkleProof } from 'cosmjs-types/ibc/core/commitment/v1/commitment'

export async function getRawProof(
  chain: ChainWorker,
  queryKey: Uint8Array,
  proofHeight: Height
): Promise<ProofOps> {
  const queryHeight = Number(proofHeight.revisionHeight - 1n)

  const { height, proof, code, log } = await chain.rpc.abciQuery({
    path: `/store/ibc/key`,
    data: queryKey,
    prove: true,
    height: queryHeight,
  })

  if (code) {
    throw new Error(`Query failed with (${code}): ${log}`)
  }

  if (!height) {
    throw new Error('No query height returned')
  }
  if (!proof || proof.ops.length !== 2) {
    throw new Error(
      `Expected 2 proof ops, got ${
        proof?.ops.length ?? 0
      }. Are you using stargate?`
    )
  }

  // we don't need the results, but we can ensure the data is the proper format
  checkAndParseOp(proof.ops[0], 'ics23:iavl')
  checkAndParseOp(proof.ops[1], 'ics23:simple')

  return {
    ops: [...proof.ops],
  }
}

export async function getChannelProof(
  chain: ChainWorker,
  portId: string,
  channelId: string,
  headerHeight: Height
): Promise<string> {
  const key = new Uint8Array(
    Buffer.from(`channelEnds/ports/${portId}/channels/${channelId}`)
  )
  const proof = await getRawProof(chain, key, headerHeight)
  const ics23Proof = convertProofsToIcs23(proof)

  return Buffer.from(ics23Proof).toString('base64')
}

export async function getUpgradeProof(
  chain: ChainWorker,
  portId: string,
  channelId: string,
  headerHeight: Height
): Promise<string> {
  const key = new Uint8Array(
    Buffer.from(`channelUpgrades/upgrades/ports/${portId}/channels/${channelId}`)
  )
  const proof = await getRawProof(chain, key, headerHeight)
  const ics23Proof = convertProofsToIcs23(proof)

  return Buffer.from(ics23Proof).toString('base64')
}

export async function getUpgradeErrorProof(
  chain: ChainWorker,
  portId: string,
  channelId: string,
  headerHeight: Height
): Promise<string> {
  const key = new Uint8Array(
    Buffer.from(`channelUpgrades/upgradeErrors/ports/${portId}/channels/${channelId}`)
  )
  const proof = await getRawProof(chain, key, headerHeight)
  const ics23Proof = convertProofsToIcs23(proof)

  return Buffer.from(ics23Proof).toString('base64')
}

export function convertProofsToIcs23(ops: ProofOps): Uint8Array {
  const proofs = ops.ops.map((op) => CommitmentProof.decode(op.data))
  const resp = MerkleProof.fromPartial({
    proofs,
  })
  return MerkleProof.encode(resp).finish()
}

function checkAndParseOp(
  op: tendermint34.ProofOp,
  kind: string
): ics23.CommitmentProof {
  if (op.type !== kind) {
    throw new Error(`Op expected to be ${kind}, got "${op.type}`)
  }

  return ics23.CommitmentProof.decode(op.data)
}
