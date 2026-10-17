import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

let dbInstance: Database.Database | null = null;

let isTestMode = false;

export function setTestMode(enabled: boolean) {
  isTestMode = enabled;
}

export function getDb(): Database.Database {
  if (dbInstance) {
    return dbInstance;
  }

  const dataDir = path.join(process.cwd(), '.data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = (isTestMode || process.env.NODE_ENV === 'test')
    ? path.join(dataDir, 'test_opspulse.db') 
    : path.join(dataDir, 'opspulse.db');

  const db = new Database(dbPath);

  // Critical performance & concurrency settings
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000'); // Wait up to 5s on locked DB before erroring

  // Initialize schema if not present
  const schemaPath = path.join(process.cwd(), 'lib', 'db', 'schema.sql');
  if (fs.existsSync(schemaPath)) {
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    db.exec(schema);
  }

  dbInstance = db;
  return dbInstance;
}

// Reset helper for tests
export function resetTestDb(): Database.Database {
  const dataDir = path.join(process.cwd(), '.data');
  const dbPath = path.join(dataDir, 'test_opspulse.db');
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch (e) {
      // ignore
    }
    dbInstance = null;
  }
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }
  isTestMode = true;
  return getDb();
}
