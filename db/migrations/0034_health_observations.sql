PRAGMA foreign_keys = ON;

CREATE TABLE health_observations (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  connection_id INTEGER REFERENCES external_connections(id),
  metric TEXT NOT NULL,
  value REAL NOT NULL,
  unit TEXT NOT NULL,
  observed_start TEXT NOT NULL,
  observed_end TEXT,
  source TEXT NOT NULL,
  external_id TEXT,
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  quality REAL NOT NULL CHECK (quality BETWEEN 0 AND 1),
  dedup_key TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  UNIQUE (user_id, source, dedup_key)
);

CREATE INDEX idx_health_observations_user_metric_time
  ON health_observations(user_id, metric, observed_start DESC);

CREATE INDEX idx_health_observations_connection_time
  ON health_observations(connection_id, observed_start DESC);
