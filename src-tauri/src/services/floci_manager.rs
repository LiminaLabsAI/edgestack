use std::time::Duration;
use anyhow::{anyhow, Result};
use crate::utils::fs::app_dir;
use tokio::net::{TcpListener, TcpStream};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

pub async fn start_floci() -> Result<()> {
    // Check if port 4568 is already in use (e.g. from an existing mock or another process)
    if check_port_in_use(4568) {
        println!("Port 4568 is already in use, assuming Floci/Mock is running");
        return Ok(());
    }

    // Spawn native mock server on port 4568
    tokio::spawn(async {
        if let Err(e) = run_mock_server().await {
            println!("Error running native Floci S3/SQS mock server: {}", e);
        }
    });

    // Wait and check health
    let mut success = false;
    for _ in 0..10 {
        tokio::time::sleep(Duration::from_secs(1)).await;
        if check_port_in_use(4568) {
            success = true;
            break;
        }
    }

    if success {
        println!("Native Floci S3/SQS Mock Server successfully started on port 4568");
        Ok(())
    } else {
        Err(anyhow!("Timed out waiting for native Floci Mock Server to start on port 4568"))
    }
}

pub fn stop_floci() {
    println!("Stopping Floci mock server (runs within tokio runtime, will terminate on app shutdown)");
}

fn check_port_in_use(port: u16) -> bool {
    std::net::TcpStream::connect(format!("127.0.0.1:{}", port)).is_ok()
}

async fn run_mock_server() -> Result<()> {
    let listener = TcpListener::bind("127.0.0.1:4568").await?;
    println!("Native Floci S3/SQS Mock Server listening on 127.0.0.1:4568");

    loop {
        match listener.accept().await {
            Ok((stream, _)) => {
                tokio::spawn(async move {
                    if let Err(e) = handle_connection(stream).await {
                        println!("Error in mock server connection: {}", e);
                    }
                });
            }
            Err(e) => {
                println!("Error accepting connection in mock server: {}", e);
            }
        }
    }
}

async fn handle_connection(mut client_stream: TcpStream) -> Result<()> {
    let mut initial_buf = vec![0u8; 1024];
    let n = client_stream.read(&mut initial_buf).await?;
    if n == 0 {
        return Ok(());
    }
    initial_buf.truncate(n);

    let (header, body) = read_full_request(&mut client_stream, &initial_buf).await?;
    let first_line = header.lines().next().unwrap_or("");
    let parts: Vec<&str> = first_line.split_whitespace().collect();
    if parts.len() < 2 {
        return Ok(());
    }
    let method = parts[0];
    let path = parts[1];

    if method == "POST" && path.starts_with("/queue/") {
        // Mock SQS SendMessage
        let response_body = r#"<SendMessageResponse xmlns="http://queue.amazonaws.com/doc/2012-11-05/"><SendMessageResult><MessageId>mock-message-id</MessageId></SendMessageResult></SendMessageResponse>"#;
        let http_response = format!(
            "HTTP/1.1 200 OK\r\n\
             Content-Type: text/xml\r\n\
             Content-Length: {}\r\n\
             Connection: close\r\n\r\n\
             {}",
            response_body.len(),
            response_body
        );
        client_stream.write_all(http_response.as_bytes()).await?;
        client_stream.flush().await?;
    } else if method == "PUT" {
        // Mock S3 PutObject
        let path_trimmed = path.trim_start_matches('/');
        let path_parts: Vec<&str> = path_trimmed.splitn(2, '/').collect();
        if path_parts.len() == 2 {
            let bucket = path_parts[0];
            let key = path_parts[1];
            let s3_dir = app_dir().join("s3").join(bucket);
            std::fs::create_dir_all(&s3_dir)?;
            let file_path = s3_dir.join(key);
            if let Some(parent) = file_path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::write(&file_path, &body)?;
            let http_response = "HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
            client_stream.write_all(http_response.as_bytes()).await?;
            client_stream.flush().await?;
        } else {
            return_error(&mut client_stream, 400, "Invalid S3 path").await?;
        }
    } else if method == "GET" {
        // Mock S3 GetObject or health check
        if path == "/" {
            let response_body = "{\"status\":\"healthy\",\"service\":\"floci-mock\"}";
            let http_response = format!(
                "HTTP/1.1 200 OK\r\n\
                 Content-Type: application/json\r\n\
                 Content-Length: {}\r\n\
                 Connection: close\r\n\r\n\
                 {}",
                response_body.len(),
                response_body
            );
            client_stream.write_all(http_response.as_bytes()).await?;
            client_stream.flush().await?;
        } else {
            let path_trimmed = path.trim_start_matches('/');
            let path_parts: Vec<&str> = path_trimmed.splitn(2, '/').collect();
            if path_parts.len() == 2 {
                let bucket = path_parts[0];
                let key = path_parts[1];
                let file_path = app_dir().join("s3").join(bucket).join(key);
                match std::fs::read(&file_path) {
                    Ok(content) => {
                        let http_response = format!(
                            "HTTP/1.1 200 OK\r\n\
                             Content-Type: application/octet-stream\r\n\
                             Content-Length: {}\r\n\
                             Connection: close\r\n\r\n",
                            content.len()
                        );
                        client_stream.write_all(http_response.as_bytes()).await?;
                        client_stream.write_all(&content).await?;
                        client_stream.flush().await?;
                    }
                    Err(_) => {
                        return_error(&mut client_stream, 404, "NoSuchKey").await?;
                    }
                }
            } else {
                return_error(&mut client_stream, 400, "Invalid S3 path").await?;
            }
        }
    } else {
        return_error(&mut client_stream, 405, "Method Not Allowed").await?;
    }

    Ok(())
}

