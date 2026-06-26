"use client";

import React, { useEffect, useState, useRef } from "react";
import { Layout } from "../../components/layout/Layout";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Alert } from "../../components/ui/Alert";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { invoke, listen } from "@/lib/tauri";
import {
  Send,
  Cpu,
  Zap,
  HardDrive,
  ShieldAlert,
  Bot,
  User,
  RefreshCw,
  Download,
  Upload,
  Trash2,
  Globe,
  Database,
  CheckCircle2
} from "lucide-react";

interface Model {
  id: string;
  display_name: string;
  ollama_tag: string;
  category: string;
  download_gb: number;
  memory_gb: number;
  description?: string;
  good_at?: string;
  license?: string;
  recommended?: boolean;
  source: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface PerformanceStats {
  tokens_per_second: number;
  first_token_ms: number;
  memory_used_gb: number;
}

export default function PlaygroundPage() {
  const [activeTab, setActiveTab] = useState<"chat" | "models">("chat");

  const [models, setModels] = useState<Model[]>([]);
  const [selectedModelTag, setSelectedModelTag] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetchingModels, setFetchingModels] = useState(true);
  const [stats, setStats] = useState<PerformanceStats | null>(null);

  // HF Downloader State
  const [hfRepoId, setHfRepoId] = useState("");
  const [hfFilename, setHfFilename] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [downloadPct, setDownloadPct] = useState(0);
  const [downloadStatus, setDownloadStatus] = useState("");

  // Local Register State
  const [localName, setLocalName] = useState("");
  const [localPath, setLocalPath] = useState("");
  const [localMemory, setLocalMemory] = useState("6.0");
  const [localSize, setLocalSize] = useState("3.5");
  const [registering, setRegistering] = useState(false);

  // Success / Error alerts
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchModels = async () => {
    try {
      setFetchingModels(true);
      const res: Model[] = await invoke("list_models");
      setModels(res);
      if (res.length > 0 && !selectedModelTag) {
        setSelectedModelTag(res[0].ollama_tag);
      }
      setFetchingModels(false);
    } catch (e) {
      console.error(e);
      setFetchingModels(false);
    }
  };

  const searchStr = typeof window !== "undefined" ? window.location.search : "";

  useEffect(() => {
    const params = new URLSearchParams(searchStr);
    if (params.get("tab") === "models") {
      setActiveTab("models");
    } else {
      setActiveTab("chat");
    }
  }, [searchStr]);

  useEffect(() => {
    fetchModels();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Listen to HF download progress
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    const setupListener = async () => {
      unlisten = await listen<{ pct: number; status: string }>(
        "hf_download_progress",
        (event) => {
          const { pct, status } = event.payload;
          setDownloadPct(pct);
          setDownloadStatus(status);
          if (pct >= 100) {
            setDownloading(false);
            setSuccessMsg(`Successfully pulled Hugging Face GGUF model: ${hfRepoId.split("/")[1]}`);
            setHfRepoId("");
            setHfFilename("");
            fetchModels();
          }
        }
      );
    };
    if (hfRepoId) {
      setupListener();
    }
    return () => {
      if (unlisten) unlisten();
    };
  }, [hfRepoId]);

  const activeModel = models.find((m) => m.ollama_tag === selectedModelTag);

