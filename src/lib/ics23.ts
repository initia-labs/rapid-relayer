import { CommitmentProof } from '@initia/initia.proto/cosmos/ics23/v1/proofs'
import { MerkleProof } from '@initia/initia.proto/ibc/core/commitment/v1/commitment'
import { ProofOps } from '@initia/initia.proto/tendermint/crypto/proof'

export function convertProofsToIcs23(ops: ProofOps): Uint8Array {
  const proofs = ops.ops.map((op) => CommitmentProof.decode(op.data))
  const resp = MerkleProof.fromPartial({
    proofs,
  })
  return MerkleProof.encode(resp).finish()
}
