use std::process::{Command, Child, Stdio};
use std::sync::Mutex;
use std::time::Duration;
use std::path::PathBuf;
use anyhow::{anyhow, Result};
use once_cell::sync::Lazy;
use crate::utils::fs::app_dir;


static OLLAMA_CHILD: Lazy<Mutex<Option<Child>>> = Lazy::new(|| Mutex::new(None));

pub async fn start_ollama() -> Result<()> {
    // 1. Check if already running
    if check_port_in_use(11434) {
        println!("Ollama is already running on port 11434");
        return Ok(());
    }

    // 2. Find local or global Ollama installation
    let bin_path = match find_installed_ollama() {
        Some(path) => path,
        None => {
            let local_bin_name = if cfg!(target_os = "windows") { "ollama.exe" } else { "ollama" };
            let local_bin_path = app_dir().join("bin").join(local_bin_name);

            if cfg!(target_os = "windows") {
                return Err(anyhow!(
                    "Ollama was not found on your system. Please download and install it from https://ollama.com."
                ));
            }

            println!("Downloading Ollama binary for current platform...");
            let url = if cfg!(target_os = "macos") {
                "https://github.com/ollama/ollama/releases/download/v0.3.14/ollama-darwin"
            } else {
                "https://github.com/ollama/ollama/releases/download/v0.3.14/ollama-linux-amd64"
            };

            match reqwest::get(url).await {
                Ok(resp) => {
                    if resp.status().is_success() {
                        let bytes = resp.bytes().await?;
                        std::fs::write(&local_bin_path, bytes)?;
                        
                        #[cfg(unix)]
                        {
                            use std::os::unix::fs::PermissionsExt;
                            if let Ok(metadata) = std::fs::metadata(&local_bin_path) {
                                let mut perms = metadata.permissions();
                                perms.set_mode(0o755); // executable
                                let _ = std::fs::set_permissions(&local_bin_path, perms);
                            }
                        }
                        println!("Ollama binary downloaded successfully to {:?}", local_bin_path);
                    } else {
                        return Err(anyhow!("Failed to download Ollama: HTTP {}", resp.status()));
                    }
                }
                Err(e) => {
                    return Err(anyhow!("Network error downloading Ollama: {}. Please ensure you are connected or install Ollama manually.", e));
                }
            }
            local_bin_path
        }
    };

    println!("Starting Ollama process at {:?}", bin_path);

    // 3. Spawn child process
    let mut child = Command::new(&bin_path)
        .arg("serve")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;

    // 4. Wait for response
    let mut success = false;
    for _ in 0..15 {
        tokio::time::sleep(Duration::from_secs(1)).await;
        if check_port_in_use(11434) {
            success = true;
            break;
        }
        if let Ok(Some(status)) = child.try_wait() {
            return Err(anyhow!("Ollama serve process exited early with status: {}", status));
        }
    }

    if success {
        let mut guard = OLLAMA_CHILD.lock().unwrap();
        *guard = Some(child);
        println!("Ollama serve successfully started on port 11434");
        Ok(())
    } else {
        let _ = child.kill();
        Err(anyhow!("Timed out waiting for Ollama to start on port 11434"))
    }
}

pub fn stop_ollama() {
    let mut guard = OLLAMA_CHILD.lock().unwrap();
    if let Some(mut child) = guard.take() {
        let _ = child.kill();
        println!("Ollama serve subprocess stopped");
    }
}

fn check_port_in_use(port: u16) -> bool {
    std::net::TcpStream::connect(format!("127.0.0.1:{}", port)).is_ok()
}

fn find_installed_ollama() -> Option<PathBuf> {
    // 1. Check in ~/.edgestack/bin/
    let local_bin = if cfg!(target_os = "windows") {
        app_dir().join("bin").join("ollama.exe")
    } else {
        app_dir().join("bin").join("ollama")
    };
    if local_bin.exists() {
        return Some(local_bin);
    }

    // 2. Check standard system paths
    let paths = if cfg!(target_os = "windows") {
        let local_appdata = dirs_next::data_local_dir().unwrap_or_default();
        vec![
            local_appdata.join("Programs").join("Ollama").join("ollama.exe"),
            PathBuf::from("C:\\Program Files\\Ollama\\ollama.exe"),
        ]
    } else if cfg!(target_os = "macos") {
        vec![
            PathBuf::from("/usr/local/bin/ollama"),
            PathBuf::from("/opt/homebrew/bin/ollama"),
            PathBuf::from("/Applications/Ollama.app/Contents/Resources/ollama"),
        ]
    } else {
        vec![
            PathBuf::from("/usr/local/bin/ollama"),
            PathBuf::from("/usr/bin/ollama"),
        ]
    };

    for p in paths {
        if p.exists() {
            return Some(p);
        }
    }

    // 3. Try to run "ollama --version" to see if it's globally in PATH
    let cmd_name = if cfg!(target_os = "windows") { "ollama.exe" } else { "ollama" };
    if Command::new(cmd_name)
        .arg("--version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .is_ok() {
            return Some(PathBuf::from(cmd_name));
        }

    None
}