  const handleSend = async () => {
    if (!inputMessage.trim() || !selectedModelTag) return;

    const userMsg: Message = {
      role: "user",
      content: inputMessage,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputMessage("");
    setLoading(true);

    try {
      const chatHistory = messages.map((m) => ({ role: m.role, content: m.content }));
      chatHistory.push({ role: "user", content: userMsg.content });

      const res = await invoke("generate_chat_response", {
        model: selectedModelTag,
        prompt: userMsg.content,
        history: chatHistory
      });

      const assistantMsg: Message = {
        role: "assistant",
        content: res.text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setMessages((prev) => [...prev, assistantMsg]);
      setStats({
        tokens_per_second: res.tokens_per_second,
        first_token_ms: res.first_token_ms,
        memory_used_gb: res.memory_used_gb
      });
      setLoading(false);
    } catch (e) {
      console.error(e);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "[ERROR] Failed to query local model. Ensure the Ollama port 11434 is running offline.",
          timestamp: new Date().toLocaleTimeString()
        }
      ]);
      setLoading(false);
    }
  };

  const handleClear = () => {
    setMessages([]);
    setStats(null);
  };

  const handleHfDownload = async () => {
    if (!hfRepoId || !hfFilename) return;
    try {
      setErrorMsg("");
      setSuccessMsg("");
      setDownloading(true);
      setDownloadPct(0);
      setDownloadStatus("Connecting to Hugging Face CDN...");
      
      await invoke("download_hf_model", {
        repoId: hfRepoId.trim(),
        filename: hfFilename.trim()
      });
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e.toString() || "Failed to download model from Hugging Face.");
      setDownloading(false);
    }
  };

  const handleLocalRegister = async () => {
    if (!localName || !localPath) return;
    try {
      setErrorMsg("");
      setSuccessMsg("");
      setRegistering(true);
      
      await invoke("register_local_model", {
        name: localName.trim(),
        filePath: localPath.trim(),
        memoryGb: localMemory.trim(),
        sizeGb: localSize.trim()
      });

      setSuccessMsg(`Successfully registered local model: ${localName}`);
      setLocalName("");
      setLocalPath("");
      setRegistering(false);
      fetchModels();
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e.toString() || "Failed to register local model.");
      setRegistering(false);
    }
  };

  const handleUninstall = async (tag: string) => {
    if (!confirm(`Are you sure you want to remove model "${tag}" from your local index?`)) return;
    try {
      setErrorMsg("");
      setSuccessMsg("");
      await invoke("uninstall_model", { tag });
      setSuccessMsg(`Model "${tag}" uninstalled successfully.`);
      fetchModels();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <Layout title="Agent Playground">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-base font-bold text-gray-900 dark:text-white">Agent Playground</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Interact with local models or manage your offline model library from a single interface.
          </p>
        </div>
        <div className="flex bg-gray-100 dark:bg-gray-905 p-1 rounded-xl border border-gray-200 dark:border-gray-800">
          <button
            onClick={() => setActiveTab("chat")}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === "chat"
                ? "bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm"
                : "text-gray-500 hover:text-gray-900 dark:hover:text-gray-300"
            }`}
          >
            Agent Sandbox
          </button>
          <button
            onClick={() => setActiveTab("models")}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === "models"
                ? "bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm"
                : "text-gray-500 hover:text-gray-900 dark:hover:text-gray-300"
            }`}
          >
            Models Hub
          </button>
        </div>
      </div>

      {activeTab === "chat" ? (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[calc(100vh-190px)]">
          {/* Left side: Chat Console */}
          <div className="lg:col-span-3 border border-gray-250 dark:border-gray-800 rounded-xl overflow-hidden bg-white dark:bg-gray-950 flex flex-col h-full">
            {/* Header config bar */}
            <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30 flex flex-col sm:flex-row gap-3 justify-between sm:items-center">
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Target Model:</span>
                {fetchingModels ? (
                  <div className="h-4 w-28 bg-gray-150 dark:bg-gray-800 animate-pulse rounded" />
                ) : (
                  <select
                    value={selectedModelTag}
                    onChange={(e) => setSelectedModelTag(e.target.value)}
                    className="input py-1.5 px-3 text-xs w-64 bg-white dark:bg-gray-900"
                  >
                    {models.map((m) => (
                      <option key={m.id} value={m.ollama_tag}>
                        {m.display_name} [{m.source}]
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <Button onClick={handleClear} variant="secondary" size="sm" className="flex items-center gap-1.5 self-end sm:self-auto">
                <RefreshCw className="h-3.5 w-3.5" /> Clear History
              </Button>
            </div>

            {/* Messages window */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[300px]">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center text-gray-500 dark:text-gray-400">
                  <Bot className="h-16 w-16 text-gray-300 dark:text-gray-800 mb-3" />
                  <h4 className="font-semibold text-sm text-gray-900 dark:text-white mb-1">Local Sandbox Ready</h4>
                  <p className="text-xs max-w-sm">
                    Send a prompt. The response will load locally from your machine cores without any internet connection.
                  </p>
                </div>
              ) : (
                messages.map((m, idx) => (
                  <div
                    key={idx}
                    className={`flex gap-3 max-w-[85%] ${m.role === "user" ? "ml-auto flex-row-reverse" : ""}`}
                  >
                    <div
                      className={`p-2 rounded-full h-8 w-8 flex items-center justify-center ${
                        m.role === "user" ? "bg-primary text-white" : "bg-gray-150 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                      }`}
                    >
                      {m.role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                    </div>
                    <div>
                      <div
                        className={`p-3.5 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap ${
                          m.role === "user"
                            ? "bg-primary text-white rounded-tr-none"
                            : "bg-gray-100 dark:bg-gray-900 text-gray-850 dark:text-gray-200 border border-gray-150 dark:border-gray-850 rounded-tl-none"
                        }`}
                      >
                        {m.content}
                      </div>
                      <span className="text-[10px] text-gray-400 dark:text-gray-500 mt-1 block px-1 text-right">
                        {m.timestamp}
                      </span>
                    </div>
                  </div>
                ))
              )}
              {loading && (
                <div className="flex gap-3 max-w-[80%]">
                  <div className="p-2 rounded-full h-8 w-8 bg-gray-150 dark:bg-gray-800 text-gray-700 dark:text-gray-300 flex items-center justify-center">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="p-4 bg-gray-100 dark:bg-gray-900 text-xs rounded-2xl rounded-tl-none border border-gray-150 dark:border-gray-850">
                    <div className="flex gap-1.5 items-center py-1">
                      <span className="h-2 w-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="h-2 w-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="h-2 w-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Footer input field */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-800 flex gap-2.5">
              <input
                type="text"
                placeholder="Ask the local model a question..."
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                className="input flex-1 text-xs py-2.5 px-4 bg-gray-50/50 dark:bg-gray-900/50"
                disabled={loading || !selectedModelTag}
              />
              <Button onClick={handleSend} disabled={loading || !inputMessage.trim() || !selectedModelTag} className="flex items-center gap-1">
                <Send className="h-3.5 w-3.5" /> Send
              </Button>
            </div>
          </div>

          {/* Right side: Model telemetry info panels */}
          <div className="space-y-4">
            <Card className="p-4 space-y-4">
              <h3 className="font-bold text-xs text-gray-900 dark:text-white uppercase tracking-wider border-b border-gray-200 dark:border-gray-800 pb-2">
                Performance Specs
              </h3>

              {stats ? (
                <div className="space-y-3.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                      <Zap className="h-3.5 w-3.5 text-amber-500" /> Response Speed
                    </span>
                    <span className="font-bold text-gray-950 dark:text-white">{stats.tokens_per_second.toFixed(1)} t/s</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                      <Zap className="h-3.5 w-3.5 text-blue-500" /> Latency to First Token
                    </span>
                    <span className="font-bold text-gray-950 dark:text-white">{stats.first_token_ms} ms</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                      <Cpu className="h-3.5 w-3.5 text-indigo-500" /> Memory (RAM) Draw
                    </span>
                    <span className="font-bold text-gray-950 dark:text-white">{stats.memory_used_gb.toFixed(1)} GB</span>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-gray-500 dark:text-gray-400 py-4 text-center">
                  Send a prompt to measure hardware execution speed.
                </div>
              )}
            </Card>

            <Card className="p-4 space-y-4">
              <h3 className="font-bold text-xs text-gray-900 dark:text-white uppercase tracking-wider border-b border-gray-200 dark:border-gray-800 pb-2">
                Model Profile
              </h3>
              {activeModel ? (
                <div className="space-y-3 text-[11px] text-gray-600 dark:text-gray-300">
                  <div className="flex justify-between">
                    <span>Source:</span>
                    <span className="font-bold text-gray-900 dark:text-white">{activeModel.source}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Ollama Tag:</span>
                    <span className="font-mono bg-gray-50 dark:bg-gray-900 px-1.5 py-0.5 rounded text-[10px] text-gray-800 dark:text-gray-200 font-semibold">{activeModel.ollama_tag}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>VRAM footprint:</span>
                    <span className="font-bold text-gray-900 dark:text-white">{activeModel.memory_gb} GB</span>
                  </div>
                  <div className="flex justify-between">
                    <span>File size:</span>
                    <span className="font-bold text-gray-900 dark:text-white">{activeModel.download_gb} GB</span>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-gray-500 dark:text-gray-400 text-center py-2">No active model loaded.</div>
              )}
            </Card>

            <Card className="p-4 bg-emerald-50/50 dark:bg-emerald-950/15 border-emerald-100 dark:border-emerald-900/50">
              <h4 className="font-semibold text-xs text-emerald-800 dark:text-emerald-400 mb-1.5 flex items-center gap-1.5">
                <ShieldAlert className="h-4 w-4" /> 100% Offline & Secure
              </h4>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-normal">
                Inference is calculated locally on your CPU/GPU cores. No text logs, secrets, or inputs are routed online.
              </p>
            </Card>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {successMsg && (
            <Alert variant="success" title="Success" className="mb-6">
              {successMsg}
            </Alert>
          )}

          {errorMsg && (
            <Alert variant="error" title="Error" className="mb-6">
              {errorMsg}
            </Alert>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Installed Models List */}
            <div className="lg:col-span-2 space-y-4">
              <Card className="p-5">
                <h3 className="font-bold text-sm text-gray-950 dark:text-white mb-4 flex items-center gap-1.5">
                  <Database className="h-4.5 w-4.5 text-primary" /> Installed Local Models Pool
                </h3>

                {fetchingModels ? (
                  <div className="flex items-center justify-center py-10">
                    <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
                  </div>
                ) : models.length === 0 ? (
                  <div className="text-center py-10 text-xs text-gray-500">No models registered.</div>
                ) : (
                  <div className="space-y-4">
                    {models.map((model) => (
                      <div
                        key={model.id}
                        className="p-4 bg-gray-50 dark:bg-gray-900/50 border border-gray-150 dark:border-gray-850 rounded-xl flex flex-col sm:flex-row justify-between sm:items-center gap-4 hover:border-primary/45 transition"
                      >
                        <div className="space-y-1.5 flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-semibold text-xs text-gray-950 dark:text-white truncate">
                              {model.display_name}
                            </h4>
                            <span className="bg-primary/10 text-primary text-[9px] px-2 py-0.5 rounded font-bold">
                              {model.source}
                            </span>
                            {model.recommended && (
                              <span className="bg-emerald-500/10 text-emerald-500 text-[9px] px-2 py-0.5 rounded font-bold">
                                Default
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-gray-500 dark:text-gray-400">{model.description}</p>
                          
                          <div className="flex flex-wrap gap-3 text-[10px] text-gray-400 font-medium">
                            <span>Size: {model.download_gb.toFixed(1)} GB</span>
                            <span>•</span>
                            <span>VRAM limits: {model.memory_gb.toFixed(1)} GB</span>
                            <span>•</span>
                            <span className="font-mono text-[9px]">Tag: {model.ollama_tag}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-auto">
                          {model.source !== "Ollama" ? (
                            <button
                              onClick={() => handleUninstall(model.ollama_tag)}
                              className="btn btn-danger btn-sm p-2"
                              aria-label="Delete custom model"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          ) : (
                            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-semibold">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Active Core
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            {/* Hugging Face / Local Weight registry tools */}
            <div className="space-y-6">
              {/* Hugging Face Puller */}
              <Card className="p-5">
                <h3 className="font-bold text-sm text-gray-950 dark:text-white mb-2 flex items-center gap-1.5">
                  <Globe className="h-4.5 w-4.5 text-primary" /> Hugging Face GGUF Puller
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 leading-normal">
                  Enter any GGUF quantization repository details on Hugging Face to download the weights directly to your local sandbox cache.
                </p>

                <div className="space-y-3.5 text-xs">
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 block mb-1">HF Repository ID</label>
                    <input
                      type="text"
                      placeholder="e.g. Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF"
                      value={hfRepoId}
                      onChange={(e) => setHfRepoId(e.target.value)}
                      className="input py-2 px-3 bg-gray-50/50 dark:bg-gray-900/50"
                      disabled={downloading}
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 block mb-1">GGUF File Pattern</label>
                    <input
                      type="text"
                      placeholder="e.g. *q4_k_m.gguf"
                      value={hfFilename}
                      onChange={(e) => setHfFilename(e.target.value)}
                      className="input py-2 px-3 bg-gray-50/50 dark:bg-gray-900/50"
                      disabled={downloading}
                    />
                  </div>

                  {downloading ? (
                    <div className="space-y-2 py-2">
                      <div className="flex justify-between items-center text-[10px] font-semibold text-gray-500">
                        <span className="truncate max-w-[150px]">{downloadStatus}</span>
                        <span>{downloadPct}%</span>
                      </div>
                      <ProgressBar value={downloadPct} />
                    </div>
                  ) : (
                    <Button
                      onClick={handleHfDownload}
                      disabled={!hfRepoId || !hfFilename}
                      className="w-full justify-center flex items-center gap-1.5 mt-2"
                    >
                      <Download className="h-4 w-4" /> Download HF GGUF
                    </Button>
                  )}
                </div>
              </Card>

              {/* Local Model Registration */}
              <Card className="p-5">
                <h3 className="font-bold text-sm text-gray-950 dark:text-white mb-2 flex items-center gap-1.5">
                  <Upload className="h-4.5 w-4.5 text-primary" /> Register Local Weight (.gguf)
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 leading-normal">
                  Register a model that you've already downloaded. PreceptaAI will map its path locally without re-downloading.
                </p>

                <div className="space-y-3.5 text-xs">
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 block mb-1">Model Name</label>
                    <input
                      type="text"
                      placeholder="e.g. My Custom Llama 3"
                      value={localName}
                      onChange={(e) => setLocalName(e.target.value)}
                      className="input py-2 px-3 bg-gray-50/50 dark:bg-gray-900/50"
                      disabled={registering}
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 block mb-1">Absolute File Path (.gguf)</label>
                    <input
                      type="text"
                      placeholder="e.g. /Users/username/models/llama.gguf"
                      value={localPath}
                      onChange={(e) => setLocalPath(e.target.value)}
                      className="input py-2 px-3 bg-gray-50/50 dark:bg-gray-900/50"
                      disabled={registering}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-semibold text-gray-500 block mb-1">Required RAM (GB)</label>
                      <input
                        type="number"
                        step="0.5"
                        value={localMemory}
                        onChange={(e) => setLocalMemory(e.target.value)}
                        className="input py-2 px-3 bg-gray-50/50 dark:bg-gray-900/50"
                        disabled={registering}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-gray-500 block mb-1">File Size (GB)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={localSize}
                        onChange={(e) => setLocalSize(e.target.value)}
                        className="input py-2 px-3 bg-gray-50/50 dark:bg-gray-900/50"
                        disabled={registering}
                      />
                    </div>
                  </div>

                  <Button
                    onClick={handleLocalRegister}
                    disabled={!localName || !localPath || registering}
                    className="w-full justify-center flex items-center gap-1.5 mt-2"
                  >
                    <Upload className="h-4 w-4" /> Register Local GGUF
                  </Button>
                </div>
              </Card>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
