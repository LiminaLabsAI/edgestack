use std::sync::Arc;
use tauri::State;
use crate::db::DbPool;
use serde::{Deserialize, Serialize};
use sysinfo::{System, Disks};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComputeInstance {
    pub id: String,
    pub name: String,
    pub state: String,
    pub image: String,
    pub cpu_cores: u32,
    pub memory_gb: u32,
    pub disk_gb: u32,
    pub uptime_seconds: u32,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComputeContainer {
    pub id: String,
    pub instance_id: String,
    pub name: String,
    pub status: String,
    pub cpu_pct: f64,
    pub memory_mb: u32,
    pub network_io: String,
    pub block_io: String,
    pub image: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComputeTelemetry {
    pub cpu_percent: f64,
    pub memory_percent: f64,
    pub disk_percent: f64,
    pub active_instances: u32,
    pub total_instances: u32,
    pub active_containers: u32,
}

#[tauri::command]
pub async fn list_instances(pool: State<'_, Arc<DbPool>>) -> Result<Vec<ComputeInstance>, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, name, state, image, cpu_cores, memory_gb, disk_gb, uptime_seconds, created_at FROM compute_instances ORDER BY created_at DESC"
    ).map_err(|e| e.to_string())?;
    
    let rows = stmt.query_map([], |row| {
        Ok(ComputeInstance {
            id: row.get(0)?,
            name: row.get(1)?,
            state: row.get(2)?,
            image: row.get(3)?,
            cpu_cores: row.get::<_, i64>(4)? as u32,
            memory_gb: row.get::<_, i64>(5)? as u32,
            disk_gb: row.get::<_, i64>(6)? as u32,
            uptime_seconds: row.get::<_, i64>(7)? as u32,
            created_at: row.get(8)?,
        })
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();
    
    Ok(rows)
}

#[tauri::command]
pub async fn create_instance(
    pool: State<'_, Arc<DbPool>>,
    name: String,
    image: String,
    cpu_cores: u32,
    memory_gb: u32,
    disk_gb: u32,
) -> Result<String, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let instance_id = format!("i-local-{}", &Uuid::new_v4().to_string()[..8]);
    
    conn.execute(
        "INSERT INTO compute_instances (id, name, state, image, cpu_cores, memory_gb, disk_gb, uptime_seconds, created_at)
         VALUES (?1, ?2, 'running', ?3, ?4, ?5, ?6, 0, datetime('now'))",
        rusqlite::params![instance_id, name, image, cpu_cores, memory_gb, disk_gb],
    ).map_err(|e| e.to_string())?;
    
    // Auto-create some mock containers for this instance
    let container_id = format!("c-{}-app", name.to_lowercase().replace(' ', "-"));
    let container_name = format!("{}-service", name.to_lowercase().replace(' ', "-"));
    conn.execute(
        "INSERT INTO compute_containers (id, instance_id, name, status, cpu_pct, memory_mb, network_io, block_io, image, created_at)
         VALUES (?1, ?2, ?3, 'running', 0.5, 64, '256 B/s', '0 B/s', 'alpine:latest', datetime('now'))",
        rusqlite::params![container_id, instance_id, container_name],
    ).map_err(|e| e.to_string())?;
    
    Ok(instance_id)
}

#[tauri::command]
pub async fn start_instance(pool: State<'_, Arc<DbPool>>, id: String) -> Result<(), String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE compute_instances SET state = 'running', uptime_seconds = 60 WHERE id = ?1",
        rusqlite::params![id],
    ).map_err(|e| e.to_string())?;
    
    conn.execute(
        "UPDATE compute_containers SET status = 'running', cpu_pct = 0.5, memory_mb = 64 WHERE instance_id = ?1",
        rusqlite::params![id],
    ).map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
pub async fn stop_instance(pool: State<'_, Arc<DbPool>>, id: String) -> Result<(), String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE compute_instances SET state = 'stopped', uptime_seconds = 0 WHERE id = ?1",
        rusqlite::params![id],
    ).map_err(|e| e.to_string())?;
    
    conn.execute(
        "UPDATE compute_containers SET status = 'stopped', cpu_pct = 0.0, memory_mb = 0 WHERE instance_id = ?1",
        rusqlite::params![id],
    ).map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
pub async fn restart_instance(pool: State<'_, Arc<DbPool>>, id: String) -> Result<(), String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE compute_instances SET state = 'running', uptime_seconds = 5 WHERE id = ?1",
        rusqlite::params![id],
    ).map_err(|e| e.to_string())?;
    
    conn.execute(
        "UPDATE compute_containers SET status = 'running', cpu_pct = 0.8, memory_mb = 72 WHERE instance_id = ?1",
        rusqlite::params![id],
    ).map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
pub async fn delete_instance(pool: State<'_, Arc<DbPool>>, id: String) -> Result<(), String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    // Cascades delete of containers due to foreign key setup
    conn.execute(
        "DELETE FROM compute_instances WHERE id = ?1",
        rusqlite::params![id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn list_active_containers(pool: State<'_, Arc<DbPool>>) -> Result<Vec<ComputeContainer>, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, instance_id, name, status, cpu_pct, memory_mb, network_io, block_io, image, created_at FROM compute_containers ORDER BY status DESC, name ASC"
    ).map_err(|e| e.to_string())?;
    
    let rows = stmt.query_map([], |row| {
        Ok(ComputeContainer {
            id: row.get(0)?,
            instance_id: row.get(1)?,
            name: row.get(2)?,
            status: row.get(3)?,
            cpu_pct: row.get(4)?,
            memory_mb: row.get::<_, i64>(5)? as u32,
            network_io: row.get(6)?,
            block_io: row.get(7)?,
            image: row.get(8)?,
            created_at: row.get(9)?,
        })
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();
    
    Ok(rows)
}

#[tauri::command]
pub async fn get_compute_telemetry(pool: State<'_, Arc<DbPool>>) -> Result<ComputeTelemetry, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    
    // Read dynamic system status
    let mut sys = System::new_all();
    sys.refresh_all();
    
    // Fallbacks if sysinfo fails
    let cpu_percent = sys.global_cpu_info().cpu_usage() as f64;
    let memory_used = (sys.total_memory() - sys.available_memory()) as f64;
    let memory_percent = (memory_used / sys.total_memory() as f64) * 100.0;
    
    let disks = Disks::new_with_refreshed_list();
    let disk_percent = disks.iter().max_by_key(|d| d.total_space()).map(|d| {
        let used = d.total_space() - d.available_space();
        (used as f64 / d.total_space() as f64) * 100.0
    }).unwrap_or(45.0);
    
    // Counts from database
    let total_instances: u32 = conn.query_row(
        "SELECT COUNT(*) FROM compute_instances",
        [],
        |row| row.get::<_, i64>(0).map(|c| c as u32),
    ).unwrap_or(0);
    
    let active_instances: u32 = conn.query_row(
        "SELECT COUNT(*) FROM compute_instances WHERE state = 'running'",
        [],
        |row| row.get::<_, i64>(0).map(|c| c as u32),
    ).unwrap_or(0);
    
    let active_containers: u32 = conn.query_row(
        "SELECT COUNT(*) FROM compute_containers WHERE status = 'running'",
        [],
        |row| row.get::<_, i64>(0).map(|c| c as u32),
    ).unwrap_or(0);
    
    Ok(ComputeTelemetry {
        cpu_percent: if cpu_percent > 0.0 { cpu_percent } else { 12.4 },
        memory_percent: if memory_percent > 0.0 { memory_percent } else { 55.2 },
        disk_percent,
        active_instances,
        total_instances,
        active_containers,
    })
}

#[tauri::command]
pub async fn execute_container_command(
    _pool: State<'_, Arc<DbPool>>,
    container_id: String,
    command: String,
) -> Result<String, String> {
    let clean_cmd = command.trim();
    if clean_cmd.is_empty() {
        return Ok("".to_string());
    }
    
    let parts: Vec<&str> = clean_cmd.split_whitespace().collect();
    let main_cmd = parts[0];
    
    let output = match main_cmd {
        "help" => "Available commands:\n  help      - Show this help list\n  ls        - List directory contents\n  pwd       - Print working directory\n  uname -a  - Print operating system details\n  top       - Show process dashboard\n  ps        - List active processes\n  cat <file>- Read mock files\n  clear     - Reset screen".to_string(),
        "ls" => "total 24\ndrwxr-xr-x    1 root     root          4096 Jun 15 08:00 .\ndrwxr-xr-x    1 root     root          4096 Jun 15 08:00 ..\n-rw-r--r--    1 root     root           128 Jun 15 08:02 app.py\n-rw-r--r--    1 root     root            45 Jun 15 08:00 config.json\ndrwxr-xr-x    2 root     root          4096 Jun 15 08:00 logs".to_string(),
        "pwd" => "/workspace".to_string(),
        "uname" => {
            if parts.contains(&"-a") {
                format!("Linux {} 6.1.0-21-amd64 #1 SMP PREEMPT_DYNAMIC Debian 6.1.90-1 (2026-06-15) x86_64 GNU/Linux", container_id)
            } else {
                "Linux".to_string()
            }
        },
        "cat" => {
            if parts.len() < 2 {
                "Usage: cat <filename>".to_string()
            } else {
                match parts[1] {
                    "config.json" => "{\n  \"env\": \"production\",\n  \"port\": 8080,\n  \"debug\": false\n}".to_string(),
                    "app.py" => "import os\nprint('Starting service container...')\n# Mock service container daemon".to_string(),
                    _ => format!("cat: {}: No such file or directory", parts[1])
                }
            }
        },
        "top" | "ps" => {
            format!(
                "PID   USER     TIME  COMMAND\n    1 root      0:05 python app.py\n   12 root      0:00 ps\nContainer active on host node. System overhead: normal."
            )
        },
        _ => format!("{}: command not found. Type 'help' for suggestions.", main_cmd),
    };
    
    Ok(output)
}
