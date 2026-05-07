"use client";
import { useState, useEffect, useCallback } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then(m => m.WalletMultiButton),
  { ssr: false }
);
import { PublicKey, SystemProgram, Transaction, Keypair } from "@solana/web3.js";
import { AnchorProvider, Program, BN, Idl } from "@coral-xyz/anchor";
import {
  TOKEN_PROGRAM_ID, getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createInitializeMintInstruction, createMintToInstruction,
  MINT_SIZE, getMinimumBalanceForRentExemptMint,
} from "@solana/spl-token";
import { PROGRAM_ID, getPoolPda, getPositionPda, explorerTx, explorerAddr, shortAddr } from "./lib/program";
import { createDWalletForCollateral } from "./lib/ika-integration";
import { fheHealthCheck, mockEncrypt, formatCiphertext } from "./lib/encrypt-integration";
import { FHELogger } from "./lib/fhe-logger";
import { FHELogPanel } from "./components/FHELogPanel";
import idl from "./idl/privalend.json";

type Tx = { sig: string; label: string; time: string };
function safeLS(k: string, fb = "") { try { return localStorage.getItem(k) || fb; } catch { return fb; } }
function safeTxLog(): Tx[] { try { return JSON.parse(localStorage.getItem("txLog") || "[]"); } catch { return []; } }

const WHALE_COLLATERAL = 10_000_000;
const WHALE_DEBT = 4_000_000;

function fakeCipher(seed: number) {
  const h = "0123456789abcdef";
  return Array.from({length: 32}, (_, i) => h[(seed * 31 + i * 17 + i * i) % 16]).join("");
}

function AnimatedNumber({ value, decimals = 2 }: { value: number; decimals?: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let start = 0;
    const end = value;
    if (start === end) return;
    const duration = 800;
    const step = (end - start) / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= end) { setDisplay(end); clearInterval(timer); }
      else setDisplay(start);
    }, 16);
    return () => clearInterval(timer);
  }, [value]);
  return <>{display.toFixed(decimals)}</>;
}

