"use client";
import { motion, useScroll, useTransform, AnimatePresence } from "framer-motion";
import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then(m => m.WalletMultiButton),
  { ssr: false }
);

const WORDS = ["Invisible.", "Private.", "Encrypted.", "Untraceable."];

function TypewriterText() {
  const [index, setIndex] = useState(0);
  const [displayed, setDisplayed] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const word = WORDS[index];
    let timeout: ReturnType<typeof setTimeout>;
    if (!deleting && displayed.length < word.length) {
      timeout = setTimeout(() => setDisplayed(word.slice(0, displayed.length + 1)), 80);
    } else if (!deleting && displayed.length === word.length) {
      timeout = setTimeout(() => setDeleting(true), 1800);
    } else if (deleting && displayed.length > 0) {
      timeout = setTimeout(() => setDisplayed(displayed.slice(0, -1)), 40);
    } else if (deleting && displayed.length === 0) {
      setDeleting(false);
      setIndex((index + 1) % WORDS.length);
    }
    return () => clearTimeout(timeout);
  }, [displayed, deleting, index]);

  return (
    <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-indigo-400">
      {displayed}
      <span className="animate-pulse">|</span>
    </span>
  );
}

function FloatingParticle({ x, y, size, delay }: { x: number; y: number; size: number; delay: number }) {
  return (
    <motion.div
      className="absolute rounded-full bg-violet-500/20 blur-sm"
      style={{ left: `${x}%`, top: `${y}%`, width: size, height: size }}
      animate={{ y: [-20, 20, -20], opacity: [0.2, 0.5, 0.2], scale: [1, 1.2, 1] }}
      transition={{ duration: 4 + delay, repeat: Infinity, ease: "easeInOut", delay }}
    />
  );
}

const particles = Array.from({ length: 20 }, (_, i) => ({
  x: Math.random() * 100,
  y: Math.random() * 100,
  size: Math.random() * 60 + 10,
  delay: Math.random() * 3,
  id: i,
}));

const stats = [
  { value: "65%", label: "Max LTV", color: "text-emerald-400" },
  { value: "FHE", label: "Encryption", color: "text-violet-400" },
  { value: "2PC-MPC", label: "dWallet", color: "text-blue-400" },
  { value: "0", label: "Bridges needed", color: "text-amber-400" },
];

const features = [
  {
    icon: "🔐",
    title: "Fully Homomorphic Encryption",
    desc: "Your collateral and debt stored as EUint64 ciphertexts. Health checks run on encrypted data. Validators see only gibberish.",
    color: "from-violet-500/10 to-violet-500/5",
    border: "border-violet-500/20",
    glow: "shadow-violet-500/10",
  },
  {
    icon: "⛓️",
    title: "Native Bitcoin via Ika dWallets",
    desc: "No bridges. No wrapping. BTC stays on Bitcoin mainnet, controlled via 2PC-MPC threshold signing. Zero-trust custody.",
    color: "from-blue-500/10 to-blue-500/5",
    border: "border-blue-500/20",
    glow: "shadow-blue-500/10",
  },
  {
    icon: "🌑",
    title: "Dark Pool Liquidations",
    desc: "Liquidation check runs as FHE boolean. Position size stays hidden. Reason stays hidden. Only result revealed.",
    color: "from-slate-500/10 to-slate-500/5",
    border: "border-slate-500/20",
    glow: "shadow-slate-500/10",
  },
];

const comparison = [
  { protocol: "Aave", collateral: "🔴 Public", debt: "🔴 Public", liquidation: "🔴 Public", btc: "🔴 Wrapped" },
  { protocol: "Kamino", collateral: "🔴 Public", debt: "🔴 Public", liquidation: "🔴 Public", btc: "🔴 Wrapped" },
  { protocol: "PrivaLend", collateral: "🟢 Encrypted", debt: "🟢 Encrypted", liquidation: "🟢 Hidden", btc: "🟢 Native", highlight: true },
];

