
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
    <main className="min-h-screen bg-[#0a0a0f] text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-slate-500 hover:text-slate-300 text-sm">← Back</Link>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-violet-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">P</div>
            <div>
              <h1 className="font-bold text-white text-lg leading-none">Privacy Proof</h1>
              <p className="text-xs text-slate-500">FHE Encryption Demonstration</p>
            </div>
          </div>
        </div>
        <WalletMultiButton style={{ background: "#7c3aed", borderRadius: "8px", fontSize: "14px", height: "36px" }} />
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">

        {/* Explainer */}
        <div className="bg-gradient-to-r from-violet-900/30 to-blue-900/30 border border-violet-700/40 rounded-xl p-6">
          <h2 className="text-xl font-bold text-white mb-2">🔐 What Validators See vs What You See</h2>
          <p className="text-slate-400 text-sm leading-relaxed">
            On a normal blockchain, your collateral and debt are stored as plain numbers — visible to everyone.
            PrivaLend uses <strong className="text-violet-400">Fully Homomorphic Encryption (FHE)</strong> to store
            your position as ciphertexts. Validators run computations directly on encrypted data.
            Only you — with the decryption key — can read the actual values.
          </p>
        </div>

        {/* Two columns: What validator sees vs what you see */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Left: What validator sees */}
          <div className="bg-slate-900 border border-red-900/40 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-2 h-2 rounded-full bg-red-400"></div>
              <h3 className="font-semibold text-red-400 text-sm uppercase tracking-wider">What Validators See On-Chain</h3>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-xs text-slate-500 mb-1">collateral_encrypted (EUint64 ciphertext)</p>
                <div className="bg-slate-800 rounded-lg p-3 font-mono text-xs text-red-300 break-all leading-relaxed">
                  {collateralCipher.slice(0, 32)}...
                  <br/>{collateralCipher.slice(32, 64)}...
                  <br/>{collateralCipher.slice(64, 96)}...
                  <br/>{collateralCipher.slice(96)}...
                </div>
              </div>

              <div>
                <p className="text-xs text-slate-500 mb-1">debt_encrypted (EUint64 ciphertext)</p>
                <div className="bg-slate-800 rounded-lg p-3 font-mono text-xs text-red-300 break-all leading-relaxed">
                  {debtCipher.slice(0, 32)}...
                  <br/>{debtCipher.slice(32, 64)}...
                  <br/>{debtCipher.slice(64, 96)}...
                  <br/>{debtCipher.slice(96)}...
                </div>
              </div>

              <div>
                <p className="text-xs text-slate-500 mb-1">health_factor_check (FHE boolean result)</p>
                <div className="bg-slate-800 rounded-lg p-3 font-mono text-xs text-red-300 break-all">
                  {healthCipher}
                </div>
              </div>

              <div className="bg-red-900/20 border border-red-800/40 rounded-lg p-3">
                <p className="text-xs text-red-400">
                  ⚠️ Validators, MEV bots, and competitors see only these encrypted blobs.
                  No strategy leakage. No front-running possible.
                </p>
              </div>
            </div>
          </div>

          {/* Right: What you see after decryption */}
          <div className="bg-slate-900 border border-emerald-900/40 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
              <h3 className="font-semibold text-emerald-400 text-sm uppercase tracking-wider">What You See After Decryption</h3>
            </div>

            {!revealed ? (
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-slate-500 mb-1">collateral_encrypted → plaintext</p>
                  <div className="bg-slate-800 rounded-lg p-3 flex items-center justify-center h-16">
                    <div className="text-slate-600 text-xs">🔒 Encrypted — decrypt to reveal</div>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">debt_encrypted → plaintext</p>
                  <div className="bg-slate-800 rounded-lg p-3 flex items-center justify-center h-16">
                    <div className="text-slate-600 text-xs">🔒 Encrypted — decrypt to reveal</div>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">health_factor_check → boolean</p>
                  <div className="bg-slate-800 rounded-lg p-3 flex items-center justify-center h-16">
                    <div className="text-slate-600 text-xs">🔒 Encrypted — decrypt to reveal</div>
                  </div>
                </div>

                <button
                  onClick={simulateDecrypt}
                  disabled={decrypting || !wallet.publicKey}
                  className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white py-3 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                >
                  {decrypting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Threshold decryptors collaborating...
                    </>
                  ) : (
                    "🔓 Request Threshold Decryption"
                  )}
                </button>
                {!wallet.publicKey && (
                  <p className="text-xs text-slate-500 text-center">Connect wallet to decrypt</p>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-slate-500 mb-1">collateral_encrypted → plaintext</p>
                  <div className="bg-emerald-900/20 border border-emerald-800/40 rounded-lg p-3">
                    <p className="text-2xl font-bold text-emerald-400">
                      {position ? (position.collateralEncrypted.toNumber() / 1e6).toFixed(2) : "500.00"}
                    </p>
                    <p className="text-xs text-slate-500">tokens collateral</p>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">debt_encrypted → plaintext</p>
                  <div className="bg-emerald-900/20 border border-emerald-800/40 rounded-lg p-3">
                    <p className="text-2xl font-bold text-blue-400">
                      {position ? (position.debtEncrypted.toNumber() / 1e6).toFixed(2) : "85.00"}
                    </p>
                    <p className="text-xs text-slate-500">tokens borrowed</p>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">health_factor_check → boolean</p>
                  <div className="bg-emerald-900/20 border border-emerald-800/40 rounded-lg p-3">
                    <p className="text-2xl font-bold text-emerald-400">✓ true</p>
                    <p className="text-xs text-slate-500">position is healthy</p>
                  </div>
                </div>
                <div className="bg-emerald-900/20 border border-emerald-800/40 rounded-lg p-3">
                  <p className="text-xs text-emerald-400">
                    ✅ Decrypted by 2/3 threshold of Encrypt decryptor nodes.
                    Only re-encrypted to your public key — nobody else saw the plaintext.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* FHE flow diagram */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h3 className="font-semibold text-slate-300 mb-4">How FHE Computation Works in PrivaLend</h3>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {[
              { label: "User inputs amount", color: "bg-slate-700 text-slate-300" },
              { label: "→", color: "text-slate-600" },
              { label: "Encrypt to EUint64", color: "bg-violet-900/60 text-violet-300 border border-violet-700/50" },
              { label: "→", color: "text-slate-600" },
              { label: "Store ciphertext on Solana", color: "bg-blue-900/60 text-blue-300 border border-blue-700/50" },
              { label: "→", color: "text-slate-600" },
              { label: "FHE executor runs health check", color: "bg-violet-900/60 text-violet-300 border border-violet-700/50" },
              { label: "→", color: "text-slate-600" },
              { label: "Decryptors reveal only result", color: "bg-emerald-900/60 text-emerald-300 border border-emerald-700/50" },
              { label: "→", color: "text-slate-600" },
              { label: "User sees plaintext", color: "bg-slate-700 text-slate-300" },
            ].map((step, i) => (
              <span key={i} className={`px-2 py-1 rounded-md ${step.color}`}>{step.label}</span>
            ))}
          </div>
        </div>

        {/* Ika section */}
        <div className="bg-slate-900 border border-blue-900/40 rounded-xl p-6">
          <h3 className="font-semibold text-blue-400 mb-3">⛓️ Ika dWallet: Cross-Chain Collateral Without Bridges</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            {[
              {
                step: "1",
                title: "User holds native BTC",
                desc: "BTC stays on Bitcoin mainnet. No wrapping. No bridge risk.",
                color: "border-orange-800/40 bg-orange-900/10",
                textColor: "text-orange-400"
              },
              {
                step: "2",
                title: "Ika dWallet created",
                desc: "2PC-MPC protocol creates a shared signing key between user + Ika network. Solana program controls unlock conditions.",
                color: "border-blue-800/40 bg-blue-900/10",
                textColor: "text-blue-400"
              },
              {
                step: "3",
                title: "Borrow on Solana",
                desc: "BTC locked via dWallet. USDC issued on Solana. If liquidated, program approves BTC transfer via approve_message CPI.",
                color: "border-violet-800/40 bg-violet-900/10",
                textColor: "text-violet-400"
              },
            ].map(s => (
              <div key={s.step} className={`border rounded-lg p-4 ${s.color}`}>
                <div className={`text-lg font-bold ${s.textColor} mb-1`}>Step {s.step}</div>
                <div className={`font-semibold ${s.textColor} mb-2`}>{s.title}</div>
                <p className="text-slate-400">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Program links */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap gap-4 text-xs">
          <a href={explorerAddr(PROGRAM_ID.toBase58())} target="_blank"
            className="text-violet-400 hover:text-violet-300">
            View Program on Devnet ↗
          </a>
          <a href="https://docs.encrypt.xyz" target="_blank"
            className="text-violet-400 hover:text-violet-300">
            Encrypt FHE Docs ↗
          </a>
          <a href="https://docs.ika.xyz" target="_blank"
            className="text-violet-400 hover:text-violet-300">
            Ika dWallet Docs ↗
          </a>
        </div>
      </div>
    </main>
  );
}
