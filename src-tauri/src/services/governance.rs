use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use crate::db::DbPool;
use chrono::Utc;
use crate::utils::id::new_id;

// ─── Data Types ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyRule {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub enabled: bool,
    /// Which workflow step action this applies to: "ask_ai" | "browse_web" | "http_request" | "save_to_vault" | "write_to_s3" | "*"
    pub action_type: String,
    /// "block" | "warn" | "audit"
    pub effect: String,
    pub conditions: PolicyConditions,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PolicyConditions {
    /// For browse_web / http_request: only allow URLs in this list (None = no restriction)
    pub url_allowlist: Option<Vec<String>>,
    /// For browse_web / http_request: block URLs matching these patterns
    pub url_blocklist: Option<Vec<String>>,
    /// For ask_ai: max tokens per day per workflow (0 = unlimited)
    pub max_tokens_per_day: Option<i64>,
    /// For ask_ai: strip PII (emails, phone numbers) from output before storing
    pub pii_filter_output: Option<bool>,
    /// For save_to_vault / write_to_s3: require a `vault_tag` field to be present
    pub require_data_tag: Option<bool>,
    /// For any action: maximum number of executions per hour
    pub max_calls_per_hour: Option<i64>,
    /// For any action: maximum daily budget in USD-equivalent (based on cost analytics)
    pub max_daily_cost_usd: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditEntry {
    pub id: String,
    pub timestamp: String,
    pub workflow_id: Option<String>,
    pub workflow_name: Option<String>,
    pub run_id: Option<String>,
    pub step_name: Option<String>,
    pub action_type: String,
    pub policy_id: Option<String>,
    pub policy_name: Option<String>,
    pub decision: String, // "allow" | "block" | "warn" | "audit"
    pub reason: Option<String>,
    pub context_url: Option<String>,
    pub tokens_requested: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyCheckContext {
    pub workflow_id: String,
    pub workflow_name: String,
    pub run_id: String,
    pub step_name: String,
    pub action_type: String,
    pub url: Option<String>,
    pub tokens_requested: Option<i64>,
    pub has_data_tag: bool,
}

#[derive(Debug, Clone)]
pub enum PolicyDecision {
    Allow,
    Warn { reason: String, policy_id: String },
    Block { reason: String, policy_id: String },
}

// ─── Governance Engine ─────────────────────────────────────────────────────────

pub struct GovernanceEngine {
    pool: Arc<DbPool>,
}

impl GovernanceEngine {
    pub fn new(pool: Arc<DbPool>) -> Self {
        Self { pool }
    }

    /// Main entry point — checks all enabled policies for a given step action.
    /// Returns the most restrictive decision (block > warn > allow).
    pub async fn check(&self, ctx: &PolicyCheckContext) -> PolicyDecision {
        let policies = match self.load_policies_for_action(&ctx.action_type) {
            Ok(p) => p,
            Err(e) => {
                println!("[Governance] Failed to load policies: {}", e);
                return PolicyDecision::Allow;
            }
        };

        let mut final_decision = PolicyDecision::Allow;

        for policy in &policies {
            if !policy.enabled { continue; }

            let decision = self.evaluate(&policy, ctx);

            // Write audit record regardless of outcome
            self.write_audit(ctx, &policy, &decision);

            // Escalate: block > warn > allow
            match &decision {
                PolicyDecision::Block { .. } => {
                    final_decision = decision;
                    break; // No need to check further policies
                }
                PolicyDecision::Warn { .. } => {
                    if !matches!(final_decision, PolicyDecision::Block { .. }) {
                        final_decision = decision;
                    }
                }
                PolicyDecision::Allow => {}
            }
        }

        final_decision
    }

    fn evaluate(&self, policy: &PolicyRule, ctx: &PolicyCheckContext) -> PolicyDecision {
        let cond = &policy.conditions;
        let effect = policy.effect.as_str();

        // 1. URL allowlist check
        if let Some(allowlist) = &cond.url_allowlist {
            if let Some(url) = &ctx.url {
                if !allowlist.is_empty() && !allowlist.iter().any(|a| url.contains(a.as_str())) {
                    let reason = format!("URL '{}' is not in the allowed list for policy '{}'", url, policy.name);
                    return match_effect(effect, reason, &policy.id);
                }
            }
        }

        // 2. URL blocklist check
        if let Some(blocklist) = &cond.url_blocklist {
            if let Some(url) = &ctx.url {
                if blocklist.iter().any(|b| url.contains(b.as_str())) {
                    let reason = format!("URL '{}' is blocked by policy '{}'", url, policy.name);
                    return match_effect(effect, reason, &policy.id);
                }
            }
        }

        // 3. Token budget check (daily, per workflow)
        if let Some(max_tokens) = cond.max_tokens_per_day {
            if max_tokens > 0 {
                if let Some(requested) = ctx.tokens_requested {
                    let used_today = self.get_tokens_used_today(&ctx.workflow_id).unwrap_or(0);
                    if used_today + requested > max_tokens {
                        let reason = format!(
                            "Token budget exceeded: {} used today, {} requested, limit is {} (policy '{}')",
                            used_today, requested, max_tokens, policy.name
                        );
                        return match_effect(effect, reason, &policy.id);
                    }
                }
            }
        }

        // 4. Data tag requirement
        if let Some(true) = cond.require_data_tag {
            if !ctx.has_data_tag {
                let reason = format!("Step '{}' must include a data classification tag (policy '{}')", ctx.step_name, policy.name);
                return match_effect(effect, reason, &policy.id);
            }
        }

        // 5. Rate limiting (calls per hour)
        if let Some(max_per_hour) = cond.max_calls_per_hour {
            if max_per_hour > 0 {
                let calls = self.get_calls_last_hour(&ctx.workflow_id, &ctx.action_type).unwrap_or(0);
                if calls >= max_per_hour {
                    let reason = format!(
                        "Rate limit exceeded: {} calls/hour for action '{}' (policy '{}')",
                        max_per_hour, ctx.action_type, policy.name
                    );
                    return match_effect(effect, reason, &policy.id);
                }
            }
        }

        PolicyDecision::Allow
    }

    fn load_policies_for_action(&self, action_type: &str) -> Result<Vec<PolicyRule>> {
        let conn = self.pool.get()?;
        let mut stmt = conn.prepare(
            "SELECT id, name, description, enabled, action_type, effect, conditions_json, created_at, updated_at
             FROM governance_policies
             WHERE enabled=1 AND (action_type=?1 OR action_type='*')
             ORDER BY created_at ASC"
        )?;
        let policies: Vec<PolicyRule> = stmt.query_map(rusqlite::params![action_type], |row| {
            let conditions_json: String = row.get(6).unwrap_or_else(|_| "{}".to_string());
            let conditions: PolicyConditions = serde_json::from_str(&conditions_json).unwrap_or_default();
            Ok(PolicyRule {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                enabled: row.get::<_, i32>(3)? == 1,
                action_type: row.get(4)?,
                effect: row.get(5)?,
                conditions,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            })
        })?.filter_map(|r| r.ok()).collect();
        Ok(policies)
    }

    fn get_tokens_used_today(&self, workflow_id: &str) -> Result<i64> {
        let conn = self.pool.get()?;
        let total: i64 = conn.query_row(
            "SELECT COALESCE(SUM(tokens_output), 0) FROM telemetry
             WHERE workflow_id=?1 AND captured_at >= datetime('now', '-1 day')",
            rusqlite::params![workflow_id],
            |row| row.get(0),
        )?;
        Ok(total)
    }

    fn get_calls_last_hour(&self, workflow_id: &str, action_type: &str) -> Result<i64> {
        let conn = self.pool.get()?;
        // Approximate by counting audit log entries for this workflow + action in last hour
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM audit_log
             WHERE workflow_id=?1 AND action_type=?2 AND timestamp >= datetime('now', '-1 hour')",
            rusqlite::params![workflow_id, action_type],
            |row| row.get(0),
        ).unwrap_or(0);
        Ok(count)
    }

    fn write_audit(&self, ctx: &PolicyCheckContext, policy: &PolicyRule, decision: &PolicyDecision) {
        let (decision_str, reason) = match decision {
            PolicyDecision::Allow => ("allow", None),
            PolicyDecision::Warn { reason, .. } => ("warn", Some(reason.clone())),
            PolicyDecision::Block { reason, .. } => ("block", Some(reason.clone())),
        };

        if let Ok(conn) = self.pool.get() {
            let id = new_id();
            let now = Utc::now().to_rfc3339();
            let _ = conn.execute(
                "INSERT INTO audit_log (id, timestamp, workflow_id, run_id, step_name, action_type, policy_id, policy_name, decision, reason, context_url, tokens_requested)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)",
                rusqlite::params![
                    id, now,
                    ctx.workflow_id, ctx.run_id, ctx.step_name, ctx.action_type,
                    policy.id, policy.name,
                    decision_str, reason,
                    ctx.url, ctx.tokens_requested
                ],
            );
        }
    }
}

fn match_effect(effect: &str, reason: String, policy_id: &str) -> PolicyDecision {
    match effect {
        "block" => PolicyDecision::Block { reason, policy_id: policy_id.to_string() },
        "warn"  => PolicyDecision::Warn  { reason, policy_id: policy_id.to_string() },
        _       => PolicyDecision::Allow,
    }
}

// ─── PII Filter ────────────────────────────────────────────────────────────────

pub fn filter_pii(text: &str) -> String {
    // Redact emails
    let email_re = regex::Regex::new(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}").unwrap();
    let result = email_re.replace_all(text, "[EMAIL_REDACTED]");
    // Redact phone numbers (basic patterns)
    let phone_re = regex::Regex::new(r"(\+?[\d\s\-().]{7,15}\d)").unwrap();
    let result = phone_re.replace_all(&result, "[PHONE_REDACTED]");
    // Redact credit card-like patterns
    let cc_re = regex::Regex::new(r"\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b").unwrap();
    cc_re.replace_all(&result, "[CC_REDACTED]").to_string()
}
