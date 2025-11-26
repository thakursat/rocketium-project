# Rocketium Canvas- Developed by Satyam Singh

A collaborative design editor prototype with a real-time multiplayer canvas, built with a React front end and an Express/MongoDB back end. This document captures the high-level architecture, technology selections, API surface, database schema, and notable scope trade-offs.

## Architecture Overview & Library Choices

- **Repository layout**: Two decoupled apps live under `frontend/` (React 19 + Vite) and `backend/` (Express 5 + Socket.IO). Shared logic stays within each package; the top-level workspace uses `pnpm` for dependency management.
- **Frontend stack**:
  - **React 19 + Vite** for fast HMR and modern JSX transforms.
  - **Redux Toolkit** to keep authentication state and design editor snapshots predictable and serialisable across undo/redo and websocket patches.
  - **React Router v7** to isolate public (sign-in/up) vs protected editor routes.
  - **Socket.IO Client** maintains low-latency presence, cursor, and design patch channels with automatic reconnection.
  - **Zod** mirrors backend validation to keep forms/client-side guards in sync.
  - **html-to-image** powers one-click PNG exports of the current canvas.
- **Backend stack**:
  - **Express 5** with a modular router/controller/service layering to keep validation, business logic, and persistence separate.
  - **MongoDB via Mongoose 8** stores users, designs, and threaded comments with schema-level validation and population helpers.
  - **Socket.IO Server** fans out real-time design patches, presence, and comment broadcasts to room-specific listeners.
  - **Zod** enforces runtime validation on all HTTP payloads before they reach the services layer.
  - **JWT (jsonwebtoken) + bcryptjs** deliver stateless auth with salted password hashes.
- **Real-time collaboration flow**: HTTP APIs create/load designs and persist comments, while the websocket layer keeps canvases, cursors, and comment feeds in sync. The frontend reconciles inbound patches against local history using optimistic updates guarded by bounding logic.

## API Documentation

All routes are served under `/api`. Requests and responses use JSON. Authentication uses a `Bearer <token>` header obtained from the sign-in/up endpoints.

### Auth

| Method | Path               | Description                |
| ------ | ------------------ | -------------------------- |
| POST   | `/api/auth/signup` | Register a new user.       |
| POST   | `/api/auth/signin` | Sign in and receive a JWT. |
| GET    | `/api/auth/me`     | Fetch the current user.    |

<details>
<summary>Example: POST /api/auth/signup</summary>

```http
POST /api/auth/signup
Content-Type: application/json

{
  "name": "Ava Designer",
  "email": "ava@example.com",
  "password": "supersecret"
}
```

```json
{
  "token": "<jwt>",
  "user": {
    "id": "665d...",
    "name": "Ava Designer",
    "email": "ava@example.com"
  }
}
```

</details>

### Designs

| Method | Path               | Description                                                                     |
| ------ | ------------------ | ------------------------------------------------------------------------------- |
| GET    | `/api/designs`     | List designs (owned + public).                                                  |
| POST   | `/api/designs`     | Create a design.                                                                |
| GET    | `/api/designs/:id` | Fetch a design plus comments.                                                   |
| PUT    | `/api/designs/:id` | Update geometry, elements, metadata, or visibility (owner-only for visibility). |

<details>
<summary>Design payload shape</summary>

```json
{
  "name": "Product Launch",
  "width": 1080,
  "height": 1080,
  "elements": [
    {
      "id": "el-1",
      "name": "Heading",
      "type": "text",
      "x": 120,
      "y": 140,
      "width": 360,
      "height": 120,
      "text": "Coming Soon",
      "fontSize": 48,
      "zIndex": 0
    }
  ],
  "isPublic": false
}
```

</details>

### Comments

| Method | Path                        | Description                                                   |
| ------ | --------------------------- | ------------------------------------------------------------- |
| GET    | `/api/designs/:id/comments` | List comments for a design (chronological).                   |
| POST   | `/api/designs/:id/comments` | Add a comment with optional @mentions and canvas coordinates. |

### Health

- `GET /health` — simple readiness probe returning `{ "status": "healthy" }` without auth.

### Websocket Channels (Socket.IO)

- `design:join` / `design:leave` — subscribe/unsubscribe to a design room with presence tracking.
- `design:presence` — broadcast of active participants and cursors for a design.
- `design:cursor` — per-user cursor updates.
- `design:patch` — element/selection/metadata patches synced between clients.
- `comment:create` → server → `comment:created` — real-time comment creation fan-out.

## Database Schema Design

| Collection | Purpose                                             | Key Fields & Indexes                                                                                                                                              |
| ---------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`    | Auth identities.                                    | `name`, unique `email`, `passwordHash`; automatic `createdAt/updatedAt` timestamps.                                                                               |
| `designs`  | Canvas documents with ownership & sharing metadata. | `name`, `width`, `height`, `elements[]` (embedded, z-index ordered), `owner` (ref `users`), `collaboratorIds[]`, `isPublic` (indexed), `lastSavedAt`, timestamps. |
| `comments` | Threaded feedback pinned to designs.                | `designId` (ref `designs`, indexed via query), `authorId` (ref `users`), `authorName` snapshot, `message`, `mentions[]`, optional `position {x,y}`, timestamps.   |

All IDs are MongoDB ObjectIds. Element payloads are stored inline inside a design document; they mirror the Zod schema used on both client and server, enabling deterministic undo/redo replay.

## What Was Cut and Why

- **All Functional requirements were completed**

## Local Development

1. **Install dependencies**
   ```bash
   pnpm install --filter frontend
   pnpm install --filter backend
   ```
2. **Environment setup**
   - Copy `backend/.env.example` to `backend/.env` and fill in `MONGO_URI` and `JWT_SECRET`.
3. **Run services**

   ```bash
   # Backend (port 4000 by default)
   cd backend && pnpm dev

   # Frontend (Vite dev server on port 3000)
   cd frontend && pnpm dev
   ```

## Deployment Build

Run a single command from the repository root to produce a hostable bundle:

```bash
pnpm run deploy
```

This script performs the following steps:

- Builds the Vite frontend into `frontend/dist`.
- Compiles the Express backend into `backend/dist`.
- Copies the frontend assets into `backend/dist/public`, which the backend serves via Express static middleware.

To launch the production bundle locally (after `pnpm deploy`), run:

```bash
pnpm --dir backend start
```

The backend will serve both the API and the compiled frontend from the same process, ready for deployment on a single host.
