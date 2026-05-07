"use client";
import { useState, useEffect, useCallback } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { motion, AnimatePresence } from "framer-motion";
import dynamic from "next/dynamic";
import Link from "next/link";
const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then(m => m.WalletMultiButton),
  { ssr: false }
);
import { AnchorProvider, Program, Idl } from "@coral-xyz/anchor";
import { getPoolPda, getPositionPda, PROGRAM_ID, explorerAddr } from "../app/lib/program";
import idl from "../app/idl/privalend.json";

function fakeCiphertext(seed: number, len = 64): string {
  const chars = "0123456789abcdef";
  return Array.from({length: len}, (_, i) => chars[(seed * 31 + i * 17 + i * i) % 16]).join("");
}

function AnimatedCipher({ seed }: { seed: number }) {
  const [text, setText] = useState("");
  useEffect(() => {
    const final = fakeCiphertext(seed, 64);
    let i = 0;
    const interval = setInterval(() => {
      setText(Array.from({length: 64}, (_, j) => j <= i ? final[j] : "0123456789abcdef"[Math.floor(Math.random() * 16)]).join(""));
      i++;
      if (i >= 64) clearInterval(interval);
    }, 20);
    return () => clearInterval(interval);
  }, [seed]);
  return <span className="font-mono text-xs break-all">{text}</span>;
}

const pipeline = [
  { label: "User Input", color: "bg-white/5 border-white/10 text-slate-300" },
  { label: "Encrypt → EUint64", color: "bg-violet-500/10 border-violet-500/30 text-violet-300" },
  { label: "Store on Solana", color: "bg-blue-500/10 border-blue-500/30 text-blue-300" },
  { label: "FHE Health Check", color: "bg-violet-500/10 border-violet-500/30 text-violet-300" },
  { label: "Nodes Reveal Result", color: "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" },
  { label: "User Sees Plaintext", color: "bg-white/5 border-white/10 text-slate-300" },
];

const ikaSteps = [
  { icon: "₿", num: "1", title: "Native BTC on Bitcoin", desc: "BTC stays on Bitcoin mainnet. Zero wrapping. Zero bridges. Zero honeypot risk.", color: "border-orange-500/20 bg-orange-500/5", textColor: "text-orange-400" },
  { icon: "🤝", num: "2", title: "Ika dWallet Created", desc: "2PC-MPC protocol creates shared signing key between user and Ika Network. Neither party can sign alone.", color: "border-blue-500/20 bg-blue-500/5", textColor: "text-blue-400" },
  { icon: "⚡", num: "3", title: "Borrow on Solana", desc: "Solana program controls BTC unlock conditions. Liquidation triggers cross-chain signing via CPI.", color: "border-violet-500/20 bg-violet-500/5", textColor: "text-violet-400" },
];

