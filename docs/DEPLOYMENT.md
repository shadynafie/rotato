# Deployment Guide

This guide explains how to deploy Rotato on your server.

## What You Need

- A server with Docker installed (or Portainer)
- 5 minutes of your time

---

## Deploying with Portainer

Portainer is the easiest way to deploy Rotato. You have two options for storing your data:

### Option A: Docker Volume (Recommended)

Docker manages the storage for you. Simpler and works better across different systems.

**Portainer Stack:**

```yaml
version: '3.8'

services:
  rotato:
    image: ghcr.io/shadynafie/rotato:latest
    container_name: rotato
    ports:
      - "3001:3001"
    volumes:
      - rotato_data:/data
    environment:
      - JWT_SECRET=CHANGE-THIS-TO-SOMETHING-RANDOM
    restart: unless-stopped

volumes:
  rotato_data:
```

**Pros:**
- No need to create folders manually
- Docker handles permissions automatically
- Easy to backup with `docker volume` commands
- Works the same on any operating system

**Where is my data?**
Docker stores it internally. To find it:
```bash
docker volume inspect rotato_data
```

**To backup:**
```bash
docker run --rm -v rotato_data:/data -v $(pwd):/backup alpine tar cvf /backup/rotato-backup.tar /data
```

---

### Option B: Host Folder (Bind Mount)

You choose exactly where the data is stored on your server.

**Step 1:** Create the folder first:
```bash
mkdir -p /opt/rotato/data
```

**Portainer Stack:**

```yaml
version: '3.8'

services:
  rotato:
    image: ghcr.io/shadynafie/rotato:latest
    container_name: rotato
    ports:
      - "3001:3001"
    volumes:
      - /opt/rotato/data:/data
    environment:
      - JWT_SECRET=CHANGE-THIS-TO-SOMETHING-RANDOM
    restart: unless-stopped
```

**Pros:**
- You know exactly where the file is (`/opt/rotato/data/rota.db`)
- Easy to backup with standard tools (rsync, cp, etc.)
- Can put it on a specific drive or NAS

**To backup:**
```bash
cp /opt/rotato/data/rota.db /backup/rota-backup.db
```

---

## Which Option Should I Choose?

| If you want... | Use |
|----------------|-----|
| Simplest setup | **Option A** (Docker Volume) |
| Control over file location | **Option B** (Host Folder) |
| Easy Docker-native backups | **Option A** (Docker Volume) |
| Backup with rsync/standard tools | **Option B** (Host Folder) |
| Store data on NAS/external drive | **Option B** (Host Folder) |

---

## After Deploying

Open your browser and go to:

```
http://YOUR-SERVER-IP:3001
```

**Default login:**
- Email: `admin@example.com`
- Password: `admin123`

---

## Understanding the Configuration

### The Port (3001)

```yaml
ports:
  - "3001:3001"
```

This is the web address port. Users will access Rotato at `http://your-server:3001`

Want to use a different port? Change the first number:
- `"80:3001"` → Users go to `http://your-server` (no port needed)
- `"8080:3001"` → Users go to `http://your-server:8080`

### The JWT Secret

```yaml
environment:
  - JWT_SECRET=CHANGE-THIS-TO-SOMETHING-RANDOM
```

This secures user logins. Use any random string - the longer the better.

Generate a random one with:
```bash
openssl rand -hex 32
```

---

## Alternative: Docker Command Line

**With Docker Volume:**
```bash
docker volume create rotato_data

docker run -d \
  --name rotato \
  -p 3001:3001 \
  -v rotato_data:/data \
  -e JWT_SECRET="your-random-secret-here" \
  --restart unless-stopped \
  ghcr.io/shadynafie/rotato:latest
```

**With Host Folder:**
```bash
mkdir -p /opt/rotato/data

docker run -d \
  --name rotato \
  -p 3001:3001 \
  -v /opt/rotato/data:/data \
  -e JWT_SECRET="your-random-secret-here" \
  --restart unless-stopped \
  ghcr.io/shadynafie/rotato:latest
```

---

## Updating Rotato

To get the latest version:

**In Portainer:**
1. Go to your `rotato` stack
2. Click **Editor**
3. Click **Update the stack**
4. Check "Re-pull image"
5. Click **Update**

**Command line:**
```bash
docker pull ghcr.io/shadynafie/rotato:latest
docker stop rotato && docker rm rotato
# Then run the docker run command again
```

---

## Using a Custom Domain (Optional)

If you want users to access Rotato at `https://rota.yourhospital.com` instead of an IP address, you'll need a reverse proxy like Nginx or Traefik. This is usually set up by your IT team.

Example Nginx configuration:

```nginx
server {
    listen 80;
    server_name rota.yourhospital.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

---

## Troubleshooting

### Can't access the web page

1. Check if Rotato is running:
   - In Portainer: Look for green "running" status
   - Command line: `docker ps | grep rotato`

2. Check the logs:
   - In Portainer: Click on the container → Logs
   - Command line: `docker logs rotato`

3. Check your firewall allows port 3001

### Lost your password

Currently, you'll need to reset the database or contact the developer for help. A password reset feature is planned.

### Data disappeared after update

**If using Docker Volume:**
```bash
docker volume ls | grep rotato
# Should show: rotato_data
```

**If using Host Folder:**
```bash
ls -la /opt/rotato/data/
# Should show: rota.db
```
