# Cargo Container Planner Deployment

This project is prepared as a front-end/back-end separated deployment.

## Services

- `frontend`: Nginx static site for the current Three.js UI. It proxies `/api/*` to the Java backend.
- `backend`: Spring Boot API service. It creates async packing jobs, persists job records, and caches repeated calculation results.
- `mysql`: Stores packing job requests/results and future business data.
- `redis`: Caches calculation results by request hash.

## Server Deployment

1. Copy the project to the server.
2. Create an environment file:

```bash
cp .env.example .env
```

3. Edit `.env` and replace all default passwords.
4. Start all services:

```bash
docker compose up -d --build
```

5. Check service status:

```bash
docker compose ps
docker compose logs -f backend
```

6. Open the system:

```text
http://your-server-ip/
```

## API Flow

Create a packing job:

```http
POST /api/packing/jobs
Content-Type: application/json
```

```json
{
  "utilizationPercent": 90,
  "globalGapCm": 1,
  "cargos": [
    {
      "id": "cargo-a",
      "name": "Carton A",
      "lengthCm": 60,
      "widthCm": 40,
      "heightCm": 35,
      "quantity": 30,
      "weightKg": 12,
      "type": "normal",
      "color": "#4e8fd0"
    }
  ],
  "containers": [
    {
      "id": "20gp",
      "name": "20GP Standard",
      "lengthCm": 590,
      "widthCm": 235,
      "heightCm": 239,
      "payloadKg": 28200
    }
  ]
}
```

Read job state/result:

```http
GET /api/packing/jobs/{jobId}
```

The response contains:

- `status`: `pending`, `running`, `finished`, or `failed`
- `progress`: 0 to 100
- `result.bestContainerId`
- `result.evaluations[]`
- `result.evaluations[].packedBoxes[].placed[]`, including each cargo unit's `xCm`, `yCm`, `zCm`, `lengthCm`, `widthCm`, and `heightCm`

## Notes

- The current UI is still the existing static prototype. The backend API is ready for the next step: switching the front-end calculation button to create a backend job and poll `/api/packing/jobs/{jobId}`.
- Redis is an acceleration layer. MySQL remains the durable record.
- For company use, put this behind an internal domain and configure HTTPS at the reverse proxy or cloud load balancer.
