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
- `src/components/` — `ProjectComposer`, `ImageUploader`, `ProjectImageTile`, `Lightbox`, `ModelPicker`, `AspectRatioPicker`, `Dropdown`, `AccountMenu`, `ErrorBanner`, `Spinner`, `MaterialsPanel` + `MaterialOverlay` + `MaterialAreaEditor` + `GenerateFromPhotoDialog` (material concept, below), `icons.tsx` (inline SVG icons).
- `src/constants.ts` — `TIME_OF_DAY_OPTIONS` / `WEATHER_OPTIONS` mirror backend enums exactly; `DEFAULT_LOCATION` fallback text.

## Key flows

- **Project page layout**: three columns - the user's photos on the left (selectable, "+ Add photo"), only the renders
  in the middle, and the original photo with its materials on the right (`MaterialsPanel`). Either side column can be
  hidden from the header (remembered in localStorage); they scroll without a visible scrollbar. Below 1100px the photos
  become a strip on top and the panel stacks under the renders. The title (`ProjectTitle`) sits beside the back arrow:
  the API's suggestion from the original photo until the user clicks it and renames it (`PATCH /api/projects/{id}`).
  While reviewing, the original is height-capped to the viewport (`MaterialOverlay`'s `maxHeight`).
- **Starting a project**: `POST /api/projects` returns immediately with **no image slots** → navigate to `/projects/:id`
  → fire `/prompt` and `/title` independently. The first photo is the original (`concept.conceptReferenceIndex`).
- **Material review (on the user's photo)**: `/prompt` picks up to 5 materials; the page re-reads the project, then
  `/materials/label` maps them on the original photo, shown large in the middle while `conceptApproved` is false.
  The panel renames (blur/Enter), adds (up to `MAX_MATERIALS` = 8, then opens the area editor already drawing) and
  deletes materials. **Approve materials** → `/concept/approve` (generates nothing) → `GenerateFromPhotoDialog` (every
  setting editable) → an ordinary `/edit` selecting the original. "Not now" leaves an empty-state button for later.
  **Try again** → `/concept/retry` and the prompt step runs again. Projects with no materials are approved at the
  prompt step, which opens the dialog straight away.
- **Editing in project**: selection drives the backend branch (selected photo, or nothing selected → a new batch of
  images appended; only renders selected → Gemini edits exactly those in place). The UI enables Send on an instruction
  *or* a parameter change alone, mirroring the backend rule — keep these in sync. Each render carries
  `sourceReferenceIndex`, shown as a "Photo N" badge.
- **Added photos wait for Generate**: uploading selects the new photo(s), focuses the input and pre-selects "As image";
  nothing renders until the user presses Generate.
- **"As image" aspect ratio** (`AS_IMAGE` in `src/aspectRatio.ts`): a UI-only choice resolved to the supported ratio
  nearest the photo being rendered (the first selected photo, else the original; measured from thumbnails, which keep
  their proportions). Requests always carry a concrete ratio. The home composer defaults to it for the original.
- **Downloads**: each render (tile on hover, and the lightbox) links to `imageDownloadUrl()` - the signed URL with
  `&download=<name>`; "Download all" fetches `GET /api/projects/{id}/download` with the token and saves the zip
  (`saveBlob`).
- **Older projects** (materials on a generated image, `conceptImageId`) and open `/images/{index}` slots still work.
- **Material overlay**: `MaterialOverlay` marks each material's polygons with an even dot grid (pitch ~width/80, 8-14 px) over the untouched image
  (dots only, no outline or tint; measured pixel space so dots stay round; smaller materials masked out of larger ones), enlarging the
  hovered/selected one and dimming the rest. Hover/selection state lives in `ProjectPage` so the list and the image
  stay in sync. Images labelled before outlines existed fall back to filling their box. Colours: `--color-material-1..8`.
- **Area editor**: "Edit areas" in the panel opens `MaterialAreaEditor` (modal, concept image full size): drag areas or
  points, double-click an edge to add a point, Delete removes a point then the area, Add area draws a new polygon,
  Ctrl+Z undoes (history in a ref - StrictMode double-runs state updaters). Each change autosaves, debounced per
  material, via `PUT /materials/{id}/areas`. Keys are captured at the window so the page's Delete-images shortcut
  never fires underneath. The areas steer generation: the API draws them into a material map that GPT reads.
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
