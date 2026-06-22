"use client";

import React, { useState, useEffect, useRef } from "react";

import { Layout } from "@/components/layout/Layout";
import { Card } from "@/components/ui/Card";

export default function WebGPULaunchpad() {
  const [model, setModel] = useState("onnx-community/Llama-3.2-1B-Instruct");
  const [prompt, setPrompt] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("You are a helpful local assistant running inside the browser WebGPU sandbox.");
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState("idle"); // idle | warming | loading | running | success | error
  const [progressMsg, setProgressMsg] = useState("");
  const [stats, setStats] = useState<any>(null);
  const [storagePersisted, setStoragePersisted] = useState<boolean | null>(null);
  const [quotaWarning, setQuotaWarning] = useState<string | null>(null);

  const workerRef = useRef<Worker | null>(null);

  const checkStorageQuota = async () => {
    if (typeof navigator !== "undefined" && navigator.storage && navigator.storage.estimate) {
      try {
        const estimate = await navigator.storage.estimate();
        const quota = estimate.quota || 0;
        const usage = estimate.usage || 0;
        const remaining = quota - usage;
        if (remaining < 2 * 1024 * 1024 * 1024) {
          const remainingGB = (remaining / (1024 * 1024 * 1024)).toFixed(2);
          setQuotaWarning(`Low cache space warning: Only ${remainingGB} GB remaining in browser storage (recommended: >= 2.00 GB).`);
        } else {
          setQuotaWarning(null);
        }
      } catch (e) {
        console.error("Failed to estimate storage quota", e);
      }
    }
  };

  useEffect(() => {
    // 1. Check/Request persistent storage
    if (typeof navigator !== "undefined" && navigator.storage && typeof navigator.storage.persist === "function") {
      navigator.storage.persisted().then((persisted) => {
        setStoragePersisted(persisted);
      });
    }

    // Check storage quota
    checkStorageQuota();

    // 2. Instantiate Web Worker
    workerRef.current = new Worker(new URL("./worker.ts", import.meta.url));
    
    workerRef.current.onmessage = (e: MessageEvent) => {
      const { status, message, result, tokensIn, tokensOut, durationMs } = e.data;
      if (status) {
        setStatus(status);
      }
      if (message) {
        setProgressMsg(message);
      }
      if (status === "success") {
        setOutput(result);
        setStats({ tokensIn, tokensOut, durationMs });
      }
    };

    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  const requestPersistence = async () => {
    if (typeof navigator !== "undefined" && navigator.storage && typeof navigator.storage.persist === "function") {
      const granted = await navigator.storage.persist();
      setStoragePersisted(granted);
    }
  };

  const handleInference = async () => {
    if (!prompt.trim()) return;
    await checkStorageQuota();
    setStatus("warming");
    setOutput("");
    setStats(null);
    workerRef.current?.postMessage({
      model,
      prompt,
      system: systemPrompt,
    });
  };

  return (
    <Layout title="Browser WebGPU Sandbox">
      <div className="flex flex-col gap-6 p-1">
        {quotaWarning && (
          <div className="flex items-center gap-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 p-4 rounded-xl text-amber-700 dark:text-amber-400 text-xs font-semibold">
            <span className="text-sm">⚠️</span>
            <span>{quotaWarning}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Settings Panel */}
          <Card className="lg:col-span-2 space-y-4" title="Configuration" subtitle="Manage model selection and parameters">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">Select Local Model</label>
              <select 
                className="w-full input-field" 
                value={model} 
                onChange={(e) => setModel(e.target.value)}
              >
                <option value="onnx-community/Llama-3.2-1B-Instruct">Llama 3.2 1B Instruct (ONNX Quantized)</option>
                <option value="Xenova/Qwen1.5-0.5B-Chat">Qwen 1.5 0.5B Chat (Lightweight)</option>
                <option value="onnx-community/Phi-3-mini-4k-instruct">Phi-3 Mini 4K Instruct</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">System Instructions</label>
              <textarea 
                className="w-full input-field" 
                rows={3} 
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
              />
            </div>

            <div className="space-y-1.5 pt-2 border-t border-gray-100 dark:border-gray-900">
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">Persistent Storage Cache</label>
              <div className="bg-gray-50 dark:bg-gray-900/50 p-3 rounded-xl border border-gray-150 dark:border-gray-850">
                {storagePersisted === true ? (
                  <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">✅ Protected (Persisted)</span>
                ) : storagePersisted === false ? (
                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 block">⚠️ Ephemeral (Subject to Eviction)</span>
                    <button onClick={requestPersistence} className="btn btn-secondary btn-xs">Request Permanent Cache Lock</button>
                  </div>
                ) : (
                  <span className="text-xs text-gray-500">Unsupported Browser Storage API</span>
                )}
              </div>
            </div>
          </Card>

          {/* Inference Panel */}
          <Card className="lg:col-span-3 space-y-4" title="Execution Sandbox" subtitle="Input prompts and view WebGPU token generation">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">Prompt Input</label>
              <textarea 
                className="w-full input-field" 
                rows={4} 
                placeholder="Type your prompt here..." 
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
            </div>

            <button 
              className={status === "idle" || status === "success" ? "btn btn-primary" : "btn btn-primary opacity-60 cursor-not-allowed"} 
              disabled={status !== "idle" && status !== "success"} 
              onClick={handleInference}
            >
              {status === "idle" || status === "success" ? "Execute WebGPU Pipeline" : "Processing..."}
            </button>

            {/* Execution Progress */}
            {status !== "idle" && (
              <div className="bg-gray-50 dark:bg-gray-900 border border-dashed border-primary/30 p-4 rounded-xl space-y-1.5 mt-4">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-primary uppercase">Device Status: {status.toUpperCase()}</span>
                  <span className="text-xs">⏳</span>
                </div>
                <p className="text-xs text-gray-500 leading-normal">{progressMsg}</p>
              </div>
            )}

            {/* Results Output */}
            {output && (
              <div className="mt-4 border-t border-gray-100 dark:border-gray-800 pt-4 space-y-3">
                <h3 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider">Response Output</h3>
                <pre className="w-full p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/30 text-xs font-mono text-gray-800 dark:text-gray-250 overflow-x-auto whitespace-pre-wrap max-h-64 leading-relaxed">{output}</pre>

                {stats && (
                  <div className="grid grid-cols-3 gap-3 pt-2">
                    <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded-xl border border-gray-100 dark:border-gray-850 text-center">
                      <span className="block text-sm font-black text-primary">{stats.durationMs}ms</span>
                      <span className="block text-[9px] text-gray-400 uppercase font-semibold mt-0.5">Latency</span>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded-xl border border-gray-150 dark:border-gray-850 text-center">
                      <span className="block text-sm font-black text-primary">{stats.tokensIn.toFixed(0)}</span>
                      <span className="block text-[9px] text-gray-400 uppercase font-semibold mt-0.5">Input Tokens</span>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded-xl border border-gray-150 dark:border-gray-850 text-center">
                      <span className="block text-sm font-black text-primary">{stats.tokensOut.toFixed(0)}</span>
                      <span className="block text-[9px] text-gray-400 uppercase font-semibold mt-0.5">Output Tokens</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>
    </Layout>
  );
}
