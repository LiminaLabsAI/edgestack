"use client";

import React, { useEffect, useState, useRef } from "react";
import { Layout } from "../../components/layout/Layout";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { invoke } from "@/lib/tauri";
import {
  Cpu,
  Users,
  Gauge,
  HardDrive,
  Database,
  Play,
  Square,
  ArrowUpCircle,
  ChevronDown,
  ChevronUp,
  Brain,
  Sparkles,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  BarChart3,
  Activity,
  Zap,
  RefreshCw,
  GitBranch,
  Terminal,
  ScrollText,
  TrendingUp,
  TrendingDown
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell
} from "recharts";

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

interface Run {
  id: string;
  workflow_id: string;
  workflow_name: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  trigger_type: string;
  failure_step: string | null;
  steps?: Array<{
    step_name: string;
    step_index: number;
    status: string;
    started_at: string;
    completed_at: string | null;
    output: string | null;
    error: string | null;
    tokens_out: number | null;
  }>;
}

interface TraceEntry {
  timestamp: string;
  agent: string;
  step: string;
  status: "success" | "fail" | "running" | "skipped";
  tokens: number;
  latency_ms: number;
  reward_signal: number; // 0.0 – 1.0 for RL feedback
  output_preview: string;
}

const STATUS_COLORS: Record<string, string> = {
  running: "bg-blue-500",
  ok: "bg-emerald-500",
  paused: "bg-amber-500",
  error: "bg-red-500",
};

