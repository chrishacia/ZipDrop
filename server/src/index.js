const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// Secret for HMAC validation - client-side key (provides integrity, not secrecy)
const API_SECRET = process.env.API_SECRET || 'zipdrop-client-v1';

// Trust proxy for rate limiting behind nginx
app.set('trust proxy', 1);

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Parse allowed origins from environment
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'https://chrishacia.github.io')
  .split(',')
  .map(origin => origin.trim());

// Allowed referrers (GitHub Pages)
const allowedReferrers = [
  'https://chrishacia.github.io',
  'http://localhost:5173', // Dev mode
  'http://localhost:4173', // Preview mode
];

// Middleware
app.use(helmet());
app.use(express.json({ limit: '1kb' })); // Small payload limit

// CORS configuration - STRICT mode for POST requests
app.use(cors({
  origin: (origin, callback) => {
    // For GET requests (stats), be more lenient
    if (!origin) {
      // Only allow no-origin for health checks via specific path check later
      return callback(null, true);
    }
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      // Return false instead of error to let our middleware handle it
      callback(null, false);
    }
  },
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'X-ZipDrop-Signature', 'X-ZipDrop-Timestamp'],
  maxAge: 86400, // Cache preflight for 24 hours
}));

// After CORS, check if origin was allowed for POST requests
app.use((req, res, next) => {
  if (req.method === 'POST' && req.path.includes('/api/')) {
    const origin = req.get('Origin');
    if (!origin || !allowedOrigins.includes(origin)) {
      console.log(`Blocked POST from origin: ${origin || 'none'}, IP: ${req.ip}`);
      return res.status(403).json({ error: 'Origin not allowed' });
    }
  }
  next();
});

// Stricter rate limiting for POST (event recording)
const postLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10, // Only 10 zip events per minute per IP
  message: { error: 'Too many zip events, please slow down' },
  standardHeaders: true,
  legacyHeaders: false,
});

// General rate limiting for GET requests
const getLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60, // 60 reads per minute
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiters
app.use('/api/events', postLimiter);
app.use('/api/stats', getLimiter);

// Middleware to validate referer header (additional check)
const validateReferer = (req, res, next) => {
  // Skip for GET requests
  if (req.method !== 'POST') {
    return next();
  }

  const referer = req.get('referer');

  // If referer is present, validate it
  if (referer) {
    const refererAllowed = allowedReferrers.some(allowed => referer.startsWith(allowed));
    if (!refererAllowed) {
      console.warn('POST with suspicious referer:', referer, 'IP:', req.ip);
      // Don't block, just log - referer can be stripped by browsers
    }
  }

  next();
};

// HMAC signature validation for event submissions
const validateSignature = (req, res, next) => {
  const signature = req.get('X-ZipDrop-Signature');
  const timestamp = req.get('X-ZipDrop-Timestamp');

  // Signature is optional but recommended - if present, validate it
  if (signature && timestamp) {
    // Check timestamp is within 5 minutes
    const now = Date.now();
    const reqTime = parseInt(timestamp, 10);
    if (isNaN(reqTime) || Math.abs(now - reqTime) > 5 * 60 * 1000) {
      return res.status(403).json({ error: 'Request expired' });
    }

    // Validate HMAC
    const payload = JSON.stringify(req.body) + timestamp;
    const expectedSig = crypto.createHmac('sha256', API_SECRET).update(payload).digest('hex');
    
    if (signature !== expectedSig) {
      console.warn('Invalid signature from IP:', req.ip);
      return res.status(403).json({ error: 'Invalid signature' });
    }
  }

  next();
};

app.use('/api/events', validateReferer, validateSignature);

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Database connection failed' });
  }
});

