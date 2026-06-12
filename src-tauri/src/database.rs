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
    pub username: String,
    pub api_key: String,
    pub platforms: String,
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
        "CREATE TABLE IF NOT EXISTS app_config (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            username TEXT NOT NULL,
            api_key TEXT NOT NULL
        )",
        [],
    )?;

    // Migration: add platforms column if it doesn't exist
    let _ = conn.execute("ALTER TABLE app_config ADD COLUMN platforms TEXT NOT NULL DEFAULT 'codeforces.com,leetcode.com,atcoder.jp,codechef.com'", []);

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

pub fn get_upcoming_contests(conn: &Connection) -> Result<Vec<Contest>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, platform, start_time, duration_seconds, url 
         FROM contests 
         WHERE datetime(start_time) >= datetime('now', '-2 hours') 
         ORDER BY datetime(start_time) ASC"
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
    for contest in contest_iter {
        contests.push(contest?);
    }

    Ok(contests)
}

pub fn get_config(conn: &Connection) -> Result<Option<AppConfig>> {
    let mut stmt = conn.prepare("SELECT username, api_key, platforms FROM app_config WHERE id = 1")?;
    let mut rows = stmt.query([])?;

    if let Some(row) = rows.next()? {
        let platforms: rusqlite::Result<String> = row.get(2);
        Ok(Some(AppConfig {
            username: row.get(0)?,
            api_key: row.get(1)?,
            platforms: platforms.unwrap_or_else(|_| "codeforces.com,leetcode.com,atcoder.jp,codechef.com".to_string()),
        }))
    } else {
        Ok(None)
    }
}

pub fn save_config(conn: &Connection, username: &str, api_key: &str, platforms: &str) -> Result<()> {
    conn.execute(
        "INSERT OR REPLACE INTO app_config (id, username, api_key, platforms) VALUES (1, ?1, ?2, ?3)",
        [username, api_key, platforms],
    )?;
    Ok(())
}
