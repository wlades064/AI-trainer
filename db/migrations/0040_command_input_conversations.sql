CREATE TABLE command_input_conversations (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK(kind IN ('goal','supplement','supplement_stop','lab','lab_cancel','nutrition','fatsecret','export')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','cancelled')),
  expires_at TEXT NOT NULL DEFAULT (datetime('now','+2 hours'))
);
CREATE INDEX idx_command_input_pending ON command_input_conversations(user_id,status,expires_at);
