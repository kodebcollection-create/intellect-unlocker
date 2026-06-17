# Umbra — The Dark Influence Library

A sequential 30-book reading curriculum on psychological influence, dark triad dynamics, and interpersonal defense. Built on TanStack Start, React 19, Tailwind v4, and Lovable Cloud (PostgreSQL + auth + storage + AI gateway).

## Features

- **Sequential unlock** — Book *n+1* is locked until you pass the quiz for book *n*.
- **AI-generated quizzes** — 15 multiple-choice questions per book, generated from the uploaded PDF via Lovable AI (Google Gemini). Pass with ≥70% to advance.
- **Built-in reader** — PDF viewer with bookmarks, highlights (4 colors), notes, vocabulary builder, adjustable font size, chapter/page navigation.
- **Offline page tracking** — Enter the page number you're on when reading offline; progress syncs to the cloud.
- **Auto-bookmark / resume across devices** — Last-read page persists per user, per book.
- **Reading themes** — Dark (default), Light, and Sepia.
- **Admin dashboard** — Upload, replace, and delete PDFs per book; regenerate quizzes on demand.
- **Mobile + desktop** — Responsive layout from phone to widescreen.

## Roles

- **user** — Default role on signup. Reads books in order, takes quizzes, manages personal notes/vocab.
- **admin** — Uploads PDFs and generates quizzes. The first user can self-claim admin in the Admin dashboard. After that, additional admins must be granted via SQL (`INSERT INTO user_roles (user_id, role) VALUES ('<uuid>', 'admin')`).

## Categories & Books

Six categories, five books each, in fixed order:

1. Foundations of Influence
2. Dark Triad Dynamics
3. Manipulation Tactics
4. Interpersonal Defense
5. Cognitive Reframing
6. Mastery & Application

All 30 books are seeded as placeholders. Replace titles, authors, and descriptions in the `books` table via SQL or extend the admin dashboard.

## Local Development

### Prerequisites

- [Node.js](https://nodejs.org/) 20+ (LTS recommended)
- [Bun](https://bun.sh/) 1.2+ (preferred package manager for this project)
- A Lovable Cloud project (database + auth + storage already provisioned)

### 1. Clone / download the codebase

If you downloaded the ZIP, extract it and `cd` into the folder.

### 2. Install dependencies

```bash
bun install
```

If you don't have Bun, you can use `npm install` — but the lockfile is `bun.lock`, so Bun is recommended.

### 3. Environment variables

Copy `.env` to `.env.local` (or keep `.env` if it already exists). The required variables are:

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<anon-key>
VITE_SUPABASE_PROJECT_ID=<project-ref>
VITE_LOVABLE_API_KEY=<lovable-ai-key>
```

These are **auto-filled** by Lovable Cloud when you work inside the Lovable editor. If you run the project outside Lovable, you must supply them manually from your Cloud settings.

### 4. Run the dev server

```bash
bun dev
```

The app starts at `http://localhost:3000` by default.

### 5. Build for production

```bash
bun run build
```

This outputs a production bundle ready for the Cloudflare Workers runtime that TanStack Start targets.

### Common issues

- **Port 3000 in use** — Vite will try the next available port automatically, or set `PORT=3001 bun dev`.
- **Missing `@lovable.dev/cloud-auth-js`** — Make sure you ran `bun install`; this package is scoped to the Lovable registry.
- **Database connection errors outside Lovable** — The app expects the Supabase URL + key to be valid. If running locally with your own Supabase project, run the migrations in `supabase/migrations/` against your database first.

## Hosting

This app deploys natively on Lovable:

1. Click **Publish** in the Lovable editor (top-right).
2. Your app goes live at `<project>.lovable.app`.
3. Frontend changes require clicking **Update** in the publish dialog. Backend changes (server functions, migrations) deploy automatically.
4. Optional: connect a custom domain in **Project Settings → Domains** (after first publish).

### Self-hosting

If you want to host outside Lovable, you will need:
- A Supabase project (Postgres + Auth + Storage)
- A Cloudflare Workers account (TanStack Start v1 targets Workers)
- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `LOVABLE_API_KEY` set as secrets in your hosting environment

Run the SQL migrations in `supabase/migrations/` in order against your Postgres database. Then deploy the built output (`dist/`) to your Workers-compatible host.

## Admin Dashboard

After signing in, navigate to **`/admin`** in the app.  

- The **first user** can click **Claim admin rights** to become an admin.
- Once claimed, no one else can self-claim; additional admins must be added by an existing admin via the database (`INSERT INTO user_roles (user_id, role) VALUES ('<uuid>', 'admin')`).

In the admin dashboard you can:
1. **Upload / Replace PDF** for each of the 30 books.
2. **Generate quiz** — AI reads the PDF and creates 15 multiple-choice questions.
3. **Delete PDF** if you want to re-upload a corrected version.

## First-run checklist

1. Sign up with any email/password or Google.
2. Visit **/admin** and click **Claim admin rights** (only works for the very first claimer).
3. For each book, upload a PDF, then click **Generate quiz** — Gemini reads the PDF and writes 15 questions.
4. Sign up a second user to verify the sequential-unlock flow.

## Tech stack

- TanStack Start v1 (SSR React framework on Cloudflare Workers)
- React 19 + Tailwind CSS v4 (CSS-first config, oklch tokens)
- Lovable Cloud (Postgres + Auth + Storage)
- Lovable AI Gateway (Google Gemini 2.5 Flash for quiz generation)
- shadcn/ui, lucide-react, sonner