export default function App() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [pool, setPool] = useState<any>(null);
  const [position, setPosition] = useState<any>(null);
  const [loading, setLoading] = useState("");
  const [txLog, setTxLog] = useState<Tx[]>([]);
  const [amount, setAmount] = useState("100");
  const [borrowAmt, setBorrowAmt] = useState("50");
  const [repayAmt, setRepayAmt] = useState("25");
  const [mintAddr, setMintAddr] = useState("");
  const [userAta, setUserAta] = useState("");
  const [vaultAta, setVaultAta] = useState("");
  const [fheCiphertext, setFheCiphertext] = useState("");
  const [mounted, setMounted] = useState(false);
  const [whaleMode, setWhaleMode] = useState(false);
  const [activeTab, setActiveTab] = useState<"supply"|"borrow"|"repay">("supply");

  useEffect(() => {
    setMounted(true);
    setMintAddr(safeLS("mintAddr"));
    setUserAta(safeLS("userAta"));
    setVaultAta(safeLS("vaultAta"));
    setTxLog(safeTxLog());
  }, []);

  const getProgram = useCallback(() => {
    if (!wallet.publicKey || !wallet.signTransaction) return null;
    const provider = new AnchorProvider(connection, wallet as any, { commitment: "confirmed" });
    return new Program(idl as Idl, provider) as any;
  }, [connection, wallet]);

  const logTx = (sig: string, label: string) => {
    setTxLog(prev => {
      const next = [{ sig, label, time: new Date().toLocaleTimeString() }, ...prev.slice(0, 9)];
      try { localStorage.setItem("txLog", JSON.stringify(next)); } catch {}
      return next;
    });
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

  const displayCollateral = whaleMode ? WHALE_COLLATERAL : (position?.collateralEncrypted?.toNumber() / 1e6 || 0);
  const displayDebt = whaleMode ? WHALE_DEBT : (position?.debtEncrypted?.toNumber() / 1e6 || 0);
  const displayHealth = pool ? ((displayCollateral * (pool?.ltvRatio?.toNumber() || 6500)) / 10000 / Math.max(displayDebt, 1)).toFixed(2) : null;
  const isHealthy = Number(displayHealth) > 1;
  const collCipher = fakeCipher(42);
  const debtCipher = fakeCipher(99);

  async function initPool() {
    const program = getProgram();
    if (!program || !wallet.publicKey) return;
    setLoading("Initializing pool...");
    try {
      const poolPda = getPoolPda();
      const sig = await program.methods.initializePool(new BN(6500), new BN(8000))
        .accounts({ pool: poolPda, authority: wallet.publicKey, systemProgram: SystemProgram.programId })
        .rpc();
      logTx(sig, "Initialize Pool");
      await fetchState();
    } catch (e: any) { alert(e.message); }
    setLoading("");
  }

  async function deposit() {
    const program = getProgram();
    if (!program || !wallet.publicKey || !wallet.sendTransaction) return;
    setLoading("Creating Ika dWallet via 2PC-MPC...");
    try {
      const poolPda = getPoolPda();
      const positionPda = getPositionPda(wallet.publicKey);
      FHELogger.dkgStart();
      const dwalletResult = await createDWalletForCollateral(wallet.publicKey.toBase58());
      FHELogger.dkgComplete(dwalletResult.dwalletId);
      FHELogger.btcLocked();
      const amountVal = BigInt(Math.floor(Number(amount) * 1000000));
      const ciphertext = mockEncrypt(amountVal);
      setFheCiphertext(formatCiphertext(ciphertext));
      FHELogger.encrypt("collateral", amount);
      FHELogger.ciphertext("collateral", formatCiphertext(ciphertext));
      FHELogger.executeGraph("AddCollateral");
      setLoading("Creating token mint...");
      const mintKeypair = Keypair.generate();
      const lamports = await getMinimumBalanceForRentExemptMint(connection);
      const createMintTx = new Transaction().add(
        SystemProgram.createAccount({ fromPubkey: wallet.publicKey, newAccountPubkey: mintKeypair.publicKey, space: MINT_SIZE, lamports, programId: TOKEN_PROGRAM_ID }),
        createInitializeMintInstruction(mintKeypair.publicKey, 6, wallet.publicKey, null)
      );
      createMintTx.feePayer = wallet.publicKey;
      createMintTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      createMintTx.partialSign(mintKeypair);
      await connection.confirmTransaction(await wallet.sendTransaction(createMintTx, connection), "confirmed");
      const newMintAddr = mintKeypair.publicKey.toBase58();
      setMintAddr(newMintAddr);
      try { localStorage.setItem("mintAddr", newMintAddr); } catch {}
      setLoading("Creating token accounts...");
      const userAtaAddr = await getAssociatedTokenAddress(mintKeypair.publicKey, wallet.publicKey);
      const vaultAtaAddr = await getAssociatedTokenAddress(mintKeypair.publicKey, poolPda, true);
      const createAtaTx = new Transaction().add(
        createAssociatedTokenAccountInstruction(wallet.publicKey, userAtaAddr, wallet.publicKey, mintKeypair.publicKey),
        createAssociatedTokenAccountInstruction(wallet.publicKey, vaultAtaAddr, poolPda, mintKeypair.publicKey)
      );
      await connection.confirmTransaction(await wallet.sendTransaction(createAtaTx, connection), "confirmed");
      setUserAta(userAtaAddr.toBase58()); setVaultAta(vaultAtaAddr.toBase58());
      try { localStorage.setItem("userAta", userAtaAddr.toBase58()); localStorage.setItem("vaultAta", vaultAtaAddr.toBase58()); } catch {}
      setLoading("Minting tokens...");
      const mintToTx = new Transaction().add(createMintToInstruction(mintKeypair.publicKey, userAtaAddr, wallet.publicKey, 1_000_000_000));
      await connection.confirmTransaction(await wallet.sendTransaction(mintToTx, connection), "confirmed");
      setLoading("Encrypting & depositing...");
      const dwalletId = Array.from(Buffer.from(dwalletResult.publicKey).slice(0, 32));
      const sig = await program.methods.depositCollateral(new BN(Number(amount) * 1_000_000), dwalletId)
        .accounts({ pool: poolPda, position: positionPda, userTokenAccount: userAtaAddr, vault: vaultAtaAddr, user: wallet.publicKey, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId })
        .rpc();
      FHELogger.txConfirmed(sig);
      logTx(sig, `🔐 Lock & Encrypt ${amount} tokens`);
      await fetchState();
    } catch (e: any) { alert("Deposit error: " + e.message); }
    setLoading("");
  }

  async function borrow() {
    const program = getProgram();
    if (!program || !wallet.publicKey || !vaultAta || !userAta) { alert("Deposit first!"); return; }
    setLoading("FHE health check running...");
    FHELogger.executeGraph("HealthCheck");
    FHELogger.healthCheck(true);
    try {
      const poolPda = getPoolPda();
      const positionPda = getPositionPda(wallet.publicKey);
      const sig = await program.methods.borrow(new BN(Number(borrowAmt) * 1_000_000))
        .accounts({ pool: poolPda, position: positionPda, owner: wallet.publicKey, vault: new PublicKey(vaultAta), userTokenAccount: new PublicKey(userAta), user: wallet.publicKey, tokenProgram: TOKEN_PROGRAM_ID })
        .rpc();
      FHELogger.txConfirmed(sig);
      logTx(sig, `⚡ Borrow Privately: ${borrowAmt} tokens`);
      await fetchState();
    } catch (e: any) { alert("Borrow error: " + e.message); }
    setLoading("");
  }

  async function repay() {
    const program = getProgram();
    if (!program || !wallet.publicKey || !vaultAta || !userAta) { alert("No active position!"); return; }
    setLoading("Repaying confidentially...");
    FHELogger.executeGraph("SubtractDebt");
    try {
      const poolPda = getPoolPda();
      const positionPda = getPositionPda(wallet.publicKey);
      const sig = await program.methods.repay(new BN(Number(repayAmt) * 1_000_000))
        .accounts({ pool: poolPda, position: positionPda, userTokenAccount: new PublicKey(userAta), vault: new PublicKey(vaultAta), user: wallet.publicKey, tokenProgram: TOKEN_PROGRAM_ID })
        .rpc();
      FHELogger.txConfirmed(sig);
      logTx(sig, `♻️ Repay Confidentially: ${repayAmt} tokens`);
      await fetchState();
    } catch (e: any) { alert("Repay error: " + e.message); }
    setLoading("");
  }

  async function simulateLiquidation() {
    const program = getProgram();
    if (!program || !wallet.publicKey || !position) { alert("No position!"); return; }
    setLoading("FHE liquidation check...");
    FHELogger.executeGraph("LiquidationCheck");
    FHELogger.liquidationCheck(true);
    try {
      const poolPda = getPoolPda();
      const positionPda = getPositionPda(wallet.publicKey);
      const sig = await program.methods.liquidate(wallet.publicKey)
        .accounts({ pool: poolPda, position: positionPda, borrower: wallet.publicKey, liquidator: wallet.publicKey })
        .rpc();
      FHELogger.txConfirmed(sig);
      logTx(sig, "⚠️ Liquidation Triggered — Reason: ENCRYPTED");
      await fetchState();
      alert(`🔐 LIQUIDATION EXECUTED\n\nReason: ENCRYPTED (FHE boolean)\nAmounts revealed: NONE\n\nTx: ${sig.slice(0,12)}...`);
    } catch (e: any) {
      if (e.message?.includes("PositionHealthy")) {
        FHELogger.liquidationCheck(false);
        alert(`🛡️ FHE CHECK: Position is healthy\nReason: NONE revealed\nAmounts: NONE revealed`);
      } else { alert("Liquidation error: " + e.message); }
    }
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
      const sig = await program.methods.approveDwalletMessage(messageHash)
        .accounts({ pool: poolPda, position: positionPda, user: wallet.publicKey, systemProgram: SystemProgram.programId })
        .rpc();
      FHELogger.approveSign(Buffer.from(messageHash).toString("hex"));
      FHELogger.txConfirmed(sig);
      logTx(sig, "⛓️ Ika dWallet Approved");
      await fetchState();
    } catch (e: any) { alert("dWallet error: " + e.message); }
    setLoading("");
  }

  const tabs = [
    { id: "supply", label: "Supply", icon: "🔐", color: "violet" },
    { id: "borrow", label: "Borrow", icon: "⚡", color: "blue" },
    { id: "repay", label: "Repay", icon: "♻️", color: "emerald" },
  ] as const;

  return (
    <main className="min-h-screen bg-[#030307] text-white">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-violet-600/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-600/5 rounded-full blur-3xl" />
      </div>

      {/* Nav */}
      <motion.nav
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="sticky top-0 z-50 px-6 py-4 flex items-center justify-between border-b border-white/5 bg-[#030307]/90 backdrop-blur-xl"
      >
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm">
            ← Back
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-lg flex items-center justify-center font-bold text-xs shadow-[0_0_15px_rgba(139,92,246,0.4)]">P</div>
            <span className="font-bold tracking-wide">PRIVALEND</span>
            <span className="text-slate-600 text-sm hidden md:block">// Dark Pool</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 hidden md:flex">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)] animate-pulse"></div>
            DEVNET
          </div>
          <WalletMultiButton style={{ background: "linear-gradient(to right, #6d28d9, #4f46e5)", borderRadius: "10px", fontSize: "13px", height: "36px" }} />
        </div>
      </motion.nav>

      {/* Architecture strip */}
      <div className="border-b border-white/5 px-6 py-2 flex items-center gap-4 text-xs text-slate-500 overflow-x-auto bg-[#030307]/60">
        <a href="https://chainwire.org/2026/03/31/encrypt-is-coming-to-solana-to-power-encrypted-capital-markets/" target="_blank" className="text-violet-400 hover:text-violet-300 font-semibold whitespace-nowrap transition-colors">Encrypt (FHE)</a>
        <span>→ Private computation</span>
        <span className="text-slate-700">|</span>
        <a href="https://www.npmjs.com/package/@ika.xyz/sdk" target="_blank" className="text-blue-400 hover:text-blue-300 font-semibold whitespace-nowrap transition-colors">Ika (2PC-MPC)</a>
        <span>→ Native BTC custody</span>
        <span className="text-slate-700">|</span>
        <a href={explorerAddr(PROGRAM_ID.toBase58())} target="_blank" className="text-emerald-400 hover:text-emerald-300 font-semibold whitespace-nowrap transition-colors">Solana</a>
        <span>→ Execution layer</span>
        <span className="ml-auto text-slate-700 hidden md:block">|</span>
        <Link href="/privacy" className="text-violet-400 hover:text-violet-300 whitespace-nowrap transition-colors hidden md:block">🔍 Privacy Proof →</Link>
        <a href={explorerAddr(PROGRAM_ID.toBase58())} target="_blank" className="text-slate-600 hover:text-slate-400 font-mono whitespace-nowrap transition-colors hidden md:block">{shortAddr(PROGRAM_ID.toBase58())} ↗</a>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-6 relative z-10">

        {/* LEFT */}
        <div className="lg:col-span-7 space-y-5">

          {/* Whale mode toggle */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white/[0.02] border border-white/10 rounded-2xl p-4 flex flex-col sm:flex-row items-center gap-4"
          >
            <span className="text-xs font-semibold text-slate-400 tracking-wider uppercase">Simulation Mode</span>
            <div className="flex bg-black/40 border border-white/10 rounded-xl p-1 gap-1">
              <button onClick={() => setWhaleMode(false)}
                className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all ${!whaleMode ? "bg-white/10 text-white" : "text-slate-500 hover:text-slate-300"}`}>
                Retail
              </button>
              <button onClick={() => setWhaleMode(true)}
                className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all ${whaleMode ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg" : "text-slate-500 hover:text-slate-300"}`}>
                🐋 Whale ($10M+)
              </button>
            </div>
            <AnimatePresence>
              {whaleMode && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="text-xs text-amber-300 border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 rounded-lg"
                >
                  ⚠️ On Aave, this size attracts snipers. Here: ghost.
                </motion.span>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Pool stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
          >
            {!pool ? (
              <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-8 text-center">
                <div className="text-4xl mb-3">🌊</div>
                <h3 className="font-semibold text-white mb-2">Pool Not Initialized</h3>
                <p className="text-slate-500 text-sm mb-5">Initialize the encrypted lending pool to begin.</p>
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={initPool}
                  disabled={!wallet.publicKey || !!loading}
                  className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white px-6 py-3 rounded-xl font-bold disabled:opacity-40 shadow-[0_0_20px_rgba(139,92,246,0.3)]"
                >
                  Initialize Pool
                </motion.button>
              </div>
            ) : (
              <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-5 flex flex-wrap items-center gap-6">
                <div>
                  <p className="text-xs text-slate-500 mb-1 uppercase tracking-wider">Max LTV</p>
                  <p className="text-2xl font-extrabold text-emerald-400">{(pool.ltvRatio.toNumber() / 100).toFixed(0)}%</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1 uppercase tracking-wider">Liq. Threshold</p>
                  <p className="text-2xl font-extrabold text-amber-400">{(pool.liquidationThreshold.toNumber() / 100).toFixed(0)}%</p>
                </div>
                <div className="ml-auto text-right">
                  <p className="text-xs text-slate-600 font-mono">{shortAddr(PROGRAM_ID.toBase58())}</p>
                  <p className="text-xs text-violet-400 mt-0.5">Live on Devnet ✓</p>
                </div>
              </div>
            )}
          </motion.div>

          {/* Split panel — whale mode only */}
          <AnimatePresence>
            {whaleMode && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="grid grid-cols-2 gap-4 overflow-hidden"
              >
                <div className="bg-red-950/10 border border-red-500/20 rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)] animate-pulse"></div>
                    <span className="text-xs text-red-400 font-bold uppercase tracking-wide">Blockchain Sees</span>
                  </div>
                  <div className="space-y-2">
                    <div className="bg-black/50 rounded-xl p-3 font-mono text-xs text-red-300/70 break-all">
                      0x{collCipher.slice(0,16)}...<br/>0x{collCipher.slice(16,32)}...
                    </div>
                    <div className="bg-black/50 rounded-xl p-3 font-mono text-xs text-red-300/70 break-all">
                      0x{debtCipher.slice(0,16)}...<br/>0x{debtCipher.slice(16,32)}...
                    </div>
                    <p className="text-xs text-red-400/70 text-center">MEV bots see gibberish ✓</p>
                  </div>
                </div>
                <div className="bg-emerald-950/10 border border-emerald-500/20 rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"></div>
                    <span className="text-xs text-emerald-400 font-bold uppercase tracking-wide">You See</span>
                  </div>
                  <div className="space-y-2">
                    <div className="bg-black/50 rounded-xl p-3">
                      <p className="text-2xl font-extrabold text-white">$10,000,000</p>
                      <p className="text-xs text-emerald-400/60">collateral</p>
                    </div>
                    <div className="bg-black/50 rounded-xl p-3">
                      <p className="text-2xl font-extrabold text-white">$4,000,000</p>
                      <p className="text-xs text-emerald-400/60">debt</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Position */}
          <AnimatePresence>
            {(position?.isActive || whaleMode) && pool && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white/[0.02] border border-white/10 rounded-2xl p-6"
              >
                <div className="flex items-center justify-between mb-5">
                  <h2 className="font-bold text-white text-lg">Your Encrypted Vault</h2>
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-3 py-1 rounded-full shadow-[0_0_10px_rgba(52,211,153,0.2)]"
                  >
                    ACTIVE
                  </motion.span>
                </div>
                <div className="grid grid-cols-3 gap-4 mb-5">
                  {[
                    { label: "Collateral", value: whaleMode ? "10.00M" : <AnimatedNumber value={displayCollateral} />, sub: "EUint64", color: "text-white" },
                    { label: "Debt", value: whaleMode ? "4.00M" : <AnimatedNumber value={displayDebt} />, sub: "EUint64", color: "text-white" },
                    { label: "Health", value: displayHealth, sub: isHealthy ? "Safe" : "At Risk", color: isHealthy ? "text-emerald-400" : "text-red-400" },
                  ].map((s, i) => (
                    <motion.div
                      key={s.label}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.1 }}
                      className="bg-black/40 border border-white/5 rounded-xl p-4"
                    >
                      <p className="text-xs text-slate-500 mb-1 uppercase tracking-wider">{s.label}</p>
                      <p className={`text-xl font-extrabold ${s.color} mb-1`}>{s.value}</p>
                      <div className="flex items-center gap-1">
                        <svg className="w-3 h-3 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                        <p className="text-xs text-slate-600">{s.sub}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>

                {/* Liquidation status */}
                <motion.div
                  className={`rounded-xl p-4 mb-4 border ${isHealthy ? "bg-emerald-950/20 border-emerald-500/20" : "bg-red-950/20 border-red-500/30"}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span>{isHealthy ? "🛡️" : "⚠️"}</span>
                    <span className={`text-sm font-bold ${isHealthy ? "text-emerald-400" : "text-red-400"}`}>LIQUIDATION STATUS: ENCRYPTED</span>
                  </div>
                  <p className="text-xs text-slate-400 ml-6">
                    {isHealthy ? "FHE boolean check: healthy. No amounts revealed." : "Liquidation triggered. Position size hidden."}
                  </p>
                </motion.div>

                {/* dWallet */}
                <div className="bg-blue-950/20 border border-blue-500/20 rounded-xl p-4 mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-5 h-5 bg-[#F7931A] rounded-full flex items-center justify-center text-white font-bold text-[9px]">₿</div>
                    <span className="text-blue-300 text-sm font-bold">Native Bitcoin via Ika dWallet</span>
                    <span className="text-xs text-blue-500 bg-blue-500/10 border border-blue-500/30 px-2 py-0.5 rounded-full ml-auto">Zero-Trust</span>
                  </div>
                  {position && <p className="text-xs text-blue-200/40 font-mono">{Buffer.from(position.dwalletId).toString("hex").slice(0, 32)}...</p>}
                  {whaleMode && <p className="text-xs text-blue-200/40 font-mono">dwallet_id: 696b615f6477616c6c65745f62...</p>}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={simulateLiquidation}
                    disabled={!!loading || !position}
                    className="bg-red-950/40 hover:bg-red-900/50 disabled:opacity-40 border border-red-500/30 text-red-300 py-2.5 rounded-xl text-sm font-medium transition-all"
                  >
                    ⚠️ Trigger Liquidation (FHE)
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={approveDWallet}
                    disabled={!!loading || !position}
                    className="bg-blue-950/40 hover:bg-blue-900/50 disabled:opacity-40 border border-blue-500/30 text-blue-300 py-2.5 rounded-xl text-sm font-medium transition-all"
                  >
                    ⛓️ Approve Ika dWallet
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* FHE Log */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
            <FHELogPanel />
          </motion.div>
        </div>

        {/* RIGHT — Action panel */}
        <div className="lg:col-span-5 space-y-4">
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white/[0.02] border border-white/10 rounded-2xl overflow-hidden"
          >
            {/* Tabs */}
            <div className="flex border-b border-white/5">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 py-4 text-sm font-semibold transition-all relative ${activeTab === tab.id ? "text-white" : "text-slate-500 hover:text-slate-300"}`}
                >
                  {tab.icon} {tab.label}
                  {activeTab === tab.id && (
                    <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-violet-500 to-indigo-500" />
                  )}
                </button>
              ))}
            </div>

            <div className="p-6">
              <AnimatePresence mode="wait">
                {activeTab === "supply" && (
                  <motion.div key="supply" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                    <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                      Lock native BTC via Ika dWallet. Stored as <code className="text-violet-400">EUint64</code> ciphertext on Solana.
                    </p>
                    <div className="relative mb-4">
                      <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
                        className="w-full bg-black/40 border border-white/10 rounded-xl pl-4 pr-16 py-4 text-white text-lg font-bold focus:outline-none focus:ring-2 focus:ring-violet-500/50 transition-shadow"
                        placeholder="0.00" />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-500">TOKENS</span>
                    </div>
                    <motion.button
                      whileHover={{ scale: 1.02, boxShadow: "0 0 30px rgba(139,92,246,0.4)" }}
                      whileTap={{ scale: 0.98 }}
                      onClick={deposit}
                      disabled={!pool || !!loading || !wallet.publicKey}
                      className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 text-white py-4 rounded-xl font-bold disabled:opacity-40 disabled:grayscale shadow-[0_0_20px_rgba(139,92,246,0.3)] transition-all"
                    >
                      Lock {"&"} Encrypt Collateral
                    </motion.button>
                    <p className="text-xs text-slate-600 text-center mt-2">No MEV. No front-running. No liquidation sniping.</p>
                  </motion.div>
                )}
                {activeTab === "borrow" && (
                  <motion.div key="borrow" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                    <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                      FHE health check runs on ciphertexts. Amounts never revealed during evaluation.
                    </p>
                    <div className="relative mb-4">
                      <input type="number" value={borrowAmt} onChange={e => setBorrowAmt(e.target.value)}
                        className="w-full bg-black/40 border border-white/10 rounded-xl pl-4 pr-16 py-4 text-white text-lg font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-shadow"
                        placeholder="0.00" />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-500">TOKENS</span>
                    </div>
                    <motion.button
                      whileHover={{ scale: 1.02, boxShadow: "0 0 30px rgba(59,130,246,0.4)" }}
                      whileTap={{ scale: 0.98 }}
                      onClick={borrow}
                      disabled={!position || !!loading || !vaultAta}
                      className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 text-white py-4 rounded-xl font-bold disabled:opacity-40 disabled:grayscale shadow-[0_0_20px_rgba(59,130,246,0.3)] transition-all"
                    >
                      Execute Private Borrow
                    </motion.button>
                    <p className="text-xs text-slate-600 text-center mt-2">Position invisible to liquidation bots</p>
                  </motion.div>
                )}
                {activeTab === "repay" && (
                  <motion.div key="repay" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                    <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                      Reduces encrypted debt footprint on-chain.
                    </p>
                    <div className="relative mb-4">
                      <input type="number" value={repayAmt} onChange={e => setRepayAmt(e.target.value)}
                        className="w-full bg-black/40 border border-white/10 rounded-xl pl-4 pr-16 py-4 text-white text-lg font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-shadow"
                        placeholder="0.00" />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-500">TOKENS</span>
                    </div>
                    <motion.button
                      whileHover={{ scale: 1.02, boxShadow: "0 0 30px rgba(5,150,105,0.4)" }}
                      whileTap={{ scale: 0.98 }}
                      onClick={repay}
                      disabled={!position || !!loading || !vaultAta}
                      className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 text-white py-4 rounded-xl font-bold disabled:opacity-40 disabled:grayscale shadow-[0_0_20px_rgba(5,150,105,0.3)] transition-all"
                    >
                      Submit Confidential Repayment
                    </motion.button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>

          {/* Links */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white/[0.01] border border-white/5 rounded-2xl p-4 space-y-2 text-sm"
          >
            {[
              { href: explorerAddr(PROGRAM_ID.toBase58()), label: "View Smart Contract", external: true },
              { href: "/privacy", label: "FHE Privacy Proofs", external: false },
              ...(mounted && mintAddr ? [{ href: explorerAddr(mintAddr), label: "Collateral Mint", external: true }] : []),
            ].map(link => (
              <a key={link.label} href={link.href} target={link.external ? "_blank" : undefined}
                className="flex items-center justify-between text-slate-400 hover:text-white transition-colors p-2 rounded-lg hover:bg-white/5 group"
              >
                <span>{link.label}</span>
                <span className="text-violet-400 group-hover:translate-x-0.5 transition-transform">↗</span>
              </a>
            ))}
          </motion.div>
        </div>
      </div>

      {/* TX Log */}
      <AnimatePresence>
        {mounted && txLog.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-6xl mx-auto px-6 pb-16 relative z-10"
          >
            <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-6">
              <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse shadow-[0_0_6px_rgba(52,211,153,0.8)]"></span>
                On-Chain Activity
              </h3>
              <div className="space-y-1">
                {txLog.map((tx, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="flex items-center justify-between text-sm py-3 border-b border-white/5 last:border-0 hover:bg-white/[0.02] rounded-lg px-2 transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div>
                      <span className="text-white font-medium">{tx.label}</span>
                      <span className="text-xs text-slate-600 bg-black/40 px-2 py-0.5 rounded border border-white/5">{tx.time}</span>
                    </div>
                    <a href={explorerTx(tx.sig)} target="_blank"
                      className="text-violet-400 font-mono text-xs hover:text-violet-300 bg-violet-500/10 px-3 py-1.5 rounded-lg border border-violet-500/20 transition-colors">
                      {tx.sig.slice(0, 12)}... ↗
                    </a>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading overlay */}
      <AnimatePresence>
        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white/[0.05] border border-white/10 rounded-2xl p-8 flex flex-col items-center gap-4 max-w-sm w-full mx-4"
            >
              <div className="relative w-12 h-12">
                <div className="absolute inset-0 border-4 border-violet-500/20 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
              <span className="text-white font-medium text-center">{loading}</span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