// Record a new ZIP creation event
app.post('/api/events', async (req, res) => {
  try {
    const { filesCount, rawSizeBytes, zippedSizeBytes, clientId } = req.body;

    // Validate input types
    if (typeof filesCount !== 'number' || filesCount < 0 ||
        typeof rawSizeBytes !== 'number' || rawSizeBytes < 0 ||
        typeof zippedSizeBytes !== 'number' || zippedSizeBytes < 0) {
      return res.status(400).json({ error: 'Invalid input data' });
    }

    // Must be integers (no decimals)
    if (!Number.isInteger(filesCount) || !Number.isInteger(rawSizeBytes) || !Number.isInteger(zippedSizeBytes)) {
      return res.status(400).json({ error: 'Values must be integers' });
    }

    // Reasonable limits to prevent abuse
    if (filesCount > 1000000 || rawSizeBytes > 100 * 1024 * 1024 * 1024) {
      return res.status(400).json({ error: 'Values exceed reasonable limits' });
    }

    // Sanity checks - these would be impossible in real usage
    if (filesCount === 0 && rawSizeBytes > 0) {
      return res.status(400).json({ error: 'Invalid: files=0 but size>0' });
    }
    if (zippedSizeBytes > rawSizeBytes * 1.1) {
      // Allow 10% margin for zip overhead on tiny files, but not more
      return res.status(400).json({ error: 'Invalid: zipped size larger than raw' });
    }
    if (filesCount > 0 && rawSizeBytes === 0) {
      return res.status(400).json({ error: 'Invalid: has files but zero size' });
    }

    // Validate clientId format if provided (should be UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const sanitizedClientId = clientId && uuidRegex.test(clientId) ? clientId : null;

    const userAgent = (req.get('user-agent') || '').substring(0, 255);

    // Log for monitoring
    console.log(`Event: files=${filesCount}, raw=${rawSizeBytes}, zipped=${zippedSizeBytes}, ip=${req.ip}`);

    const result = await pool.query(
      `INSERT INTO zip_events (files_count, raw_size_bytes, zipped_size_bytes, client_id, user_agent)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, created_at`,
      [filesCount, rawSizeBytes, zippedSizeBytes, sanitizedClientId, userAgent]
    );

    res.status(201).json({
      success: true,
      id: result.rows[0].id,
      timestamp: result.rows[0].created_at,
    });
  } catch (error) {
    console.error('Error recording event:', error);
    res.status(500).json({ error: 'Failed to record event' });
  }
});

// Helper to convert bigint strings to numbers
const toBigIntNumber = (val) => {
  if (val === null || val === undefined) return 0;
  const num = Number(val);
  return isNaN(num) ? 0 : num;
};

// Get all-time global stats
app.get('/api/stats', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        COUNT(*)::int as total_zips,
        COALESCE(SUM(files_count), 0)::bigint as total_files,
        COALESCE(SUM(raw_size_bytes), 0)::bigint as total_raw_bytes,
        COALESCE(SUM(zipped_size_bytes), 0)::bigint as total_zipped_bytes,
        COALESCE(SUM(raw_size_bytes - zipped_size_bytes), 0)::bigint as total_bytes_saved,
        MIN(created_at) as first_event,
        MAX(created_at) as last_event
      FROM zip_events
    `);

    const row = result.rows[0];
    res.json({
      total_zips: row.total_zips,
      total_files: toBigIntNumber(row.total_files),
      total_raw_bytes: toBigIntNumber(row.total_raw_bytes),
      total_zipped_bytes: toBigIntNumber(row.total_zipped_bytes),
      total_bytes_saved: toBigIntNumber(row.total_bytes_saved),
      first_event: row.first_event,
      last_event: row.last_event,
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Get today's stats (MUST be before :period route)
app.get('/api/stats/today', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        COUNT(*)::int as zips_created,
        COALESCE(SUM(files_count), 0)::bigint as files_zipped,
        COALESCE(SUM(raw_size_bytes), 0)::bigint as raw_bytes,
        COALESCE(SUM(zipped_size_bytes), 0)::bigint as zipped_bytes,
        COALESCE(SUM(raw_size_bytes - zipped_size_bytes), 0)::bigint as bytes_saved
      FROM zip_events
      WHERE DATE(created_at) = CURRENT_DATE
    `);

    const row = result.rows[0];
    res.json({
      zips_created: row.zips_created,
      files_zipped: toBigIntNumber(row.files_zipped),
      raw_bytes: toBigIntNumber(row.raw_bytes),
      zipped_bytes: toBigIntNumber(row.zipped_bytes),
      bytes_saved: toBigIntNumber(row.bytes_saved),
    });
  } catch (error) {
    console.error('Error fetching today stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Get computed averages and insights (MUST be before :period route)
app.get('/api/stats/averages', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        COUNT(*)::int as total_zips,
        COALESCE(AVG(files_count), 0)::float as avg_files_per_zip,
        COALESCE(AVG(raw_size_bytes), 0)::float as avg_raw_size,
        COALESCE(AVG(zipped_size_bytes), 0)::float as avg_zipped_size,
        COALESCE(AVG(raw_size_bytes - zipped_size_bytes), 0)::float as avg_bytes_saved,
        CASE 
          WHEN SUM(raw_size_bytes) > 0 
          THEN (1 - SUM(zipped_size_bytes)::float / SUM(raw_size_bytes)::float) * 100
          ELSE 0 
        END as avg_compression_percent,
        MAX(files_count)::int as max_files_in_zip,
        MAX(raw_size_bytes)::bigint as largest_zip_raw,
        MIN(CASE WHEN files_count > 0 THEN files_count END)::int as min_files_in_zip,
        MIN(CASE WHEN raw_size_bytes > 0 THEN raw_size_bytes END)::bigint as smallest_zip_raw
      FROM zip_events
    `);

    const row = result.rows[0];
    res.json({
      total_zips: row.total_zips,
      avg_files_per_zip: Math.round(row.avg_files_per_zip * 10) / 10,
      avg_raw_size: Math.round(row.avg_raw_size),
      avg_zipped_size: Math.round(row.avg_zipped_size),
      avg_bytes_saved: Math.round(row.avg_bytes_saved),
      avg_compression_percent: Math.round(row.avg_compression_percent * 10) / 10,
      max_files_in_zip: row.max_files_in_zip || 0,
      largest_zip_raw: toBigIntNumber(row.largest_zip_raw),
      min_files_in_zip: row.min_files_in_zip || 0,
      smallest_zip_raw: toBigIntNumber(row.smallest_zip_raw),
    });
  } catch (error) {
    console.error('Error fetching averages:', error);
    res.status(500).json({ error: 'Failed to fetch averages' });
  }
});

// Get hourly distribution (last 7 days) (MUST be before :period route)
app.get('/api/stats/hourly', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        EXTRACT(HOUR FROM created_at)::int as hour,
        COUNT(*)::int as zips_created,
        COALESCE(SUM(files_count), 0)::bigint as files_zipped,
        COALESCE(SUM(raw_size_bytes), 0)::bigint as raw_bytes
      FROM zip_events
      WHERE created_at >= NOW() - INTERVAL '7 days'
      GROUP BY EXTRACT(HOUR FROM created_at)
      ORDER BY hour
    `);

    // Fill in missing hours with zeros
    const hourlyData = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      zips_created: 0,
      files_zipped: 0,
      raw_bytes: 0,
    }));

    result.rows.forEach(row => {
      hourlyData[row.hour] = {
        hour: row.hour,
        zips_created: row.zips_created,
        files_zipped: toBigIntNumber(row.files_zipped),
        raw_bytes: toBigIntNumber(row.raw_bytes),
      };
    });

    res.json(hourlyData);
  } catch (error) {
    console.error('Error fetching hourly stats:', error);
    res.status(500).json({ error: 'Failed to fetch hourly stats' });
  }
});