async fn return_error(stream: &mut TcpStream, status_code: u16, msg: &str) -> Result<()> {
    let status_str = match status_code {
        400 => "Bad Request",
        404 => "Not Found",
        405 => "Method Not Allowed",
        _ => "Internal Server Error",
    };
    let err_body = format!("{{\"error\":\"{}\"}}", msg);
    let http_response = format!(
        "HTTP/1.1 {} {}\r\n\
         Content-Type: application/json\r\n\
         Content-Length: {}\r\n\
         Connection: close\r\n\r\n\
         {}",
        status_code,
        status_str,
        err_body.len(),
        err_body
    );
    stream.write_all(http_response.as_bytes()).await?;
    stream.flush().await?;
    Ok(())
}

async fn read_full_request(stream: &mut TcpStream, initial_data: &[u8]) -> Result<(String, Vec<u8>)> {
    let mut request_data = initial_data.to_vec();
    let mut header_end = find_subsequence(&request_data, b"\r\n\r\n");
    
    while header_end.is_none() {
        let mut chunk = [0u8; 1024];
        let n = stream.read(&mut chunk).await?;
        if n == 0 {
            break;
        }
        request_data.extend_from_slice(&chunk[..n]);
        header_end = find_subsequence(&request_data, b"\r\n\r\n");
    }
    
    let header_end_idx = header_end.ok_or_else(|| anyhow!("Malformed HTTP headers"))?;
    let header_part = String::from_utf8_lossy(&request_data[..header_end_idx]).to_string();
    
    let mut content_length = 0;
    for line in header_part.lines() {
        if line.to_lowercase().starts_with("content-length:") {
            if let Some(val) = line.split(':').nth(1) {
                content_length = val.trim().parse::<usize>().unwrap_or(0);
            }
        }
    }
    
    let total_required = header_end_idx + 4 + content_length;
    while request_data.len() < total_required {
        let mut chunk = [0u8; 1024];
        let n = stream.read(&mut chunk).await?;
        if n == 0 {
            break;
        }
        request_data.extend_from_slice(&chunk[..n]);
    }
    
    let body = request_data[header_end_idx + 4..total_required.min(request_data.len())].to_vec();
    Ok((header_part, body))
}

fn find_subsequence(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack.windows(needle.len()).position(|window| window == needle)
}
