# TODO

## Ports

### Local dev port configuration
Frontend and backend use default ports **3053** (frontend) and **8053** (backend).
These can be overridden via environment variables before the dev server is started:

```bash
# Override frontend port
PORT=3060 npm run dev

# Override backend port
PORT=8060 uvicorn app.main:app --reload --port 8060
```

The frontend `npm run dev` and `npm start` scripts read `$PORT` with a fallback of **3053**.
The backend reads `PORT` from `.env` (see `backend/app/core/config.py`, default `8053`).
The Next.js proxy routes read `BACKEND_URL` (default `http://localhost:8053`) — update this
in `.env` if the backend port is changed.

### Pre-VPS deployment
Before deploying to the VPS, check available port assignments and update:

1. Frontend port in the `start` npm script (or set `$PORT` in the PM2 ecosystem file).
2. Backend `PORT` in production `.env`.
3. nginx `proxy_pass` directives for both services.
4. PM2 ecosystem file `PORT` / `BACKEND_URL` env vars.
5. CORS `allow_origins` in `backend/app/main.py` — add the production domain.
