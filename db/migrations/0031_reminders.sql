PRAGMA foreign_keys = ON;
CREATE TABLE reminder_settings (
  user_id INTEGER NOT NULL REFERENCES users(id),
  reminder_type TEXT NOT NULL CHECK(reminder_type IN ('weight','measurements')),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
  weekday INTEGER CHECK(weekday BETWEEN 0 AND 6),
  day_of_month INTEGER CHECK(day_of_month BETWEEN 1 AND 28),
  local_hour INTEGER NOT NULL DEFAULT 9 CHECK(local_hour BETWEEN 0 AND 23),
  local_minute INTEGER NOT NULL DEFAULT 0 CHECK(local_minute=0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id,reminder_type)
);
CREATE TABLE reminder_deliveries (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  reminder_type TEXT NOT NULL,
  local_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','delivered')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  delivered_at TEXT,
  UNIQUE(user_id,reminder_type,local_date)
);
CREATE TABLE reminder_conversations (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','cancelled','expired')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_reminder_conversations_pending ON reminder_conversations(user_id,status,expires_at);
