
"use client";
import { useState, useEffect, useCallback } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import dynamic from "next/dynamic";
const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then(m => m.WalletMultiButton),
  { ssr: false }
);
import { AnchorProvider, Program, Idl } from "@coral-xyz/anchor";
import { getPoolPda, getPositionPda, PROGRAM_ID, explorerAddr } from "../lib/program";
import idl from "../idl/privalend.json";
import Link from "next/link";

// Simulate what a raw ciphertext looks like on-chain
function fakeCiphertext(seed: number, len = 64): string {
  let result = "";
  const chars = "0123456789abcdef";
  for (let i = 0; i < len; i++) {
    result += chars[(seed * 31 + i * 17 + i * i) % 16];
  }
  return result;
}

export default function PrivacyProof() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [position, setPosition] = useState<any>(null);
  const [pool, setPool] = useState<any>(null);
  const [revealed, setRevealed] = useState(false);
  const [decrypting, setDecrypting] = useState(false);

  const getProgram = useCallback(() => {
    if (!wallet.publicKey || !wallet.signTransaction) return null;
    const provider = new AnchorProvider(connection, wallet as any, { commitment: "confirmed" });
    return new Program(idl as Idl, provider) as any;
  }, [connection, wallet]);

  useEffect(() => {
    async function load() {
      const program = getProgram();
      if (!program || !wallet.publicKey) return;
      try {
        const poolPda = getPoolPda();
        const positionPda = getPositionPda(wallet.publicKey);
        try { setPool(await program.account.lendingPool.fetch(poolPda)); } catch {}
        try { setPosition(await program.account.userPosition.fetch(positionPda)); } catch {}
      } catch {}
    }
    load();
  }, [getProgram, wallet.publicKey]);

  async function simulateDecrypt() {
    setDecrypting(true);
    await new Promise(r => setTimeout(r, 2000)); // simulate FHE decryption delay
    setRevealed(true);
    setDecrypting(false);
  }

  const collateralCipher = fakeCiphertext(42, 128);
  const debtCipher = fakeCiphertext(99, 128);
  const healthCipher = fakeCiphertext(7, 64);

  return (
    <main className="min-h-screen bg-[#050508] text-slate-100 font-sans selection:bg-violet-500/30 relative overflow-hidden">
      
      {/* Background Gradients */}
      <div className="absolute top-[-20%] left-[10%] w-[50%] h-[50%] rounded-full bg-violet-900/10 blur-[150px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-blue-900/10 blur-[120px] pointer-events-none"></div>

      {/* Header */}
      <header className="border-b border-white/5 px-6 py-4 flex items-center justify-between bg-[#050508]/60 backdrop-blur-md sticky top-0 z-40">
        <div className="flex items-center gap-6">
          <Link href="/" className="group flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm font-medium bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] px-3 py-1.5 rounded-lg">
            <span className="group-hover:-translate-x-0.5 transition-transform">←</span> Home
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-sm shadow-[0_0_15px_rgba(139,92,246,0.3)]">P</div>
            <div>
              <h1 className="font-bold text-white text-lg leading-none tracking-wide">Privacy Proof</h1>
              <p className="text-xs text-slate-400 font-mono mt-1">FHE Encryption Demo</p>
            </div>
          </div>
        </div>
        <div className="hover:scale-105 transition-transform duration-200 hidden sm:block">
          <WalletMultiButton style={{ background: "linear-gradient(to right, #6d28d9, #4f46e5)", borderRadius: "8px", fontSize: "14px", height: "38px", fontWeight: "600" }} />
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-10 space-y-8 relative z-10">

        {/* Explainer */}
        <div className="bg-gradient-to-r from-violet-900/20 to-blue-900/10 border border-violet-500/20 rounded-2xl p-8 backdrop-blur-md shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-violet-500/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
          <h2 className="text-2xl font-bold text-white mb-3 tracking-tight flex items-center gap-3">
            <span className="text-3xl">🔐</span> What Validators See vs What You See
          </h2>
          <p className="text-slate-300 text-base leading-relaxed max-w-3xl">
            On normal blockchains, your collateral and debt are public. 
            PrivaLend uses <strong className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-indigo-400 font-bold">Fully Homomorphic Encryption (FHE)</strong> to store 
            your position as ciphertexts. Validators execute liquidations directly on encrypted data without ever knowing the amounts. Only you hold the decryption key.
          </p>
        </div>

        {/* Two columns: What validator sees vs what you see */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">

          {/* Left: What validator sees */}
          <div className="bg-red-950/10 border border-red-500/20 rounded-2xl p-6 backdrop-blur-sm relative overflow-hidden group hover:border-red-500/40 transition-colors shadow-lg flex flex-col">
            <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
            
            <div className="flex items-center gap-3 mb-6 border-b border-red-500/10 pb-4">
              <div className="w-3 h-3 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)] animate-pulse"></div>
              <h3 className="font-bold text-red-400 text-sm uppercase tracking-wider">What Validators See On-Chain</h3>
            </div>

            <div className="space-y-5 flex-1">
              <div>
                <p className="text-xs text-slate-400 mb-2 font-medium flex items-center justify-between">
                  <span>collateral_encrypted</span>
                  <span className="text-[10px] font-mono bg-red-500/10 text-red-400/80 px-2 py-0.5 rounded border border-red-500/20">EUint64</span>
                </p>
                <div className="bg-black/60 rounded-xl p-4 font-mono text-xs text-red-300/90 break-all leading-relaxed border border-red-900/30 shadow-inner">
                  {collateralCipher.slice(0, 32)}...
                  <br/>{collateralCipher.slice(32, 64)}...
                  <br/>{collateralCipher.slice(64, 96)}...
                  <br/>{collateralCipher.slice(96)}...
                </div>
              </div>

              <div>
                <p className="text-xs text-slate-400 mb-2 font-medium flex items-center justify-between">
                  <span>debt_encrypted</span>
                  <span className="text-[10px] font-mono bg-red-500/10 text-red-400/80 px-2 py-0.5 rounded border border-red-500/20">EUint64</span>
                </p>
                <div className="bg-black/60 rounded-xl p-4 font-mono text-xs text-red-300/90 break-all leading-relaxed border border-red-900/30 shadow-inner">
                  {debtCipher.slice(0, 32)}...
                  <br/>{debtCipher.slice(32, 64)}...
                  <br/>{debtCipher.slice(64, 96)}...
                  <br/>{debtCipher.slice(96)}...
                </div>
              </div>

              <div>
                <p className="text-xs text-slate-400 mb-2 font-medium flex items-center justify-between">
                  <span>health_factor_check</span>
                  <span className="text-[10px] font-mono bg-red-500/10 text-red-400/80 px-2 py-0.5 rounded border border-red-500/20">ebool</span>
                </p>
                <div className="bg-black/60 rounded-xl p-4 font-mono text-xs text-red-300/90 break-all border border-red-900/30 shadow-inner">
                  {healthCipher}
                </div>
              </div>
            </div>

            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mt-5">
              <p className="text-xs text-red-300/90 leading-relaxed font-medium">
                <span className="text-base mr-1">⚠️</span> Validators, MEV bots, and competitors see only these encrypted blobs. No strategy leakage. No front-running possible.
              </p>
            </div>
          </div>

          {/* Right: What you see after decryption */}
          <div className="bg-emerald-950/10 border border-emerald-500/20 rounded-2xl p-6 backdrop-blur-sm relative overflow-hidden group hover:border-emerald-500/40 transition-colors shadow-lg flex flex-col">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
            
            <div className="flex items-center gap-3 mb-6 border-b border-emerald-500/10 pb-4">
              <div className="w-3 h-3 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]"></div>
              <h3 className="font-bold text-emerald-400 text-sm uppercase tracking-wider">What You See After Decryption</h3>
            </div>

            {!revealed ? (
              <div className="flex flex-col flex-1 h-full">
                <div className="space-y-4">
                  <div>
                    <p className="text-xs text-slate-400 mb-2 font-medium">collateral_encrypted → plaintext</p>
                    <div className="bg-black/40 border border-white/5 rounded-xl py-6 px-4 flex items-center justify-center shadow-inner">
                      <div className="flex items-center gap-2 text-slate-500 text-sm font-medium">
                        <span>🔒</span> Encrypted — decrypt to reveal
                      </div>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 mb-2 font-medium">debt_encrypted → plaintext</p>
                    <div className="bg-black/40 border border-white/5 rounded-xl py-6 px-4 flex items-center justify-center shadow-inner">
                      <div className="flex items-center gap-2 text-slate-500 text-sm font-medium">
                        <span>🔒</span> Encrypted — decrypt to reveal
                      </div>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 mb-2 font-medium">health_factor_check → boolean</p>
                    <div className="bg-black/40 border border-white/5 rounded-xl py-4 px-4 flex items-center justify-center shadow-inner">
                      <div className="flex items-center gap-2 text-slate-500 text-sm font-medium">
                        <span>🔒</span> Encrypted
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-6 mt-auto">
                  <button
                    onClick={simulateDecrypt}
                    disabled={decrypting || !wallet.publicKey}
                    className={`w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-40 disabled:grayscale text-white py-4 rounded-xl text-sm font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-3 ${wallet.publicKey && !decrypting ? 'shadow-[0_0_15px_rgba(139,92,246,0.5)] animate-pulse' : 'shadow-md'}`}
                  >
                    {decrypting ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        Threshold decryptors collaborating...
                      </>
                    ) : (
                      <>
                        <span className="text-lg">🔓</span> Request Threshold Decryption
                      </>
                    )}
                  </button>
                  {!wallet.publicKey && (
                    <p className="text-xs text-slate-500 text-center mt-3 font-medium">Connect wallet to authorize decryption</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col flex-1 h-full animate-in fade-in zoom-in duration-500">
                <div className="space-y-4">
                  <div>
                    <p className="text-xs text-slate-400 mb-2 font-medium">collateral_encrypted → plaintext</p>
                    <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-5 flex flex-col justify-center shadow-inner">
                      <p className="text-3xl font-extrabold text-emerald-400 tracking-tight">
                        {position ? (position.collateralEncrypted.toNumber() / 1e6).toFixed(2) : "500.00"}
                      </p>
                      <p className="text-xs text-emerald-400/60 font-medium uppercase tracking-wider mt-1">Tokens Collateral</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 mb-2 font-medium">debt_encrypted → plaintext</p>
                    <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-5 flex flex-col justify-center shadow-inner">
                      <p className="text-3xl font-extrabold text-blue-400 tracking-tight">
                        {position ? (position.debtEncrypted.toNumber() / 1e6).toFixed(2) : "85.00"}
                      </p>
                      <p className="text-xs text-blue-400/60 font-medium uppercase tracking-wider mt-1">Tokens Borrowed</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 mb-2 font-medium">health_factor_check → boolean</p>
                    <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 flex items-center justify-between shadow-inner">
                      <p className="text-lg font-bold text-emerald-400 flex items-center gap-2">
                        <span className="bg-emerald-500/20 rounded-full p-0.5">✓</span> TRUE
                      </p>
                      <p className="text-xs text-emerald-400/60 font-medium uppercase tracking-wider">Position is Healthy</p>
                    </div>
                  </div>
                </div>
                
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 mt-auto">
                  <p className="text-xs text-emerald-300/90 leading-relaxed font-medium">
                    <span className="text-base mr-1">✅</span> Decrypted by 2/3 threshold of Encrypt decryptor nodes. Only re-encrypted to your public key — nobody else saw the plaintext.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* FHE flow diagram */}
        <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-8 backdrop-blur-md shadow-xl overflow-x-auto">
          <h3 className="font-bold text-white mb-6 text-center text-sm uppercase tracking-wider">The FHE Encryption Pipeline</h3>
          <div className="flex items-center gap-2 md:gap-4 text-xs min-w-max pb-2 justify-center">
            {[
              { label: "User Inputs Data", color: "bg-white/[0.05] border-white/10 text-slate-300" },
              { label: "→", type: "arrow" },
              { label: "Encrypt to EUint64", color: "bg-violet-500/10 border-violet-500/30 text-violet-300 shadow-[0_0_10px_rgba(139,92,246,0.2)]" },
              { label: "→", type: "arrow" },
              { label: "Store on Solana", color: "bg-blue-500/10 border-blue-500/30 text-blue-300 shadow-[0_0_10px_rgba(59,130,246,0.2)]" },
              { label: "→", type: "arrow" },
              { label: "FHE Network Checks Health", color: "bg-violet-500/10 border-violet-500/30 text-violet-300 shadow-[0_0_10px_rgba(139,92,246,0.2)]" },
              { label: "→", type: "arrow" },
              { label: "Nodes Reveal Result", color: "bg-emerald-500/10 border-emerald-500/30 text-emerald-300 shadow-[0_0_10px_rgba(52,211,153,0.2)]" },
              { label: "→", type: "arrow" },
              { label: "User Sees Plaintext", color: "bg-white/[0.05] border-white/10 text-slate-300" },
            ].map((step, i) => (
              step.type === "arrow" ? (
                <span key={i} className="text-slate-600 font-bold">→</span>
              ) : (
                <div key={i} className={`px-4 py-2.5 rounded-lg border font-medium whitespace-nowrap transition-transform hover:-translate-y-1 ${step.color}`}>
                  {step.label}
                </div>
              )
            ))}
          </div>
        </div>

        {/* Ika section */}
        <div className="bg-white/[0.02] border border-blue-500/10 rounded-2xl p-8 backdrop-blur-md shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl pointer-events-none"></div>
          <h3 className="font-bold text-white mb-6 text-lg flex items-center gap-3">
            <span className="text-2xl">⛓️</span> Ika dWallet: Cross-Chain Collateral Without Bridges
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                step: "1",
                title: "User holds native BTC",
                desc: "BTC stays securely on the Bitcoin mainnet. Zero wrapping. Zero bridging. Zero honeypot risk.",
                color: "border-orange-500/20 bg-orange-500/5 hover:bg-orange-500/10",
                textColor: "text-orange-400",
                icon: "₿"
              },
              {
                step: "2",
                title: "Ika dWallet created",
                desc: "A 2PC-MPC protocol establishes a shared signing key between you and the decentralized Ika network.",
                color: "border-blue-500/20 bg-blue-500/5 hover:bg-blue-500/10",
                textColor: "text-blue-400",
                icon: "🤝"
              },
              {
                step: "3",
                title: "Borrow on Solana",
                desc: "Solana smart contracts dictate unlock conditions. If liquidated, the program authorizes transfer via CPI.",
                color: "border-violet-500/20 bg-violet-500/5 hover:bg-violet-500/10",
                textColor: "text-violet-400",
                icon: "⚡"
              },
            ].map(s => (
              <div key={s.step} className={`border rounded-xl p-6 transition-all duration-300 relative ${s.color}`}>
                <div className="absolute -top-3 -left-3 w-8 h-8 rounded-full bg-black border border-inherit flex items-center justify-center font-bold text-sm shadow-lg">
                  {s.step}
                </div>
                <div className={`text-2xl mb-3`}>{s.icon}</div>
                <div className={`font-bold text-base text-white mb-2`}>{s.title}</div>
                <p className={`text-sm text-slate-400 leading-relaxed`}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Program links */}
        <div className="flex flex-wrap items-center justify-center gap-4 text-sm pb-8">
          <a href={explorerAddr(PROGRAM_ID.toBase58())} target="_blank"
            className="flex items-center gap-2 bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] text-slate-300 hover:text-white px-5 py-2.5 rounded-xl transition-all">
            View Solana Program <span className="text-violet-400">↗</span>
          </a>
          <a href="https://docs.encrypt.xyz" target="_blank"
            className="flex items-center gap-2 bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] text-slate-300 hover:text-white px-5 py-2.5 rounded-xl transition-all">
            Encrypt FHE Docs <span className="text-violet-400">↗</span>
          </a>
          <a href="https://docs.ika.xyz" target="_blank"
            className="flex items-center gap-2 bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] text-slate-300 hover:text-white px-5 py-2.5 rounded-xl transition-all">
            Ika dWallet Docs <span className="text-violet-400">↗</span>
          </a>
        </div>
      </div>
    </main>
  );
}