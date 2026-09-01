use crate::database::Contest;
use reqwest::Client;
use serde::Deserialize;
use std::error::Error;

pub async fn fetch_contests(
    server_url: &str,
    platforms: &str,
    max_known_users: i64,
    device_id: &str,
) -> Result<(Vec<Contest>, Option<i64>), Box<dyn Error>> {
    let client = Client::builder().user_agent("CP-Companion/1.0").build()?;

    let url = if platforms.trim().is_empty() {
        format!("{}/contests", server_url)
    } else {
        format!("{}/contests?platforms={}", server_url, platforms)
    };

    let res = client
        .get(&url)
        .header("x-restore-unique-devices", max_known_users.to_string())
        .header("x-device-id", device_id)
        .send()
        .await?;

    if !res.status().is_success() {
        return Err(format!("Backend API Error: {}", res.status()).into());
    }

    let returned_max = res.headers().get("x-unique-devices")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<i64>().ok());

    let contests = res.json::<Vec<Contest>>().await?;
    Ok((contests, returned_max))
}

#[derive(Deserialize, serde::Serialize)]
pub struct ClistPlatform {
    pub id: i64,
    pub name: String,
}

pub async fn fetch_available_platforms(
    server_url: &str,
    max_known_users: i64,
    device_id: &str,
) -> Result<(Vec<ClistPlatform>, Option<i64>), Box<dyn Error>> {
    let client = Client::builder().user_agent("CP-Companion/1.0").build()?;
    let url = format!("{}/platforms", server_url);

    let res = client
        .get(&url)
        .header("x-restore-unique-devices", max_known_users.to_string())
        .header("x-device-id", device_id)
        .send()
        .await?;

    if !res.status().is_success() {
        return Err(format!("Backend API Error: {}", res.status()).into());
    }

    let returned_max = res.headers().get("x-unique-devices")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<i64>().ok());

    let platforms = res.json::<Vec<ClistPlatform>>().await?;
    Ok((platforms, returned_max))
}
