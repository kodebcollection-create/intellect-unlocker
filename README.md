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

## Hosting

This app deploys natively on Lovable:

1. Click **Publish** in the Lovable editor (top-right).
2. Your app goes live at `<project>.lovable.app`.
3. Frontend changes require clicking **Update** in the publish dialog. Backend changes (server functions, migrations) deploy automatically.
4. Optional: connect a custom domain in **Project Settings → Domains** (after first publish).

### Required services (already provisioned via Lovable Cloud)

- Postgres database with all tables, RLS, and seed data
- Auth (email/password + Google OAuth via the managed broker)
- Storage bucket `book-pdfs` (private; signed URLs valid 1 hour)
- AI Gateway (`LOVABLE_API_KEY` auto-provisioned)

No external accounts or API keys to manage.

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
