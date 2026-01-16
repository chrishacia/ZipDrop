const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

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

// Middleware
app.use(helmet());
app.use(express.json({ limit: '1kb' })); // Small payload limit

// CORS configuration
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
  maxAge: 86400, // Cache preflight for 24 hours
}));

// Rate limiting - 30 requests per minute per IP
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

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

    // Validate input
    if (typeof filesCount !== 'number' || filesCount < 0 ||
        typeof rawSizeBytes !== 'number' || rawSizeBytes < 0 ||
        typeof zippedSizeBytes !== 'number' || zippedSizeBytes < 0) {
      return res.status(400).json({ error: 'Invalid input data' });
    }

    // Reasonable limits to prevent abuse
    if (filesCount > 1000000 || rawSizeBytes > 100 * 1024 * 1024 * 1024) {
      return res.status(400).json({ error: 'Values exceed reasonable limits' });
    }

    const userAgent = (req.get('user-agent') || '').substring(0, 255);
    const sanitizedClientId = clientId ? String(clientId).substring(0, 64) : null;

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

// Get stats by time period
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
