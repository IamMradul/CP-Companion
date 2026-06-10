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

pub async fn fetch_contests(api_key: &str, username: &str) -> Result<Vec<Contest>, Box<dyn Error>> {
    let client = Client::builder()
        .user_agent("CP-Companion/1.0")
        .build()?;
    
    // Fetch upcoming contests
    let url = format!(
        "https://clist.by/api/v4/contest/?username={}&api_key={}&limit=50&order_by=start&start__gte={}",
        username,
        api_key,
        chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S")
    );

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
