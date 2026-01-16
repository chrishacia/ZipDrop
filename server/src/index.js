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
