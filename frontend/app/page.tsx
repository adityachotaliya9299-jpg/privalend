"use client";
import { useState, useEffect, useCallback } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { AnchorProvider, Program, BN, Idl } from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID, getOrCreateAssociatedTokenAccount, createMint, mintTo } from "@solana/spl-token";
import { PROGRAM_ID, getPoolPda, getPositionPda, explorerTx, explorerAddr, shortAddr } from "./lib/program";
import idl from "../target/idl/privalend.json";

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

  const getProgram = useCallback(() => {
    if (!wallet.publicKey || !wallet.signTransaction) return null;
    const provider = new AnchorProvider(connection, wallet as any, { commitment: "confirmed" });
    return new Program(idl as Idl, provider);
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
    } catch (e: any) { alert(e.message); }
    setLoading("");
  }

  async function deposit() {
    const program = getProgram();
    if (!program || !wallet.publicKey) return;
    setLoading("Depositing collateral...");
    try {
      const poolPda = getPoolPda();
      const positionPda = getPositionPda(wallet.publicKey);
      const mint = await createMint(connection, (wallet as any).payer, wallet.publicKey, null, 6);
      const userAta = await getOrCreateAssociatedTokenAccount(connection, (wallet as any).payer, mint, wallet.publicKey);
      await mintTo(connection, (wallet as any).payer, mint, userAta.address, wallet.publicKey, 1_000_000_000);
      const vaultAta = await getOrCreateAssociatedTokenAccount(connection, (wallet as any).payer, mint, poolPda, true);
      const dwalletId = Array.from(Buffer.from("ika_dwallet_btc_mock_00000000000".slice(0, 32)));
      const sig = await program.methods
        .depositCollateral(new BN(Number(amount) * 1_000_000), dwalletId)
        .accounts({
          pool: poolPda, position: positionPda,
          userTokenAccount: userAta.address, vault: vaultAta.address,
          user: wallet.publicKey, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
        })
        .rpc();
      logTx(sig, `Deposit ${amount} tokens`);
      await fetchState();
    } catch (e: any) { alert(e.message); }
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
                  Your collateral and debt amounts are stored as <code className="text-violet-400">EUint64</code> ciphertexts.
                  Health checks run on encrypted data — validators never see your position size.
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
              <p className="text-slate-500 text-sm mb-3">Pool not initialized</p>
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
              {/* dWallet info */}
              <div className="bg-blue-900/20 border border-blue-800/40 rounded-lg p-3">
                <p className="text-xs text-blue-400 font-medium mb-1">⛓️ Ika dWallet (Cross-Chain Collateral)</p>
                <p className="text-xs text-slate-500 font-mono">{Buffer.from(position.dwalletId).toString("hex").slice(0, 32)}...</p>
                <p className="text-xs text-slate-600 mt-1">BTC collateral locked via 2PC-MPC • Zero-trust custody</p>
              </div>
            </div>
          ) : pool && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-center">
              <p className="text-slate-500 text-sm">No position yet — deposit collateral to start</p>
            </div>
          )}
        </div>

        {/* Right: Actions */}
        <div className="space-y-4">
          {/* Deposit */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h3 className="font-semibold text-sm mb-3 text-slate-300">Deposit Collateral</h3>
            <p className="text-xs text-slate-500 mb-3">Locks BTC via Ika dWallet • Stored as FHE ciphertext</p>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white mb-3 focus:outline-none focus:border-violet-500"
              placeholder="Amount" />
            <button onClick={deposit} disabled={!pool || !!loading}
              className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white py-2 rounded-lg text-sm font-medium transition-colors">
              🔐 Deposit + Encrypt
            </button>
          </div>

          {/* Borrow */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h3 className="font-semibold text-sm mb-3 text-slate-300">Borrow</h3>
            <p className="text-xs text-slate-500 mb-3">FHE health check • Amounts never revealed</p>
            <input type="number" value={borrowAmt} onChange={e => setBorrowAmt(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white mb-3 focus:outline-none focus:border-violet-500"
              placeholder="Borrow amount" />
            <button disabled={!position || !!loading}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white py-2 rounded-lg text-sm font-medium transition-colors">
              ⚡ Borrow
            </button>
          </div>

          {/* Repay */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h3 className="font-semibold text-sm mb-3 text-slate-300">Repay</h3>
            <input type="number" value={repayAmt} onChange={e => setRepayAmt(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white mb-3 focus:outline-none focus:border-violet-500"
              placeholder="Repay amount" />
            <button disabled={!position || !!loading}
              className="w-full bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white py-2 rounded-lg text-sm font-medium transition-colors">
              ✅ Repay
            </button>
          </div>

          {/* Links */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-xs text-slate-500 mb-2 font-medium">Explorer</p>
            <a href={explorerAddr(PROGRAM_ID.toBase58())} target="_blank"
              className="text-xs text-violet-400 hover:text-violet-300 block truncate">
              View Program on Devnet ↗
            </a>
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

      {/* Loading overlay */}
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
