use crate::database::Contest;
use reqwest::Client;
use serde::Deserialize;
use std::error::Error;

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

pub async fn fetch_contests(
    api_key: &str,
    username: &str,
    platforms: &str,
) -> Result<Vec<Contest>, Box<dyn Error>> {
    if platforms.trim().is_empty() {
        return Ok(Vec::new());
    }

    let client = Client::builder().user_agent("CP-Companion/1.0").build()?;
    let mut handles = Vec::new();
    let platform_list: Vec<String> = platforms
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();

    for platform in platform_list {
        let client = client.clone();
        let api_key = api_key.to_string();
        let username = username.to_string();
        
        let handle = tokio::spawn(async move {
            let url = format!(
                "https://clist.by/api/v4/contest/?username={}&api_key={}&limit=30&order_by=start&start__gte={}&resource__in={}",
                username,
                api_key,
                chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S"),
                platform
            );

            if let Ok(res) = client.get(&url).send().await {
                if res.status().is_success() {
                    if let Ok(json_res) = res.json::<ClistResponse>().await {
                        return json_res.objects;
                    }
                }
            }
            Vec::new()
        });
        handles.push(handle);
    }

    let mut all_contests = Vec::new();
    for handle in handles {
        if let Ok(objects) = handle.await {
            for c in objects {
                all_contests.push(Contest {
                    id: c.id,
                    name: c.event,
                    platform: c.resource,
                    // Convert to standard ISO string if necessary, Clist gives UTC by default
                    start_time: if c.start.ends_with('Z') {
                        c.start
                    } else {
                        format!("{}Z", c.start)
                    },
                    duration_seconds: c.duration,
                    url: c.href,
                });
            }
        }
    }

    // Sort all contests globally by start time since we fetched them separately
    all_contests.sort_by(|a, b| a.start_time.cmp(&b.start_time));

    Ok(all_contests)
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

pub async fn fetch_available_platforms(
    api_key: &str,
    username: &str,
) -> Result<Vec<ClistPlatform>, Box<dyn Error>> {
    let client = Client::builder().user_agent("CP-Companion/1.0").build()?;

    let mut all_platforms = Vec::new();
    let mut offset = 0;
    let limit = 500;

    loop {
        let url = format!(
            "https://clist.by/api/v4/resource/?username={}&api_key={}&limit={}&offset={}",
            username, api_key, limit, offset
        );

        let res = client.get(&url).send().await?;
        if !res.status().is_success() {
            let status = res.status();
            let text = res.text().await.unwrap_or_default();
            return Err(format!("API Error: {} - {}", status, text).into());
        }
        let mut res = res.json::<ClistResourceResponse>().await?;
        let count = res.objects.len();
        all_platforms.append(&mut res.objects);

        if count < limit {
            break;
        }
        offset += limit;
    }

    Ok(all_platforms)
}
