use reqwest::Client;
use serde::Deserialize;
use std::error::Error;
use crate::database::Contest;

#[derive(Deserialize)]
struct ClistResponse {
    objects: Vec<ClistContest>,
}

#[derive(Deserialize)]
struct ClistContest {
    id: i64,
    event: String,
    start: String, // format: "2024-06-11T14:35:00"
    duration: i64,
    href: String,
    resource: String,
}

pub async fn fetch_contests(api_key: &str, username: &str, platforms: &str) -> Result<Vec<Contest>, Box<dyn Error>> {
    if platforms.trim().is_empty() {
        return Ok(Vec::new());
    }

    let client = Client::builder()
        .user_agent("CP-Companion/1.0")
        .build()?;
    
    // Fetch upcoming contests
    let mut url = format!(
        "https://clist.by/api/v4/contest/?username={}&api_key={}&limit=50&order_by=start&start__gte={}",
        username,
        api_key,
        chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S")
    );

    if !platforms.trim().is_empty() {
        url.push_str(&format!("&resource__in={}", platforms));
    }

    let res = client.get(&url).send().await?.json::<ClistResponse>().await?;

    let contests = res.objects.into_iter().map(|c| Contest {
        id: c.id,
        name: c.event,
        platform: c.resource,
        // Convert to standard ISO string if necessary, Clist gives UTC by default
        start_time: if c.start.ends_with('Z') { c.start } else { format!("{}Z", c.start) },
        duration_seconds: c.duration,
        url: c.href,
    }).collect();

    Ok(contests)
}

#[derive(Deserialize)]
struct ClistResourceResponse {
    objects: Vec<ClistPlatform>,
}

#[derive(Deserialize, serde::Serialize)]
pub struct ClistPlatform {
    pub id: i64,
    pub name: String,
}

pub async fn fetch_available_platforms(api_key: &str, username: &str) -> Result<Vec<ClistPlatform>, Box<dyn Error>> {
    let client = Client::builder()
        .user_agent("CP-Companion/1.0")
        .build()?;
    
    let mut all_platforms = Vec::new();
    let mut offset = 0;
    let limit = 500;

    loop {
        let url = format!(
            "https://clist.by/api/v4/resource/?username={}&api_key={}&limit={}&offset={}",
            username,
            api_key,
            limit,
            offset
        );

        let mut res = client.get(&url).send().await?.json::<ClistResourceResponse>().await?;
        let count = res.objects.len();
        all_platforms.append(&mut res.objects);

        if count < limit {
            break;
        }
        offset += limit;
    }

    Ok(all_platforms)
}
