CREATE TABLE supplements(
 id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),name TEXT NOT NULL,
 dose_value REAL NOT NULL CHECK(dose_value>0),dose_unit TEXT NOT NULL,schedule_text TEXT NOT NULL,
 starts_on TEXT NOT NULL,ends_on TEXT,status TEXT NOT NULL DEFAULT 'active' CHECK(status IN('active','paused','stopped')),
 source TEXT NOT NULL DEFAULT 'telegram',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_supplements_user_status ON supplements(user_id,status,starts_on);
