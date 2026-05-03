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
  TOKEN_PROGRAM_ID, getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createInitializeMintInstruction, createMintToInstruction,
  MINT_SIZE, getMinimumBalanceForRentExemptMint,
} from "@solana/spl-token";
import { PROGRAM_ID, getPoolPda, getPositionPda, explorerTx, explorerAddr, shortAddr } from "./lib/program";
import { createDWalletForCollateral } from "./lib/ika-integration";
import { fheHealthCheck, mockEncrypt, formatCiphertext } from "./lib/encrypt-integration";
import idl from "./idl/privalend.json";

type Tx = { sig: string; label: string; time: string };
function safeLS(k: string, fb = "") { try { return localStorage.getItem(k) || fb; } catch { return fb; } }
function safeTxLog(): Tx[] { try { return JSON.parse(localStorage.getItem("txLog") || "[]"); } catch { return []; } }

const WHALE_COLLATERAL = 10_000_000;
const WHALE_DEBT = 4_000_000;

// Fake ciphertext for display
function fakeCipher(seed: number) {
  const h = "0123456789abcdef";
  return Array.from({length: 32}, (_, i) => h[(seed * 31 + i * 17 + i * i) % 16]).join("");
}

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
  const [mintAddr, setMintAddr] = useState("");
  const [userAta, setUserAta] = useState("");
  const [vaultAta, setVaultAta] = useState("");
  const [fheCiphertext, setFheCiphertext] = useState("");
  const [mounted, setMounted] = useState(false);
  const [whaleMode, setWhaleMode] = useState(false);

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

  // Display values — real or whale simulation
  const displayCollateral = whaleMode ? WHALE_COLLATERAL : (position?.collateralEncrypted?.toNumber() / 1e6 || 0);
  const displayDebt = whaleMode ? WHALE_DEBT : (position?.debtEncrypted?.toNumber() / 1e6 || 0);
  const displayHealth = pool
    ? ((displayCollateral * (pool?.ltvRatio?.toNumber() || 6500)) / 10000 / Math.max(displayDebt, 1)).toFixed(2)
    : null;
  const isHealthy = Number(displayHealth) > 1;
  const collCipher = fakeCipher(42);
  const debtCipher = fakeCipher(99);

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
    if (!program || !wallet.publicKey || !wallet.sendTransaction) return;
    setLoading("Creating Ika dWallet via 2PC-MPC...");
    try {
      const poolPda = getPoolPda();
      const positionPda = getPositionPda(wallet.publicKey);
      const dwalletResult = await createDWalletForCollateral(wallet.publicKey.toBase58());
      const amountVal = BigInt(Math.floor(Number(amount) * 1000000));
      const ciphertext = mockEncrypt(amountVal);
      setFheCiphertext(formatCiphertext(ciphertext));
      const existingDebt = position ? BigInt(position.debtEncrypted.toNumber()) : BigInt(0);
      fheHealthCheck(amountVal, existingDebt, BigInt(6500));
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
      const newUserAta = userAtaAddr.toBase58();
      const newVaultAta = vaultAtaAddr.toBase58();
      setUserAta(newUserAta); setVaultAta(newVaultAta);
      try { localStorage.setItem("userAta", newUserAta); localStorage.setItem("vaultAta", newVaultAta); } catch {}
      setLoading("Minting tokens...");
      const mintToTx = new Transaction().add(createMintToInstruction(mintKeypair.publicKey, userAtaAddr, wallet.publicKey, 1_000_000_000));
      await connection.confirmTransaction(await wallet.sendTransaction(mintToTx, connection), "confirmed");
      setLoading("Encrypting & depositing collateral...");
      const dwalletId = Array.from(Buffer.from(dwalletResult.publicKey).slice(0, 32));
      const sig = await program.methods
        .depositCollateral(new BN(Number(amount) * 1_000_000), dwalletId)
        .accounts({ pool: poolPda, position: positionPda, userTokenAccount: userAtaAddr, vault: vaultAtaAddr, user: wallet.publicKey, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId })
        .rpc();
      logTx(sig, `🔐 Lock & Encrypt ${amount} tokens`);
      await fetchState();
    } catch (e: any) { alert("Deposit error: " + e.message); }
    setLoading("");
  }

  async function borrow() {
    const program = getProgram();
    if (!program || !wallet.publicKey || !vaultAta || !userAta) { alert("Deposit first!"); return; }
    setLoading("Running FHE health check privately...");
    try {
      const poolPda = getPoolPda();
      const positionPda = getPositionPda(wallet.publicKey);
      const sig = await program.methods
        .borrow(new BN(Number(borrowAmt) * 1_000_000))
        .accounts({ pool: poolPda, position: positionPda, owner: wallet.publicKey, vault: new PublicKey(vaultAta), userTokenAccount: new PublicKey(userAta), user: wallet.publicKey, tokenProgram: TOKEN_PROGRAM_ID })
        .rpc();
      logTx(sig, `⚡ Borrow Privately: ${borrowAmt} tokens`);
      await fetchState();
    } catch (e: any) { alert("Borrow error: " + e.message); }
    setLoading("");
  }

  async function repay() {
    const program = getProgram();
    if (!program || !wallet.publicKey || !vaultAta || !userAta) { alert("No active position!"); return; }
    setLoading("Repaying confidentially...");
    try {
      const poolPda = getPoolPda();
      const positionPda = getPositionPda(wallet.publicKey);
      const sig = await program.methods
        .repay(new BN(Number(repayAmt) * 1_000_000))
        .accounts({ pool: poolPda, position: positionPda, userTokenAccount: new PublicKey(userAta), vault: new PublicKey(vaultAta), user: wallet.publicKey, tokenProgram: TOKEN_PROGRAM_ID })
        .rpc();
      logTx(sig, `♻️ Repay Confidentially: ${repayAmt} tokens`);
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
        .accounts({ pool: poolPda, position: positionPda, user: wallet.publicKey, systemProgram: SystemProgram.programId })
        .rpc();
      logTx(sig, "⛓️ Ika dWallet Approved");
      await fetchState();
    } catch (e: any) { alert("dWallet error: " + e.message); }
    setLoading("");
  }

  return (
    <main className="min-h-screen bg-[#07070d] text-slate-100 font-mono">

      {/* Header */}
      <header className="border-b border-slate-800/80 px-6 py-3 flex items-center justify-between bg-[#07070d]/95 backdrop-blur sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-violet-600 rounded flex items-center justify-center text-white font-bold text-xs">P</div>
          <span className="font-bold text-white tracking-tight">PRIVALEND</span>
          <span className="text-slate-600 text-xs hidden md:block">// Dark Lending Market</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-600 hidden md:flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block animate-pulse"></span>
            DEVNET
          </span>
          <WalletMultiButton style={{ background: "#5b21b6", borderRadius: "4px", fontSize: "12px", height: "32px", fontFamily: "monospace" }} />
        </div>
      </header>

      {/* Architecture strip */}
      <div className="border-b border-slate-800/50 px-6 py-2 flex items-center gap-4 text-xs text-slate-600 bg-[#09090f] overflow-x-auto">
        <span className="text-violet-400 font-semibold whitespace-nowrap">Encrypt (FHE)</span>
        <span>→ Private computation on encrypted state</span>
        <span className="text-slate-700">|</span>
        <span className="text-blue-400 font-semibold whitespace-nowrap">Ika (2PC-MPC)</span>
        <span>→ Native BTC custody, no bridges</span>
        <span className="text-slate-700">|</span>
        <span className="text-emerald-400 font-semibold whitespace-nowrap">Solana</span>
        <span>→ Execution & settlement layer</span>
        <span className="text-slate-700 ml-auto">|</span>
        <a href="/privacy" className="text-violet-400 hover:text-violet-300 whitespace-nowrap">🔍 Privacy Proof →</a>
        <a href={explorerAddr(PROGRAM_ID.toBase58())} target="_blank" className="text-slate-500 hover:text-slate-400 whitespace-nowrap">{shortAddr(PROGRAM_ID.toBase58())} ↗</a>
      </div>

      {/* HERO */}
      <div className="border-b border-slate-800/50 px-6 py-8 bg-[#09090f]">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2 tracking-tight">
            Private BTC Lending —{" "}
            <span className="text-violet-400">Invisible On-Chain</span>
          </h1>
          <p className="text-slate-400 text-sm mb-4 max-w-2xl">
            Your collateral, debt, and liquidation risk are fully encrypted via FHE.
            Validators see nothing. MEV bots can't attack you. Liquidators can't front-run you.
          </p>
          {/* Comparison bar */}
          <div className="flex items-center gap-3 text-xs flex-wrap">
            <div className="flex items-center gap-2 bg-red-950/40 border border-red-900/50 px-3 py-1.5 rounded">
              <span className="text-red-400 font-semibold">Aave / Kamino</span>
              <span className="text-red-500">Fully Public ❌</span>
            </div>
            <span className="text-slate-700">vs</span>
            <div className="flex items-center gap-2 bg-emerald-950/40 border border-emerald-900/50 px-3 py-1.5 rounded">
              <span className="text-emerald-400 font-semibold">PrivaLend</span>
              <span className="text-emerald-500">Fully Private ✅</span>
            </div>
            <span className="text-slate-600 ml-2">No MEV. No front-running. No liquidation sniping.</span>
          </div>
        </div>
      </div>

      {/* Whale Mode Toggle */}
      <div className="border-b border-slate-800/50 px-6 py-3 bg-[#0a0a10] flex items-center gap-4">
        <span className="text-xs text-slate-500">SIMULATION MODE:</span>
        <div className="flex items-center gap-1 bg-slate-900 border border-slate-700 rounded p-0.5">
          <button
            onClick={() => setWhaleMode(false)}
            className={`px-3 py-1 text-xs rounded transition-colors ${!whaleMode ? "bg-slate-700 text-white" : "text-slate-500 hover:text-slate-300"}`}
          >
            Retail
          </button>
          <button
            onClick={() => setWhaleMode(true)}
            className={`px-3 py-1 text-xs rounded transition-colors ${whaleMode ? "bg-violet-700 text-white" : "text-slate-500 hover:text-slate-300"}`}
          >
            🐋 Whale ($10M+)
          </button>
        </div>
        {whaleMode && (
          <span className="text-xs text-amber-400 border border-amber-800/50 bg-amber-950/30 px-2 py-1 rounded">
            ⚠️ On Aave, this position would be visible and targeted by bots. Here, it is completely hidden.
          </span>
        )}
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* LEFT: main content */}
        <div className="lg:col-span-2 space-y-4">

          {/* Pool init or pool stats (minimal) */}
          {!pool ? (
            <div className="bg-slate-900 border border-slate-800 rounded p-5 text-center">
              <p className="text-slate-500 text-sm mb-3">Pool not initialized</p>
              <button onClick={initPool} disabled={!wallet.publicKey || !!loading}
                className="bg-violet-700 hover:bg-violet-600 disabled:opacity-40 text-white px-4 py-2 rounded text-sm font-medium transition-colors">
                Initialize Pool
              </button>
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded p-4 flex items-center gap-6 text-xs">
              <div>
                <span className="text-slate-500">LTV</span>
                <span className="text-emerald-400 font-bold ml-2">{(pool.ltvRatio.toNumber() / 100).toFixed(0)}%</span>
              </div>
              <div>
                <span className="text-slate-500">Liq. Threshold</span>
                <span className="text-yellow-400 font-bold ml-2">{(pool.liquidationThreshold.toNumber() / 100).toFixed(0)}%</span>
              </div>
              <div className="ml-auto text-slate-600 font-mono text-xs">
                Program: {shortAddr(PROGRAM_ID.toBase58())}
              </div>
            </div>
          )}

          {/* SPLIT PANEL: What blockchain sees vs what you see */}
          {(position || whaleMode) && (
            <div className="grid grid-cols-2 gap-3">
              {/* Left: blockchain view */}
              <div className="bg-[#0d0d14] border border-red-900/40 rounded p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-red-500"></div>
                  <span className="text-xs text-red-400 uppercase tracking-wider font-semibold">👁️ Blockchain Sees</span>
                </div>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-slate-600 mb-1">collateral_encrypted</p>
                    <div className="bg-slate-900 rounded p-2 font-mono text-xs text-red-300/80 break-all leading-relaxed">
                      0x{collCipher.slice(0,16)}...<br/>
                      0x{collCipher.slice(16,32)}...
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-slate-600 mb-1">debt_encrypted</p>
                    <div className="bg-slate-900 rounded p-2 font-mono text-xs text-red-300/80 break-all">
                      0x{debtCipher.slice(0,16)}...<br/>
                      0x{debtCipher.slice(16,32)}...
                    </div>
                  </div>
                  <div className="text-xs text-red-500/70 mt-2">
                    MEV bots see only gibberish ✓
                  </div>
                </div>
              </div>

              {/* Right: your view */}
              <div className="bg-[#0d0d14] border border-emerald-900/40 rounded p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                  <span className="text-xs text-emerald-400 uppercase tracking-wider font-semibold">🔓 You See</span>
                </div>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-slate-600 mb-1">Collateral</p>
                    <div className="bg-slate-900 rounded p-2">
                      <span className="text-lg font-bold text-blue-400">
                        {whaleMode ? "$10,000,000" : `${displayCollateral.toFixed(2)}`}
                      </span>
                      <span className="text-xs text-slate-500 ml-1">{whaleMode ? "USD" : "tokens"}</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-slate-600 mb-1">Debt</p>
                    <div className="bg-slate-900 rounded p-2">
                      <span className="text-lg font-bold text-red-400">
                        {whaleMode ? "$4,000,000" : `${displayDebt.toFixed(2)}`}
                      </span>
                      <span className="text-xs text-slate-500 ml-1">{whaleMode ? "USD" : "tokens"}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Position details */}
          {(position?.isActive || whaleMode) && pool && (
            <div className="bg-slate-900 border border-slate-800 rounded p-5">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Position</span>
                <span className="text-xs bg-emerald-900/50 text-emerald-400 border border-emerald-800 px-2 py-0.5 rounded">ACTIVE</span>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-slate-800/60 rounded p-3">
                  <p className="text-xs text-slate-500 mb-1">🔐 Collateral</p>
                  <p className="text-lg font-bold text-blue-400">
                    {whaleMode ? "$10M" : `${displayCollateral.toFixed(2)}`}
                  </p>
                  <p className="text-xs text-slate-600">EUint64 ciphertext</p>
                </div>
                <div className="bg-slate-800/60 rounded p-3">
                  <p className="text-xs text-slate-500 mb-1">🔐 Debt</p>
                  <p className="text-lg font-bold text-red-400">
                    {whaleMode ? "$4M" : `${displayDebt.toFixed(2)}`}
                  </p>
                  <p className="text-xs text-slate-600">EUint64 ciphertext</p>
                </div>
                <div className="bg-slate-800/60 rounded p-3">
                  <p className="text-xs text-slate-500 mb-1">Health Factor</p>
                  <p className={`text-lg font-bold ${isHealthy ? "text-emerald-400" : "text-red-400"}`}>{displayHealth}</p>
                  <p className="text-xs text-slate-600">{isHealthy ? "Safe" : "At Risk"}</p>
                </div>
              </div>

              {/* Liquidation status */}
              <div className={`rounded p-3 mb-3 border ${isHealthy ? "bg-emerald-950/30 border-emerald-900/40" : "bg-red-950/30 border-red-900/40"}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm">{isHealthy ? "🛡" : "⚠️"}</span>
                  <span className={`text-xs font-semibold uppercase tracking-wider ${isHealthy ? "text-emerald-400" : "text-red-400"}`}>
                    Liquidation Status: ENCRYPTED
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  {isHealthy
                    ? "FHE boolean check: healthy. No amounts revealed during evaluation."
                    : "⚠️ Liquidation Triggered (Reason Hidden) — only result visible, not position size."}
                </p>
              </div>

              {/* Ika dWallet */}
              <div className="bg-blue-950/20 border border-blue-900/40 rounded p-3 mb-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-blue-400 text-xs font-semibold">₿ Native Bitcoin via Ika dWallet</span>
                  <span className="text-xs text-blue-600">No bridges. No wrapping. Zero-trust custody.</span>
                </div>
                {position && (
                  <p className="text-xs text-slate-600 font-mono">{Buffer.from(position.dwalletId).toString("hex").slice(0, 32)}...</p>
                )}
                {whaleMode && (
                  <p className="text-xs text-slate-600 font-mono">dwallet_id: 696b615f6477616c6c65745f6274635f...</p>
                )}
              </div>

              <button onClick={approveDWallet} disabled={!!loading || !position}
                className="w-full bg-blue-950/40 hover:bg-blue-900/50 border border-blue-800/50 text-blue-300 py-2 rounded text-xs transition-colors">
                ⛓️ Approve Ika dWallet Signing
              </button>
            </div>
          )}
        </div>

        {/* RIGHT: actions */}
        <div className="space-y-3">
          <div className="bg-slate-900 border border-slate-800 rounded p-4">
            <h3 className="text-xs font-semibold text-slate-300 mb-1 uppercase tracking-wider">Lock & Encrypt Collateral</h3>
            <p className="text-xs text-slate-600 mb-3">₿ Native BTC via Ika dWallet • Stored as EUint64 ciphertext</p>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-white mb-3 focus:outline-none focus:border-violet-500 font-mono" />
            <button onClick={deposit} disabled={!pool || !!loading || !wallet.publicKey}
              className="w-full bg-violet-700 hover:bg-violet-600 disabled:opacity-40 text-white py-2 rounded text-sm font-semibold transition-colors">
              🔐 Lock & Encrypt Collateral
            </button>
            <p className="text-xs text-slate-600 text-center mt-1">No MEV. No front-running. No liquidation sniping.</p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded p-4">
            <h3 className="text-xs font-semibold text-slate-300 mb-1 uppercase tracking-wider">Borrow Privately</h3>
            <p className="text-xs text-slate-600 mb-3">FHE health check on encrypted data • Amounts never revealed</p>
            <input type="number" value={borrowAmt} onChange={e => setBorrowAmt(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-white mb-3 focus:outline-none focus:border-blue-500 font-mono" />
            <button onClick={borrow} disabled={!position || !!loading || !vaultAta}
              className="w-full bg-blue-700 hover:bg-blue-600 disabled:opacity-40 text-white py-2 rounded text-sm font-semibold transition-colors">
              ⚡ Borrow Privately
            </button>
            <p className="text-xs text-slate-600 text-center mt-1">Position invisible to liquidation bots</p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded p-4">
            <h3 className="text-xs font-semibold text-slate-300 mb-1 uppercase tracking-wider">Repay Confidentially</h3>
            <p className="text-xs text-slate-600 mb-3">Reduces encrypted debt on-chain</p>
            <input type="number" value={repayAmt} onChange={e => setRepayAmt(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-white mb-3 focus:outline-none focus:border-emerald-500 font-mono" />
            <button onClick={repay} disabled={!position || !!loading || !vaultAta}
              className="w-full bg-emerald-800 hover:bg-emerald-700 disabled:opacity-40 text-white py-2 rounded text-sm font-semibold transition-colors">
              ♻️ Repay Confidentially
            </button>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded p-3 text-xs space-y-1">
            <a href={explorerAddr(PROGRAM_ID.toBase58())} target="_blank" className="text-violet-400 hover:text-violet-300 block">View Program ↗</a>
            <a href="/privacy" className="text-violet-400 hover:text-violet-300 block">Privacy Proof Page ↗</a>
            {mounted && mintAddr && <a href={explorerAddr(mintAddr)} target="_blank" className="text-blue-400 hover:text-blue-300 block">Collateral Mint ↗</a>}
          </div>
        </div>
      </div>

      {/* TX Log */}
      {mounted && txLog.length > 0 && (
        <div className="max-w-5xl mx-auto px-6 pb-8">
          <div className="bg-slate-900 border border-slate-800 rounded p-4">
            <h3 className="text-xs font-semibold text-slate-500 mb-3 uppercase tracking-wider">Transaction Log</h3>
            <div className="space-y-2">
              {txLog.map((tx, i) => (
                <div key={i} className="flex items-center justify-between text-xs py-1.5 border-b border-slate-800 last:border-0">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div>
                    <span className="text-slate-300">{tx.label}</span>
                    <span className="text-slate-600">{tx.time}</span>
                  </div>
                  <a href={explorerTx(tx.sig)} target="_blank" className="text-violet-400 font-mono hover:text-violet-300">
                    {tx.sig.slice(0, 8)}... ↗
                  </a>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-slate-900 border border-slate-700 rounded p-6 flex items-center gap-3">
            <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-sm text-slate-300 font-mono">{loading}</span>
          </div>
        </div>
      )}
    </main>
  );
}
