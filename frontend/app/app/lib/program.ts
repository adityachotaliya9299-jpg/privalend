import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";
import { AnchorProvider, Program, BN } from "@coral-xyz/anchor";

export const PROGRAM_ID = new PublicKey("7WLWShzAzU747a5WVSTHJ7YUNPGPSyjewetJ5YfNA7Sb");
export const NETWORK = clusterApiUrl("devnet");
export const EXPLORER = "https://explorer.solana.com";

export function getPoolPda(): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("lending_pool")], PROGRAM_ID)[0];
}

export function getPositionPda(owner: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("position"), owner.toBuffer()],
    PROGRAM_ID
  )[0];
}

export function explorerTx(sig: string) {
  return `${EXPLORER}/tx/${sig}?cluster=devnet`;
}

export function explorerAddr(addr: string) {
  return `${EXPLORER}/address/${addr}?cluster=devnet`;
}

export function shortAddr(addr: string) {
  return addr.slice(0, 4) + "..." + addr.slice(-4);
}
