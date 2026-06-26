"use client";

import React, { useEffect, useState } from "react";
import { Layout } from "../components/layout/Layout";
import ComputePage from "./compute/page";
import StoragePage from "./storage/page";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { AlertBanner } from "../components/dashboard/AlertBanner";
import { ActivityFeed } from "../components/dashboard/ActivityFeed";
import { FailureReview } from "../components/workflow/FailureReview";
import { invoke } from "@/lib/tauri";
import {
  Play,
  Square,
  Activity,
  DollarSign,
  Heart,
  GitBranch,
  ShieldCheck,
  ArrowUpRight,
  TrendingUp,
  Server,
  Layers,
  HardDrive,
  Database,
  Cpu,
  Gauge,
  Sparkles,
  CheckCircle2,
  XCircle,
  ArrowUpCircle,
  RefreshCw,
  Activity as ChartIcon
} from "lucide-react";
import Link from "next/link";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer
} from "recharts";

interface Workflow {
  id: string;
  name: string;
  enabled: boolean;
  status: string;
  run_count: number;
}

interface Run {
  id: string;
  workflow_id: string;
  workflow_name: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  trigger_type: string;
  failure_step: string | null;
}

interface CostSummary {
  total_savings: number;
  savings_pct: number;
  matched_tier: string;
}

interface ReviewDetails {
  run_id: string;
  workflow_name: string;
  failure_step: string;
  ai_explanation: string;
  raw_log: string;
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

interface AgentMetrics {
  workflow_id: string;
  workflow_name: string;
  tasks_today: number;
  success_rate: number;
  avg_response_ms: number;
  cpu_avg_pct: number;
  memory_gb: number;
  status: string;
  last_run: string | null;
}

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<"infrastructure" | "automation" | "compute" | "storage">("infrastructure");
  const [loading, setLoading] = useState(true);
  const [isMounted, setIsMounted] = useState(false);

  const searchStr = typeof window !== "undefined" ? window.location.search : "";

  useEffect(() => {
    const params = new URLSearchParams(searchStr);
    const tabParam = params.get("tab");
    if (tabParam === "compute") {
      setActiveTab("compute");
    } else if (tabParam === "storage") {
      setActiveTab("storage");
    } else if (tabParam === "automation") {
      setActiveTab("automation");
    } else {
      setActiveTab("infrastructure");
    }
  }, [searchStr]);

  // Automation states
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [savings, setSavings] = useState<CostSummary | null>(null);
  const [aiOnline, setAiOnline] = useState(false);
  const [pausedRuns, setPausedRuns] = useState<any[]>([]);
  const [agentMetrics, setAgentMetrics] = useState<AgentMetrics[]>([]);
  const [agentActions, setAgentActions] = useState<Record<string, string>>({});

  // Infrastructure states
  const [containers, setContainers] = useState<ComputeContainer[]>([]);
  const [telemetry, setTelemetry] = useState<Telemetry>({
    cpu_percent: 12.0,
    memory_percent: 54.0,
    disk_percent: 45.0,
    active_instances: 3,
    total_instances: 4,
    active_containers: 11
  });
  const [totalStorageUsed, setTotalStorageUsed] = useState("0 B");

  // Chart history
  const [cpuHistory, setCpuHistory] = useState<{ time: string; cpu: number; mem: number }[]>([]);

  // Modal control
  const [reviewRunId, setReviewRunId] = useState<string | null>(null);
  const [reviewDetails, setReviewDetails] = useState<ReviewDetails | null>(null);
  const [loadingReview, setLoadingReview] = useState(false);