export default function Landing() {
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef });
  const heroOpacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);
  const heroY = useTransform(scrollYProgress, [0, 0.5], [0, -80]);

  return (
    <main className="min-h-screen bg-[#030307] text-white overflow-x-hidden">

      {/* Background particles */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        {particles.map(p => <FloatingParticle key={p.id} {...p} />)}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-violet-600/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-600/5 rounded-full blur-3xl" />
      </div>

      {/* Nav */}
      <motion.nav
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6 }}
        className="fixed top-0 left-0 right-0 z-50 px-6 py-4 flex items-center justify-between border-b border-white/5 bg-[#030307]/80 backdrop-blur-xl"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-lg flex items-center justify-center font-bold text-sm shadow-[0_0_20px_rgba(139,92,246,0.4)]">P</div>
          <span className="font-bold text-lg tracking-wide">PRIVALEND</span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm text-slate-400">
          <a href="#features" className="hover:text-white transition-colors">Features</a>
          <a href="#compare" className="hover:text-white transition-colors">Compare</a>
          <Link href="/privacy" className="hover:text-white transition-colors">Privacy Proof</Link>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/app">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white px-5 py-2 rounded-xl text-sm font-bold shadow-[0_0_20px_rgba(139,92,246,0.3)] hover:shadow-[0_0_30px_rgba(139,92,246,0.5)] transition-shadow"
            >
              Launch App →
            </motion.button>
          </Link>
        </div>
      </motion.nav>

      {/* Hero */}
      <motion.section
        ref={heroRef}
        style={{ opacity: heroOpacity, y: heroY }}
        className="min-h-screen flex items-center justify-center px-6 pt-20"
      >
        <div className="max-w-5xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="inline-flex items-center gap-2 bg-violet-500/10 border border-violet-500/20 text-violet-300 px-4 py-2 rounded-full text-sm font-medium mb-8"
          >
            <span className="w-2 h-2 bg-violet-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(167,139,250,0.8)]"></span>
            Live on Solana Devnet • Encrypt FHE + Ika dWallets
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="text-5xl md:text-7xl lg:text-8xl font-extrabold leading-tight mb-6"
          >
            BTC Lending.<br />
            <TypewriterText />
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
            className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto mb-4 leading-relaxed"
          >
            The first dark lending market for native Bitcoin on Solana.
            Collateral, debt, and liquidation risk — fully encrypted.
            Validators see nothing.
          </motion.p>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.8 }}
            className="text-sm text-amber-300/80 mb-10"
          >
            💡 A $10M position on Aave is a target. Here, it is a ghost.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.9 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16"
          >
            <Link href="/app">
              <motion.button
                whileHover={{ scale: 1.05, boxShadow: "0 0 40px rgba(139,92,246,0.6)" }}
                whileTap={{ scale: 0.95 }}
                className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white px-8 py-4 rounded-2xl text-base font-bold shadow-[0_0_30px_rgba(139,92,246,0.4)] transition-all"
              >
                Launch App →
              </motion.button>
            </Link>
            <Link href="/privacy">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="bg-white/5 border border-white/10 text-white px-8 py-4 rounded-2xl text-base font-medium hover:bg-white/10 transition-all"
              >
                🔍 See Privacy Proof
              </motion.button>
            </Link>
          </motion.div>

          {/* Stats row */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 1.1 }}
            className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-2xl mx-auto"
          >
            {stats.map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 1.2 + i * 0.1 }}
                className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 text-center"
              >
                <div className={`text-2xl font-extrabold ${s.color} mb-1`}>{s.value}</div>
                <div className="text-xs text-slate-500">{s.label}</div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </motion.section>

      {/* Features */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-5xl font-extrabold mb-4">
              This product cannot exist<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-indigo-400">
                without both Encrypt and Ika
              </span>
            </h2>
            <p className="text-slate-400 max-w-xl mx-auto">Remove either one and the product collapses. They are fundamental, not decorative.</p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: i * 0.15 }}
                whileHover={{ scale: 1.02, y: -4 }}
                className={`bg-gradient-to-b ${f.color} border ${f.border} rounded-2xl p-6 shadow-xl ${f.glow} cursor-default`}
              >
                <div className="text-4xl mb-4">{f.icon}</div>
                <h3 className="font-bold text-white text-lg mb-3">{f.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison table */}
      <section id="compare" className="py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl md:text-5xl font-extrabold mb-4">
              Every other protocol<br />
              <span className="text-red-400">exposes your position</span>
            </h2>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="bg-white/[0.02] border border-white/10 rounded-2xl overflow-hidden"
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left px-6 py-4 text-slate-400 font-medium">Protocol</th>
                  <th className="text-center px-4 py-4 text-slate-400 font-medium">Collateral</th>
                  <th className="text-center px-4 py-4 text-slate-400 font-medium">Debt</th>
                  <th className="text-center px-4 py-4 text-slate-400 font-medium">Liquidation</th>
                  <th className="text-center px-4 py-4 text-slate-400 font-medium">BTC</th>
                </tr>
              </thead>
              <tbody>
                {comparison.map((row, i) => (
                  <motion.tr
                    key={row.protocol}
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1 }}
                    className={`border-b border-white/5 last:border-0 ${row.highlight ? "bg-violet-500/5" : ""}`}
                  >
                    <td className={`px-6 py-4 font-bold ${row.highlight ? "text-violet-300" : "text-slate-300"}`}>
                      {row.highlight && <span className="mr-2">🏆</span>}{row.protocol}
                    </td>
                    <td className="text-center px-4 py-4">{row.collateral}</td>
                    <td className="text-center px-4 py-4">{row.debt}</td>
                    <td className="text-center px-4 py-4">{row.liquidation}</td>
                    <td className="text-center px-4 py-4">{row.btc}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </motion.div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="bg-gradient-to-b from-violet-900/20 to-indigo-900/10 border border-violet-500/20 rounded-3xl p-12"
          >
            <h2 className="text-3xl md:text-5xl font-extrabold mb-4">
              Ready to lend in the dark?
            </h2>
            <p className="text-slate-400 mb-8">Connect your wallet and experience private DeFi for the first time.</p>
            <Link href="/app">
              <motion.button
                whileHover={{ scale: 1.05, boxShadow: "0 0 60px rgba(139,92,246,0.5)" }}
                whileTap={{ scale: 0.95 }}
                className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white px-10 py-5 rounded-2xl text-lg font-bold shadow-[0_0_40px_rgba(139,92,246,0.4)] transition-all"
              >
                Launch PrivaLend →
              </motion.button>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 px-6 py-8 text-center text-slate-600 text-sm">
        <p>PrivaLend • Built with Encrypt FHE + Ika dWallets on Solana</p>
        <p className="mt-1">
          Program: <span className="font-mono">7WLWShzAzU747a5WVSTHJ7YUNPGPSyjewetJ5YfNA7Sb</span>
        </p>
      </footer>
    </main>
  );
}
