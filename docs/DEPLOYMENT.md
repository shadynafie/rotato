# Deployment Guide

This guide explains how to deploy Rotato on your server.

## What You Need

- A server with Docker installed (or Portainer)
- 5 minutes of your time

## Deploying with Portainer (Recommended)

Portainer is the easiest way to deploy Rotato. Follow these steps:

### Step 1: Create the Data Folder

First, SSH into your server and create a folder to store the database:

```bash
mkdir -p /opt/rotato/data
```

This folder will store all your rota data. Choose a location that gets backed up!

### Step 2: Create the Stack in Portainer

1. Open Portainer and go to **Stacks**
2. Click **Add Stack**
3. Give it a name: `rotato`
4. Paste this configuration:

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

5. **Important:** Change `CHANGE-THIS-TO-SOMETHING-RANDOM` to an actual random string
6. Click **Deploy the stack**

### Step 3: Access Rotato

Open your browser and go to:

```
http://YOUR-SERVER-IP:3001
```

**Default login:**
- Email: `admin@example.com`
- Password: `admin123`

That's it! You're done.

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

### The Data Folder

```yaml
volumes:
  - /opt/rotato/data:/data
```

This saves your database outside the container. If you update or restart Rotato, your data is safe.

Change `/opt/rotato/data` to wherever you want to store the data on your server.

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

If you prefer the command line over Portainer:

```bash
# Create data folder
mkdir -p /opt/rotato/data

# Run Rotato
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
docker restart rotato
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

Make sure your volume is correctly mapped. The data folder should contain a file called `rota.db`:

```bash
ls -la /opt/rotato/data/
# Should show: rota.db
```