  const fetchData = async () => {
    try {
      // 1. Fetch workflows list
      const workflowList: Workflow[] = await invoke("list_workflows");
      setWorkflows(workflowList);

      // 2. Fetch recent runs
      const recentRuns: Run[] = await invoke("list_all_runs");
      setRuns(recentRuns);

      const paused = recentRuns.filter((r) => r.status === "paused_awaiting_human");
      setPausedRuns(paused);

      // 3. Fetch cost summary
      const cost: CostSummary = await invoke("get_cost_summary", { periodDays: 7 });
      setSavings(cost);

      // 4. Check Ollama engine
      const health: boolean = await invoke("check_ollama");
      setAiOnline(health);

      // 5. Fetch Compute & Containers Info
      const contList: ComputeContainer[] = await invoke("list_active_containers");
      setContainers(contList);

      const telem: Telemetry = await invoke("get_compute_telemetry");
      setTelemetry(telem);

      // 6. Calculate storage used by S3 vaults
      const vaults: any[] = await invoke("list_vaults");
      const totalBytes = vaults.reduce((acc, v) => acc + (v.total_size_bytes || 0), 0);
      setTotalStorageUsed(formatSize(totalBytes));

      // 7. Agent telemetry metrics
      const agMetrics: AgentMetrics[] = await invoke("get_agent_metrics");
      setAgentMetrics(agMetrics);

      // Append chart telemetry
      setCpuHistory(prev => {
        const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const updated = [...prev, { time: now, cpu: telem.cpu_percent, mem: telem.memory_percent }];
        return updated.slice(-15); // Keep last 15 points
      });

      setLoading(false);
    } catch (e) {
      console.error("Dashboard failed to fetch data:", e);
      setLoading(false);
    }
  };

