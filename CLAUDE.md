# Handliz.ai Client

Frontend for Handliz.ai: an AI architectural-visualization tool. Architects upload renders/CAD views of a building,
choose location, time of day, weather, aspect ratio, image count and model, and get photorealistic renders of that
exact building in that setting. Work happens in persistent projects where images can be refined, edited, regenerated,
deleted, and viewed in a lightbox. Usage is credit-metered.

Backend lives in the sibling repo `../Handliz.ai.api` (ASP.NET Core + MySQL). It has its own CLAUDE.md that
documents the pipeline, credit system and API contracts — read it when touching anything API-related.

## Stack

- React 19 + TypeScript (~6.0) + Vite 8, `react-router-dom` v7 (`BrowserRouter`)
- **No other runtime dependencies** — no UI kit, state library, data-fetching library or CSS framework. Keep it that way unless asked.
- Styling: CSS Modules (`*.module.css` next to each component) + design tokens in `src/index.css`
- Lint: oxlint (`.oxlintrc.json`). No test setup yet.

## Commands

```bash
npm run dev      # http://localhost:5174 (strictPort; must be in backend Cors:AllowedOrigins)
npm run build    # tsc -b && vite build — this is the type check
npm run lint
```

The backend must be running at `VITE_API_BASE_URL` (default `http://localhost:5047`). `VITE_GOOGLE_CLIENT_ID` in
`.env.development` / `.env.local` must match the backend's `Google:ClientId`.

`.claude/launch.json` defines `handliz-frontend` (5174) and `handliz-api` (5047, runs the sibling repo) for the preview tooling.

## Layout

- `src/api/` — `client.ts` (fetch wrappers `apiGet`/etc., `ApiError`, `imageUrl()`), one `*Api.ts` + `*Types.ts` per backend area (auth, projects, usage). Types mirror backend DTOs by hand — keep in sync when contracts change.
- `src/auth/` — `AuthContext` (access token kept **in memory only**, never localStorage; silent refresh on load via the httpOnly refresh cookie), `ProtectedRoute`, Google Identity Services button.
- `src/usage/` — `UsageContext` (one shared credit-usage snapshot; call `refresh()` after any generation), `UsageRing`, `UsageBar`.
- `src/pages/` — `HomePage` (new-project composer + paginated project grid), `ProjectPage` (the main workspace, largest file), `LoginPage`, `SignupPage`, `SettingsPage`, `BillingPage`.
- `src/components/` — `ProjectComposer`, `ImageUploader`, `ProjectImageTile`, `Lightbox`, `ModelPicker`, `AspectRatioPicker`, `Dropdown`, `AccountMenu`, `ErrorBanner`, `Spinner`, `icons.tsx` (inline SVG icons).
- `src/constants.ts` — `TIME_OF_DAY_OPTIONS` / `WEATHER_OPTIONS` mirror backend enums exactly; `DEFAULT_LOCATION` fallback text.

## Key flows

- **Starting a project**: `POST /api/projects` returns immediately → navigate to `/projects/:id` → fire `/prompt` and `/title` independently → once the prompt resolves, fire one `/images/{index}` request **per image in parallel**, each filling its own loading placeholder as it completes.
- **Editing in project**: selection drives the backend branch (selected uploaded/reference image → GPT re-prompt + new images appended; otherwise Gemini edits selected/all generated images in place). The UI enables Send on an instruction *or* a parameter change alone, mirroring the backend rule — keep these in sync.
- **Images** are `<img src>` of signed URLs from the API, resolved with `imageUrl()`. Never request or embed base64.
- **Errors**: every non-2xx throws `ApiError` (`code`, `message`, `stage`, `fieldErrors`, and credit-limit details on `CREDIT_LIMIT`-style errors). Show them via `ErrorBanner`.
- **Auth calls** use `credentials: "include"` so the refresh cookie flows; authorized calls pass `accessToken` explicitly.
- Project deletion is soft on the backend; the project card offers undo via `/restore` (which can fail with `PROJECT_LIMIT_REACHED`).

## Conventions

- Dark mode only (by request). All colors/radii/shadows come from the CSS variables in `src/index.css` — don't hardcode colors.
- Function components + hooks, named exports, double quotes, semicolons. Context hooks live in their own `use*.ts` files.
- Comments explain *why* (often referencing backend behavior or a past bug); match that style.
- `verbatimModuleSyntax` is on — use `import type` for type-only imports. `noUnusedLocals/Parameters` are on.
- Commit messages: imperative, describe the user-visible change (see `git log`).
