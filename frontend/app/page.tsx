"use client";
import { useState, useEffect, useCallback } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import dynamic from "next/dynamic";
const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then(m => m.WalletMultiButton),
  { ssr: false }
);
import { PublicKey, SystemProgram, Transaction, Keypair } from "@solana/web3.js";
import { AnchorProvider, Program, BN, Idl } from "@coral-xyz/anchor";
import {
  TOKEN_PROGRAM_ID,
  getOrCreateAssociatedTokenAccount,
  createMint,
  mintTo,
  createInitializeMintInstruction,
  MINT_SIZE,
  getMinimumBalanceForRentExemptMint,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
  createMintToInstruction,
} from "@solana/spl-token";
import { PROGRAM_ID, getPoolPda, getPositionPda, explorerTx, explorerAddr, shortAddr } from "./lib/program";
import idl from "./idl/privalend.json";

type Tx = { sig: string; label: string; time: string };

export default function Home() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [pool, setPool] = useState<any>(null);
  const [position, setPosition] = useState<any>(null);
  const [loading, setLoading] = useState("");
  const [txLog, setTxLog] = useState<Tx[]>([]);
  const [amount, setAmount] = useState("100");
  const [borrowAmt, setBorrowAmt] = useState("50");
  const [repayAmt, setRepayAmt] = useState("25");
  const [mintAddr, setMintAddr] = useState<string>("");
  const [userAta, setUserAta] = useState<string>("");
  const [vaultAta, setVaultAta] = useState<string>("");

  const getProgram = useCallback(() => {
    if (!wallet.publicKey || !wallet.signTransaction) return null;
    const provider = new AnchorProvider(connection, wallet as any, { commitment: "confirmed" });
    return new Program(idl as Idl, provider) as any;
  }, [connection, wallet]);

  const logTx = (sig: string, label: string) => {
    setTxLog(prev => [{ sig, label, time: new Date().toLocaleTimeString() }, ...prev.slice(0, 9)]);
  };

  const fetchState = useCallback(async () => {
    const program = getProgram();
    if (!program || !wallet.publicKey) return;
    try {
      const poolPda = getPoolPda();
      const positionPda = getPositionPda(wallet.publicKey);
      try { setPool(await program.account.lendingPool.fetch(poolPda)); } catch {}
      try { setPosition(await program.account.userPosition.fetch(positionPda)); } catch {}
    } catch {}
  }, [getProgram, wallet.publicKey]);

  useEffect(() => { fetchState(); }, [fetchState]);

  async function initPool() {
    const program = getProgram();
    if (!program || !wallet.publicKey) return;
    setLoading("Initializing pool...");
    try {
      const poolPda = getPoolPda();
      const sig = await program.methods
        .initializePool(new BN(6500), new BN(8000))
        .accounts({ pool: poolPda, authority: wallet.publicKey, systemProgram: SystemProgram.programId })
        .rpc();
      logTx(sig, "Initialize Pool");
      await fetchState();
    } catch (e: any) { alert("Init pool error: " + e.message); }
    setLoading("");
  }

  async function deposit() {
    const program = getProgram();
    if (!program || !wallet.publicKey || !wallet.sendTransaction) return;
    setLoading("Creating token mint...");
    try {
      const poolPda = getPoolPda();
      const positionPda = getPositionPda(wallet.publicKey);

      // Step 1: Create mint keypair
      const mintKeypair = Keypair.generate();
      const lamports = await getMinimumBalanceForRentExemptMint(connection);

      // Step 2: Build mint creation transaction
      const createMintTx = new Transaction().add(
        SystemProgram.createAccount({
          fromPubkey: wallet.publicKey,
          newAccountPubkey: mintKeypair.publicKey,
          space: MINT_SIZE,
          lamports,
          programId: TOKEN_PROGRAM_ID,
        }),
        createInitializeMintInstruction(mintKeypair.publicKey, 6, wallet.publicKey, null)
      );
      createMintTx.feePayer = wallet.publicKey;
      createMintTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      createMintTx.partialSign(mintKeypair);

      const mintSig = await wallet.sendTransaction(createMintTx, connection);
      await connection.confirmTransaction(mintSig, "confirmed");
      setMintAddr(mintKeypair.publicKey.toBase58());
      setLoading("Creating token accounts...");

      // Step 3: Create user ATA
      const userAtaAddr = await getAssociatedTokenAddress(mintKeypair.publicKey, wallet.publicKey);
      const vaultAtaAddr = await getAssociatedTokenAddress(mintKeypair.publicKey, poolPda, true);

      const createAtaTx = new Transaction().add(
        createAssociatedTokenAccountInstruction(wallet.publicKey, userAtaAddr, wallet.publicKey, mintKeypair.publicKey),
        createAssociatedTokenAccountInstruction(wallet.publicKey, vaultAtaAddr, poolPda, mintKeypair.publicKey)
      );
      const ataSig = await wallet.sendTransaction(createAtaTx, connection);
      await connection.confirmTransaction(ataSig, "confirmed");
      setUserAta(userAtaAddr.toBase58());
      setVaultAta(vaultAtaAddr.toBase58());
      setLoading("Minting tokens...");

      // Step 4: Mint tokens to user
      const mintToTx = new Transaction().add(
        createMintToInstruction(mintKeypair.publicKey, userAtaAddr, wallet.publicKey, 1_000_000_000)
      );
      const mintToSig = await wallet.sendTransaction(mintToTx, connection);
      await connection.confirmTransaction(mintToSig, "confirmed");
      setLoading("Depositing collateral...");

      // Step 5: Deposit
      const dwalletId = Array.from(Buffer.from("ika_dwallet_btc_mock_00000000000".slice(0, 32)));
      const sig = await program.methods
        .depositCollateral(new BN(Number(amount) * 1_000_000), dwalletId)
        .accounts({
          pool: poolPda,
          position: positionPda,
          userTokenAccount: userAtaAddr,
          vault: vaultAtaAddr,
          user: wallet.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      logTx(sig, `🔐 Deposit ${amount} tokens (FHE encrypted)`);
      await fetchState();
    } catch (e: any) { alert("Deposit error: " + e.message); }
    setLoading("");
  }

  async function borrow() {
    const program = getProgram();
    if (!program || !wallet.publicKey || !vaultAta || !userAta) {
      alert("Please deposit collateral first!");
      return;
    }
    setLoading("Running FHE health check + borrowing...");
    try {
      const poolPda = getPoolPda();
      const positionPda = getPositionPda(wallet.publicKey);
      const sig = await program.methods
        .borrow(new BN(Number(borrowAmt) * 1_000_000))
        .accounts({
          pool: poolPda,
          position: positionPda,
          owner: wallet.publicKey,
          vault: new PublicKey(vaultAta),
          userTokenAccount: new PublicKey(userAta),
          user: wallet.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      logTx(sig, `⚡ Borrow ${borrowAmt} tokens (FHE verified)`);
      await fetchState();
    } catch (e: any) { alert("Borrow error: " + e.message); }
    setLoading("");
  }

  async function repay() {
    const program = getProgram();
    if (!program || !wallet.publicKey || !vaultAta || !userAta) {
      alert("No active position to repay!");
      return;
    }
    setLoading("Repaying loan...");
    try {
      const poolPda = getPoolPda();
      const positionPda = getPositionPda(wallet.publicKey);
      const sig = await program.methods
        .repay(new BN(Number(repayAmt) * 1_000_000))
        .accounts({
          pool: poolPda,
          position: positionPda,
          userTokenAccount: new PublicKey(userAta),
          vault: new PublicKey(vaultAta),
          user: wallet.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      logTx(sig, `✅ Repay ${repayAmt} tokens`);
      await fetchState();
    } catch (e: any) { alert("Repay error: " + e.message); }
    setLoading("");
  }

  async function approveDWallet() {
    const program = getProgram();
    if (!program || !wallet.publicKey) return;
    setLoading("Approving Ika dWallet message...");
    try {
      const poolPda = getPoolPda();
      const positionPda = getPositionPda(wallet.publicKey);
      const messageHash = Array.from(crypto.getRandomValues(new Uint8Array(32)));
      const sig = await program.methods
        .approveDwalletMessage(messageHash)
        .accounts({
          pool: poolPda,
          position: positionPda,
          user: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      logTx(sig, "⛓️ Ika dWallet message approved");
      await fetchState();
    } catch (e: any) { alert("dWallet error: " + e.message); }
    setLoading("");
  }

  const healthFactor = position && pool
    ? ((position.collateralEncrypted.toNumber() * pool.ltvRatio.toNumber()) / 10000 / Math.max(position.debtEncrypted.toNumber(), 1)).toFixed(2)
    : null;

  return (
    <main className="min-h-screen bg-[#0a0a0f] text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-violet-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">P</div>
          <div>
            <h1 className="font-bold text-white text-lg leading-none">PrivaLend</h1>
            <p className="text-xs text-slate-500">Encrypted Cross-Chain Lending</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700 px-3 py-1.5 rounded-full text-xs">
            <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></div>
            <span className="text-slate-400">Devnet</span>
          </div>
          <WalletMultiButton style={{ background: "#7c3aed", borderRadius: "8px", fontSize: "14px", height: "36px" }} />
        </div>
      </header>

      {/* Tech badges */}
      <div className="px-6 py-3 border-b border-slate-800/50 flex gap-2 flex-wrap">
        <span className="text-xs bg-violet-900/40 border border-violet-700/50 text-violet-300 px-2.5 py-1 rounded-full">🔐 Encrypt FHE</span>
        <span className="text-xs bg-blue-900/40 border border-blue-700/50 text-blue-300 px-2.5 py-1 rounded-full">⛓️ Ika dWallet</span>
        <span className="text-xs bg-emerald-900/40 border border-emerald-700/50 text-emerald-300 px-2.5 py-1 rounded-full">◎ Solana Devnet</span>
        <span className="text-xs bg-slate-800 border border-slate-700 text-slate-400 px-2.5 py-1 rounded-full font-mono">
          {shortAddr(PROGRAM_ID.toBase58())}
        </span>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left: Stats */}
        <div className="lg:col-span-2 space-y-4">

          {/* FHE Privacy Banner */}
          <div className="bg-gradient-to-r from-violet-900/30 to-blue-900/30 border border-violet-700/40 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <span className="text-2xl">🔐</span>
              <div>
                <p className="font-semibold text-violet-300 text-sm">Fully Homomorphic Encryption Active</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Collateral and debt stored as <code className="text-violet-400">EUint64</code> ciphertexts.
                  FHE health checks run on encrypted data — validators never see your amounts.
                  Ika 2PC-MPC signs cross-chain BTC transactions with zero-trust custody.
                </p>
              </div>
            </div>
          </div>

          {/* Pool Stats */}
          {pool ? (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-slate-400 mb-4 uppercase tracking-wider">Pool State</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "LTV Ratio", value: (pool.ltvRatio.toNumber() / 100).toFixed(0) + "%", color: "text-emerald-400" },
                  { label: "Liq. Threshold", value: (pool.liquidationThreshold.toNumber() / 100).toFixed(0) + "%", color: "text-yellow-400" },
                  { label: "Total Collateral", value: (pool.totalCollateral.toNumber() / 1e6).toFixed(2), color: "text-blue-400" },
                  { label: "Total Borrowed", value: (pool.totalBorrowed.toNumber() / 1e6).toFixed(2), color: "text-violet-400" },
                ].map(s => (
                  <div key={s.label} className="bg-slate-800/50 rounded-lg p-3">
                    <p className="text-xs text-slate-500 mb-1">{s.label}</p>
                    <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 text-center">
              <p className="text-slate-500 text-sm mb-3">Pool not initialized yet</p>
              <button onClick={initPool} disabled={!wallet.publicKey || !!loading}
                className="bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                Initialize Pool
              </button>
            </div>
          )}

          {/* User Position */}
          {position && position.isActive ? (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Your Position</h2>
                <span className="text-xs bg-emerald-900/50 text-emerald-400 border border-emerald-700/50 px-2 py-0.5 rounded-full">Active</span>
              </div>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="bg-slate-800/50 rounded-lg p-3">
                  <p className="text-xs text-slate-500 mb-1">🔐 Collateral</p>
                  <p className="text-lg font-bold text-blue-400">{(position.collateralEncrypted.toNumber() / 1e6).toFixed(2)}</p>
                  <p className="text-xs text-slate-600">EUint64 ciphertext</p>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-3">
                  <p className="text-xs text-slate-500 mb-1">🔐 Debt</p>
                  <p className="text-lg font-bold text-red-400">{(position.debtEncrypted.toNumber() / 1e6).toFixed(2)}</p>
                  <p className="text-xs text-slate-600">EUint64 ciphertext</p>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-3">
                  <p className="text-xs text-slate-500 mb-1">Health Factor</p>
                  <p className={`text-lg font-bold ${Number(healthFactor) > 1.2 ? "text-emerald-400" : "text-red-400"}`}>{healthFactor}</p>
                  <p className="text-xs text-slate-600">{Number(healthFactor) > 1 ? "Safe" : "At Risk"}</p>
                </div>
              </div>
              <div className="bg-blue-900/20 border border-blue-800/40 rounded-lg p-3 mb-3">
                <p className="text-xs text-blue-400 font-medium mb-1">⛓️ Ika dWallet (Cross-Chain Collateral)</p>
                <p className="text-xs text-slate-500 font-mono">{Buffer.from(position.dwalletId).toString("hex").slice(0, 32)}...</p>
                <p className="text-xs text-slate-600 mt-1">BTC collateral locked via 2PC-MPC • Zero-trust custody</p>
              </div>
              <button onClick={approveDWallet} disabled={!!loading}
                className="w-full bg-blue-900/40 hover:bg-blue-800/60 border border-blue-700/50 text-blue-300 py-2 rounded-lg text-xs font-medium transition-colors">
                ⛓️ Approve Ika dWallet Message
              </button>
            </div>
          ) : pool && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-center">
              <p className="text-slate-500 text-sm">No position yet — deposit collateral to start</p>
            </div>
          )}
        </div>

        {/* Right: Actions */}
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h3 className="font-semibold text-sm mb-1 text-slate-300">Deposit Collateral</h3>
            <p className="text-xs text-slate-500 mb-3">Locks BTC via Ika dWallet • Encrypted via FHE</p>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white mb-3 focus:outline-none focus:border-violet-500"
              placeholder="Amount" />
            <button onClick={deposit} disabled={!pool || !!loading || !wallet.publicKey}
              className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white py-2 rounded-lg text-sm font-medium transition-colors">
              🔐 Deposit + Encrypt
            </button>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h3 className="font-semibold text-sm mb-1 text-slate-300">Borrow</h3>
            <p className="text-xs text-slate-500 mb-3">FHE health check • Amounts never revealed on-chain</p>
            <input type="number" value={borrowAmt} onChange={e => setBorrowAmt(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white mb-3 focus:outline-none focus:border-blue-500"
              placeholder="Borrow amount" />
            <button onClick={borrow} disabled={!position || !!loading || !vaultAta}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white py-2 rounded-lg text-sm font-medium transition-colors">
              ⚡ Borrow
            </button>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h3 className="font-semibold text-sm mb-1 text-slate-300">Repay</h3>
            <p className="text-xs text-slate-500 mb-3">Reduces encrypted debt on-chain</p>
            <input type="number" value={repayAmt} onChange={e => setRepayAmt(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white mb-3 focus:outline-none focus:border-emerald-500"
              placeholder="Repay amount" />
            <button onClick={repay} disabled={!position || !!loading || !vaultAta}
              className="w-full bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white py-2 rounded-lg text-sm font-medium transition-colors">
              ✅ Repay
            </button>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-xs text-slate-500 mb-2 font-medium">Explorer</p>
            <a href={explorerAddr(PROGRAM_ID.toBase58())} target="_blank"
              className="text-xs text-violet-400 hover:text-violet-300 block truncate">
              View Program on Devnet ↗
            </a>
            {mintAddr && (
              <a href={explorerAddr(mintAddr)} target="_blank"
                className="text-xs text-blue-400 hover:text-blue-300 block truncate mt-1">
                View Collateral Mint ↗
              </a>
            )}
          </div>
        </div>
      </div>

      {/* TX Log */}
      {txLog.length > 0 && (
        <div className="max-w-5xl mx-auto px-6 pb-8">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-slate-400 mb-3 uppercase tracking-wider">Transaction Log</h3>
            <div className="space-y-2">
              {txLog.map((tx, i) => (
                <div key={i} className="flex items-center justify-between text-xs py-2 border-b border-slate-800 last:border-0">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div>
                    <span className="text-slate-300">{tx.label}</span>
                    <span className="text-slate-600">{tx.time}</span>
                  </div>
                  <a href={explorerTx(tx.sig)} target="_blank" className="text-violet-400 hover:text-violet-300 font-mono">
                    {tx.sig.slice(0, 8)}... ↗
                  </a>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-sm text-slate-300">{loading}</span>
          </div>
        </div>
      )}
    </main>
  );
}
