"use client";

import React, { useEffect, useState } from "react";
import { Layout } from "../../components/layout/Layout";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Alert } from "../../components/ui/Alert";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { invoke, listen } from "@/lib/tauri";
import { Download, Upload, Cpu, Trash2, Globe, Database, FileText, CheckCircle2, ShieldAlert } from "lucide-react";

interface Model {
  id: string;
  display_name: string;
  ollama_tag: string;
  category: string;
  download_gb: number;
  memory_gb: number;
  description: string;
  good_at: string;
  license: string;
  recommended: boolean;
  source: string;
}

export default function ModelsHubPage() {
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);

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

  const fetchModels = async () => {
    try {
      setLoading(true);
      const res: Model[] = await invoke("list_models");
      setModels(res);
      setLoading(false);
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchModels();
  }, []);

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
    setupListener();
    return () => {
      if (unlisten) unlisten();
    };
  }, [hfRepoId]);

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
    <Layout title="Models Hub">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-base font-bold text-gray-900 dark:text-white">Local AI Model Registry</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Install and manage model quantizations locally from Hugging Face or upload GGUF weight files from your local storage.
          </p>
        </div>
      </div>

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
        {/* Left 2 columns: Models List */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="p-5">
            <h3 className="font-bold text-sm text-gray-950 dark:text-white mb-4 flex items-center gap-1.5">
              <Database className="h-4.5 w-4.5 text-primary" /> Installed Local Models Pool
            </h3>

            {loading ? (
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

        {/* Right column: Import / Download Tools */}
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
              Register a model that you've already downloaded. EdgeStack will map its path locally without re-downloading.
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
    </Layout>
  );
}