// Get day of week distribution (all time) (MUST be before :period route)
app.get('/api/stats/weekday', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        EXTRACT(DOW FROM created_at)::int as day_of_week,
        COUNT(*)::int as zips_created,
        COALESCE(SUM(files_count), 0)::bigint as files_zipped,
        COALESCE(SUM(raw_size_bytes), 0)::bigint as raw_bytes
      FROM zip_events
      GROUP BY EXTRACT(DOW FROM created_at)
      ORDER BY day_of_week
    `);

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    // Fill in missing days with zeros
    const weekdayData = Array.from({ length: 7 }, (_, i) => ({
      day_of_week: i,
      day_name: dayNames[i],
      zips_created: 0,
      files_zipped: 0,
      raw_bytes: 0,
    }));

    result.rows.forEach(row => {
      weekdayData[row.day_of_week] = {
        day_of_week: row.day_of_week,
        day_name: dayNames[row.day_of_week],
        zips_created: row.zips_created,
        files_zipped: toBigIntNumber(row.files_zipped),
        raw_bytes: toBigIntNumber(row.raw_bytes),
      };
    });

    res.json(weekdayData);
  } catch (error) {
    console.error('Error fetching weekday stats:', error);
    res.status(500).json({ error: 'Failed to fetch weekday stats' });
  }
});

// Get stats by time period (MUST be LAST - :period is a wildcard)
app.get('/api/stats/:period', async (req, res) => {
  try {
    const { period } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 30, 365);

    let truncate;
    switch (period) {
      case 'daily':
        truncate = 'day';
        break;
      case 'weekly':
        truncate = 'week';
        break;
      case 'monthly':
        truncate = 'month';
        break;
      default:
        return res.status(400).json({ error: 'Invalid period. Use: daily, weekly, monthly' });
    }

    const result = await pool.query(`
      SELECT 
        DATE_TRUNC($1, created_at)::date as period,
        COUNT(*)::int as zips_created,
        COALESCE(SUM(files_count), 0)::bigint as files_zipped,
        COALESCE(SUM(raw_size_bytes), 0)::bigint as raw_bytes,
        COALESCE(SUM(zipped_size_bytes), 0)::bigint as zipped_bytes,
        COALESCE(SUM(raw_size_bytes - zipped_size_bytes), 0)::bigint as bytes_saved
      FROM zip_events
      WHERE created_at >= NOW() - INTERVAL '${limit} ${truncate}s'
      GROUP BY DATE_TRUNC($1, created_at)
      ORDER BY period DESC
      LIMIT $2
    `, [truncate, limit]);

    const data = result.rows.map(row => ({
      period: row.period,
      zips_created: row.zips_created,
      files_zipped: toBigIntNumber(row.files_zipped),
      raw_bytes: toBigIntNumber(row.raw_bytes),
      zipped_bytes: toBigIntNumber(row.zipped_bytes),
      bytes_saved: toBigIntNumber(row.bytes_saved),
    }));

    res.json({
      period,
      data,
    });
  } catch (error) {
    console.error('Error fetching periodic stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ============================================
// LEADERBOARD ENDPOINTS
// ============================================

// Get top clients leaderboard
app.get('/api/leaderboard', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const sortBy = req.query.sort || 'zips'; // zips, files, bytes_saved
    
    let orderBy;
    switch (sortBy) {
      case 'files':
        orderBy = 'total_files DESC';
        break;
      case 'bytes_saved':
        orderBy = 'total_bytes_saved DESC';
        break;
      default:
        orderBy = 'total_zips DESC';
    }

    const result = await pool.query(`
      SELECT 
        client_id,
        COUNT(*)::int as total_zips,
        COALESCE(SUM(files_count), 0)::bigint as total_files,
        COALESCE(SUM(raw_size_bytes), 0)::bigint as total_raw_bytes,
        COALESCE(SUM(zipped_size_bytes), 0)::bigint as total_zipped_bytes,
        COALESCE(SUM(raw_size_bytes - zipped_size_bytes), 0)::bigint as total_bytes_saved,
        MAX(created_at) as last_active,
        MIN(created_at) as first_zip
      FROM zip_events
      WHERE client_id IS NOT NULL
      GROUP BY client_id
      ORDER BY ${orderBy}
      LIMIT $1
    `, [limit]);

    const leaderboard = result.rows.map((row, index) => ({
      rank: index + 1,
      client_id: row.client_id.substring(0, 8) + '...', // Anonymize
      full_client_id: row.client_id, // For matching
      total_zips: row.total_zips,
      total_files: toBigIntNumber(row.total_files),
      total_bytes_saved: toBigIntNumber(row.total_bytes_saved),
      compression_ratio: row.total_raw_bytes > 0 
        ? Math.round((1 - row.total_zipped_bytes / row.total_raw_bytes) * 1000) / 10
        : 0,
      last_active: row.last_active,
      days_active: Math.ceil((new Date(row.last_active) - new Date(row.first_zip)) / (1000 * 60 * 60 * 24)) + 1,
    }));

    res.json({ leaderboard, sort_by: sortBy });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// Get specific client's rank and stats
app.get('/api/leaderboard/:clientId', async (req, res) => {
  try {
    const { clientId } = req.params;
    
    // Validate clientId format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(clientId)) {
      return res.status(400).json({ error: 'Invalid client ID format' });
    }

    // Get client stats
    const statsResult = await pool.query(`
      SELECT 
        COUNT(*)::int as total_zips,
        COALESCE(SUM(files_count), 0)::bigint as total_files,
        COALESCE(SUM(raw_size_bytes), 0)::bigint as total_raw_bytes,
        COALESCE(SUM(zipped_size_bytes), 0)::bigint as total_zipped_bytes,
        COALESCE(SUM(raw_size_bytes - zipped_size_bytes), 0)::bigint as total_bytes_saved,
        MAX(created_at) as last_active,
        MIN(created_at) as first_zip
      FROM zip_events
      WHERE client_id = $1
    `, [clientId]);

    if (statsResult.rows[0].total_zips === 0) {
      return res.json({ found: false });
    }

    // Get rank by total zips
    const rankResult = await pool.query(`
      SELECT COUNT(*)::int + 1 as rank
      FROM (
        SELECT client_id, COUNT(*) as zip_count
        FROM zip_events
        WHERE client_id IS NOT NULL
        GROUP BY client_id
      ) sub
      WHERE zip_count > (
        SELECT COUNT(*) FROM zip_events WHERE client_id = $1
      )
    `, [clientId]);

    // Get total unique clients
    const totalResult = await pool.query(`
      SELECT COUNT(DISTINCT client_id)::int as total_clients
      FROM zip_events
      WHERE client_id IS NOT NULL
    `);

    const stats = statsResult.rows[0];
    res.json({
      found: true,
      rank: rankResult.rows[0].rank,
      total_clients: totalResult.rows[0].total_clients,
      percentile: Math.round((1 - rankResult.rows[0].rank / totalResult.rows[0].total_clients) * 100),
      stats: {
        total_zips: stats.total_zips,
        total_files: toBigIntNumber(stats.total_files),
        total_bytes_saved: toBigIntNumber(stats.total_bytes_saved),
        compression_ratio: stats.total_raw_bytes > 0 
          ? Math.round((1 - stats.total_zipped_bytes / stats.total_raw_bytes) * 1000) / 10
          : 0,
        first_zip: stats.first_zip,
        last_active: stats.last_active,
      }
    });
  } catch (error) {
    console.error('Error fetching client stats:', error);
    res.status(500).json({ error: 'Failed to fetch client stats' });
  }
});

// ============================================
// ACHIEVEMENTS/BADGES ENDPOINTS
// ============================================

// Achievement definitions
const ACHIEVEMENTS = {
  first_zip: { name: 'First Zip', description: 'Created your first ZIP archive', icon: '🎉', threshold: 1, type: 'zips' },
  zip_10: { name: 'Getting Started', description: 'Created 10 ZIP archives', icon: '📦', threshold: 10, type: 'zips' },
  zip_50: { name: 'Zip Enthusiast', description: 'Created 50 ZIP archives', icon: '⚡', threshold: 50, type: 'zips' },
  zip_100: { name: 'Compression Master', description: 'Created 100 ZIP archives', icon: '🏆', threshold: 100, type: 'zips' },
  zip_500: { name: 'Zip Legend', description: 'Created 500 ZIP archives', icon: '👑', threshold: 500, type: 'zips' },
  files_100: { name: 'File Wrangler', description: 'Zipped 100 files total', icon: '📁', threshold: 100, type: 'files' },
  files_1000: { name: 'File Collector', description: 'Zipped 1,000 files total', icon: '📚', threshold: 1000, type: 'files' },
  files_10000: { name: 'Archive Architect', description: 'Zipped 10,000 files total', icon: '🏗️', threshold: 10000, type: 'files' },
  saved_1mb: { name: 'Space Saver', description: 'Saved 1 MB of storage', icon: '💾', threshold: 1024 * 1024, type: 'bytes_saved' },
  saved_100mb: { name: 'Storage Hero', description: 'Saved 100 MB of storage', icon: '🦸', threshold: 100 * 1024 * 1024, type: 'bytes_saved' },
  saved_1gb: { name: 'Gigabyte Guardian', description: 'Saved 1 GB of storage', icon: '🛡️', threshold: 1024 * 1024 * 1024, type: 'bytes_saved' },
  saved_10gb: { name: 'Compression Titan', description: 'Saved 10 GB of storage', icon: '⭐', threshold: 10 * 1024 * 1024 * 1024, type: 'bytes_saved' },
  streak_7: { name: 'Week Warrior', description: 'Used ZipDrop 7 days in a row', icon: '🔥', threshold: 7, type: 'streak' },
  streak_30: { name: 'Monthly Master', description: 'Used ZipDrop 30 days in a row', icon: '🌟', threshold: 30, type: 'streak' },
  big_zip: { name: 'Heavy Lifter', description: 'Created a ZIP with 500+ files', icon: '💪', threshold: 500, type: 'single_zip_files' },
  huge_zip: { name: 'Mega Zipper', description: 'Created a ZIP over 100 MB', icon: '🐘', threshold: 100 * 1024 * 1024, type: 'single_zip_size' },
};

// Get all achievements with unlock status for a client
app.get('/api/achievements/:clientId', async (req, res) => {
  try {
    const { clientId } = req.params;
    
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(clientId)) {
      return res.status(400).json({ error: 'Invalid client ID format' });
    }

    // Get client stats
    const statsResult = await pool.query(`
      SELECT 
        COUNT(*)::int as total_zips,
        COALESCE(SUM(files_count), 0)::bigint as total_files,
        COALESCE(SUM(raw_size_bytes - zipped_size_bytes), 0)::bigint as total_bytes_saved,
        MAX(files_count)::int as max_files_in_zip,
        MAX(raw_size_bytes)::bigint as max_zip_size
      FROM zip_events
      WHERE client_id = $1
    `, [clientId]);

    // Get streak (consecutive days)
    const streakResult = await pool.query(`
      WITH dates AS (
        SELECT DISTINCT DATE(created_at) as zip_date
        FROM zip_events
        WHERE client_id = $1
        ORDER BY zip_date DESC
      ),
      numbered AS (
        SELECT zip_date, 
               zip_date - (ROW_NUMBER() OVER (ORDER BY zip_date DESC))::int AS grp
        FROM dates
      )
      SELECT COUNT(*)::int as streak
      FROM numbered
      WHERE grp = (SELECT grp FROM numbered WHERE zip_date = CURRENT_DATE)
    `, [clientId]);

    // Get unlocked achievements from DB
    const unlockedResult = await pool.query(`
      SELECT achievement_id, unlocked_at
      FROM client_achievements
      WHERE client_id = $1
    `, [clientId]);

    const unlockedMap = new Map(unlockedResult.rows.map(r => [r.achievement_id, r.unlocked_at]));
    const stats = statsResult.rows[0];
    const streak = streakResult.rows[0]?.streak || 0;

    // Check each achievement
    const achievements = Object.entries(ACHIEVEMENTS).map(([id, achievement]) => {
      let current = 0;
      let unlocked = unlockedMap.has(id);
      let unlocked_at = unlockedMap.get(id);

      switch (achievement.type) {
        case 'zips':
          current = stats.total_zips;
          break;
        case 'files':
          current = toBigIntNumber(stats.total_files);
          break;
        case 'bytes_saved':
          current = toBigIntNumber(stats.total_bytes_saved);
          break;
        case 'streak':
          current = streak;
          break;
        case 'single_zip_files':
          current = stats.max_files_in_zip || 0;
          break;
        case 'single_zip_size':
          current = toBigIntNumber(stats.max_zip_size);
          break;
      }

      // Check if newly unlocked
      if (!unlocked && current >= achievement.threshold) {
        unlocked = true;
        // Store in DB (fire and forget)
        pool.query(
          'INSERT INTO client_achievements (client_id, achievement_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [clientId, id]
        ).catch(err => console.error('Failed to save achievement:', err));
      }

      return {
        id,
        ...achievement,
        current,
        progress: Math.min(100, Math.round((current / achievement.threshold) * 100)),
        unlocked,
        unlocked_at,
      };
    });

    res.json({
      achievements,
      total_unlocked: achievements.filter(a => a.unlocked).length,
      total_achievements: achievements.length,
      current_streak: streak,
    });
  } catch (error) {
    console.error('Error fetching achievements:', error);
    res.status(500).json({ error: 'Failed to fetch achievements' });
  }
});

// ============================================
// HEATMAP ENDPOINT (GitHub-style contribution grid)
// ============================================

app.get('/api/heatmap', async (req, res) => {
  try {
    const clientId = req.query.clientId;
    const days = Math.min(parseInt(req.query.days) || 365, 365);

    let query;
    let params;

    if (clientId) {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(clientId)) {
        return res.status(400).json({ error: 'Invalid client ID format' });
      }
      query = `
        SELECT 
          DATE(created_at) as date,
          COUNT(*)::int as count,
          COALESCE(SUM(files_count), 0)::bigint as files,
          COALESCE(SUM(raw_size_bytes - zipped_size_bytes), 0)::bigint as bytes_saved
        FROM zip_events
        WHERE created_at >= CURRENT_DATE - $1::int
        AND client_id = $2
        GROUP BY DATE(created_at)
        ORDER BY date
      `;
      params = [days, clientId];
    } else {
      query = `
        SELECT 
          DATE(created_at) as date,
          COUNT(*)::int as count,
          COALESCE(SUM(files_count), 0)::bigint as files,
          COALESCE(SUM(raw_size_bytes - zipped_size_bytes), 0)::bigint as bytes_saved
        FROM zip_events
        WHERE created_at >= CURRENT_DATE - $1::int
        GROUP BY DATE(created_at)
        ORDER BY date
      `;
      params = [days];
    }

    const result = await pool.query(query, params);

    // Create a map for quick lookup
    const dataMap = new Map(result.rows.map(r => [
      r.date.toISOString().split('T')[0],
      { count: r.count, files: toBigIntNumber(r.files), bytes_saved: toBigIntNumber(r.bytes_saved) }
    ]));

    // Generate full date range
    const heatmap = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const data = dataMap.get(dateStr) || { count: 0, files: 0, bytes_saved: 0 };
      heatmap.push({
        date: dateStr,
        ...data,
        level: data.count === 0 ? 0 : data.count <= 2 ? 1 : data.count <= 5 ? 2 : data.count <= 10 ? 3 : 4,
      });
    }

    // Calculate stats
    const totalDays = heatmap.filter(d => d.count > 0).length;
    const maxCount = Math.max(...heatmap.map(d => d.count));
    const totalZips = heatmap.reduce((sum, d) => sum + d.count, 0);

    res.json({
      heatmap,
      stats: {
        active_days: totalDays,
        max_daily_zips: maxCount,
        total_zips: totalZips,
        activity_rate: Math.round((totalDays / days) * 100),
      }
    });
  } catch (error) {
    console.error('Error fetching heatmap:', error);
    res.status(500).json({ error: 'Failed to fetch heatmap' });
  }
});

// ============================================
// LIVE COUNTER ENDPOINT (for polling)
// ============================================

app.get('/api/live', async (req, res) => {
  try {
    // Get stats for the last hour
    const result = await pool.query(`
      SELECT 
        COUNT(*)::int as zips_last_hour,
        COALESCE(SUM(files_count), 0)::bigint as files_last_hour,
        COALESCE(SUM(raw_size_bytes - zipped_size_bytes), 0)::bigint as bytes_saved_last_hour
      FROM zip_events
      WHERE created_at >= NOW() - INTERVAL '1 hour'
    `);

    // Get all-time totals
    const totalResult = await pool.query(`
      SELECT 
        COUNT(*)::int as total_zips,
        COALESCE(SUM(raw_size_bytes - zipped_size_bytes), 0)::bigint as total_bytes_saved
      FROM zip_events
    `);

    // Get most recent event
    const recentResult = await pool.query(`
      SELECT created_at, files_count, raw_size_bytes - zipped_size_bytes as bytes_saved
      FROM zip_events
      ORDER BY created_at DESC
      LIMIT 1
    `);

    const hourly = result.rows[0];
    const totals = totalResult.rows[0];
    const recent = recentResult.rows[0];

    res.json({
      last_hour: {
        zips: hourly.zips_last_hour,
        files: toBigIntNumber(hourly.files_last_hour),
        bytes_saved: toBigIntNumber(hourly.bytes_saved_last_hour),
      },
      all_time: {
        zips: totals.total_zips,
        bytes_saved: toBigIntNumber(totals.total_bytes_saved),
      },
      last_event: recent ? {
        timestamp: recent.created_at,
        files: recent.files_count,
        bytes_saved: toBigIntNumber(recent.bytes_saved),
        seconds_ago: Math.round((Date.now() - new Date(recent.created_at).getTime()) / 1000),
      } : null,
      server_time: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching live stats:', error);
    res.status(500).json({ error: 'Failed to fetch live stats' });
  }
});

// ============================================
// RECORDS/MILESTONES ENDPOINT
// ============================================

app.get('/api/records', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        MAX(files_count)::int as max_files_single_zip,
        MAX(raw_size_bytes)::bigint as max_size_single_zip,
        MAX(raw_size_bytes - zipped_size_bytes)::bigint as max_bytes_saved_single_zip,
        (SELECT COUNT(*)::int FROM zip_events) as total_zips,
        (SELECT COUNT(DISTINCT client_id)::int FROM zip_events WHERE client_id IS NOT NULL) as unique_clients,
        (SELECT COUNT(DISTINCT DATE(created_at))::int FROM zip_events) as active_days
      FROM zip_events
    `);

    // Get busiest day ever
    const busiestDayResult = await pool.query(`
      SELECT DATE(created_at) as date, COUNT(*)::int as zips
      FROM zip_events
      GROUP BY DATE(created_at)
      ORDER BY zips DESC
      LIMIT 1
    `);

    // Get busiest hour ever
    const busiestHourResult = await pool.query(`
      SELECT 
        DATE_TRUNC('hour', created_at) as hour,
        COUNT(*)::int as zips
      FROM zip_events
      GROUP BY DATE_TRUNC('hour', created_at)
      ORDER BY zips DESC
      LIMIT 1
    `);

    const stats = result.rows[0];
    const busiestDay = busiestDayResult.rows[0];
    const busiestHour = busiestHourResult.rows[0];

    // Calculate milestones
    const totalZips = stats.total_zips;
    const milestones = [
      { target: 100, reached: totalZips >= 100, label: '100 Zips' },
      { target: 500, reached: totalZips >= 500, label: '500 Zips' },
      { target: 1000, reached: totalZips >= 1000, label: '1K Zips' },
      { target: 5000, reached: totalZips >= 5000, label: '5K Zips' },
      { target: 10000, reached: totalZips >= 10000, label: '10K Zips' },
      { target: 50000, reached: totalZips >= 50000, label: '50K Zips' },
      { target: 100000, reached: totalZips >= 100000, label: '100K Zips' },
    ];

    const nextMilestone = milestones.find(m => !m.reached);

    res.json({
      records: {
        max_files_single_zip: stats.max_files_single_zip || 0,
        max_size_single_zip: toBigIntNumber(stats.max_size_single_zip),
        max_bytes_saved_single_zip: toBigIntNumber(stats.max_bytes_saved_single_zip),
        unique_clients: stats.unique_clients,
        active_days: stats.active_days,
        busiest_day: busiestDay ? { date: busiestDay.date, zips: busiestDay.zips } : null,
        busiest_hour: busiestHour ? { hour: busiestHour.hour, zips: busiestHour.zips } : null,
      },
      milestones: {
        current: totalZips,
        next: nextMilestone,
        all: milestones,
        progress_to_next: nextMilestone 
          ? Math.round((totalZips / nextMilestone.target) * 100)
          : 100,
      }
    });
  } catch (error) {
    console.error('Error fetching records:', error);
    res.status(500).json({ error: 'Failed to fetch records' });
  }
});

