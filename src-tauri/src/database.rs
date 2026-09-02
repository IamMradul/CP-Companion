use rusqlite::{Connection, Result};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Contest {
    pub id: i64,
    pub name: StringOrNumber,
    pub platform: String,
    pub start_time: String,
    pub duration_seconds: i64,
    pub url: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub server_url: String,
    pub platforms: String,
    pub max_known_users: i64,
    pub device_id: String,
}

// Temporary workaround for clist API sometimes sending ints as names (rare but possible)
type StringOrNumber = String;

pub fn init_db(db_path: &std::path::Path) -> Result<Connection> {
    let conn = Connection::open(db_path)?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS contests (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            platform TEXT NOT NULL,
            start_time TEXT NOT NULL,
            duration_seconds INTEGER NOT NULL,
            url TEXT NOT NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS app_settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            server_url TEXT NOT NULL,
            platforms TEXT NOT NULL,
            max_known_users INTEGER DEFAULT 0,
            device_id TEXT NOT NULL DEFAULT ''
        )",
        [],
    )?;

    // For existing users before this update
    conn.execute("ALTER TABLE app_settings ADD COLUMN max_known_users INTEGER DEFAULT 0", []).ok();
    conn.execute("ALTER TABLE app_settings ADD COLUMN device_id TEXT NOT NULL DEFAULT ''", []).ok();

    // Set defaults if empty
    let default_id = format!("device-{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos());
    conn.execute("INSERT OR IGNORE INTO app_settings (id, server_url, platforms, max_known_users, device_id) VALUES (1, 'http://localhost:3000/api', 'codeforces.com,leetcode.com,atcoder.jp,codechef.com,geeksforgeeks.org,hackerrank.com', 0, ?1)", [&default_id])?;

    Ok(conn)
}

pub fn insert_contests(conn: &Connection, contests: &[Contest]) -> Result<()> {
    // Clear old cache first so deselected platforms are removed
    conn.execute("DELETE FROM contests", [])?;

    let mut stmt = conn.prepare(
        "INSERT INTO contests (id, name, platform, start_time, duration_seconds, url)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
    )?;

    for contest in contests {
        stmt.execute((
            &contest.id,
            &contest.name,
            &contest.platform,
            &contest.start_time,
            &contest.duration_seconds,
            &contest.url,
        ))?;
    }

    Ok(())
}

pub fn get_upcoming_contests(conn: &Connection, platforms: &str) -> Result<Vec<Contest>> {
    let platform_list: Vec<&str> = platforms.split(',').map(|s| s.trim()).filter(|s| !s.is_empty()).collect();

    let mut stmt = conn.prepare(
        "SELECT id, name, platform, start_time, duration_seconds, url 
         FROM contests 
         WHERE datetime(start_time) >= datetime('now', '-2 hours') 
         ORDER BY datetime(start_time) ASC",
    )?;

    let contest_iter = stmt.query_map([], |row| {
        Ok(Contest {
            id: row.get(0)?,
            name: row.get(1)?,
            platform: row.get(2)?,
            start_time: row.get(3)?,
            duration_seconds: row.get(4)?,
            url: row.get(5)?,
        })
    })?;

    let mut contests = Vec::new();
    for contest_res in contest_iter {
        let contest = contest_res?;
        if platform_list.is_empty() || platform_list.contains(&contest.platform.as_str()) {
            contests.push(contest);
        }
    }

    Ok(contests)
}

pub fn get_config(conn: &Connection) -> Result<Option<AppConfig>> {
    let mut stmt = conn.prepare("SELECT server_url, platforms, max_known_users, device_id FROM app_settings WHERE id = 1")?;
    let mut rows = stmt.query([])?;

    if let Some(row) = rows.next()? {
        let mut device_id: String = row.get(3).unwrap_or_default();
        if device_id.is_empty() {
            device_id = format!("device-{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos());
            conn.execute("UPDATE app_settings SET device_id = ?1 WHERE id = 1", [&device_id]).ok();
        }

        Ok(Some(AppConfig {
            server_url: row.get(0)?,
            platforms: row.get(1)?,
            max_known_users: row.get(2).unwrap_or(0),
            device_id,
        }))
    } else {
        Ok(None)
    }
}

pub fn update_max_known_users(conn: &Connection, count: i64) -> Result<()> {
    conn.execute(
        "UPDATE app_settings SET max_known_users = ?1 WHERE id = 1",
        [count],
    )?;
    Ok(())
}

pub fn save_config(conn: &Connection, server_url: &str, platforms: &str) -> Result<()> {
    conn.execute(
        "UPDATE app_settings SET server_url = ?1, platforms = ?2 WHERE id = 1",
        [server_url, platforms],
    )?;
    Ok(())
}