  useEffect(() => {
    setIsMounted(true);
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleReviewTrigger = async (runId: string) => {
    try {
      setLoadingReview(true);
      setReviewRunId(runId);
      const details: ReviewDetails = await invoke("get_failure_review", { runId });
      setReviewDetails(details);
      setLoadingReview(false);
    } catch (e) {
      console.error(e);
      setLoadingReview(false);
      setReviewRunId(null);
    }
  };

  const handleActionComplete = () => {
    setReviewRunId(null);
    setReviewDetails(null);
    fetchData();
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // Stats derivations
  const activeWorkflowsCount = workflows.filter((w) => w.enabled).length;
  const runningRunsCount = runs.filter((r) => r.status === "running").length;
  const totalRunsCount = workflows.reduce((acc, w) => acc + w.run_count, 0);

  return (
    <Layout title="Control Tower">
      {/* HITL Intervention Alert Banner */}
      <AlertBanner pausedRuns={pausedRuns} onReview={handleReviewTrigger} />

      {/* Tabs Selector */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-1.5 p-1 bg-gray-100 dark:bg-gray-900 rounded-lg select-none">
          <button
            onClick={() => setActiveTab("infrastructure")}
            className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition flex items-center gap-1.5 ${
              activeTab === "infrastructure"
                ? "bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm"
                : "text-gray-500 hover:text-gray-900 dark:hover:text-gray-100"
            }`}
          >
            <Server className="h-3.5 w-3.5" /> Infrastructure Node Status
          </button>
          <button
            onClick={() => setActiveTab("automation")}
            className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition flex items-center gap-1.5 ${
              activeTab === "automation"
                ? "bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm"
                : "text-gray-500 hover:text-gray-900 dark:hover:text-gray-100"
            }`}
          >
            <GitBranch className="h-3.5 w-3.5" /> Agent Automations
          </button>
          <button
            onClick={() => setActiveTab("compute")}
            className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition flex items-center gap-1.5 ${
              activeTab === "compute"
                ? "bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm"
                : "text-gray-500 hover:text-gray-900 dark:hover:text-gray-100"
            }`}
          >
            <Cpu className="h-3.5 w-3.5" /> Compute
          </button>
          <button
            onClick={() => setActiveTab("storage")}
            className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition flex items-center gap-1.5 ${
              activeTab === "storage"
                ? "bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm"
                : "text-gray-500 hover:text-gray-900 dark:hover:text-gray-100"
            }`}
          >
            <Database className="h-3.5 w-3.5" /> Storage
          </button>
        </div>
        <div className="text-[10px] text-gray-500 dark:text-gray-400 font-semibold flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse" />
          Node ID: ES-LOCAL-PRIMARY
        </div>
      </div>

      {activeTab === "infrastructure" && (
        /* INFRASTRUCTURE DASHBOARD VIEW */
        <div className="space-y-6">
          {/* Infrastructure Metrics Row */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
            <Card className="metric-card hover:shadow-md transition">
              <div className="flex justify-between items-start mb-2">
                <span className="metric-label flex items-center gap-1.5 text-xs text-gray-500">
                  <Server className="h-4 w-4 text-blue-500" /> Active Instances
                </span>
                <Badge variant="ok">Live</Badge>
              </div>
              <div className="metric-value text-2xl font-bold">
                {telemetry.active_instances} / {telemetry.total_instances}
              </div>
              <span className="text-[10px] text-gray-500 mt-1">Virtual guest partitions running</span>
            </Card>

            <Card className="metric-card hover:shadow-md transition">
              <div className="flex justify-between items-start mb-2">
                <span className="metric-label flex items-center gap-1.5 text-xs text-gray-500">
                  <Layers className="h-4 w-4 text-indigo-500" /> Containers Active
                </span>
                <Badge variant="running">Healthy</Badge>
              </div>
              <div className="metric-value text-2xl font-bold">{telemetry.active_containers}</div>
              <span className="text-[10px] text-gray-500 mt-1">Isolated guest microservices loaded</span>
            </Card>

            <Card className="metric-card hover:shadow-md transition">
              <div className="flex justify-between items-start mb-2">
                <span className="metric-label flex items-center gap-1.5 text-xs text-gray-500">
                  <Database className="h-4 w-4 text-emerald-500" /> S3 Storage Pool
                </span>
                <Badge variant="ok">Local S3</Badge>
              </div>
              <div className="metric-value text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {totalStorageUsed}
              </div>
              <span className="text-[10px] text-gray-500 mt-1">Total local object storage partition</span>
            </Card>

            <Card className="metric-card hover:shadow-md transition">
              <div className="flex justify-between items-start mb-2">
                <span className="metric-label flex items-center gap-1.5 text-xs text-gray-500">
                  <Heart className="h-4 w-4 text-red-500" /> Host GPU Bridge
                </span>
                {aiOnline ? <Badge variant="ok">Healthy</Badge> : <Badge variant="error">Offline</Badge>}
              </div>
              <div className="metric-value text-sm font-semibold mt-1">
                {aiOnline ? "Metal / CUDA Connected" : "Connecting..."}
              </div>
              <span className="text-[10px] text-gray-500 mt-2 block font-medium">Ollama Inference Endpoint active</span>
            </Card>
          </div>

          {/* Infrastructure Graphs */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="p-5 lg:col-span-2">
              <div className="flex justify-between items-center border-b border-gray-200 dark:border-gray-800 pb-3 mb-4">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white">Real-Time Node Resource Usage</h3>
                  <p className="text-[10px] text-gray-500">CPU and memory allocation load tracked from system kernels</p>
                </div>
                <ChartIcon className="h-4.5 w-4.5 text-indigo-500" />
              </div>
              <div className="h-56 w-full text-xs">
                {isMounted && cpuHistory.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={cpuHistory}>
                      <defs>
                        <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorMem" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="time" stroke="#9ca3af" tickLine={false} />
                      <YAxis stroke="#9ca3af" domain={[0, 100]} />
                      <Tooltip />
                      <Area type="monotone" dataKey="cpu" name="CPU Core Load %" stroke="#3b82f6" fillOpacity={1} fill="url(#colorCpu)" />
                      <Area type="monotone" dataKey="mem" name="Memory Pool %" stroke="#6366f1" fillOpacity={1} fill="url(#colorMem)" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-400 italic">
                    Aggregating hardware telemetry logs...
                  </div>
                )}
              </div>
            </Card>

            <Card className="p-5">
              <h4 className="font-bold text-xs text-gray-900 dark:text-white mb-4">Host Node Constraints</h4>
              <div className="space-y-4 text-xs">
                <div>
                  <div className="flex justify-between text-gray-500 mb-1">
                    <span>Active Containers Overhead</span>
                    <span className="font-semibold">{telemetry.active_containers} tasks</span>
                  </div>
                  <div className="w-full bg-gray-100 dark:bg-gray-900 rounded-full h-1.5">
                    <div className="bg-primary h-1.5 rounded-full" style={{ width: `${(telemetry.active_containers/16)*100}%` }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-gray-500 mb-1">
                    <span>Virtual Core Allocations</span>
                    <span className="font-semibold">{(telemetry.active_instances * 4)} Cores</span>
                  </div>
                  <div className="w-full bg-gray-100 dark:bg-gray-900 rounded-full h-1.5">
                    <div className="bg-indigo-500 h-1.5 rounded-full" style={{ width: `${(telemetry.active_instances/5)*100}%` }} />
                  </div>
                </div>

                <div className="border-t border-gray-150 dark:border-gray-800 pt-3 space-y-2 mt-4 text-[11px] text-gray-500">
                  <div className="flex justify-between">
                    <span>Storage Pool Class:</span>
                    <span className="font-semibold text-gray-800 dark:text-gray-200">Local SSD / Ext4</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Hypervisor Isolator:</span>
                    <span className="font-semibold text-gray-800 dark:text-gray-200">gVisor Sandbox</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Network Gateway:</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">127.0.0.1 Proxy Ok</span>
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* Active Containers list table */}
          <Card className="p-6">
            <div className="flex justify-between items-center border-b border-gray-200 dark:border-gray-800 pb-4 mb-4">
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">Active Service Microcontainers</h3>
                <p className="text-xs text-gray-500">Containers currently hosted on active virtual partitions</p>
              </div>
              <Link href="/compute" className="btn btn-secondary btn-sm flex items-center gap-1 text-xs">
                Manage Compute Core <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-gray-250 dark:border-gray-800 text-gray-400 dark:text-gray-500 font-semibold bg-gray-50/30 dark:bg-gray-900/10">
                    <th className="p-3">Status</th>
                    <th className="p-3">Container Name</th>
                    <th className="p-3">Host Instance ID</th>
                    <th className="p-3">CPU Usage</th>
                    <th className="p-3">Memory (VRAM)</th>
                    <th className="p-3">Network I/O</th>
                    <th className="p-3">Block I/O</th>
                    <th className="p-3">Image Tag</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-150 dark:divide-gray-800/60">
                  {containers.map((c) => {
                    const isRunning = c.status === "running";
                    return (
                      <tr key={c.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-900/30">
                        <td className="p-3">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            isRunning ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400" : "bg-gray-100 text-gray-600 dark:bg-gray-900 dark:text-gray-400"
                          }`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${isRunning ? "bg-emerald-500 animate-pulse" : "bg-gray-400"}`} />
                            {c.status}
                          </span>
                        </td>
                        <td className="p-3 font-semibold text-gray-900 dark:text-white font-mono">{c.name}</td>
                        <td className="p-3 text-gray-500 font-mono">{c.instance_id}</td>
                        <td className="p-3 font-medium text-gray-700 dark:text-gray-300">
                          {isRunning ? `${c.cpu_pct.toFixed(1)}%` : "0%"}
                        </td>
                        <td className="p-3 text-gray-500">
                          {isRunning ? (c.memory_mb >= 1024 ? `${(c.memory_mb/1024).toFixed(1)} GB` : `${c.memory_mb} MB`) : "-"}
                        </td>
                        <td className="p-3 text-gray-500 font-mono text-[10px]">{c.network_io}</td>
                        <td className="p-3 text-gray-500 font-mono text-[10px]">{c.block_io}</td>
                        <td className="p-3 text-gray-400 font-mono text-[10px] truncate max-w-[120px]">{c.image}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {activeTab === "automation" && (
        /* AUTOMATION DASHBOARD VIEW — Agent Workspace */
        <div className="space-y-6">
          {/* Summary Metrics Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="metric-card hover:shadow-md transition">
              <div className="flex justify-between items-start mb-2">
                <span className="metric-label flex items-center gap-1.5 text-xs text-gray-500">
                  <GitBranch className="h-4 w-4 text-primary" /> Active Agents
                </span>
                {runningRunsCount > 0 && <Badge variant="running" className="animate-pulse">{runningRunsCount} Live</Badge>}
              </div>
              <div className="metric-value text-2xl font-bold">{activeWorkflowsCount}</div>
              <span className="text-[10px] text-gray-500 mt-1">{workflows.length} workflows configured</span>
            </Card>
            <Card className="metric-card hover:shadow-md transition">
              <div className="flex justify-between items-start mb-2">
                <span className="metric-label flex items-center gap-1.5 text-xs text-gray-500">
                  <Activity className="h-4 w-4 text-indigo-500" /> Runs Completed
                </span>
                <Badge variant="ok">Live</Badge>
              </div>
              <div className="metric-value text-2xl font-bold">{totalRunsCount}</div>
              <span className="text-[10px] text-gray-500 mt-1">Total steps executed locally</span>
            </Card>
            <Card className="metric-card hover:shadow-md transition">
              <div className="flex justify-between items-start mb-2">
                <span className="metric-label flex items-center gap-1.5 text-xs text-gray-500">
                  <DollarSign className="h-4 w-4 text-emerald-500" /> Weekly Savings
                </span>
                {savings && savings.total_savings > 0 && (
                  <span className="flex items-center text-[10px] text-emerald-600 dark:text-emerald-400 font-bold gap-0.5">
                    <TrendingUp className="h-3 w-3" /> {savings.savings_pct.toFixed(0)}%
                  </span>
                )}
              </div>
              <div className="metric-value text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                ${savings ? savings.total_savings.toFixed(2) : "0.00"}
              </div>
              <span className="text-[10px] text-gray-500 mt-1">vs {savings?.matched_tier || "Nova Lite"}</span>
            </Card>
            <Card className="metric-card hover:shadow-md transition">
              <div className="flex justify-between items-start mb-2">
                <span className="metric-label flex items-center gap-1.5 text-xs text-gray-500">
                  <Heart className="h-4 w-4 text-red-500" /> Inference Engine
                </span>
                {aiOnline ? <Badge variant="ok">Online</Badge> : <Badge variant="error">Offline</Badge>}
              </div>
              <div className="metric-value text-sm font-semibold mt-1">{aiOnline ? "llama3.2:3b" : "Connecting..."}</div>
              <span className="text-[10px] text-gray-500 mt-2">Ollama port 11434</span>
            </Card>
          </div>

          {/* Agent Workspace Cards */}
          <div>
            <div className="flex justify-between items-center mb-3">
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" /> Agent Workspaces
                </h3>
                <p className="text-[10px] text-gray-500 mt-0.5">Per-agent resource allocation, traces, and controls</p>
              </div>
              <Link href="/agents" className="btn btn-secondary btn-sm flex items-center gap-1 text-xs">
                Full Workspace <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>

            <div className="space-y-3">
              {agentMetrics.map((agent) => {
                const isRunning = agent.status === "running";
                const actionInProgress = agentActions[agent.workflow_id];
                const agentRuns = runs.filter(r => r.workflow_id === agent.workflow_id);
                const completedRuns = agentRuns.filter(r => r.status === "completed").length;

                return (
                  <Card key={agent.workflow_id} className="p-4 hover:shadow-sm transition">
                    {/* Top row: name + status + controls */}
                    <div className="flex items-center gap-4 mb-3">
                      <span className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${isRunning ? "bg-emerald-500 animate-pulse" : "bg-gray-400"}`} />
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm text-gray-900 dark:text-white truncate">{agent.workflow_name}</div>
                        <div className="text-[10px] text-gray-500">
                          {agent.last_run ? `Last run ${new Date(agent.last_run).toLocaleTimeString()}` : "Never run"} · {agentRuns.length} runs · {completedRuns} succeeded
                        </div>
                      </div>
                      {/* Status badge */}
                      {isRunning ? <Badge variant="running">Running</Badge> : <Badge variant="ok">Idle</Badge>}
                      {/* Action Buttons */}
                      <div className="flex items-center gap-1.5">
                        {isRunning ? (
                          <button
                            onClick={async () => {
                              setAgentActions(p => ({ ...p, [agent.workflow_id]: "stop" }));
                              await new Promise(r => setTimeout(r, 1000));
                              setAgentActions(p => { const n = { ...p }; delete n[agent.workflow_id]; return n; });
                            }}
                            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition"
                          >
                            {actionInProgress === "stop" ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Square className="h-3 w-3 fill-current" />}
                            Stop
                          </button>
                        ) : (
                          <button
                            onClick={async () => {
                              setAgentActions(p => ({ ...p, [agent.workflow_id]: "start" }));
                              await new Promise(r => setTimeout(r, 1000));
                              setAgentActions(p => { const n = { ...p }; delete n[agent.workflow_id]; return n; });
                            }}
                            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold bg-primary text-white hover:bg-primary/90 transition"
                          >
                            {actionInProgress === "start" ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3 fill-current" />}
                            Start
                          </button>
                        )}
                        <button
                          onClick={async () => {
                            setAgentActions(p => ({ ...p, [agent.workflow_id]: "upgrade" }));
                            await new Promise(r => setTimeout(r, 1200));
                            setAgentActions(p => { const n = { ...p }; delete n[agent.workflow_id]; return n; });
                          }}
                          className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 transition"
                        >
                          {actionInProgress === "upgrade" ? <RefreshCw className="h-3 w-3 animate-spin" /> : <ArrowUpCircle className="h-3 w-3" />}
                          Upgrade
                        </button>
                      </div>
                    </div>

                    {/* Workspace Stats: Compute · Memory · Storage · Success */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {/* Compute */}
                      <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-2.5 border border-gray-100 dark:border-gray-800">
                        <div className="flex items-center gap-1 mb-1">
                          <Cpu className="h-3 w-3 text-blue-500" />
                          <span className="text-[9px] font-bold text-gray-400 uppercase">Compute</span>
                        </div>
                        <div className="font-bold text-sm text-gray-900 dark:text-white">{agent.cpu_avg_pct.toFixed(1)}%</div>
                        <div className="w-full bg-gray-200 dark:bg-gray-800 rounded-full h-1 mt-1.5">
                          <div className="bg-blue-500 h-1 rounded-full" style={{ width: `${Math.min(agent.cpu_avg_pct, 100)}%` }} />
                        </div>
                        <div className="text-[9px] text-gray-400 mt-1">{(agent.avg_response_ms / 1000).toFixed(1)}s avg</div>
                      </div>

                      {/* Memory */}
                      <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-2.5 border border-gray-100 dark:border-gray-800">
                        <div className="flex items-center gap-1 mb-1">
                          <Gauge className="h-3 w-3 text-indigo-500" />
                          <span className="text-[9px] font-bold text-gray-400 uppercase">Memory</span>
                        </div>
                        <div className="font-bold text-sm text-gray-900 dark:text-white">{agent.memory_gb.toFixed(1)} GB</div>
                        <div className="w-full bg-gray-200 dark:bg-gray-800 rounded-full h-1 mt-1.5">
                          <div className="bg-indigo-500 h-1 rounded-full" style={{ width: `${Math.min((agent.memory_gb / 16) * 100, 100)}%` }} />
                        </div>
                        <div className="text-[9px] text-gray-400 mt-1">{((agent.memory_gb / 16) * 100).toFixed(0)}% of pool</div>
                      </div>

                      {/* Storage */}
                      <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-2.5 border border-gray-100 dark:border-gray-800">
                        <div className="flex items-center gap-1 mb-1">
                          <Database className="h-3 w-3 text-emerald-500" />
                          <span className="text-[9px] font-bold text-gray-400 uppercase">Storage</span>
                        </div>
                        <div className="font-bold text-sm text-gray-900 dark:text-white">{totalStorageUsed}</div>
                        <div className="text-[9px] text-gray-400 mt-2">Shared S3 vault · Local</div>
                      </div>

                      {/* Success + RL signal */}
                      <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-2.5 border border-gray-100 dark:border-gray-800">
                        <div className="flex items-center gap-1 mb-1">
                          <Sparkles className="h-3 w-3 text-amber-500" />
                          <span className="text-[9px] font-bold text-gray-400 uppercase">Success / RL</span>
                        </div>
                        <div className={`font-bold text-sm ${agent.success_rate >= 80 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                          {agent.success_rate.toFixed(0)}%
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-800 rounded-full h-1 mt-1.5">
                          <div className={`h-1 rounded-full ${agent.success_rate >= 80 ? "bg-emerald-500" : "bg-amber-500"}`} style={{ width: `${agent.success_rate}%` }} />
                        </div>
                        <div className="text-[9px] text-gray-400 mt-1">{agent.tasks_today} tasks today</div>
                      </div>
                    </div>
                  </Card>
                );
              })}

              {agentMetrics.length === 0 && (
                <div className="text-center py-8 text-xs text-gray-500 italic">
                  No agent metrics yet. Run a workflow to populate workspace data.
                </div>
              )}
            </div>
          </div>

          {/* Activity Feed */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <Card className="p-6">
                <div className="flex justify-between items-center border-b border-gray-200 dark:border-gray-800 pb-4 mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white">Recent Execution History</h3>
                    <p className="text-xs text-gray-500">Live feed of local agents executing workflow graphs</p>
                  </div>
                  <Link href="/workflows" className="btn btn-secondary btn-sm flex items-center gap-1 text-xs">
                    View All <ArrowUpRight className="h-3 w-3" />
                  </Link>
                </div>
                <ActivityFeed runs={runs} />
              </Card>
            </div>
            <div className="space-y-4">
              <Card className="p-5">
                <h4 className="font-bold text-xs text-gray-900 dark:text-white mb-4">Node Config Quickview</h4>
                <div className="space-y-3.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Active Model:</span>
                    <span className="font-semibold text-gray-850 dark:text-gray-200">{workflows.length > 0 ? "llama3.2:3b" : "None"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Storage Pool:</span>
                    <span className="font-semibold text-gray-850 dark:text-gray-200">Local SSD</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Security Layer:</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <ShieldCheck className="h-3.5 w-3.5" /> 100% Secure
                    </span>
                  </div>
                </div>
                <div className="mt-5 border-t border-gray-250 dark:border-gray-800 pt-4 flex gap-2">
                  <Link href="/workflows" className="btn btn-primary btn-sm flex-1 justify-center text-xs">New Workflow</Link>
                  <Link href="/settings" className="btn btn-secondary btn-sm flex-1 justify-center text-xs">Configure Node</Link>
                </div>
              </Card>
            </div>
          </div>
        </div>
      )}

      {activeTab === "compute" && (
        <ComputePage embed />
      )}

      {activeTab === "storage" && (
        <StoragePage embed />
      )}

      {/* Failure review intervention modal */}
      {reviewRunId && reviewDetails && (
        <FailureReview
          runId={reviewRunId}
          workflowName={reviewDetails.workflow_name}
          failureStep={reviewDetails.failure_step}
          aiExplanation={reviewDetails.ai_explanation}
          rawLog={reviewDetails.raw_log}
          onActionComplete={handleActionComplete}
          onClose={() => setReviewRunId(null)}
        />
      )}
    </Layout>
  );
}