// ============================================
// WRAPPED ENDPOINT (yearly summary)
// ============================================

app.get('/api/wrapped/:year', async (req, res) => {
  try {
    const year = parseInt(req.params.year);
    const clientId = req.query.clientId;
    
    if (year < 2020 || year > new Date().getFullYear()) {
      return res.status(400).json({ error: 'Invalid year' });
    }

    let whereClause = `EXTRACT(YEAR FROM created_at) = $1`;
    let params = [year];

    if (clientId) {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(clientId)) {
        return res.status(400).json({ error: 'Invalid client ID format' });
      }
      whereClause += ` AND client_id = $2`;
      params = [year, clientId];
    }

    // Get yearly totals
    const totalsResult = await pool.query(`
      SELECT 
        COUNT(*)::int as total_zips,
        COALESCE(SUM(files_count), 0)::bigint as total_files,
        COALESCE(SUM(raw_size_bytes), 0)::bigint as total_raw_bytes,
        COALESCE(SUM(zipped_size_bytes), 0)::bigint as total_zipped_bytes,
        COALESCE(SUM(raw_size_bytes - zipped_size_bytes), 0)::bigint as total_bytes_saved,
        MAX(files_count)::int as biggest_zip_files,
        MAX(raw_size_bytes)::bigint as biggest_zip_size,
        COUNT(DISTINCT DATE(created_at))::int as active_days
      FROM zip_events
      WHERE ${whereClause}
    `, params);

    // Get monthly breakdown
    const monthlyResult = await pool.query(`
      SELECT 
        EXTRACT(MONTH FROM created_at)::int as month,
        COUNT(*)::int as zips,
        COALESCE(SUM(raw_size_bytes - zipped_size_bytes), 0)::bigint as bytes_saved
      FROM zip_events
      WHERE ${whereClause}
      GROUP BY EXTRACT(MONTH FROM created_at)
      ORDER BY month
    `, params);

    // Get busiest day of the year
    const busiestDayResult = await pool.query(`
      SELECT DATE(created_at) as date, COUNT(*)::int as zips
      FROM zip_events
      WHERE ${whereClause}
      GROUP BY DATE(created_at)
      ORDER BY zips DESC
      LIMIT 1
    `, params);

    // Get day of week distribution
    const weekdayResult = await pool.query(`
      SELECT 
        EXTRACT(DOW FROM created_at)::int as day,
        COUNT(*)::int as zips
      FROM zip_events
      WHERE ${whereClause}
      GROUP BY EXTRACT(DOW FROM created_at)
      ORDER BY zips DESC
      LIMIT 1
    `, params);

    const totals = totalsResult.rows[0];
    const busiestDay = busiestDayResult.rows[0];
    const favoriteWeekday = weekdayResult.rows[0];
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    // Create monthly data with zeros for missing months
    const monthlyData = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      month_name: monthNames[i + 1],
      zips: 0,
      bytes_saved: 0,
    }));
    monthlyResult.rows.forEach(row => {
      monthlyData[row.month - 1] = {
        month: row.month,
        month_name: monthNames[row.month],
        zips: row.zips,
        bytes_saved: toBigIntNumber(row.bytes_saved),
      };
    });

    // Find peak month
    const peakMonth = monthlyData.reduce((max, m) => m.zips > max.zips ? m : max, monthlyData[0]);

    // Fun facts
    const avgCompression = totals.total_raw_bytes > 0
      ? Math.round((1 - totals.total_zipped_bytes / totals.total_raw_bytes) * 100)
      : 0;
    
    const bytesSaved = toBigIntNumber(totals.total_bytes_saved);
    const funComparisons = [];
    if (bytesSaved > 1024 * 1024 * 1024 * 10) {
      funComparisons.push(`That's ${Math.round(bytesSaved / (1024 * 1024 * 1024))} GB saved - enough for ${Math.round(bytesSaved / (700 * 1024 * 1024))} CDs!`);
    }
    if (bytesSaved > 1024 * 1024 * 100) {
      funComparisons.push(`You saved ${Math.round(bytesSaved / (4 * 1024 * 1024))} floppy disks worth of space!`);
    }
    if (totals.total_files > 1000) {
      funComparisons.push(`You zipped ${totals.total_files.toLocaleString()} files - that's like organizing a digital library!`);
    }

    res.json({
      year,
      is_personal: !!clientId,
      summary: {
        total_zips: totals.total_zips,
        total_files: toBigIntNumber(totals.total_files),
        total_bytes_saved: bytesSaved,
        avg_compression_percent: avgCompression,
        active_days: totals.active_days,
        biggest_zip_files: totals.biggest_zip_files || 0,
        biggest_zip_size: toBigIntNumber(totals.biggest_zip_size),
      },
      highlights: {
        busiest_day: busiestDay ? {
          date: busiestDay.date,
          zips: busiestDay.zips,
        } : null,
        peak_month: peakMonth.zips > 0 ? peakMonth : null,
        favorite_weekday: favoriteWeekday ? {
          day: favoriteWeekday.day,
          name: dayNames[favoriteWeekday.day],
          zips: favoriteWeekday.zips,
        } : null,
      },
      monthly_breakdown: monthlyData,
      fun_facts: funComparisons,
    });
  } catch (error) {
    console.error('Error fetching wrapped:', error);
    res.status(500).json({ error: 'Failed to fetch wrapped data' });
  }
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await pool.end();
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`ZipDrop API running on port ${PORT}`);
  console.log(`Allowed origins: ${allowedOrigins.join(', ')}`);
});
