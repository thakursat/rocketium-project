# Project Instructions Log

This file consolidates the running set of instructions provided by the user. Review it before implementing any change.

## Assignment Overview

- Goal: Build a canvas-based design editor (Canva/Figma-lite) allowing multiple users to collaborate on designs in real time.
- Persistence: Store designs in MongoDB via a REST API; allow users to create, list, open, edit, and save designs.
- Timeline: Complete within 48 hours from assignment receipt.
- Deliverables: GitHub repo, live demo, 1–3 minute video, README detailing architecture, API documentation, DB schema, cut scope, and AI/codegen attribution.

## Functional Requirements

1. Canvas with at least one fixed-size preset (e.g., 1080×1080) and preferably custom sizing.
2. Add and edit text, image, and shape elements with 2–3 styling options each (e.g., font, color).
3. Support move, resize, rotate transformations with selection handles/bounding boxes.
4. Manage layer order (bring forward/back), provide layers list with rename and delete.
5. Undo/redo the last 10+ actions.
6. Export the current canvas to PNG (client-side export acceptable).
7. Save designs to MongoDB via REST API and reload them later.
8. Enable real-time multi-user editing on the same design.
9. Support comments with @mentions; display existing comments.
10. Allow creating new designs, editing existing ones, and listing past designs with name, updated time, optional thumbnail.

## Non-Functional Requirements

- Provide user-friendly error handling with toasts.
- API responses must follow `{ code, message, details }` for errors.
- Ensure smooth front-end performance (memoization, avoid unnecessary re-renders).
- Cite AI/codegen assistance where used.
- Include unit tests and E2E tests.
- Emphasize clarity over over-engineering; document design decisions.

## Technical Constraints

- Frontend: React (TypeScript) with Redux for state management and a canvas solution (Fabric.js/Konva/raw Canvas).
- Backend: Node.js with Express.
- Database: MongoDB (Atlas or local) with Mongoose ODM and/or runtime validation (e.g., Zod).

## UI Expectations

- Suggested layout: top bar with object creation, undo/redo, download, project name.
- Right panel for styling options of the selected layer (font, color, rotation, etc.).
- Left panel for layers list with reorder, rename, delete controls.
- Central canvas with selection handles and bounding boxes during transforms.

## Nice-to-Haves

- Rulers, guides, snapping.
- Autosave (debounced).
- Keyboard shortcuts (⌘/Ctrl+C/V/Z/Y, Delete, arrow keys).
- Simple authentication (JWT or token) with per-user projects.
- Thumbnail generation endpoint.
- CI pipeline (tests + lint) and additional E2E tests (e.g., Playwright).

## Testing Expectations

- Demonstrate creating a design with text, image, shape elements.
- Reorder layers, use undo/redo, export to PNG.
- Save and reload designs.
- Validate live edits and presence with two browsers.
- Add comments and confirm persistence.
- Ensure API rejects invalid payloads with clear errors.

## Implementation Blueprint (agreed plan)

1. Scaffold monorepo structure, shared types, Express server with Mongo, Next/React app with Konva and Redux store.
2. Implement canvas element CRUD with transformations, layer management, styling panel.
3. Add undo/redo system and export to PNG.
4. Build persistence: REST endpoints, autosave debounce, design list.
5. Integrate real-time collaboration (Socket.IO) and comments with @mentions.
6. Polish: toasts, error handling, Jest + Playwright tests, documentation, demo prep.

## Ongoing Instructions

- Always consult this log before coding; update it whenever new instructions arrive.
- Maintain code in TypeScript where applicable; ensure backend is TS-compatible.
- Use `pnpm` for package management; dev scripts run via root `pnpm dev` to start both frontend and backend concurrently.
- Keep comments concise and only for non-obvious logic; default to ASCII.
- Backend must load configuration from `.env` using `dotenv`; maintain `.env.example` as needed.
- Review this file after every new instruction to ensure compliance.

_Last updated: 24 Nov 2025._