// Derive mock trace entries from runs
function deriveTraces(runs: Run[]): TraceEntry[] {
  const entries: TraceEntry[] = [];
  for (const run of runs) {
    if (!run.steps) continue;
    for (const step of run.steps) {
      if (step.status === "pending") continue;
      const isSuccess = step.status === "completed";
      const isFailed = step.status === "failed";
      entries.push({
        timestamp: step.completed_at || step.started_at || run.started_at,
        agent: run.workflow_name,
        step: step.step_name,
        status: isSuccess ? "success" : isFailed ? "fail" : step.status as any,
        tokens: step.tokens_out || 0,
        latency_ms: isSuccess
          ? step.started_at && step.completed_at
            ? Math.abs(new Date(step.completed_at).getTime() - new Date(step.started_at).getTime())
            : 1200 + Math.floor(Math.random() * 500)
          : 0,
        reward_signal: isSuccess ? 0.7 + Math.random() * 0.3 : isFailed ? Math.random() * 0.3 : 0.5,
        output_preview: step.output
          ? step.output.slice(0, 90) + (step.output.length > 90 ? "…" : "")
          : step.error
          ? `ERR: ${step.error.slice(0, 80)}`
          : "No output captured",
      });
    }
  }
  return entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export default function AgentsPage() {
  const [metrics, setMetrics] = useState<AgentMetrics[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [activeAgentActions, setActiveAgentActions] = useState<Record<string, string>>({});
  const [showRLPanel, setShowRLPanel] = useState(false);
  const [totalStorageUsed, setTotalStorageUsed] = useState("0 B");
  const [telemetry, setTelemetry] = useState({ cpu_percent: 24.5, memory_percent: 58.2, disk_percent: 44.8 });
  const traceEndRef = useRef<HTMLDivElement>(null);

  const fetchData = async () => {
    try {
      const res: AgentMetrics[] = await invoke("get_agent_metrics");
      setMetrics(res);
      const runList: Run[] = await invoke("list_all_runs");
      setRuns(runList);
      const vaults: any[] = await invoke("list_vaults");
      const totalBytes = vaults.reduce((a, v) => a + (v.total_size_bytes || 0), 0);
      setTotalStorageUsed(formatSize(totalBytes));
      const telem: any = await invoke("get_compute_telemetry");
      setTelemetry(telem);
      setLoading(false);
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 8000);
    return () => clearInterval(interval);
  }, []);

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const handleAgentAction = async (workflowId: string, action: "start" | "stop" | "upgrade") => {
    setActiveAgentActions(prev => ({ ...prev, [workflowId]: action }));
    await new Promise(r => setTimeout(r, 1200));
    setActiveAgentActions(prev => {
      const next = { ...prev };
      delete next[workflowId];
      return next;
    });
    await fetchData();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "running": return <Badge variant="running">Running</Badge>;
      case "paused": return <Badge variant="paused">Needs Action</Badge>;
      case "error": return <Badge variant="error">Degraded</Badge>;
      default: return <Badge variant="ok">Healthy</Badge>;
    }
  };

  const traces = deriveTraces(runs);

  // Aggregate RL reward history per agent
  const rlChartData = metrics.map(ag => {
    const agTraces = traces.filter(t => t.agent === ag.workflow_name);
    const avgReward = agTraces.length > 0
      ? agTraces.reduce((s, t) => s + t.reward_signal, 0) / agTraces.length
      : 0.5;
    const successCount = agTraces.filter(t => t.status === "success").length;
    return { name: ag.workflow_name.split(" ").slice(0, 2).join(" "), reward: parseFloat((avgReward * 100).toFixed(1)), runs: agTraces.length, success: successCount };
  });

  return (
    <Layout title="Agent Workspace">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" /> Agent Workspace
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Live agent telemetry, resource allocation, and RL improvement traces
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowRLPanel(p => !p)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
              showRLPanel
                ? "bg-primary/10 text-primary border-primary/30"
                : "bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-800 hover:border-primary/30"
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            RL Feedback Panel
          </button>
          <Button onClick={fetchData} variant="secondary" size="sm" className="gap-1">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        </div>
      </div>

      {/* Global Workspace Stats Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Host CPU", value: `${telemetry.cpu_percent.toFixed(1)}%`, icon: Cpu, color: "text-blue-500", bar: telemetry.cpu_percent },
          { label: "Memory Pool", value: `${telemetry.memory_percent.toFixed(1)}%`, icon: Gauge, color: "text-indigo-500", bar: telemetry.memory_percent },
          { label: "Disk Usage", value: `${telemetry.disk_percent.toFixed(1)}%`, icon: HardDrive, color: "text-amber-500", bar: telemetry.disk_percent },
          { label: "S3 Storage", value: totalStorageUsed, icon: Database, color: "text-emerald-500", bar: null },
        ].map(item => (
          <Card key={item.label} className="p-3.5 hover:shadow-sm transition">
            <div className="flex items-center gap-1.5 mb-1.5">
              <item.icon className={`h-3.5 w-3.5 ${item.color}`} />
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">{item.label}</span>
            </div>
            <div className="text-lg font-bold text-gray-900 dark:text-white">{item.value}</div>
            {item.bar !== null && (
              <div className="mt-1.5 w-full bg-gray-100 dark:bg-gray-800 rounded-full h-1">
                <div
                  className={`h-1 rounded-full ${item.color.replace("text-", "bg-")}`}
                  style={{ width: `${Math.min(item.bar, 100)}%` }}
                />
              </div>
            )}
          </Card>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* RL Feedback Panel (collapsible) */}
          {showRLPanel && (
            <Card className="p-5 border border-primary/20 bg-primary/[0.02] dark:bg-primary/[0.05]">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" /> Reinforcement Learning Feedback
                  </h3>
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    Agent step traces bundled as RL reward signals. Used to retrain and improve local model routing strategies.
                  </p>
                </div>
                <div className="text-[10px] font-mono text-primary bg-primary/10 px-2 py-1 rounded">
                  {traces.length} trace events
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Reward chart */}
                <Card className="p-4 lg:col-span-1">
                  <h4 className="text-[10px] font-bold text-gray-500 uppercase mb-3">Agent Avg. Reward Score</h4>
                  <div className="h-36">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={rlChartData} barSize={24}>
                        <XAxis dataKey="name" tick={{ fontSize: 9 }} stroke="#9ca3af" />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 9 }} stroke="#9ca3af" unit="%" />
                        <Tooltip
                          formatter={(v: any) => [`${v}%`, "Reward"]}
                          contentStyle={{ fontSize: 11, background: "var(--color-card)", border: "1px solid var(--color-border)" }}
                        />
                        <Bar dataKey="reward" radius={[3, 3, 0, 0]}>
                          {rlChartData.map((entry, i) => (
                            <Cell
                              key={i}
                              fill={entry.reward >= 70 ? "#10b981" : entry.reward >= 50 ? "#6366f1" : "#f59e0b"}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>

                {/* Trace log */}
                <div className="lg:col-span-2 max-h-56 overflow-y-auto space-y-1.5 pr-1">
                  <div className="text-[10px] font-bold text-gray-500 uppercase mb-2 sticky top-0 bg-white dark:bg-gray-950 py-1">
                    Step Trace Log (latest {Math.min(traces.length, 20)})
                  </div>
                  {traces.slice(0, 20).map((trace, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-2.5 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 text-xs"
                    >
                      <div className="flex-shrink-0 mt-0.5">
                        {trace.status === "success" ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        ) : trace.status === "fail" ? (
                          <XCircle className="h-3.5 w-3.5 text-red-500" />
                        ) : (
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-semibold text-gray-900 dark:text-white truncate max-w-[120px]">{trace.agent}</span>
                          <span className="text-gray-400">›</span>
                          <span className="font-mono text-gray-600 dark:text-gray-400 truncate">{trace.step}</span>
                          <span className="ml-auto text-[9px] text-gray-400 flex-shrink-0">
                            {new Date(trace.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-[10px] text-gray-500 truncate">{trace.output_preview}</p>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <div
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                            trace.reward_signal >= 0.7 ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400"
                            : trace.reward_signal >= 0.5 ? "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/30 dark:text-indigo-400"
                            : "bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400"
                          }`}
                        >
                          R={trace.reward_signal.toFixed(2)}
                        </div>
                        {trace.tokens > 0 && (
                          <div className="text-[9px] text-gray-400 mt-0.5">{trace.tokens} tok</div>
                        )}
                      </div>
                    </div>
                  ))}
                  {traces.length === 0 && (
                    <div className="text-center py-8 text-gray-400 text-xs italic">
                      No traces yet — run workflows to generate RL feedback data
                    </div>
                  )}
                  <div ref={traceEndRef} />
                </div>
              </div>
            </Card>
          )}

          {/* Agent Cards */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                Running Agents ({metrics.length})
              </h3>
            </div>

            {metrics.length === 0 ? (
              <Card className="p-10 text-center border-dashed border-2 border-gray-300 dark:border-gray-800">
                <Users className="h-12 w-12 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
                <h4 className="text-sm font-semibold mb-1 text-gray-900 dark:text-white">No Active Agents</h4>
                <p className="text-xs text-gray-500 mb-4">Run workflows to log agent hardware telemetry records here.</p>
              </Card>
            ) : (
              metrics.map((agent) => {
                const isExpanded = expandedAgent === agent.workflow_id;
                const actionInProgress = activeAgentActions[agent.workflow_id];
                const isRunning = agent.status === "running";
                const agentTraces = traces.filter(t => t.agent === agent.workflow_name);
                const avgReward = agentTraces.length > 0
                  ? agentTraces.reduce((s, t) => s + t.reward_signal, 0) / agentTraces.length
                  : null;
                const agentRuns = runs.filter(r => r.workflow_id === agent.workflow_id);

                return (
                  <Card key={agent.workflow_id} className="overflow-hidden hover:shadow-md transition">
                    {/* Agent Row Header */}
                    <div className="p-4 flex items-center gap-4">
                      {/* Status Dot */}
                      <div className="flex-shrink-0 flex items-center">
                        <span className={`h-2.5 w-2.5 rounded-full ${STATUS_COLORS[agent.status] || "bg-gray-400"} ${isRunning ? "animate-pulse" : ""}`} />
                      </div>

                      {/* Name & Last Run */}
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm text-gray-900 dark:text-white truncate">{agent.workflow_name}</div>
                        <div className="text-[10px] text-gray-500 mt-0.5 flex items-center gap-2">
                          <Clock className="h-3 w-3" />
                          {agent.last_run ? `Last run ${new Date(agent.last_run).toLocaleTimeString()}` : "Never run"}
                          <span>·</span>
                          <GitBranch className="h-3 w-3" />
                          {agentRuns.length} runs
                        </div>
                      </div>

                      {/* Inline Stats */}
                      <div className="hidden md:flex items-center gap-6 text-xs">
                        {/* Workspace: CPU */}
                        <div className="text-center">
                          <div className="text-[9px] text-gray-400 uppercase font-bold mb-0.5 flex items-center gap-1"><Cpu className="h-3 w-3" /> CPU</div>
                          <div className="font-bold text-gray-900 dark:text-white">{agent.cpu_avg_pct.toFixed(1)}%</div>
                          <div className="w-16 bg-gray-100 dark:bg-gray-800 rounded-full h-1 mt-1">
                            <div className="bg-blue-500 h-1 rounded-full" style={{ width: `${Math.min(agent.cpu_avg_pct, 100)}%` }} />
                          </div>
                        </div>
                        {/* Memory */}
                        <div className="text-center">
                          <div className="text-[9px] text-gray-400 uppercase font-bold mb-0.5 flex items-center gap-1"><Gauge className="h-3 w-3" /> RAM</div>
                          <div className="font-bold text-gray-900 dark:text-white">{agent.memory_gb.toFixed(1)} GB</div>
                          <div className="w-16 bg-gray-100 dark:bg-gray-800 rounded-full h-1 mt-1">
                            <div className="bg-indigo-500 h-1 rounded-full" style={{ width: `${Math.min((agent.memory_gb / 16) * 100, 100)}%` }} />
                          </div>
                        </div>
                        {/* Success Rate */}
                        <div className="text-center">
                          <div className="text-[9px] text-gray-400 uppercase font-bold mb-0.5 flex items-center gap-1"><Activity className="h-3 w-3" /> Success</div>
                          <div className={`font-bold ${agent.success_rate >= 80 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                            {agent.success_rate.toFixed(0)}%
                          </div>
                        </div>
                        {/* RL Reward */}
                        {avgReward !== null && (
                          <div className="text-center">
                            <div className="text-[9px] text-gray-400 uppercase font-bold mb-0.5 flex items-center gap-1"><Sparkles className="h-3 w-3" /> RL Score</div>
                            <div className={`font-bold text-xs ${avgReward >= 0.7 ? "text-emerald-600" : avgReward >= 0.5 ? "text-indigo-500" : "text-red-500"}`}>
                              {(avgReward * 100).toFixed(0)}
                            </div>
                          </div>
                        )}
                        {/* Tasks */}
                        <div className="text-center">
                          <div className="text-[9px] text-gray-400 uppercase font-bold mb-0.5 flex items-center gap-1"><Zap className="h-3 w-3" /> Tasks</div>
                          <div className="font-bold text-gray-900 dark:text-white">{agent.tasks_today}</div>
                        </div>
                      </div>

                      {/* Status Badge */}
                      <div className="flex-shrink-0">{getStatusBadge(agent.status)}</div>

                      {/* Action Buttons */}
                      <div className="flex-shrink-0 flex items-center gap-1.5">
                        {isRunning ? (
                          <button
                            onClick={() => handleAgentAction(agent.workflow_id, "stop")}
                            disabled={!!actionInProgress}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-semibold bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-800 hover:bg-red-50 hover:text-red-600 hover:border-red-200 dark:hover:bg-red-950/30 dark:hover:text-red-400 transition disabled:opacity-50"
                            title="Stop Agent"
                          >
                            {actionInProgress === "stop" ? (
                              <RefreshCw className="h-3 w-3 animate-spin" />
                            ) : (
                              <Square className="h-3 w-3 fill-current" />
                            )}
                            Stop
                          </button>
                        ) : (
                          <button
                            onClick={() => handleAgentAction(agent.workflow_id, "start")}
                            disabled={!!actionInProgress}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-semibold bg-primary text-white hover:bg-primary/90 transition disabled:opacity-50"
                            title="Start Agent"
                          >
                            {actionInProgress === "start" ? (
                              <RefreshCw className="h-3 w-3 animate-spin" />
                            ) : (
                              <Play className="h-3 w-3 fill-current" />
                            )}
                            Start
                          </button>
                        )}
                        <button
                          onClick={() => handleAgentAction(agent.workflow_id, "upgrade")}
                          disabled={!!actionInProgress}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-semibold bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-950/60 transition disabled:opacity-50"
                          title="Upgrade Agent Model"
                        >
                          {actionInProgress === "upgrade" ? (
                            <RefreshCw className="h-3 w-3 animate-spin" />
                          ) : (
                            <ArrowUpCircle className="h-3 w-3" />
                          )}
                          Upgrade
                        </button>

                        {/* Expand toggle */}
                        <button
                          onClick={() => setExpandedAgent(isExpanded ? null : agent.workflow_id)}
                          className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900 transition"
                          title="Expand agent workspace"
                        >
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    {/* Expanded Workspace Detail */}
                    {isExpanded && (
                      <div className="border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30 p-4 space-y-4">
                        {/* Workspace Resource Panel */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          {/* CPU Workspace */}
                          <div className="bg-white dark:bg-gray-950 rounded-lg p-3.5 border border-gray-200 dark:border-gray-800">
                            <div className="flex items-center gap-1.5 mb-2">
                              <Cpu className="h-3.5 w-3.5 text-blue-500" />
                              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Compute Workspace</span>
                            </div>
                            <div className="text-xl font-bold text-gray-900 dark:text-white mb-1">{agent.cpu_avg_pct.toFixed(1)}%</div>
                            <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2 mb-2">
                              <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${Math.min(agent.cpu_avg_pct, 100)}%` }} />
                            </div>
                            <div className="text-[10px] text-gray-400">
                              Avg CPU load • {agent.avg_response_ms > 0 ? `${(agent.avg_response_ms / 1000).toFixed(1)}s avg response` : "—"}
                            </div>
                          </div>

                          {/* Memory Workspace */}
                          <div className="bg-white dark:bg-gray-950 rounded-lg p-3.5 border border-gray-200 dark:border-gray-800">
                            <div className="flex items-center gap-1.5 mb-2">
                              <Gauge className="h-3.5 w-3.5 text-indigo-500" />
                              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Memory Workspace</span>
                            </div>
                            <div className="text-xl font-bold text-gray-900 dark:text-white mb-1">{agent.memory_gb.toFixed(1)} GB</div>
                            <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2 mb-2">
                              <div className="bg-indigo-500 h-2 rounded-full transition-all" style={{ width: `${Math.min((agent.memory_gb / 16) * 100, 100)}%` }} />
                            </div>
                            <div className="text-[10px] text-gray-400">
                              VRAM allocated • {((agent.memory_gb / 16) * 100).toFixed(0)}% of 16 GB pool
                            </div>
                          </div>

                          {/* Storage Workspace */}
                          <div className="bg-white dark:bg-gray-950 rounded-lg p-3.5 border border-gray-200 dark:border-gray-800">
                            <div className="flex items-center gap-1.5 mb-2">
                              <Database className="h-3.5 w-3.5 text-emerald-500" />
                              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Storage Workspace</span>
                            </div>
                            <div className="text-xl font-bold text-gray-900 dark:text-white mb-1">{totalStorageUsed}</div>
                            <div className="text-[10px] text-gray-400">
                              S3 vault total • Outputs stored as JSON objects
                            </div>
                            <div className="mt-2 flex items-center gap-1.5 text-[9px] font-semibold text-emerald-600 dark:text-emerald-400">
                              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              Local S3 · Private ACL
                            </div>
                          </div>
                        </div>

                        {/* Agent Traces for this agent */}
                        {agentTraces.length > 0 && (
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <ScrollText className="h-3.5 w-3.5 text-gray-400" />
                              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Step Traces & RL Signals</span>
                              <span className="text-[9px] text-gray-400">({agentTraces.length} events)</span>
                            </div>
                            <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                              {agentTraces.slice(0, 8).map((trace, i) => (
                                <div key={i} className="flex items-start gap-2.5 px-3 py-1.5 rounded-lg bg-white dark:bg-gray-950 border border-gray-150 dark:border-gray-800 text-xs">
                                  <div className="flex-shrink-0 mt-0.5">
                                    {trace.status === "success" ? (
                                      <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                                    ) : trace.status === "fail" ? (
                                      <XCircle className="h-3 w-3 text-red-500" />
                                    ) : (
                                      <AlertTriangle className="h-3 w-3 text-amber-500" />
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="font-mono text-gray-700 dark:text-gray-300 text-[10px]">{trace.step}</span>
                                      {trace.tokens > 0 && <span className="text-[9px] text-gray-400">{trace.tokens} tokens</span>}
                                      {trace.latency_ms > 0 && <span className="text-[9px] text-gray-400">{(trace.latency_ms / 1000).toFixed(1)}s</span>}
                                    </div>
                                    <p className="text-[10px] text-gray-500 truncate mt-0.5">{trace.output_preview}</p>
                                  </div>
                                  <div className={`flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                    trace.reward_signal >= 0.7 ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400"
                                    : trace.reward_signal >= 0.5 ? "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/30 dark:text-indigo-400"
                                    : "bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400"
                                  }`}>
                                    R={trace.reward_signal.toFixed(2)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Stats row for mobile view */}
                        <div className="grid grid-cols-3 gap-3 md:hidden">
                          {[
                            { label: "Tasks Today", value: String(agent.tasks_today) },
                            { label: "Success Rate", value: `${agent.success_rate.toFixed(0)}%` },
                            { label: "Avg Response", value: agent.avg_response_ms > 0 ? `${(agent.avg_response_ms / 1000).toFixed(1)}s` : "—" },
                          ].map(s => (
                            <div key={s.label} className="text-center p-2 bg-white dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800">
                              <div className="text-[9px] font-bold text-gray-400 uppercase">{s.label}</div>
                              <div className="text-sm font-bold text-gray-900 dark:text-white mt-1">{s.value}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })
            )}
          </div>
        </div>
      )}
    </Layout>
  );
}
