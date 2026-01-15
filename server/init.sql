-- ZipDrop Analytics Database Schema

-- Table to store individual zip creation events
CREATE TABLE IF NOT EXISTS zip_events (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    files_count INTEGER NOT NULL CHECK (files_count >= 0),
    raw_size_bytes BIGINT NOT NULL CHECK (raw_size_bytes >= 0),
    zipped_size_bytes BIGINT NOT NULL CHECK (zipped_size_bytes >= 0),
    client_id VARCHAR(64),  -- Anonymous client identifier (optional)
    user_agent VARCHAR(255)
);

-- Index for fast time-based queries
CREATE INDEX IF NOT EXISTS idx_zip_events_created_at ON zip_events(created_at);

-- Index for daily/weekly/monthly aggregations
CREATE INDEX IF NOT EXISTS idx_zip_events_date ON zip_events(DATE(created_at));

-- Materialized view for daily stats (refreshed periodically for performance)
CREATE MATERIALIZED VIEW IF NOT EXISTS daily_stats AS
SELECT 
    DATE(created_at) as date,
    COUNT(*) as zips_created,
    SUM(files_count) as files_zipped,
    SUM(raw_size_bytes) as raw_bytes,
    SUM(zipped_size_bytes) as zipped_bytes,
    SUM(raw_size_bytes - zipped_size_bytes) as bytes_saved
FROM zip_events
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- Index on the materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_stats_date ON daily_stats(date);

-- Function to refresh the materialized view
CREATE OR REPLACE FUNCTION refresh_daily_stats()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY daily_stats;
END;
$$ LANGUAGE plpgsql;
