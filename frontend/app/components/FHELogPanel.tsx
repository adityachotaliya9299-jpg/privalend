"use client";
import { useState, useEffect, useRef } from "react";
import { onLog, FHELog } from "../lib/fhe-logger";

export function FHELogPanel() {
  const [logs, setLogs] = useState<FHELog[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = onLog(log => {
      setLogs(prev => [...prev.slice(-49), log]);
    });
    return unsub;
  }, []);

 useEffect(() => {
    if (!collapsed && logs.length > 0 && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, collapsed]);

  const colors: Record<string, string> = {
    fhe: "text-violet-400",
    ika: "text-blue-400",
    solana: "text-emerald-400",
    error: "text-red-400",
  };

  const badges: Record<string, string> = {
    fhe: "bg-violet-500/20 border-violet-500/40 text-violet-300",
    ika: "bg-blue-500/20 border-blue-500/40 text-blue-300",
    solana: "bg-emerald-500/20 border-emerald-500/40 text-emerald-300",
    error: "bg-red-500/20 border-red-500/40 text-red-300",
  };

  const labels: Record<string, string> = {
    fhe: "ENCRYPT FHE",
    ika: "IKA 2PC-MPC",
    solana: "SOLANA",
    error: "ERROR",
  };

  return (
    <div className="bg-black/60 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-md shadow-xl">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b border-white/5 cursor-pointer hover:bg-white/[0.02] transition-colors"
        onClick={() => setCollapsed(c => !c)}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse"></div>
            <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" style={{animationDelay: "0.2s"}}></div>
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" style={{animationDelay: "0.4s"}}></div>
          </div>
          <span className="text-xs font-bold text-white tracking-wider uppercase">Cryptographic Execution Log</span>
          {logs.length > 0 && (
            <span className="text-xs text-slate-500 bg-white/5 px-2 py-0.5 rounded-full">
              {logs.length} operations
            </span>
          )}
        </div>
        <button className="text-slate-500 hover:text-slate-300 transition-colors text-xs">
          {collapsed ? "▼ EXPAND" : "▲ COLLAPSE"}
        </button>
      </div>

      {/* Log area */}
      {!collapsed && (
        <div ref={scrollRef} className="h-48 overflow-y-auto p-3 space-y-1 font-mono text-xs scrollbar-thin">
          {logs.length === 0 ? (
            <div className="flex items-center justify-center h-full text-slate-600">
              <div className="text-center">
                <div className="text-2xl mb-2">⬡</div>
                <p>Waiting for operations...</p>
                <p className="text-slate-700 mt-1">Deposit collateral to see FHE + Ika in action</p>
              </div>
            </div>
          ) : (
            logs.map(log => (
              <div key={log.id} className="flex items-start gap-2 py-1 border-b border-white/5 last:border-0">
                <span className="text-slate-600 shrink-0">{log.timestamp}</span>
                <span className={`shrink-0 text-[9px] font-bold border px-1.5 py-0.5 rounded ${badges[log.level]}`}>
                  {labels[log.level]}
                </span>
                <div className="flex-1 min-w-0">
                  <span className={`font-medium ${colors[log.level]}`}>{log.message}</span>
                  {log.detail && (
                    <p className="text-slate-600 text-[10px] mt-0.5 truncate">{log.detail}</p>
                  )}
                </div>
                <span className="shrink-0 text-xs">{log.success ? "✓" : "✗"}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}