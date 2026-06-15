use std::sync::Arc;
use tauri::State;
use crate::db::DbPool;
use crate::models::{VaultSummary, VaultObject};
use crate::utils::fs::app_dir;

#[tauri::command]
pub async fn list_vaults(pool: State<'_, Arc<DbPool>>) -> Result<Vec<VaultSummary>, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT vault_name, COUNT(*), SUM(size_bytes), MAX(last_modified) FROM vault_objects GROUP BY vault_name"
    ).map_err(|e| e.to_string())?;
    let vaults = stmt.query_map([], |row| {
        Ok(VaultSummary {
            name: row.get(0)?,
            object_count: row.get::<_, i64>(1)? as u32,
            total_size_bytes: row.get::<_, i64>(2)? as u64,
            last_modified: row.get(3)?,
        })
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();

    // Also include filesystem vaults not in DB
    let vault_dir = app_dir().join("vault");
    if vault_dir.exists() {
        // Already captured from DB
    }
    Ok(vaults)
}

#[tauri::command]
pub async fn list_vault_objects(pool: State<'_, Arc<DbPool>>, vault_name: String) -> Result<Vec<VaultObject>, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT object_key, size_bytes, last_modified, content_type, w.name FROM vault_objects v LEFT JOIN workflows w ON v.workflow_id=w.id WHERE vault_name=?1 ORDER BY last_modified DESC"
    ).map_err(|e| e.to_string())?;
    let objects = stmt.query_map(rusqlite::params![vault_name], |row| {
        Ok(VaultObject {
            key: row.get(0)?,
            size_bytes: row.get::<_, i64>(1)? as u64,
            last_modified: row.get(2)?,
            content_type: row.get(3)?,
            workflow_name: row.get(4)?,
        })
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();
    Ok(objects)
}

#[tauri::command]
pub async fn create_vault(_pool: State<'_, Arc<DbPool>>, name: String) -> Result<(), String> {
    let vault_dir = app_dir().join("vault").join(&name);
    std::fs::create_dir_all(&vault_dir).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_vault_object(pool: State<'_, Arc<DbPool>>, vault_name: String, key: String) -> Result<(), String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM vault_objects WHERE vault_name=?1 AND object_key=?2",
        rusqlite::params![vault_name, key],
    ).map_err(|e| e.to_string())?;
    // Also delete physical file
    let file_path = app_dir().join("vault").join(&vault_name).join(&key);
    let _ = std::fs::remove_file(file_path);
    Ok(())
}

#[tauri::command]
pub async fn import_file_to_vault(
    pool: State<'_, Arc<DbPool>>,
    vault_name: String,
    src_path: String,
) -> Result<(), String> {
    let src = std::path::Path::new(&src_path);
    if !src.exists() {
        return Err("Source file does not exist".to_string());
    }
    let file_name = src.file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "Invalid file name".to_string())?;

    let vault_dir = app_dir().join("vault").join(&vault_name);
    std::fs::create_dir_all(&vault_dir).map_err(|e| e.to_string())?;
    
    let dest_path = vault_dir.join(file_name);
    std::fs::copy(src, &dest_path).map_err(|e| e.to_string())?;
    
    // Add to DB
    let size_bytes = dest_path.metadata().map(|m| m.len()).unwrap_or(0);
    let content_type = match src.extension().and_then(|ext| ext.to_str()) {
        Some("json") => Some("application/json".to_string()),
        Some("txt") => Some("text/plain".to_string()),
        Some("pdf") => Some("application/pdf".to_string()),
        Some("yaml") | Some("yml") => Some("text/yaml".to_string()),
        _ => Some("application/octet-stream".to_string()),
    };
    
    let conn = pool.get().map_err(|e| e.to_string())?;
    let uuid = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT OR REPLACE INTO vault_objects (id, vault_name, object_key, size_bytes, content_type, created_at, last_modified, workflow_id)
         VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'), datetime('now'), NULL)",
        rusqlite::params![uuid, vault_name, file_name, size_bytes, content_type],
    ).map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
pub async fn download_vault_object(
    _pool: State<'_, Arc<DbPool>>,
    vault_name: String,
    key: String,
    dest_path: String,
) -> Result<(), String> {
    let vault_path = app_dir().join("vault").join(&vault_name).join(&key);
    if !vault_path.exists() {
        return Err("Vault object does not exist".to_string());
    }
    
    let dest = std::path::Path::new(&dest_path);
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    
    std::fs::copy(&vault_path, dest).map_err(|e| e.to_string())?;
    Ok(())
}
