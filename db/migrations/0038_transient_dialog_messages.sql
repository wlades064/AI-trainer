CREATE TABLE transient_dialog_messages (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  chat_id INTEGER NOT NULL,
  message_id INTEGER NOT NULL,
  dialog_key TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('incoming','outgoing')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(chat_id, message_id)
);

CREATE INDEX idx_transient_dialog_messages_cleanup
  ON transient_dialog_messages(user_id, dialog_key, created_at);
