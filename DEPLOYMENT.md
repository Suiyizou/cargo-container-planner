# Deployment

## Architecture

- `frontend`: Nginx serves the Vue production build and proxies `/api/*` to `backend:8080`.
- `backend`: Spring Boot API service for packing jobs and calculation results.
- `mysql`: Stores job requests and results.
- `redis`: Caches repeated calculation results.

Only the frontend container publishes a host port. In normal server deployment, opening TCP port `80` is enough.

## Server Commands

```bash
git pull
cp -n .env.example .env
docker compose up -d --build
docker compose ps
```

Open:

```text
http://your-server-ip/
```

## Useful Checks

```bash
docker compose logs --tail=80 frontend
docker compose logs --tail=120 backend
curl http://127.0.0.1/api/health
```

From outside the server, use:

```text
http://your-server-ip/api/health
```

## Notes

- Do not expose `8080`, `3306`, or `6379` to the public network unless there is a specific operations reason.
- If a browser keeps an old page, press `Ctrl+F5`; the Vue asset filenames are hashed, and Nginx serves `index.html` with `no-cache`.
