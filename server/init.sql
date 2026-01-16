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

-- Index for client leaderboard queries
CREATE INDEX IF NOT EXISTS idx_zip_events_client_id ON zip_events(client_id) WHERE client_id IS NOT NULL;

-- Table to track achievements/badges per client
CREATE TABLE IF NOT EXISTS client_achievements (
    id SERIAL PRIMARY KEY,
    client_id VARCHAR(64) NOT NULL,
    achievement_id VARCHAR(50) NOT NULL,
    unlocked_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(client_id, achievement_id)
);

CREATE INDEX IF NOT EXISTS idx_achievements_client ON client_achievements(client_id);

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

-- Materialized view for leaderboard (refreshed periodically)
CREATE MATERIALIZED VIEW IF NOT EXISTS client_leaderboard AS
SELECT 
    client_id,
    COUNT(*) as total_zips,
    SUM(files_count) as total_files,
    SUM(raw_size_bytes) as total_raw_bytes,
    SUM(zipped_size_bytes) as total_zipped_bytes,
    SUM(raw_size_bytes - zipped_size_bytes) as total_bytes_saved,
    MAX(created_at) as last_active
FROM zip_events
WHERE client_id IS NOT NULL
GROUP BY client_id
ORDER BY total_zips DESC;

CREATE UNIQUE INDEX IF NOT EXISTS idx_leaderboard_client ON client_leaderboard(client_id);

-- Function to refresh the materialized view
CREATE OR REPLACE FUNCTION refresh_daily_stats()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY daily_stats;
END;
$$ LANGUAGE plpgsql;

-- Function to refresh leaderboard
CREATE OR REPLACE FUNCTION refresh_leaderboard()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY client_leaderboard;
END;
$$ LANGUAGE plpgsql;
