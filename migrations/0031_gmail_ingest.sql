-- Gmail haber alımı: ham posta yalnız yönetici/işleme katmanında tutulur.
CREATE TABLE IF NOT EXISTS gmail_ingest_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_message_id TEXT NOT NULL UNIQUE,
  thread_id TEXT NOT NULL DEFAULT '',
  mailbox TEXT NOT NULL,
  sender TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  received_at TEXT NOT NULL DEFAULT '',
  body_text TEXT NOT NULL DEFAULT '',
  source_urls_json TEXT NOT NULL DEFAULT '[]',
  body_hash TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'received',
  news_slug TEXT NOT NULL DEFAULT '',
  error TEXT NOT NULL DEFAULT '',
  processed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gmail_ingest_status_received
  ON gmail_ingest_messages(status, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_gmail_ingest_mailbox_received
  ON gmail_ingest_messages(mailbox, received_at DESC);
