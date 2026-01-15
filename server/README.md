# ZipDrop API Server

Self-contained Docker setup for tracking global ZipDrop usage statistics.

## Quick Start

### 1. Set up environment variables

```bash
cd server
cp .env.example .env
# Edit .env and set a strong DB_PASSWORD
nano .env
```

### 2. Build and start the containers

```bash
docker-compose up -d --build
```

### 3. Verify it's running

```bash
curl http://localhost:3847/health
# Should return: {"status":"ok","timestamp":"..."}
```

### 4. Configure NGINX

```bash
# Copy the example config
sudo cp nginx.conf.example /etc/nginx/sites-available/zipdrop-api

# Edit and replace YOUR_DOMAIN with your actual domain
sudo nano /etc/nginx/sites-available/zipdrop-api

# Enable the site
sudo ln -s /etc/nginx/sites-available/zipdrop-api /etc/nginx/sites-enabled/

# Get SSL certificate
sudo certbot --nginx -d YOUR_DOMAIN

# Test and reload NGINX
sudo nginx -t && sudo systemctl reload nginx
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| POST | `/api/events` | Record a ZIP creation event |
| GET | `/api/stats` | Get all-time global stats |
| GET | `/api/stats/today` | Get today's stats |
| GET | `/api/stats/daily?limit=30` | Get daily breakdown |
| GET | `/api/stats/weekly?limit=12` | Get weekly breakdown |
| GET | `/api/stats/monthly?limit=12` | Get monthly breakdown |

### Recording an Event

```bash
curl -X POST https://YOUR_DOMAIN/api/events \
  -H "Content-Type: application/json" \
  -d '{"filesCount": 42, "rawSizeBytes": 1048576, "zippedSizeBytes": 524288}'
```

### Getting Stats

```bash
curl https://YOUR_DOMAIN/api/stats
# Returns: {
#   "total_zips": 1234,
#   "total_files": 56789,
#   "total_raw_bytes": 123456789,
#   "total_zipped_bytes": 98765432,
#   "total_bytes_saved": 24691357,
#   "first_event": "2025-01-01T00:00:00Z",
#   "last_event": "2026-01-15T12:00:00Z"
# }
```

## Management Commands

```bash
# View logs
docker-compose logs -f api

# Restart services
docker-compose restart

# Stop everything
docker-compose down

# Stop and remove data (CAUTION: deletes all stats!)
docker-compose down -v

# Update and rebuild
git pull
docker-compose up -d --build
```

## Backup Database

```bash
# Backup
docker exec zipdrop-db pg_dump -U zipdrop zipdrop > backup_$(date +%Y%m%d).sql

# Restore
cat backup_20260115.sql | docker exec -i zipdrop-db psql -U zipdrop zipdrop
```

## Data Persistence

The PostgreSQL data is stored in a Docker volume named `zipdrop-postgres-data`. This persists across container restarts and updates.

To find the volume location:
```bash
docker volume inspect zipdrop-postgres-data
```
