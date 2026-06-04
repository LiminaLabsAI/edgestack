"use client";

import React, { useEffect, useState } from "react";
import { Layout } from "../../components/layout/Layout";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { invoke } from "@/lib/tauri";
import { Scale, Zap, Cpu, HardDrive, Play, Bot, ArrowRightLeft } from "lucide-react";

interface Model {
  id: string;
  display_name: string;
  ollama_tag: string;
  download_gb: number;
  memory_gb: number;
  source: string;
}

interface ComparisonResult {
  text: string;
  tokens_per_second: number;
  first_token_ms: number;
  memory_used_gb: number;
  model_name: string;
}

export default function CompareArenaPage() {
  const [models, setModels] = useState<Model[]>([]);
  const [modelATag, setModelATag] = useState("");
  const [modelBTag, setModelBTag] = useState("");
  
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetchingModels, setFetchingModels] = useState(true);

  const [resultA, setResultA] = useState<ComparisonResult | null>(null);
  const [resultB, setResultB] = useState<ComparisonResult | null>(null);

  useEffect(() => {
    const fetchModels = async () => {
      try {
        const res: Model[] = await invoke("list_models");
        setModels(res);
        if (res.length > 0) {
          setModelATag(res[0].ollama_tag);
          setModelBTag(res[1]?.ollama_tag || res[0].ollama_tag);
        }
        setFetchingModels(false);
      } catch (e) {
        console.error(e);
        setFetchingModels(false);
      }
    };
    fetchModels();
  }, []);

  const handleCompare = async () => {
    if (!prompt.trim() || !modelATag || !modelBTag) return;

    setLoading(true);
    setResultA(null);
    setResultB(null);

    const modelA = models.find((m) => m.ollama_tag === modelATag);
    const modelB = models.find((m) => m.ollama_tag === modelBTag);

    try {
      // Execute in parallel
      const [resA, resB] = await Promise.all([
        invoke("generate_chat_response", { model: modelATag, prompt, history: [] }),
        invoke("generate_chat_response", { model: modelBTag, prompt, history: [] })
      ]);

      setResultA({
        text: resA.text,
        tokens_per_second: resA.tokens_per_second,
        first_token_ms: resA.first_token_ms,
        memory_used_gb: resA.memory_used_gb,
        model_name: modelA?.display_name || modelATag
      });

      setResultB({
        text: resB.text,
        tokens_per_second: resB.tokens_per_second,
        first_token_ms: resB.first_token_ms,
        memory_used_gb: resB.memory_used_gb,
        model_name: modelB?.display_name || modelBTag
      });

      setLoading(false);
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  };

  return (
    <Layout title="Model Arena">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-base font-bold text-gray-900 dark:text-white">Side-by-Side Model Arena</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Send a single prompt to two different models simultaneously and benchmark their outputs, latency, and speed.
          </p>
        </div>
      </div>

      {/* Model selectors bar */}
      <Card className="p-4 mb-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-5 text-xs">
          <div className="flex flex-1 flex-col sm:flex-row items-center gap-4 w-full">
            {/* Model A */}
            <div className="w-full flex-1">
              <label className="font-semibold text-gray-500 mb-1.5 block">Model A (Left Column)</label>
              {fetchingModels ? (
                <div className="h-9 w-full bg-gray-150 dark:bg-gray-800 animate-pulse rounded" />
              ) : (
                <select
                  value={modelATag}
                  onChange={(e) => setModelATag(e.target.value)}
                  className="input py-2 px-3 w-full bg-white dark:bg-gray-900"
                >
                  {models.map((m) => (
                    <option key={m.id} value={m.ollama_tag}>
                      {m.display_name} [{m.source}]
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Split Swap Icon */}
            <div className="p-2 text-gray-400 hidden sm:block">
              <ArrowRightLeft className="h-5 w-5" />
            </div>

            {/* Model B */}
            <div className="w-full flex-1">
              <label className="font-semibold text-gray-500 mb-1.5 block">Model B (Right Column)</label>
              {fetchingModels ? (
                <div className="h-9 w-full bg-gray-150 dark:bg-gray-800 animate-pulse rounded" />
              ) : (
                <select
                  value={modelBTag}
                  onChange={(e) => setModelBTag(e.target.value)}
                  className="input py-2 px-3 w-full bg-white dark:bg-gray-900"
                >
                  {models.map((m) => (
                    <option key={m.id} value={m.ollama_tag} disabled={m.ollama_tag === modelATag && models.length > 1}>
                      {m.display_name} [{m.source}]
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Main split canvas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-[calc(100vh-340px)] min-h-[300px]">
        {/* Left Column: Result A */}
        <div className="border border-gray-250 dark:border-gray-800 rounded-xl overflow-hidden bg-white dark:bg-gray-950 flex flex-col h-full">
          {/* Header */}
          <div className="p-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30 flex justify-between items-center text-xs">
            <span className="font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
              <Bot className="h-4 w-4 text-primary" /> Model A: {models.find((m) => m.ollama_tag === modelATag)?.display_name || "Unselected"}
            </span>
          </div>

          {/* Body content */}
          <div className="flex-1 p-4 overflow-y-auto space-y-4">
            {loading && !resultA && (
              <div className="animate-pulse space-y-3">
                <div className="h-4 bg-gray-100 dark:bg-gray-900 rounded w-3/4" />
                <div className="h-4 bg-gray-100 dark:bg-gray-900 rounded" />
                <div className="h-4 bg-gray-100 dark:bg-gray-900 rounded w-5/6" />
              </div>
            )}
            {resultA ? (
              <div className="text-xs leading-relaxed text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                {resultA.text}
              </div>
            ) : !loading && (
              <div className="text-center py-20 text-xs text-gray-400 dark:text-gray-500">
                Awaiting prompt execution...
              </div>
            )}
          </div>

          {/* Performance footer */}
          {resultA && (
            <div className="p-3 border-t border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/10 grid grid-cols-3 gap-2 text-center text-[10px] font-semibold text-gray-500">
              <div className="flex items-center justify-center gap-1 border-r border-gray-200 dark:border-gray-800">
                <Zap className="h-3.5 w-3.5 text-amber-500" /> {resultA.tokens_per_second.toFixed(1)} t/s
              </div>
              <div className="flex items-center justify-center gap-1 border-r border-gray-200 dark:border-gray-800">
                <Zap className="h-3.5 w-3.5 text-blue-500" /> {resultA.first_token_ms} ms
              </div>
              <div className="flex items-center justify-center gap-1">
                <Cpu className="h-3.5 w-3.5 text-indigo-500" /> {resultA.memory_used_gb.toFixed(1)} GB RAM
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Result B */}
        <div className="border border-gray-250 dark:border-gray-800 rounded-xl overflow-hidden bg-white dark:bg-gray-950 flex flex-col h-full">
          {/* Header */}
          <div className="p-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30 flex justify-between items-center text-xs">
            <span className="font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
              <Bot className="h-4 w-4 text-primary" /> Model B: {models.find((m) => m.ollama_tag === modelBTag)?.display_name || "Unselected"}
            </span>
          </div>

          {/* Body content */}
          <div className="flex-1 p-4 overflow-y-auto space-y-4">
            {loading && !resultB && (
              <div className="animate-pulse space-y-3">
                <div className="h-4 bg-gray-100 dark:bg-gray-900 rounded w-3/4" />
                <div className="h-4 bg-gray-100 dark:bg-gray-900 rounded" />
                <div className="h-4 bg-gray-100 dark:bg-gray-900 rounded w-5/6" />
              </div>
            )}
            {resultB ? (
              <div className="text-xs leading-relaxed text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                {resultB.text}
              </div>
            ) : !loading && (
              <div className="text-center py-20 text-xs text-gray-400 dark:text-gray-500">
                Awaiting prompt execution...
              </div>
            )}
          </div>

          {/* Performance footer */}
          {resultB && (
            <div className="p-3 border-t border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/10 grid grid-cols-3 gap-2 text-center text-[10px] font-semibold text-gray-500">
              <div className="flex items-center justify-center gap-1 border-r border-gray-200 dark:border-gray-800">
                <Zap className="h-3.5 w-3.5 text-amber-500" /> {resultB.tokens_per_second.toFixed(1)} t/s
              </div>
              <div className="flex items-center justify-center gap-1 border-r border-gray-200 dark:border-gray-800">
                <Zap className="h-3.5 w-3.5 text-blue-500" /> {resultB.first_token_ms} ms
              </div>
              <div className="flex items-center justify-center gap-1">
                <Cpu className="h-3.5 w-3.5 text-indigo-500" /> {resultB.memory_used_gb.toFixed(1)} GB RAM
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Arena prompt bar */}
      <div className="mt-5 flex gap-2.5">
        <input
          type="text"
          placeholder="Enter prompt to execute on both models simultaneously..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCompare()}
          className="input flex-1 text-xs py-3 px-4 bg-white dark:bg-gray-950 border border-gray-250 dark:border-gray-800 rounded-xl"
          disabled={loading || fetchingModels}
        />
        <Button onClick={handleCompare} disabled={loading || !prompt.trim() || fetchingModels} className="flex items-center gap-1.5 py-3 px-6 text-xs rounded-xl">
          <Play className="h-4 w-4" /> Run Arena
        </Button>
      </div>
    </Layout>
  );
}
