CREATE TABLE lab_results(
 id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),collected_on TEXT NOT NULL,
 marker_name TEXT NOT NULL,value_text TEXT NOT NULL,value_numeric REAL,unit TEXT NOT NULL,reference_text TEXT NOT NULL,
 source TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'active' CHECK(status IN('active','cancelled')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_lab_results_user_date ON lab_results(user_id,status,collected_on,marker_name);
