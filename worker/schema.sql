-- Schema for AI Content Detector Research Study
CREATE TABLE IF NOT EXISTS detections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL,
    author_handle TEXT,
    content_text TEXT NOT NULL,
    word_count INTEGER,
    ai_score REAL,
    ai_label TEXT,
    likes INTEGER DEFAULT 0,
    comments INTEGER DEFAULT 0,
    reposts INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_platform ON detections(platform);
CREATE INDEX IF NOT EXISTS idx_ai_score ON detections(ai_score);
