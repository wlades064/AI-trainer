CREATE TABLE weight_conversations (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','cancelled')),
  expires_at TEXT NOT NULL DEFAULT (datetime('now','+2 hours'))
);
CREATE INDEX idx_weight_conversations_pending ON weight_conversations(user_id,status,expires_at);
