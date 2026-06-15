"use client";

import React, { useEffect, useState } from "react";
import { Layout } from "../../components/layout/Layout";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { invoke } from "@/lib/tauri";
import {
  Folder,
  FolderPlus,
  Database,
  FileCode,
  Trash2,
  Download,
  Upload,
  ArrowLeft,
  Settings,
  ShieldAlert,
  Server,
  X
} from "lucide-react";

interface VaultSummary {
  name: string;
  object_count: number;
  total_size_bytes: number;
  last_modified: string | null;
  // Extends with UI options
  region?: string;
  access?: string;
}

interface VaultObject {
  key: string;
  size_bytes: number;
  last_modified: string;
  content_type: string | null;
  workflow_name: string | null;
}

export default function StoragePage() {
  const [buckets, setBuckets] = useState<VaultSummary[]>([]);
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null);
  const [objects, setObjects] = useState<VaultObject[]>([]);
  const [loadingBuckets, setLoadingBuckets] = useState(true);
  const [loadingObjects, setLoadingObjects] = useState(false);

  // Bucket details states (fake metadata saved to localStorage or mocked)
  const [bucketMetadata, setBucketMetadata] = useState<{ [bucketName: string]: { region: string; access: string } }>({});

  // Create Bucket Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newBucketName, setNewBucketName] = useState("");
  const [selectedRegion, setSelectedRegion] = useState("Local (Offline)");
  const [selectedAccess, setSelectedAccess] = useState("Private");
  const [createError, setCreateError] = useState("");

  const fetchBuckets = async () => {
    try {
      setLoadingBuckets(true);
      const res: VaultSummary[] = await invoke("list_vaults");
      
      // Load or build bucket metadata from local storage
      const savedMeta = localStorage.getItem("edgestack_bucket_meta");
      const meta = savedMeta ? JSON.parse(savedMeta) : {};
      
      const enriched = res.map(bucket => {
        if (!meta[bucket.name]) {
          meta[bucket.name] = {
            region: bucket.name.includes("datasets") ? "US-East (N. Virginia)" : "Local (Offline)",
            access: "Private"
          };
        }
        return {
          ...bucket,
          region: meta[bucket.name].region,
          access: meta[bucket.name].access
        };
      });

      localStorage.setItem("edgestack_bucket_meta", JSON.stringify(meta));
      setBucketMetadata(meta);
      setBuckets(enriched);

      if (enriched.length > 0 && !selectedBucket) {
        setSelectedBucket(enriched[0].name);
      }
      setLoadingBuckets(false);
    } catch (e) {
      console.error(e);
      setLoadingBuckets(false);
    }
  };

  const fetchObjects = async (bucketName: string) => {
    try {
      setLoadingObjects(true);
      const res: VaultObject[] = await invoke("list_vault_objects", { vaultName: bucketName });
      setObjects(res);
      setLoadingObjects(false);
    } catch (e) {
      console.error(e);
      setLoadingObjects(false);
    }
  };

  useEffect(() => {
    fetchBuckets();
  }, []);

  useEffect(() => {
    if (selectedBucket) {
      fetchObjects(selectedBucket);
    } else {
      setObjects([]);
    }
  }, [selectedBucket]);

  const handleCreateBucket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBucketName) return;
    try {
      setCreateError("");
      const cleanName = newBucketName.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
      if (cleanName.length < 3) {
        setCreateError("Bucket name must be at least 3 characters long.");
        return;
      }
      
      await invoke("create_vault", { name: cleanName });
      
      // Save metadata
      const savedMeta = localStorage.getItem("edgestack_bucket_meta");
      const meta = savedMeta ? JSON.parse(savedMeta) : {};
      meta[cleanName] = {
        region: selectedRegion,
        access: selectedAccess
      };
      localStorage.setItem("edgestack_bucket_meta", JSON.stringify(meta));
      
      setNewBucketName("");
      setShowCreateModal(false);
      fetchBuckets();
      setSelectedBucket(cleanName);
    } catch (e: any) {
      setCreateError(e.toString() || "Failed to create bucket.");
    }
  };

  const handleDeleteObject = async (key: string) => {
    if (!selectedBucket) return;
    if (!confirm(`Are you sure you want to delete S3 object "${key}"?`)) return;
    try {
      await invoke("delete_vault_object", { vaultName: selectedBucket, key });
      fetchObjects(selectedBucket);
      fetchBuckets(); // refresh stats
    } catch (e) {
      console.error(e);
    }
  };

  const handleUploadFile = async () => {
    if (!selectedBucket) return;
    try {
      // Check if running in Tauri
      const isTauriEnv = typeof window !== "undefined" && (window as any).__TAURI_IPC__ !== undefined;
      
      if (isTauriEnv) {
        const { open } = await import("@tauri-apps/plugin-dialog");
        const selected = await open({
          multiple: false,
          title: "Select File to Upload to S3 Store"
        });
        
        if (selected && typeof selected === "string") {
          await invoke("import_file_to_vault", { vaultName: selectedBucket, srcPath: selected });
          fetchObjects(selectedBucket);
          fetchBuckets();
        }
      } else {
        // Fallback for browser simulation
        const fakeName = prompt("Browser simulation: Enter a mock filename to upload (e.g. data_summary.csv):", "report_analytics.json");
        if (fakeName) {
          await invoke("import_file_to_vault", { vaultName: selectedBucket, srcPath: fakeName });
          fetchObjects(selectedBucket);
          fetchBuckets();
        }
      }
    } catch (e) {
      console.error("Failed to upload file:", e);
      alert(`Upload failed: ${e}`);
    }
  };

  const handleDownloadObject = async (key: string) => {
    if (!selectedBucket) return;
    try {
      const isTauriEnv = typeof window !== "undefined" && (window as any).__TAURI_IPC__ !== undefined;
      
      if (isTauriEnv) {
        const { save } = await import("@tauri-apps/plugin-dialog");
        const defaultPath = key;
        const dest = await save({
          defaultPath,
          title: "Save S3 Object to Local Path"
        });
        
        if (dest && typeof dest === "string") {
          await invoke("download_vault_object", { vaultName: selectedBucket, key, destPath: dest });
          alert(`S3 Object successfully saved to: ${dest}`);
        }
      } else {
        // Browser fallback
        alert(`S3 Object "${key}" downloaded successfully (simulated).`);
      }
    } catch (e) {
      console.error("Failed to download file:", e);
      alert(`Download failed: ${e}`);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <Layout title="S3 Storage Core">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-base font-bold text-gray-900 dark:text-white">Local S3 Storage buckets</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">AWS S3 compatible local block storage emulated via Floci mock runtime APIs</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)} className="flex items-center gap-1.5 shadow-sm">
          <FolderPlus className="h-4 w-4" /> New Bucket
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[calc(100vh-190px)]">
        {/* Left pane: Buckets List */}
        <div className="lg:col-span-1 overflow-y-auto pr-1 space-y-3">
          <div className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold mb-2 pl-1">
            Storage Buckets
          </div>
          
          {loadingBuckets ? (
            <div className="flex justify-center py-10">
              <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : buckets.length === 0 ? (
            <div className="text-center py-10 text-gray-500 text-xs italic">
              No buckets configured.
            </div>
          ) : (
            buckets.map((b) => {
              const isSelected = selectedBucket === b.name;
              return (
                <div
                  key={b.name}
                  onClick={() => setSelectedBucket(b.name)}
                  className={`p-3.5 rounded-lg border cursor-pointer transition flex items-start gap-3 select-none ${
                    isSelected
                      ? "border-primary bg-primary/5 dark:bg-primary/10"
                      : "border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900"
                  }`}
                >
                  <Folder className={`h-4.5 w-4.5 mt-0.5 ${isSelected ? "text-primary fill-primary/10" : "text-gray-400"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-xs text-gray-900 dark:text-white truncate">{b.name}</div>
                    <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 truncate">{b.region}</div>
                    <div className="text-[10px] text-gray-500 dark:text-gray-400 flex justify-between mt-2 font-medium">
                      <span>{b.object_count} objects</span>
                      <span>{formatSize(b.total_size_bytes)}</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right pane: Objects Explorer */}
        <div className="lg:col-span-3 border border-gray-250 dark:border-gray-800 rounded-xl overflow-hidden bg-white dark:bg-gray-950 h-full flex flex-col shadow-sm">
          {selectedBucket ? (
            <div className="flex-1 flex flex-col h-full overflow-hidden">
              {/* Explorer Header */}
              <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 flex justify-between items-center text-xs">
                <div className="flex items-center gap-4">
                  <span className="font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1.5 font-mono">
                    <Database className="h-4 w-4 text-primary" /> s3://{selectedBucket}/
                  </span>
                  <div className="hidden sm:flex gap-1.5 items-center">
                    <Badge variant="ok" className="text-[9px]">
                      {bucketMetadata[selectedBucket]?.region || "Local"}
                    </Badge>
                    <Badge variant="running" className="text-[9px]">
                      {bucketMetadata[selectedBucket]?.access || "Private"}
                    </Badge>
                  </div>
                </div>
                <Button onClick={handleUploadFile} size="sm" className="flex items-center gap-1">
                  <Upload className="h-3.5 w-3.5" /> Upload Files
                </Button>
              </div>

              {/* Objects Table */}
              <div className="flex-1 overflow-y-auto">
                {loadingObjects ? (
                  <div className="flex justify-center py-20">
                    <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
                  </div>
                ) : objects.length === 0 ? (
                  <div className="py-24 text-center">
                    <div className="mb-4 inline-flex items-center justify-center p-3 bg-gray-50 dark:bg-gray-900 rounded-full">
                      <FileCode className="h-10 w-10 text-gray-300 dark:text-gray-700" />
                    </div>
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">Bucket is Empty</h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400 max-w-xs mx-auto mb-4">
                      Upload files from your computer or run workflow integrations that save output data chunks here.
                    </p>
                    <Button onClick={handleUploadFile} size="sm" variant="secondary" className="gap-1">
                      <Upload className="h-3.5 w-3.5" /> Upload Now
                    </Button>
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-gray-250 dark:border-gray-800 text-gray-400 dark:text-gray-500 font-semibold bg-gray-50/30 dark:bg-gray-900/10">
                        <th className="p-3">File Name</th>
                        <th className="p-3">Content Type</th>
                        <th className="p-3">File Size</th>
                        <th className="p-3">Workflow Creator</th>
                        <th className="p-3">Last Modified</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-150 dark:divide-gray-800/60">
                      {objects.map((obj) => (
                        <tr key={obj.key} className="hover:bg-gray-50/50 dark:hover:bg-gray-900/30">
                          <td className="p-3 font-semibold text-gray-900 dark:text-white font-mono break-all max-w-[200px] truncate">{obj.key}</td>
                          <td className="p-3 text-gray-400 font-mono text-[10px]">{obj.content_type || "application/octet-stream"}</td>
                          <td className="p-3 text-gray-500">{formatSize(obj.size_bytes)}</td>
                          <td className="p-3 text-gray-500">
                            {obj.workflow_name ? (
                              <span className="text-primary hover:underline cursor-pointer">{obj.workflow_name}</span>
                            ) : (
                              <span className="text-gray-400 italic">Manual Upload</span>
                            )}
                          </td>
                          <td className="p-3 text-gray-400 text-[10px]">{new Date(obj.last_modified).toLocaleString()}</td>
                          <td className="p-3 text-right space-x-1.5 flex justify-end items-center mt-0.5">
                            <button
                              onClick={() => handleDownloadObject(obj.key)}
                              className="btn btn-secondary btn-sm p-1.5 border border-gray-200/50 dark:border-gray-800"
                              title="Download to Local System"
                            >
                              <Download className="h-3.5 w-3.5 text-gray-600 dark:text-gray-400" />
                            </button>
                            <button
                              onClick={() => handleDeleteObject(obj.key)}
                              className="btn btn-danger btn-sm p-1.5"
                              title="Delete Object"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-gray-500">
              <Database className="h-16 w-16 text-gray-200 dark:text-gray-800 mb-3" />
              <h4 className="font-semibold text-sm text-gray-800 dark:text-gray-300">Select S3 Bucket</h4>
              <p className="text-xs max-w-xs mt-1 text-gray-400 dark:text-gray-500">
                Choose a storage bucket from the left panel to browse stored object partitions, download assets, or upload raw files.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Create Bucket Modal */}
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal-box max-w-md">
            <div className="flex justify-between items-center border-b border-gray-250 dark:border-gray-800 pb-3 mb-4">
              <h3 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-1.5">
                <FolderPlus className="h-4.5 w-4.5 text-primary" /> Create S3 Bucket
              </h3>
              <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateBucket} className="space-y-4 text-xs">
              <div>
                <label className="block text-gray-500 dark:text-gray-400 font-semibold mb-1">Bucket Name</label>
                <input
                  type="text"
                  placeholder="e.g. customer-invoices-vault"
                  value={newBucketName}
                  onChange={(e) => setNewBucketName(e.target.value)}
                  className="input text-xs"
                  required
                  autoFocus
                />
                <span className="text-[10px] text-gray-400 mt-1 block">Must contain lowercase alphanumeric chars and hyphens.</span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-500 dark:text-gray-400 font-semibold mb-1">Region Emulator</label>
                  <select
                    value={selectedRegion}
                    onChange={(e) => setSelectedRegion(e.target.value)}
                    className="input text-xs"
                  >
                    <option value="Local (Offline)">Local (Offline)</option>
                    <option value="US-East (N. Virginia)">US-East (N. Virginia)</option>
                    <option value="EU-West (Ireland)">EU-West (Ireland)</option>
                    <option value="AP-South (Mumbai)">AP-South (Mumbai)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-gray-500 dark:text-gray-400 font-semibold mb-1">Access Control List</label>
                  <select
                    value={selectedAccess}
                    onChange={(e) => setSelectedAccess(e.target.value)}
                    className="input text-xs"
                  >
                    <option value="Private">Private (IAM Roles Only)</option>
                    <option value="Public Read">Public Read (HTTPS Web)</option>
                    <option value="Public Read/Write">Public Read/Write</option>
                  </select>
                </div>
              </div>

              {createError && <p className="text-xs text-red-500 mt-2">{createError}</p>}

              <div className="flex justify-end gap-2 border-t border-gray-250 dark:border-gray-800 pt-4 mt-6">
                <Button onClick={() => setShowCreateModal(false)} variant="secondary" size="sm">
                  Cancel
                </Button>
                <Button type="submit" size="sm">
                  Create Bucket
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