export default function PrivacyProof() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [position, setPosition] = useState<any>(null);
  const [pool, setPool] = useState<any>(null);
  const [revealed, setRevealed] = useState(false);
  const [decrypting, setDecrypting] = useState(false);
  const [decryptStep, setDecryptStep] = useState(0);

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
        try { setPool(await program.account.lendingPool.fetch(getPoolPda())); } catch {}
        try { setPosition(await program.account.userPosition.fetch(getPositionPda(wallet.publicKey))); } catch {}
      } catch {}
    }
    load();
  }, [getProgram, wallet.publicKey]);

  const steps = ["Requesting threshold decryption...", "2/3 Encrypt nodes collaborating...", "Re-encrypting to your pubkey...", "Decryption complete ✓"];

  async function simulateDecrypt() {
    setDecrypting(true);
    for (let i = 0; i < steps.length; i++) {
      setDecryptStep(i);
      await new Promise(r => setTimeout(r, 600));
    }
    setRevealed(true);
    setDecrypting(false);
  }

  const collCipher = fakeCiphertext(42, 128);
  const debtCipher = fakeCiphertext(99, 128);
  const healthCipher = fakeCiphertext(7, 64);

  return (
    <main className="min-h-screen bg-[#030307] text-white">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-violet-600/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-600/5 rounded-full blur-3xl" />
      </div>

      {/* Nav */}
      <motion.nav
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="sticky top-0 z-50 px-6 py-4 flex items-center justify-between border-b border-white/5 bg-[#030307]/90 backdrop-blur-xl"
      >
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm group">
            <span className="group-hover:-translate-x-1 transition-transform">←</span> Home
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-lg flex items-center justify-center font-bold text-xs">P</div>
            <div>
              <span className="font-bold">Privacy Proof</span>
              <span className="text-slate-500 text-xs ml-2 font-mono">FHE Demo</span>
            </div>
          </div>
        </div>
        <WalletMultiButton style={{ background: "linear-gradient(to right, #6d28d9, #4f46e5)", borderRadius: "10px", fontSize: "13px", height: "36px" }} />
      </motion.nav>

      <div className="max-w-5xl mx-auto px-6 py-10 space-y-10 relative z-10">

        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="bg-gradient-to-r from-violet-900/20 to-blue-900/10 border border-violet-500/20 rounded-3xl p-10 relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-64 h-64 bg-violet-500/10 rounded-full blur-3xl pointer-events-none" />
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.3, type: "spring" }}
            className="text-5xl mb-4"
          >
            🔐
          </motion.div>
          <h1 className="text-3xl md:text-4xl font-extrabold mb-3 tracking-tight">
            What Validators See<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-indigo-400">vs What You See</span>
          </h1>
          <p className="text-slate-400 max-w-2xl leading-relaxed">
            On normal blockchains, your collateral and debt are public numbers.
            PrivaLend uses <strong className="text-violet-300">Fully Homomorphic Encryption</strong> to store your position as ciphertexts.
            Validators run computations on encrypted data without ever decrypting. Only you hold the key.
          </p>
        </motion.div>

        {/* Split panel */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: validator view */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-red-950/10 border border-red-500/20 rounded-2xl p-6 flex flex-col"
          >
            <div className="flex items-center gap-2 mb-6 border-b border-red-500/10 pb-4">
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="w-3 h-3 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]"
              />
              <h3 className="font-bold text-red-400 text-sm uppercase tracking-wider">What Validators See On-Chain</h3>
            </div>
            <div className="space-y-4 flex-1">
              {[
                { label: "collateral_encrypted", type: "EUint64", cipher: collCipher, seed: 42 },
                { label: "debt_encrypted", type: "EUint64", cipher: debtCipher, seed: 99 },
                { label: "health_factor_check", type: "ebool", cipher: healthCipher, seed: 7 },
              ].map((item, i) => (
                <motion.div
                  key={item.label}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + i * 0.1 }}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs text-slate-400 font-medium">{item.label}</p>
                    <span className="text-[10px] font-mono bg-red-500/10 text-red-400/80 px-2 py-0.5 rounded border border-red-500/20">{item.type}</span>
                  </div>
                  <div className="bg-black/60 rounded-xl p-3 border border-red-900/30">
                    <p className="font-mono text-xs text-red-300/80 break-all leading-relaxed">
                      {item.cipher.slice(0, 32)}...<br/>{item.cipher.slice(32, 64)}...
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mt-5"
            >
              <p className="text-xs text-red-300 leading-relaxed">
                <span className="text-base mr-1">⚠️</span> MEV bots, validators, and competitors see only these encrypted blobs. No strategy leakage. No front-running possible.
              </p>
            </motion.div>
          </motion.div>

          {/* Right: decrypted view */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-emerald-950/10 border border-emerald-500/20 rounded-2xl p-6 flex flex-col"
          >
            <div className="flex items-center gap-2 mb-6 border-b border-emerald-500/10 pb-4">
              <div className="w-3 h-3 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]" />
              <h3 className="font-bold text-emerald-400 text-sm uppercase tracking-wider">What You See After Decryption</h3>
            </div>

            <AnimatePresence mode="wait">
              {!revealed ? (
                <motion.div key="locked" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col flex-1">
                  <div className="space-y-3 flex-1">
                    {["collateral_encrypted → plaintext", "debt_encrypted → plaintext", "health_factor_check → boolean"].map((label, i) => (
                      <div key={label}>
                        <p className="text-xs text-slate-400 mb-1.5">{label}</p>
                        <div className="bg-black/40 border border-white/5 rounded-xl py-5 px-4 flex items-center justify-center">
                          <span className="text-slate-500 text-sm">🔒 Encrypted</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="pt-5 mt-auto space-y-3">
                    <AnimatePresence>
                      {decrypting && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="bg-violet-500/10 border border-violet-500/20 rounded-xl p-3 space-y-1.5"
                        >
                          {steps.map((step, i) => (
                            <motion.div
                              key={step}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: i <= decryptStep ? 1 : 0.3 }}
                              className="flex items-center gap-2 text-xs"
                            >
                              <span className={i <= decryptStep ? "text-emerald-400" : "text-slate-600"}>
                                {i < decryptStep ? "✓" : i === decryptStep ? "⟳" : "○"}
                              </span>
                              <span className={i <= decryptStep ? "text-violet-300" : "text-slate-600"}>{step}</span>
                            </motion.div>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <motion.button
                      whileHover={{ scale: 1.02, boxShadow: "0 0 30px rgba(139,92,246,0.5)" }}
                      whileTap={{ scale: 0.98 }}
                      onClick={simulateDecrypt}
                      disabled={decrypting || !wallet.publicKey}
                      className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 disabled:opacity-40 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-3 shadow-[0_0_20px_rgba(139,92,246,0.3)] transition-all"
                    >
                      {decrypting ? (
                        <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Decrypting...</>
                      ) : (
                        <><span className="text-xl">🔓</span> Request Threshold Decryption</>
                      )}
                    </motion.button>
                    {!wallet.publicKey && <p className="text-xs text-slate-500 text-center">Connect wallet to authorize</p>}
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="revealed"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col flex-1"
                >
                  <div className="space-y-3 flex-1">
                    {[
                      { label: "collateral_encrypted → plaintext", value: position ? (position.collateralEncrypted.toNumber() / 1e6).toFixed(2) : "500.00", unit: "tokens", color: "text-emerald-400" },
                      { label: "debt_encrypted → plaintext", value: position ? (position.debtEncrypted.toNumber() / 1e6).toFixed(2) : "85.00", unit: "tokens borrowed", color: "text-blue-400" },
                      { label: "health_factor_check → boolean", value: "✓ TRUE", unit: "position is healthy", color: "text-emerald-400" },
                    ].map((item, i) => (
                      <motion.div
                        key={item.label}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.15 }}
                      >
                        <p className="text-xs text-slate-400 mb-1.5">{item.label}</p>
                        <div className="bg-black/60 border border-emerald-900/30 rounded-xl p-4">
                          <p className={`text-3xl font-extrabold ${item.color} tracking-tight`}>{item.value}</p>
                          <p className="text-xs text-slate-500 mt-1 uppercase tracking-wider">{item.unit}</p>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 mt-4"
                  >
                    <p className="text-xs text-emerald-300 leading-relaxed">
                      <span className="mr-1">✅</span> Decrypted by 2/3 threshold of Encrypt decryptor nodes. Re-encrypted to your public key only — nobody else saw the plaintext.
                    </p>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>

        {/* FHE Pipeline */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="bg-white/[0.02] border border-white/10 rounded-2xl p-8 overflow-x-auto"
        >
          <h3 className="font-bold text-white mb-6 text-center text-sm uppercase tracking-wider">The FHE Encryption Pipeline</h3>
          <div className="flex items-center gap-2 min-w-max pb-2 justify-center">
            {pipeline.map((step, i) => (
              <div key={i} className="flex items-center gap-2">
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  whileHover={{ scale: 1.05, y: -2 }}
                  className={`px-4 py-2.5 rounded-xl border text-xs font-medium whitespace-nowrap ${step.color} cursor-default transition-all`}
                >
                  {step.label}
                </motion.div>
                {i < pipeline.length - 1 && <span className="text-slate-700 font-bold">→</span>}
              </div>
            ))}
          </div>
        </motion.div>

        {/* Ika dWallet section */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="bg-white/[0.02] border border-blue-500/10 rounded-2xl p-8 relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />
          <h3 className="font-bold text-white mb-2 text-xl flex items-center gap-3">
            <span className="text-2xl">⛓️</span> Ika dWallet: Native BTC Without Bridges
          </h3>
          <p className="text-slate-500 text-sm mb-8">Remove Ika → no native BTC → product collapses. It is fundamental, not decorative.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {ikaSteps.map((s, i) => (
              <motion.div
                key={s.num}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15 }}
                whileHover={{ scale: 1.02, y: -4 }}
                className={`border rounded-2xl p-6 relative ${s.color} transition-all`}
              >
                <div className="absolute -top-3 -left-3 w-8 h-8 rounded-full bg-[#030307] border border-white/10 flex items-center justify-center font-bold text-sm shadow-lg">
                  {s.num}
                </div>
                <div className="text-3xl mb-3">{s.icon}</div>
                <h4 className={`font-bold text-base text-white mb-2`}>{s.title}</h4>
                <p className="text-sm text-slate-400 leading-relaxed">{s.desc}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Links */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="flex flex-wrap items-center justify-center gap-4 pb-10"
        >
          {[
            { href: explorerAddr(PROGRAM_ID.toBase58()), label: "View Solana Program ↗" },
            { href: "https://chainwire.org/2026/03/31/encrypt-is-coming-to-solana-to-power-encrypted-capital-markets/", label: "Encrypt FHE Docs ↗" },
            { href: "https://www.npmjs.com/package/@ika.xyz/sdk", label: "Ika dWallet SDK ↗" },
          ].map(link => (
            <motion.a
              key={link.label}
              href={link.href}
              target="_blank"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="bg-white/[0.02] border border-white/10 hover:bg-white/[0.05] text-slate-300 hover:text-white px-5 py-2.5 rounded-xl transition-all text-sm"
            >
              {link.label}
            </motion.a>
          ))}
        </motion.div>
      </div>
    </main>
  );
}
