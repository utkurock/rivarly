import { Horizon, TransactionBuilder, Operation, Memo, hash, BASE_FEE } from '@stellar/stellar-sdk';
import { HORIZON_URL, STELLAR_NETWORK } from '../contexts/StellarWalletContext';

const server = new Horizon.Server(HORIZON_URL);
const IS_TESTNET = STELLAR_NETWORK.includes('Test SDF Network');

export type BetSide = 'yes' | 'no';

// Hash memos bound to the acting uid — must match the server's sha256 inputs
// (api/_serverStellar.ts). Binding to uid stops one user replaying another's tx.
const claimMemo = (uid: string): Memo => Memo.hash(hash(Buffer.from(`claim:${uid}`)) as Buffer);
const betMemoObj = (uid: string, marketId: string, side: BetSide): Memo =>
  Memo.hash(hash(Buffer.from(`bet:${side}:${marketId}:${uid}`)) as Buffer);

// Fund a brand-new testnet account via friendbot so it can pay tx fees.
async function fundWithFriendbot(address: string): Promise<void> {
  await fetch(`https://friendbot.stellar.org/?addr=${encodeURIComponent(address)}`);
}

async function loadAccountFunded(address: string) {
  try {
    return await server.loadAccount(address);
  } catch (e: any) {
    const notFound = e?.response?.status === 404 || e?.name === 'NotFoundError';
    if (notFound && IS_TESTNET) {
      await fundWithFriendbot(address);
      // Friendbot can take a moment; retry a few times.
      for (let i = 0; i < 5; i++) {
        try {
          return await server.loadAccount(address);
        } catch {
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
    }
    throw e;
  }
}

export class ClaimTxError extends Error {}

/**
 * Build, sign and submit a memo-tagged, side-effect-free transaction. It's a
 * bumpSequence no-op, so the user only pays the tiny network fee — the point is
 * a real, verifiable on-chain action. Returns the tx hash.
 */
async function submitMemoTx(
  address: string,
  memo: Memo,
  sign: (xdr: string) => Promise<string>
): Promise<string> {
  let account;
  try {
    account = await loadAccountFunded(address);
  } catch {
    throw new ClaimTxError(
      IS_TESTNET
        ? 'Could not load your testnet account. Please try again in a moment.'
        : 'Your account needs a small XLM balance to cover the network fee.'
    );
  }

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: STELLAR_NETWORK,
  })
    // No-op: bumping below the current sequence changes nothing on-chain, so the
    // only cost is the base network fee.
    .addOperation(Operation.bumpSequence({ bumpTo: '0' }))
    .addMemo(memo)
    .setTimeout(120)
    .build();

  let signedXdr: string;
  try {
    signedXdr = await sign(tx.toXDR());
  } catch {
    throw new ClaimTxError('Transaction was not signed.');
  }

  try {
    const signed = TransactionBuilder.fromXDR(signedXdr, STELLAR_NETWORK);
    const res = await server.submitTransaction(signed as any);
    return res.hash;
  } catch {
    throw new ClaimTxError('The network rejected the transaction. Please try again.');
  }
}

/** Daily-claim tx (memo bound to uid). Returns the tx hash. */
export const submitDailyClaimTx = (address: string, uid: string, sign: (xdr: string) => Promise<string>) =>
  submitMemoTx(address, claimMemo(uid), sign);

/** Market prediction tx (memo bound to uid + market + side). Returns the tx hash. */
export const submitBetTx = (address: string, uid: string, marketId: string, side: BetSide, sign: (xdr: string) => Promise<string>) =>
  submitMemoTx(address, betMemoObj(uid, marketId, side), sign);
