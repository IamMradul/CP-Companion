use crate::database::Contest;
use reqwest::Client;
use serde::Deserialize;
use std::error::Error;

pub async fn fetch_contests(
    server_url: &str,
    platforms: &str,
) -> Result<Vec<Contest>, Box<dyn Error>> {
    let client = Client::builder().user_agent("CP-Companion/1.0").build()?;

    let url = if platforms.trim().is_empty() {
        format!("{}/contests", server_url)
    } else {
        format!("{}/contests?platforms={}", server_url, platforms)
    };

    let res = client.get(&url).send().await?;
    if !res.status().is_success() {
        return Err(format!("Backend API Error: {}", res.status()).into());
    }

    let contests = res.json::<Vec<Contest>>().await?;
    Ok(contests)
}

#[derive(Deserialize, serde::Serialize)]
pub struct ClistPlatform {
    pub id: i64,
    pub name: String,
}

pub async fn fetch_available_platforms(
    server_url: &str,
) -> Result<Vec<ClistPlatform>, Box<dyn Error>> {
    let client = Client::builder().user_agent("CP-Companion/1.0").build()?;
    let url = format!("{}/platforms", server_url);

    let res = client.get(&url).send().await?;
    if !res.status().is_success() {
        return Err(format!("Backend API Error: {}", res.status()).into());
    }

    let platforms = res.json::<Vec<ClistPlatform>>().await?;
    Ok(platforms)
}
