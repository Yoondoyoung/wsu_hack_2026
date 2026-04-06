# Utah Smart Path (WSU Hackathon 2026)

An interactive **Salt Lake City** real-estate dashboard: **Mapbox** map with listings, **layer overlays** (crime, schools, population, noise, structures), **filters**, a **mortgage approval assistant** powered by OpenAI, and an **AI chat** that can search listings with natural language.

---

## Features

- **Map-centric UI**: Satellite / 3D views, price labels, selection with fly-to and a visual connection to the detail card.
- **Overlays**: Toggle crime, schools, population, road noise, and building footprints (vector tiles where applicable).
- **Risk signals**: Crime proximity tiers and related badges on listings; noise exposure where data is available.
- **Mortgage predictor**: Submit income, debt, loan terms, and credit band; get a structured approval-style assessment (`POST /api/predict-mortgage`).
- **Chat assistant**: Ask about mortgages and local listings; the backend can call tools to search the property dataset (`/api/chat`).

---

## Tech stack

| Layer    | Stack |
|----------|--------|
| Client   | React 19, Vite 8, TypeScript, Tailwind CSS 4, Mapbox GL (`react-map-gl`), Axios |
| Server   | Express (TypeScript, `tsx`), Supabase (Postgres) for listings and overlays |
| AI       | OpenAI API (`gpt-4o-mini`) for mortgage evaluation and chat |

Dev ports: **Vite `5173`** (proxies `/api` → **`3001`**).

---

## Repository layout

```
client/                 # React app
  src/components/       # Layout, map, panels, chat, mortgage UI
  src/hooks/, services/, utils/, types/
server/                 # Express API
  src/routes/           # properties, mortgage, chat
  src/lib/              # Supabase, noise/geo helpers
  src/scripts/          # e.g. seedSupabase
docs/                   # Extra project notes (see PROJECT_OVERVIEW.md)
```

---

## Prerequisites

- **Node.js** (LTS recommended)
- **Mapbox** public token ([account.mapbox.com](https://account.mapbox.com/))
- **Supabase** project with tables populated for listings and overlays (use the seed script if you are setting up fresh data)
- **OpenAI API key** for mortgage prediction and chat

---

## Setup

1. **Install dependencies** (from the repo root):

   ```bash
   npm run install:all
   ```

2. **Environment variables**

   **Client** — create `client/.env`:

   ```bash
   VITE_MAPBOX_TOKEN=pk.your_mapbox_public_token
   ```

   **Server** — create `server/.env` (see `server/.env.example`):

   ```bash
   OPENAI_API_KEY=sk-...
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   # Optional
   PORT=3001
   ```

   The server loads `dotenv` from its own directory; keep secrets out of version control.

3. **Database (optional but typical for local dev)**  
   If you maintain data in Supabase, run the seed script after configuring `server/.env`:

   ```bash
   cd server && npm run seed:supabase
   ```

---

## Development

From the **repository root**, start client and server together:

```bash
npm run dev
```

Or run them separately:

```bash
npm run dev:client   # Vite → http://localhost:5173
npm run dev:server   # API → http://localhost:3001
```

---

## Production build

```bash
cd client && npm run build    # static output in client/dist
cd server && npm run build && npm start
```

The Vite dev server proxies `/api` to the Express app. In production, serve the client behind a host that forwards `/api` to the Node server (or align URLs via your deployment config).

---

## API overview

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/properties` | Listing payloads (from Supabase) |
| `GET` | `/api/properties/overlays/:type` | Overlay GeoJSON by type (`crime`, `schools`, `population`, `noise`, `structures`, …) |
| `POST` | `/api/predict-mortgage` | Mortgage-style evaluation (requires `OPENAI_API_KEY`) |
| `POST` | `/api/chat` (and related) | Chat with listing search tools (requires `OPENAI_API_KEY`) |

---

## Further reading

- Field-level notes and data sources: [docs/PROJECT_OVERVIEW.md](docs/PROJECT_OVERVIEW.md) (mixed detail; some sections predate the current Supabase + OpenAI setup).

---

## License

Private / hackathon project unless otherwise specified by the authors.
