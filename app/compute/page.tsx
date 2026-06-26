"use client";

import React, { useEffect, useState, useRef } from "react";
import { Layout } from "../../components/layout/Layout";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { invoke } from "@/lib/tauri";
import {
  Server,
  Play,
  Square,
  RefreshCw,
  Terminal as TerminalIcon,
  Trash2,
  Cpu,
  HardDrive,
  Database,
  X,
  Plus,
  Activity,
  ArrowRight
} from "lucide-react";

interface ComputeInstance {
  id: string;
  name: string;
  state: string; // "running" | "stopped" | "pending"
  image: string;
  cpu_cores: number;
  memory_gb: number;
  disk_gb: number;
  uptime_seconds: number;
  created_at: string;
}

interface ComputeContainer {
  id: string;
  instance_id: string;
  name: string;
  status: string;
  cpu_pct: number;
  memory_mb: number;
  network_io: string;
  block_io: string;
  image: string;
}

interface Telemetry {
  cpu_percent: number;
  memory_percent: number;
  disk_percent: number;
  active_instances: number;
  total_instances: number;
  active_containers: number;
}

export default function ComputePage({ embed = false }: { embed?: boolean }) {
  const [instances, setInstances] = useState<ComputeInstance[]>([]);
  const [containers, setContainers] = useState<ComputeContainer[]>([]);
  const [telemetry, setTelemetry] = useState<Telemetry>({
    cpu_percent: 12.0,
    memory_percent: 54.0,
    disk_percent: 45.0,
    active_instances: 3,
    total_instances: 4,
    active_containers: 11
  });
  const [loading, setLoading] = useState(true);

  // Provisoning Modal
  const [showLaunchModal, setShowLaunchModal] = useState(false);
  const [newInstanceName, setNewInstanceName] = useState("");
  const [selectedImage, setSelectedImage] = useState("Ubuntu 22.04 LTS");
  const [cpuCores, setCpuCores] = useState(2);
  const [memoryGb, setMemoryGb] = useState(4);
  const [diskGb, setDiskGb] = useState(20);
  const [launching, setLaunching] = useState(false);

  // Terminal Simulator State
  const [activeTerminalContainer, setActiveTerminalContainer] = useState<ComputeContainer | null>(null);
  const [terminalHistory, setTerminalHistory] = useState<{ type: "input" | "output"; text: string }[]>([
    { type: "output", text: "PreceptaAI Container Shell Emulator v2.0" },
    { type: "output", text: "Type 'help' to view available diagnostic tools.\n" }
  ]);
  const [terminalInput, setTerminalInput] = useState("");
  const terminalBottomRef = useRef<HTMLDivElement>(null);

  const fetchData = async () => {
    try {
      const instList: ComputeInstance[] = await invoke("list_instances");
      setInstances(instList);

      const contList: ComputeContainer[] = await invoke("list_active_containers");
      setContainers(contList);

      const telem: Telemetry = await invoke("get_compute_telemetry");
      setTelemetry(telem);

      setLoading(false);
    } catch (e) {
      console.error("Failed to load compute dashboard data:", e);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 8000);
    return () => clearInterval(interval);
  }, []);

  // Auto scroll terminal to bottom
  useEffect(() => {
    if (terminalBottomRef.current) {
      terminalBottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [terminalHistory, activeTerminalContainer]);

  const handleLaunchInstance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInstanceName.trim()) return;

    try {
      setLaunching(true);
      await invoke("create_instance", {
        name: newInstanceName.trim(),
        image: selectedImage,
        cpuCores,
        memoryGb,
        diskGb
      });
      setNewInstanceName("");
      setCpuCores(2);
      setMemoryGb(4);
      setDiskGb(20);
      setShowLaunchModal(false);
      setLaunching(false);
      fetchData();
    } catch (e) {
      console.error(e);
      setLaunching(false);
    }
  };

  const handleStartInstance = async (id: string) => {
    try {
      // Optmistic state update
      setInstances(prev => prev.map(inst => inst.id === id ? { ...inst, state: "running" } : inst));
      await invoke("start_instance", { id });
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleStopInstance = async (id: string) => {
    try {
      setInstances(prev => prev.map(inst => inst.id === id ? { ...inst, state: "stopped" } : inst));
      await invoke("stop_instance", { id });
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleRestartInstance = async (id: string) => {
    try {
      setInstances(prev => prev.map(inst => inst.id === id ? { ...inst, state: "pending" } : inst));
      await invoke("restart_instance", { id });
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteInstance = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to terminate compute instance "${name}"? This deletes all associated containers.`)) return;
    try {
      await invoke("delete_instance", { id });
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleOpenTerminal = (instanceId: string) => {
    // find a running container inside this instance to open terminal
    const matched = containers.find(c => c.instance_id === instanceId && c.status === "running");
    if (matched) {
      setActiveTerminalContainer(matched);
      setTerminalHistory([
        { type: "output", text: `Connected to container '${matched.name}' (${matched.image})` },
        { type: "output", text: "Type 'help' to see active commands. Type 'clear' to reset console.\n" }
      ]);
    } else {
      alert("This instance does not have any active running containers. Start the instance first.");
    }
  };

  const handleSendTerminalCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!terminalInput.trim() || !activeTerminalContainer) return;

    const cmd = terminalInput.trim();
    setTerminalHistory(prev => [...prev, { type: "input", text: cmd }]);
    setTerminalInput("");

    if (cmd.toLowerCase() === "clear") {
      setTerminalHistory([]);
      return;
    }

    try {
      const output: string = await invoke("execute_container_command", {
        containerId: activeTerminalContainer.id,
        command: cmd
      });
      setTerminalHistory(prev => [...prev, { type: "output", text: output }]);
    } catch (err: any) {
      setTerminalHistory(prev => [...prev, { type: "output", text: `Error: ${err}` }]);
    }
  };

  const formatUptime = (seconds: number) => {
    if (seconds <= 0) return "Stopped";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  const content = (
    <>
      {/* Telemetry Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        <Card className="p-5 hover:shadow-md transition">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
              <Cpu className="h-4 w-4 text-blue-500" /> CPU Core Load
            </span>
            <Badge variant="ok">{telemetry.cpu_percent.toFixed(1)}%</Badge>
          </div>
          <ProgressBar value={telemetry.cpu_percent} color="bg-blue-500" />
          <span className="text-[10px] text-gray-400 mt-2 block">Allocated to local sandboxed namespaces</span>
        </Card>

        <Card className="p-5 hover:shadow-md transition">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
              <HardDrive className="h-4 w-4 text-indigo-500" /> Virtual Memory Pool
            </span>
            <Badge variant="ok">{telemetry.memory_percent.toFixed(1)}%</Badge>
          </div>
          <ProgressBar value={telemetry.memory_percent} color="bg-indigo-500" />
          <span className="text-[10px] text-gray-400 mt-2 block">Available host RAM constraints active</span>
        </Card>

        <Card className="p-5 hover:shadow-md transition">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
              <Database className="h-4 w-4 text-emerald-500" /> Shared Disk Volume
            </span>
            <Badge variant="ok">{telemetry.disk_percent.toFixed(1)}%</Badge>
          </div>
          <ProgressBar value={telemetry.disk_percent} color="bg-emerald-500" />
          <span className="text-[10px] text-gray-400 mt-2 block">Shared folder root limits enforced</span>
        </Card>
      </div>

      {/* Main Grid header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-base font-bold text-gray-900 dark:text-white">Active Virtual Instances</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">Locally simulated, isolated computing instances running gVisor hypervisor specs</p>
        </div>
        <Button onClick={() => setShowLaunchModal(true)} className="flex items-center gap-1.5 shadow-sm">
          <Plus className="h-4 w-4" /> Launch Instance
        </Button>
      </div>

      {/* Instances list */}
      {loading ? (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : instances.length === 0 ? (
        <Card className="p-10 text-center border-dashed border-2 border-gray-300 dark:border-gray-800">
          <Server className="h-12 w-12 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">No Compute Nodes</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 max-w-xs mx-auto mt-1 mb-4">
            Provision isolated guest operating instances locally to host microservices and database engines.
          </p>
          <Button onClick={() => setShowLaunchModal(true)} size="sm">Launch First Instance</Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {instances.map((inst) => {
            const isRunning = inst.state === "running";
            const isPending = inst.state === "pending";
            const instContainers = containers.filter(c => c.instance_id === inst.id);
            const activeContCount = instContainers.filter(c => c.status === "running").length;

            return (
              <Card key={inst.id} className="p-6 border border-gray-200 dark:border-gray-800 flex flex-col justify-between hover:shadow-md transition">
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2">
                        <Server className={`h-4 w-4 ${isRunning ? "text-primary" : "text-gray-400"}`} />
                        {inst.name}
                      </h3>
                      <span className="text-[10px] text-gray-500 font-mono mt-0.5 block">{inst.id}</span>
                    </div>
                    <Badge variant={isRunning ? "ok" : isPending ? "running" : "error"} className="capitalize">
                      {inst.state}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-3 mb-5 border-y border-gray-100 dark:border-gray-900 py-3.5 text-xs text-gray-600 dark:text-gray-400">
                    <div>
                      <span className="text-gray-400 dark:text-gray-500 block text-[10px] uppercase tracking-wide">Image Template</span>
                      <span className="font-medium text-gray-900 dark:text-white truncate block">{inst.image}</span>
                    </div>
                    <div>
                      <span className="text-gray-400 dark:text-gray-500 block text-[10px] uppercase tracking-wide">Uptime Clock</span>
                      <span className="font-semibold block">{formatUptime(inst.uptime_seconds)}</span>
                    </div>
                    <div>
                      <span className="text-gray-400 dark:text-gray-500 block text-[10px] uppercase tracking-wide">CPU Cores</span>
                      <span className="font-semibold text-gray-900 dark:text-white block">{inst.cpu_cores} Cores</span>
                    </div>
                    <div>
                      <span className="text-gray-400 dark:text-gray-500 block text-[10px] uppercase tracking-wide">Memory & Disk</span>
                      <span className="font-semibold text-gray-900 dark:text-white block">{inst.memory_gb} GB / {inst.disk_gb} GB</span>
                    </div>
                  </div>

                  {/* Containers in this instance snippet */}
                  <div className="mb-6">
                    <div className="flex justify-between items-center text-[10px] text-gray-400 mb-2 uppercase tracking-wide">
                      <span>Task Services ({activeContCount} running)</span>
                    </div>
                    {instContainers.length === 0 ? (
                      <span className="text-[11px] text-gray-500 italic block">No active service tasks</span>
                    ) : (
                      <div className="space-y-1.5">
                        {instContainers.slice(0, 3).map(c => (
                          <div key={c.id} className="flex justify-between items-center bg-gray-50 dark:bg-gray-900 px-2 py-1 rounded text-[11px]">
                            <span className="font-mono text-gray-700 dark:text-gray-300 truncate max-w-[120px]">{c.name}</span>
                            <span className="text-gray-400 truncate max-w-[80px]">{c.image}</span>
                            <span className="font-semibold text-primary">{c.status === "running" ? `${c.cpu_pct.toFixed(1)}%` : "Off"}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Actions */}
                <div className="flex gap-2 border-t border-gray-100 dark:border-gray-900 pt-4 mt-auto">
                  {isRunning ? (
                    <Button onClick={() => handleStopInstance(inst.id)} variant="secondary" size="sm" className="flex-1 justify-center gap-1">
                      <Square className="h-3.5 w-3.5" /> Stop
                    </Button>
                  ) : (
                    <Button onClick={() => handleStartInstance(inst.id)} size="sm" className="flex-1 justify-center gap-1">
                      <Play className="h-3.5 w-3.5 fill-current" /> Start
                    </Button>
                  )}
                  <Button onClick={() => handleRestartInstance(inst.id)} disabled={!isRunning} variant="secondary" size="sm" className="p-2" title="Reboot Instance">
                    <RefreshCw className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} />
                  </Button>
                  <Button onClick={() => handleOpenTerminal(inst.id)} disabled={!isRunning} variant="secondary" size="sm" className="p-2" title="Container Terminal">
                    <TerminalIcon className="h-3.5 w-3.5" />
                  </Button>
                  <Button onClick={() => handleDeleteInstance(inst.id, inst.name)} variant="secondary" size="sm" className="p-2 hover:text-red-500 hover:bg-red-50/10 border-red-200/20" title="Delete Instance">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Launch Instance wizard Modal */}
      {showLaunchModal && (
        <div className="modal-overlay">
          <div className="modal-box max-w-lg">
            <div className="flex justify-between items-center border-b border-gray-250 dark:border-gray-800 pb-3.5 mb-4">
              <h3 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2">
                <Server className="h-4.5 w-4.5 text-primary" /> Provision Compute Node
              </h3>
              <button onClick={() => setShowLaunchModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleLaunchInstance} className="space-y-4 text-xs">
              <div>
                <label className="block text-gray-500 dark:text-gray-400 font-semibold mb-1">Instance Name</label>
                <input
                  type="text"
                  placeholder="e.g. k3s-worker-node-1"
                  value={newInstanceName}
                  onChange={(e) => setNewInstanceName(e.target.value)}
                  className="input text-xs"
                  required
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-500 dark:text-gray-400 font-semibold mb-1">Operating Template</label>
                  <select
                    value={selectedImage}
                    onChange={(e) => setSelectedImage(e.target.value)}
                    className="input text-xs"
                  >
                    <option value="Ubuntu 22.04 LTS">Ubuntu 22.04 LTS</option>
                    <option value="Debian 12">Debian 12 Bookworm</option>
                    <option value="Alpine Linux">Alpine Linux 3.18</option>
                  </select>
                </div>
                <div>
                  <label className="block text-gray-500 dark:text-gray-400 font-semibold mb-1">Docker Daemon Bridge</label>
                  <input
                    type="text"
                    value="Isolated gVisor Sandbox"
                    className="input bg-gray-100 dark:bg-gray-900 text-gray-500 text-xs"
                    disabled
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-gray-500 dark:text-gray-400 font-semibold mb-1">
                  <span>Allocate CPU Cores</span>
                  <span className="font-bold text-primary">{cpuCores} Cores</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="16"
                  value={cpuCores}
                  onChange={(e) => setCpuCores(parseInt(e.target.value))}
                  className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex justify-between text-gray-500 dark:text-gray-400 font-semibold mb-1">
                    <span>VRAM / Memory Pool</span>
                    <span className="font-bold text-primary">{memoryGb} GB</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="32"
                    value={memoryGb}
                    onChange={(e) => setMemoryGb(parseInt(e.target.value))}
                    className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-gray-500 dark:text-gray-400 font-semibold mb-1">
                    <span>Block Storage Disk</span>
                    <span className="font-bold text-primary">{diskGb} GB</span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="200"
                    value={diskGb}
                    onChange={(e) => setDiskGb(parseInt(e.target.value))}
                    className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                </div>
              </div>

              <div className="bg-primary/5 dark:bg-primary/10 border border-primary/20 p-3.5 rounded-lg flex items-start gap-2.5 mt-2">
                <Activity className="h-4.5 w-4.5 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-primary block">Hypervisor Sandboxing Enforced</span>
                  <p className="text-[10px] text-gray-500 mt-0.5 leading-relaxed">
                    This guest instance runs in a fully isolated gVisor container runtime namespace. Security and CPU core throttling will be monitored dynamically.
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t border-gray-250 dark:border-gray-800 pt-4 mt-6">
                <Button onClick={() => setShowLaunchModal(false)} variant="secondary" size="sm">
                  Cancel
                </Button>
                <Button type="submit" disabled={launching} size="sm">
                  {launching ? "Provisioning..." : "Launch Instance"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Terminal Drawer Overlay */}
      {activeTerminalContainer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-gray-950 text-emerald-400 border border-gray-800 w-full max-w-4xl h-[520px] rounded-xl flex flex-col overflow-hidden shadow-2xl font-mono text-xs">
            {/* Header */}
            <div className="flex justify-between items-center bg-gray-900 border-b border-gray-800 px-4 py-2.5 text-gray-300">
              <span className="flex items-center gap-2 font-semibold">
                <TerminalIcon className="h-4 w-4 text-emerald-500" />
                Shell: {activeTerminalContainer.name} ({activeTerminalContainer.id})
              </span>
              <button
                onClick={() => setActiveTerminalContainer(null)}
                className="text-gray-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Terminal screen */}
            <div className="flex-1 overflow-y-auto p-4 space-y-1 bg-black text-emerald-500 border-b border-gray-900">
              {terminalHistory.map((item, idx) => (
                <div key={idx} className="whitespace-pre-wrap leading-relaxed">
                  {item.type === "input" ? (
                    <span className="text-gray-400 flex items-start gap-1">
                      <span className="text-emerald-600 font-bold">root@preceptaai:/#</span> {item.text}
                    </span>
                  ) : (
                    <span>{item.text}</span>
                  )}
                </div>
              ))}
              <div ref={terminalBottomRef} />
            </div>

            {/* Input Line */}
            <form onSubmit={handleSendTerminalCommand} className="flex bg-black px-4 py-3 items-center border-t border-gray-900 gap-2">
              <span className="text-emerald-600 font-bold flex-shrink-0">root@preceptaai:/#</span>
              <input
                type="text"
                value={terminalInput}
                onChange={(e) => setTerminalInput(e.target.value)}
                className="flex-1 bg-transparent text-emerald-400 border-none outline-none focus:ring-0 p-0 text-xs"
                placeholder="type command here..."
                autoFocus
              />
              <button type="submit" className="text-gray-500 hover:text-emerald-500 flex items-center">
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );

  if (embed) return content;

  return (
    <Layout title="Local Compute Core">
      {content}
    </Layout>
  );
}
