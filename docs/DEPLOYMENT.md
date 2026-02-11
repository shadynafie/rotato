# Deployment Guide

This guide covers the technical details for deploying Rotato.

## Docker Deployment

Rotato runs as a single Docker container that includes both the web interface and API server.

### Prerequisites

- Docker installed on your server
- A directory for persistent data storage

### Quick Start with Docker Compose

```bash
# Clone the repository
git clone https://github.com/shadynafie/rotato.git
cd rotato

# Create data directory for persistent database
mkdir -p data

# Set your JWT secret (required for production)
export JWT_SECRET="your-secure-random-secret-here"

# Start the container
docker-compose up -d
```

### Docker Run (Alternative)

```bash
# Pull the image from GitHub Container Registry
docker pull ghcr.io/shadynafie/rotato:latest

# Run with persistent data
docker run -d \
  --name rota-manager \
  -p 3001:3001 \
  -v $(pwd)/data:/data \
  -e JWT_SECRET="your-secure-random-secret-here" \
  ghcr.io/shadynafie/rotato:latest
```

### Portainer Stack

If you're using Portainer, create a new stack with this configuration:

```yaml
version: '3.8'

services:
  rota-manager:
    image: ghcr.io/shadynafie/rotato:latest
    container_name: rota-manager
    ports:
      - "3001:3001"
    volumes:
      - /path/to/your/data:/data
    environment:
      - JWT_SECRET=your-secure-random-secret-here
      - CORS_ORIGIN=*
    restart: unless-stopped
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Port the server listens on |
| `JWT_SECRET` | - | **Required.** Secret key for authentication |
| `DATABASE_URL` | `file:/data/rota.db` | SQLite database path |
| `CORS_ORIGIN` | `*` | Allowed origins for web requests |

### Data Persistence

The SQLite database is stored at `/data/rota.db` inside the container. **Important:** Always map this to a host directory to keep your data safe:

```bash
-v /your/host/path:/data
```

### Health Check

The container includes a health check endpoint at `/health`. You can verify the service is running:

```bash
curl http://localhost:3001/health
```

### Updating

To update to the latest version:

```bash
docker pull ghcr.io/shadynafie/rotato:latest
docker-compose down
docker-compose up -d
```

## Reverse Proxy (Optional)

If you want to run Rotato behind a reverse proxy like Nginx:

```nginx
server {
    listen 80;
    server_name rota.yourhospital.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Troubleshooting

### Container won't start
- Check logs: `docker logs rota-manager`
- Verify JWT_SECRET is set
- Ensure the data directory has correct permissions

### Can't access the web interface
- Verify port 3001 is not blocked by firewall
- Check if the container is running: `docker ps`

### Data not persisting
- Ensure volume is correctly mounted
- Check the data directory exists and is writable
