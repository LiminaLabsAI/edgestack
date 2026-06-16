"use client";

import React, { useEffect, useState } from "react";
import { Layout } from "../../components/layout/Layout";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { invoke } from "@/lib/tauri";
import {
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Download,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Filter,
  Globe,
  Brain,
  HardDrive,
  Activity,
  Lock,
  ChevronDown,
  ChevronUp,
  X,
  Info,
  FileText,
  BarChart3
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend
} from "recharts";

// ─── Types ───────────────────────────────────────────────────────────────────

interface PolicyConditions {
  url_allowlist?: string[];
  url_blocklist?: string[];
  max_tokens_per_day?: number;
  pii_filter_output?: boolean;
  require_data_tag?: boolean;
  max_calls_per_hour?: number;
  max_daily_cost_usd?: number;
}

interface Policy {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  action_type: string;
  effect: string;
  conditions: PolicyConditions;
  created_at: string;
  updated_at: string;
}

interface AuditEntry {
  id: string;
  timestamp: string;
  workflow_id?: string;
  workflow_name?: string;
  run_id?: string;
  step_name?: string;
  action_type: string;
  policy_id?: string;
  policy_name?: string;
  decision: string;
  reason?: string;
  context_url?: string;
  tokens_requested?: number;
}

interface ComplianceSummary {
  total_policies: number;
  active_policies: number;
  compliance_score: number;
  audit_events_today: number;
  blocks_today: number;
  warns_today: number;
  allows_today: number;
  blocks_week: number;
  top_violations: { policy_name: string; count: number }[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ACTION_OPTIONS = [
  { value: "*", label: "All Actions", icon: Activity },
  { value: "ask_ai", label: "AI Inference (ask_ai)", icon: Brain },
  { value: "browse_web", label: "Web Browsing (browse_web)", icon: Globe },
  { value: "http_request", label: "HTTP Request", icon: Globe },
  { value: "save_to_vault", label: "Save to Vault", icon: HardDrive },
  { value: "write_to_s3", label: "Write to S3", icon: HardDrive },
];

const EFFECT_OPTIONS = [
  { value: "block", label: "Block", description: "Hard stop — step fails, workflow pauses for HITL", color: "text-red-600" },
  { value: "warn", label: "Warn", description: "Emit warning and continue execution", color: "text-amber-600" },
  { value: "audit", label: "Audit Only", description: "Log to audit trail without affecting execution", color: "text-blue-600" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DECISION_COLORS: Record<string, string> = {
  allow: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400",
  block: "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400",
  warn: "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400",
  audit: "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400",
};

const DecisionIcon = ({ decision }: { decision: string }) => {
  if (decision === "allow") return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
  if (decision === "block") return <XCircle className="h-3.5 w-3.5 text-red-500" />;
  return <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />;
};

const scoreColor = (score: number) => {
  if (score >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 60) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
};

const scoreGradient = (score: number) => {
  if (score >= 80) return "from-emerald-500 to-emerald-400";
  if (score >= 60) return "from-amber-500 to-amber-400";
  return "from-red-500 to-red-400";
};

// ─── New Policy Modal ─────────────────────────────────────────────────────────

const BLANK_FORM = {
  name: "",
  description: "",
  action_type: "ask_ai",
  effect: "block",
  url_allowlist: "",
  url_blocklist: "",
  max_tokens_per_day: "",
  pii_filter_output: false,
  require_data_tag: false,
  max_calls_per_hour: "",
  max_daily_cost_usd: "",
};

function PolicyModal({
  onClose,
  onSave,
  initial,
}: {
  onClose: () => void;
  onSave: (data: any) => Promise<void>;
  initial?: Policy | null;
}) {
  const [form, setForm] = useState(() => {
    if (initial) {
      const c = initial.conditions;
      return {
        name: initial.name,
        description: initial.description || "",
        action_type: initial.action_type,
        effect: initial.effect,
        url_allowlist: (c.url_allowlist || []).join(", "),
        url_blocklist: (c.url_blocklist || []).join(", "),
        max_tokens_per_day: c.max_tokens_per_day ? String(c.max_tokens_per_day) : "",
        pii_filter_output: c.pii_filter_output || false,
        require_data_tag: c.require_data_tag || false,
        max_calls_per_hour: c.max_calls_per_hour ? String(c.max_calls_per_hour) : "",
        max_daily_cost_usd: c.max_daily_cost_usd ? String(c.max_daily_cost_usd) : "",
      };
    }
    return BLANK_FORM;
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    const conditions: PolicyConditions = {};
    if (form.url_allowlist.trim()) conditions.url_allowlist = form.url_allowlist.split(",").map(s => s.trim()).filter(Boolean);
    if (form.url_blocklist.trim()) conditions.url_blocklist = form.url_blocklist.split(",").map(s => s.trim()).filter(Boolean);
    if (form.max_tokens_per_day) conditions.max_tokens_per_day = parseInt(form.max_tokens_per_day);
    if (form.pii_filter_output) conditions.pii_filter_output = true;
    if (form.require_data_tag) conditions.require_data_tag = true;
    if (form.max_calls_per_hour) conditions.max_calls_per_hour = parseInt(form.max_calls_per_hour);
    if (form.max_daily_cost_usd) conditions.max_daily_cost_usd = parseFloat(form.max_daily_cost_usd);
    await onSave({ ...form, conditions });
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-950 rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-gray-800">
        <div className="flex justify-between items-center p-5 border-b border-gray-200 dark:border-gray-800">
          <div>
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">
              {initial ? "Edit Policy Rule" : "New Policy Rule"}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">Define a governance constraint for workflow step execution</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900 transition">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Policy Name *</label>
            <input
              className="w-full input-field"
              placeholder="e.g. Block External HTTP Calls"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Description</label>
            <input
              className="w-full input-field"
              placeholder="What does this policy enforce?"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>

          {/* Action Type + Effect */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Applies To</label>
              <select
                className="w-full input-field"
                value={form.action_type}
                onChange={e => setForm(f => ({ ...f, action_type: e.target.value }))}
              >
                {ACTION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Effect</label>
              <select
                className="w-full input-field"
                value={form.effect}
                onChange={e => setForm(f => ({ ...f, effect: e.target.value }))}
              >
                {EFFECT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <p className="text-[10px] text-gray-400 mt-1">
                {EFFECT_OPTIONS.find(o => o.value === form.effect)?.description}
              </p>
            </div>
          </div>

          {/* Conditions section */}
          <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
            <div className="flex items-center gap-1.5 mb-3">
              <Lock className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-bold text-gray-700 dark:text-gray-300">Conditions</span>
              <span className="text-[10px] text-gray-400">(leave blank to skip)</span>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-1">URL Allowlist (comma-separated)</label>
                <input className="w-full input-field text-xs" placeholder="api.stripe.com, hooks.slack.com" value={form.url_allowlist}
                  onChange={e => setForm(f => ({ ...f, url_allowlist: e.target.value }))} />
                <p className="text-[9px] text-gray-400 mt-0.5">Only URLs containing these strings are permitted</p>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-1">URL Blocklist (comma-separated)</label>
                <input className="w-full input-field text-xs" placeholder="malicious.com, tracking.io" value={form.url_blocklist}
                  onChange={e => setForm(f => ({ ...f, url_blocklist: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-1">Max Tokens / Day</label>
                  <input className="w-full input-field text-xs" type="number" placeholder="50000" value={form.max_tokens_per_day}
                    onChange={e => setForm(f => ({ ...f, max_tokens_per_day: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-1">Max Calls / Hour</label>
                  <input className="w-full input-field text-xs" type="number" placeholder="10" value={form.max_calls_per_hour}
                    onChange={e => setForm(f => ({ ...f, max_calls_per_hour: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-gray-500 uppercase mb-1">Max Daily Cost (USD)</label>
                <input className="w-full input-field text-xs" type="number" step="0.01" placeholder="5.00" value={form.max_daily_cost_usd}
                  onChange={e => setForm(f => ({ ...f, max_daily_cost_usd: e.target.value }))} />
              </div>
              <div className="flex flex-col gap-2 pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="rounded" checked={form.pii_filter_output}
                    onChange={e => setForm(f => ({ ...f, pii_filter_output: e.target.checked }))} />
                  <span className="text-xs text-gray-700 dark:text-gray-300">Enable PII filter on AI output <span className="text-gray-400">(strips emails, phones, card numbers)</span></span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="rounded" checked={form.require_data_tag}
                    onChange={e => setForm(f => ({ ...f, require_data_tag: e.target.checked }))} />
                  <span className="text-xs text-gray-700 dark:text-gray-300">Require <code className="text-[10px] bg-gray-100 dark:bg-gray-900 px-1 rounded">data_tag</code> on vault/storage steps</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 p-5 border-t border-gray-200 dark:border-gray-800">
          <button onClick={onClose} className="btn btn-secondary btn-sm">Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={saving || !form.name.trim()}
            className="btn btn-primary btn-sm flex items-center gap-1.5"
          >
            {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
            {initial ? "Save Changes" : "Create Policy"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function GovernancePage() {
  const [activeTab, setActiveTab] = useState<"overview" | "policies" | "audit">("overview");
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [summary, setSummary] = useState<ComplianceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editPolicy, setEditPolicy] = useState<Policy | null>(null);
  const [decisionFilter, setDecisionFilter] = useState("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [yamlExport, setYamlExport] = useState<string | null>(null);

  const fetchAll = async () => {
    try {
      const [pols, audit, sum] = await Promise.all([
        invoke<Policy[]>("list_policies"),
        invoke<AuditEntry[]>("list_audit_log", { limit: 50, decision_filter: decisionFilter }),
        invoke<ComplianceSummary>("get_compliance_summary"),
      ]);
      setPolicies(pols);
      setAuditLog(audit);
      setSummary(sum);
      setLoading(false);
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, [decisionFilter]);

  const handleSavePolicy = async (formData: any) => {
    if (editPolicy) {
      await invoke("update_policy", {
        id: editPolicy.id,
        name: formData.name,
        description: formData.description || null,
        action_type: formData.action_type,
        effect: formData.effect,
        conditions: formData.conditions,
        enabled: editPolicy.enabled,
      });
    } else {
      await invoke("create_policy", {
        name: formData.name,
        description: formData.description || null,
        action_type: formData.action_type,
        effect: formData.effect,
        conditions: formData.conditions,
      });
    }
    setShowModal(false);
    setEditPolicy(null);
    fetchAll();
  };

  const handleToggle = async (policy: Policy) => {
    setTogglingId(policy.id);
    await invoke("toggle_policy", { id: policy.id, enabled: !policy.enabled });
    setTogglingId(null);
    fetchAll();
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    await invoke("delete_policy", { id });
    setDeletingId(null);
    fetchAll();
  };

  const handleExportYaml = async () => {
    const yaml = await invoke<string>("export_policies_yaml");
    setYamlExport(yaml);
  };

  // Chart data for overview
  const decisionChartData = summary ? [
    { name: "Allow", value: summary.allows_today, color: "#10b981" },
    { name: "Warn", value: summary.warns_today, color: "#f59e0b" },
    { name: "Block", value: summary.blocks_today, color: "#ef4444" },
  ] : [];

  const actionTypeLabel = (type: string) => ACTION_OPTIONS.find(o => o.value === type)?.label || type;

  return (
    <Layout title="Governance & Compliance">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" /> Governance & Compliance
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Define policy rules, enforce data controls, and audit all agent actions
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExportYaml} className="btn btn-secondary btn-sm flex items-center gap-1.5">
            <Download className="h-3.5 w-3.5" /> Export YAML
          </button>
          <button onClick={() => { setEditPolicy(null); setShowModal(true); }} className="btn btn-primary btn-sm flex items-center gap-1.5">
            <Plus className="h-3.5 w-3.5" /> New Policy
          </button>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex items-center gap-1 p-1 bg-gray-100 dark:bg-gray-900 rounded-lg select-none mb-6 w-fit">
        {[
          { id: "overview", label: "Overview", icon: BarChart3 },
          { id: "policies", label: `Policies (${policies.length})`, icon: ShieldCheck },
          { id: "audit", label: "Audit Log", icon: FileText },
        ].map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                activeTab === tab.id
                  ? "bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm"
                  : "text-gray-500 hover:text-gray-900 dark:hover:text-gray-100"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : (
        <>
          {/* ── OVERVIEW TAB ──────────────────────────────────────────────── */}
          {activeTab === "overview" && summary && (
            <div className="space-y-6">
              {/* Score + Stats */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {/* Compliance Score */}
                <Card className="md:col-span-1 p-5 flex flex-col items-center justify-center">
                  <div className="text-[10px] font-bold text-gray-400 uppercase mb-2 tracking-wide">Compliance Score</div>
                  <div className={`text-5xl font-black ${scoreColor(summary.compliance_score)}`}>
                    {summary.compliance_score}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">out of 100</div>
                  <div className="w-full mt-3 bg-gray-100 dark:bg-gray-800 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full bg-gradient-to-r ${scoreGradient(summary.compliance_score)} transition-all`}
                      style={{ width: `${summary.compliance_score}%` }}
                    />
                  </div>
                </Card>

                {/* Stats */}
                {[
                  { label: "Active Policies", value: summary.active_policies, sub: `${summary.total_policies} total`, icon: ShieldCheck, color: "text-primary" },
                  { label: "Events Today", value: summary.audit_events_today, sub: "policy checks", icon: Activity, color: "text-indigo-500" },
                  { label: "Blocks Today", value: summary.blocks_today, sub: `${summary.blocks_week} this week`, icon: ShieldX, color: "text-red-500" },
                  { label: "Warnings Today", value: summary.warns_today, sub: "non-critical", icon: ShieldAlert, color: "text-amber-500" },
                ].map(s => {
                  const Icon = s.icon;
                  return (
                    <Card key={s.label} className="metric-card hover:shadow-sm transition">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Icon className={`h-4 w-4 ${s.color}`} />
                        <span className="text-[10px] font-bold text-gray-400 uppercase">{s.label}</span>
                      </div>
                      <div className="text-2xl font-bold text-gray-900 dark:text-white">{s.value}</div>
                      <div className="text-[10px] text-gray-400 mt-1">{s.sub}</div>
                    </Card>
                  );
                })}
              </div>

              {/* Charts Row */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Decision Breakdown */}
                <Card className="p-5">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Today's Decision Breakdown</h3>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={decisionChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                          {decisionChartData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                        </Pie>
                        <Tooltip formatter={(v: any, name: any) => [v, name]} contentStyle={{ fontSize: 11 }} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </Card>

                {/* Top Violations */}
                <Card className="p-5">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Top Violated Policies (7 days)</h3>
                  {summary.top_violations.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-36 text-gray-400 text-xs italic">
                      <ShieldCheck className="h-10 w-10 mb-2 text-emerald-400" />
                      No policy violations this week
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {summary.top_violations.map((v, i) => (
                        <div key={i} className="flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">{v.policy_name}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-32 bg-gray-100 dark:bg-gray-800 rounded-full h-1.5">
                              <div
                                className="bg-red-400 h-1.5 rounded-full"
                                style={{ width: `${(v.count / (summary.top_violations[0]?.count || 1)) * 100}%` }}
                              />
                            </div>
                            <span className="text-xs font-bold text-gray-600 dark:text-gray-400 w-4 text-right">{v.count}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>

              {/* Policy Health Cards */}
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3">Policy Health</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {policies.map(p => (
                    <Card key={p.id} className="p-3.5 flex items-center gap-3 hover:shadow-sm transition">
                      {p.enabled
                        ? <ShieldCheck className="h-4.5 w-4.5 text-emerald-500 flex-shrink-0" />
                        : <ShieldAlert className="h-4.5 w-4.5 text-gray-400 flex-shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-gray-900 dark:text-white truncate">{p.name}</div>
                        <div className="text-[10px] text-gray-400">{actionTypeLabel(p.action_type)} · {p.effect}</div>
                      </div>
                      <div className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${p.enabled ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400" : "bg-gray-100 text-gray-500 dark:bg-gray-900 dark:text-gray-500"}`}>
                        {p.enabled ? "Active" : "Disabled"}
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── POLICIES TAB ──────────────────────────────────────────────── */}
          {activeTab === "policies" && (
            <div className="space-y-3">
              {policies.length === 0 ? (
                <Card className="p-12 text-center border-dashed border-2 border-gray-200 dark:border-gray-800">
                  <ShieldCheck className="h-12 w-12 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">No Policies Defined</h4>
                  <p className="text-xs text-gray-500 mb-4">Create your first governance policy to enforce data controls on workflow execution</p>
                  <button onClick={() => setShowModal(true)} className="btn btn-primary btn-sm mx-auto flex items-center gap-1.5">
                    <Plus className="h-3.5 w-3.5" /> Create First Policy
                  </button>
                </Card>
              ) : (
                policies.map(policy => (
                  <Card key={policy.id} className={`p-4 transition ${!policy.enabled ? "opacity-60" : "hover:shadow-sm"}`}>
                    <div className="flex items-center gap-4">
                      {/* Enable toggle */}
                      <button
                        onClick={() => handleToggle(policy)}
                        disabled={togglingId === policy.id}
                        className="flex-shrink-0 text-gray-400 hover:text-primary transition"
                        title={policy.enabled ? "Disable policy" : "Enable policy"}
                      >
                        {togglingId === policy.id
                          ? <RefreshCw className="h-5 w-5 animate-spin" />
                          : policy.enabled
                          ? <ToggleRight className="h-5 w-5 text-primary" />
                          : <ToggleLeft className="h-5 w-5" />}
                      </button>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-gray-900 dark:text-white">{policy.name}</span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${
                            policy.effect === "block" ? "bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400"
                            : policy.effect === "warn" ? "bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400"
                            : "bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400"
                          }`}>
                            {policy.effect}
                          </span>
                        </div>
                        {policy.description && (
                          <p className="text-[11px] text-gray-500 mt-0.5 truncate">{policy.description}</p>
                        )}
                        <div className="flex flex-wrap gap-3 mt-2 text-[10px] text-gray-400">
                          <span>Applies to: <strong className="text-gray-600 dark:text-gray-300">{actionTypeLabel(policy.action_type)}</strong></span>
                          {policy.conditions.url_allowlist?.length && (
                            <span>Allowlist: <strong className="text-gray-600 dark:text-gray-300">{policy.conditions.url_allowlist.length} domains</strong></span>
                          )}
                          {policy.conditions.max_tokens_per_day && (
                            <span>Token cap: <strong className="text-gray-600 dark:text-gray-300">{policy.conditions.max_tokens_per_day.toLocaleString()}/day</strong></span>
                          )}
                          {policy.conditions.pii_filter_output && (
                            <span className="text-indigo-500 font-semibold">PII Filter ON</span>
                          )}
                          {policy.conditions.require_data_tag && (
                            <span className="text-amber-600 font-semibold">Data Tag Required</span>
                          )}
                          {policy.conditions.max_calls_per_hour && (
                            <span>Rate: <strong className="text-gray-600 dark:text-gray-300">{policy.conditions.max_calls_per_hour}/hr</strong></span>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="text-[9px] text-gray-400">Updated {new Date(policy.updated_at).toLocaleDateString()}</span>
                        <button
                          onClick={() => { setEditPolicy(policy); setShowModal(true); }}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-gray-100 dark:hover:bg-gray-900 transition"
                          title="Edit policy"
                        >
                          <Info className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(policy.id)}
                          disabled={deletingId === policy.id}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition"
                          title="Delete policy"
                        >
                          {deletingId === policy.id
                            ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            : <Trash2 className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </div>
                  </Card>
                ))
              )}
            </div>
          )}

          {/* ── AUDIT LOG TAB ──────────────────────────────────────────────── */}
          {activeTab === "audit" && (
            <div className="space-y-4">
              {/* Filter bar */}
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-gray-400" />
                <span className="text-xs font-semibold text-gray-500">Decision:</span>
                {["all", "allow", "warn", "block"].map(d => (
                  <button
                    key={d}
                    onClick={() => setDecisionFilter(d)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition capitalize ${
                      decisionFilter === d
                        ? d === "all" ? "bg-primary text-white" : `${DECISION_COLORS[d]} border border-current`
                        : "bg-gray-100 dark:bg-gray-900 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                    }`}
                  >
                    {d}
                  </button>
                ))}
                <span className="ml-auto text-[10px] text-gray-400">{auditLog.length} entries</span>
                <button onClick={fetchAll} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900 transition">
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Log entries */}
              <div className="space-y-1.5">
                {auditLog.map(entry => (
                  <div key={entry.id} className="flex items-start gap-3 px-4 py-3 rounded-xl bg-white dark:bg-gray-950 border border-gray-100 dark:border-gray-800 hover:shadow-sm transition">
                    <div className="flex-shrink-0 mt-0.5"><DecisionIcon decision={entry.decision} /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center flex-wrap gap-2">
                        <span className="font-semibold text-xs text-gray-900 dark:text-white truncate max-w-[160px]">
                          {entry.workflow_name || entry.workflow_id || "Unknown Workflow"}
                        </span>
                        <span className="text-gray-400 text-xs">›</span>
                        <span className="font-mono text-[10px] text-gray-600 dark:text-gray-400">{entry.step_name}</span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${DECISION_COLORS[entry.decision]}`}>
                          {entry.decision}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-3 mt-1 text-[10px] text-gray-400">
                        {entry.policy_name && <span>Policy: <strong className="text-gray-600 dark:text-gray-300">{entry.policy_name}</strong></span>}
                        <span>Action: <strong className="text-gray-600 dark:text-gray-300">{entry.action_type}</strong></span>
                        {entry.tokens_requested && <span>Tokens: {entry.tokens_requested}</span>}
                        {entry.context_url && (
                          <span className="text-primary truncate max-w-[200px]" title={entry.context_url}>{entry.context_url}</span>
                        )}
                      </div>
                      {entry.reason && (
                        <p className="text-[10px] text-red-500 dark:text-red-400 mt-1 italic">{entry.reason}</p>
                      )}
                    </div>
                    <div className="flex-shrink-0 text-[9px] text-gray-400 whitespace-nowrap">
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                ))}

                {auditLog.length === 0 && (
                  <div className="text-center py-12 text-gray-400 text-xs italic">
                    No audit log entries found for this filter
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Policy Modal */}
      {showModal && (
        <PolicyModal
          onClose={() => { setShowModal(false); setEditPolicy(null); }}
          onSave={handleSavePolicy}
          initial={editPolicy}
        />
      )}

      {/* YAML Export Modal */}
      {yamlExport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-950 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col border border-gray-200 dark:border-gray-800">
            <div className="flex justify-between items-center p-5 border-b border-gray-200 dark:border-gray-800">
              <h2 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Download className="h-4 w-4 text-primary" /> Exported Governance Policies (YAML)
              </h2>
              <button onClick={() => setYamlExport(null)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-900 transition">
                <X className="h-4 w-4" />
              </button>
            </div>
            <pre className="flex-1 overflow-auto p-5 text-[11px] font-mono text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900 rounded-b-2xl whitespace-pre-wrap">
              {yamlExport}
            </pre>
            <div className="p-4 border-t border-gray-200 dark:border-gray-800 flex justify-end">
              <button
                onClick={() => { navigator.clipboard.writeText(yamlExport); }}
                className="btn btn-secondary btn-sm"
              >
                Copy to Clipboard
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
