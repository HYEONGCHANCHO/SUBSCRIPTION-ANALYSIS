import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dataDir = path.resolve(process.cwd(), 'backend/data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'subscription.db');

// verbose 로깅 제거
export const db = new Database(dbPath);

export function initializeDatabase() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS notices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            site_name TEXT NOT NULL,
            external_id TEXT NOT NULL,
            title TEXT NOT NULL,
            region TEXT NOT NULL,
            supply_type TEXT,
            notice_date DATE,
            announcement_url TEXT,
            file_path TEXT,
            analyzed_summary TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(site_name, external_id)
        );
    `);
}
