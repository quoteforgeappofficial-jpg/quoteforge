# QuoteForge

QuoteForge is a SaaS application for creating and managing customer quotes,
estimates, and proposals.

This repository currently contains **project scaffolding plus an
authentication foundation** — routes, layout, configuration, Supabase-backed
signup/login/password-reset, and the `profiles`/`businesses` tables with Row
Level Security. No customer-facing business features (customers, estimates,
proposals) or third-party integrations (AI, payments, SMS, email) have been
implemented yet.

## Tech stack

- **Framework:** [Next.js](https://nextjs.org) (App Router) + [React](https://react.dev)
- **Language:** TypeScript
- **Styling:** [Tailwind CSS v4](https://tailwindcss.com) (CSS-first config — no `tailwind.config.js`; theme tokens live in `src/app/globals.css`)
- **Linting:** ESLint (`eslint-config-next`)
- **Database & Auth:** [Supabase](https://supabase.com) (PostgreSQL + Auth), with Row Level Security (RLS) for multi-tenant data isolation
- **Deployment:** [Vercel](https://vercel.com)
- **Source control:** GitHub

## Project structure

```
src/
  app/
    layout.tsx                    # Root layout (fonts, global metadata)
    page.tsx                       # Public landing page
    globals.css                     # Tailwind import + theme tokens
    (auth)/
      layout.tsx                   # Centered auth shell
      login/page.tsx                # /login
      signup/page.tsx               # /signup
      forgot-password/page.tsx      # /forgot-password
      reset-password/page.tsx       # /reset-password (requires a recovery session)
    auth/callback/route.ts         # Exchanges Supabase email links for a session
    dashboard/
      layout.tsx                   # Protected shell: requires auth, shows user + logout
      page.tsx                      # /dashboard — overview (placeholder)
      customers/page.tsx            # /dashboard/customers (placeholder)
      estimates/page.tsx            # /dashboard/estimates (placeholder)
      proposals/page.tsx            # /dashboard/proposals (placeholder)
      settings/page.tsx             # /dashboard/settings (placeholder)
  components/
    placeholder-section.tsx        # Shared "coming soon" placeholder UI
    ui/                             # Shared form building blocks (text-field, form-message, submit-button)
  lib/
    supabase/
      client.ts                    # Browser Supabase client (Client Components)
      server.ts                    # Server Supabase client (Server Components/Actions/Route Handlers)
      middleware.ts                # Session refresh + route protection, used by src/proxy.ts
      admin.ts                     # Service-role client — server-only, unused so far, for future privileged ops
    auth/
      actions.ts                   # Server Actions: signIn, signUp, signOut, requestPasswordReset, updatePassword
  proxy.ts                         # Next.js proxy (formerly "middleware") entry point
supabase/
  migrations/
    20260908120000_init_auth_foundation.sql   # profiles + businesses tables, RLS policies
docs/
  SUPABASE_SETUP.md                # Step-by-step Supabase project setup (Android-friendly)
```

Everything under `/dashboard` is protected: the middleware redirects
unauthenticated requests to `/login`, and the dashboard layout re-checks the
session server-side as a second line of defense. `/dashboard` itself still
renders placeholder content — no customer/estimate/proposal data exists yet.

## Authentication

Implemented with [`@supabase/ssr`](https://supabase.com/docs/guides/auth/server-side/nextjs),
the current Supabase-recommended approach for the Next.js App Router:

- **Signup / login / logout** — email + password, via Server Actions in
  `src/lib/auth/actions.ts`.
- **Email confirmation & password reset** — both use Supabase's emailed
  links, which redirect to `src/app/auth/callback/route.ts` to exchange a
  one-time code for a session before continuing to `/dashboard` or
  `/reset-password`.
- **Session handling** — `src/proxy.ts` (Next.js 16's renamed "middleware"
  convention) refreshes the session cookie on every request and enforces
  redirects (signed-out users away from `/dashboard`, signed-in users away
  from `/login`/`/signup`).

### Data model

```
auth.users (Supabase-managed)
    │  1:1
    ▼
profiles (id = auth.users.id, business_id, role)
    │  many:1
    ▼
businesses (the contractor/company account)
```

A new signup automatically gets a `businesses` row and an owner `profiles`
row via a database trigger (see the migration) — no client-side setup step
required. Because many `profiles` rows can share one `business_id`, this
already supports a business having multiple users once invites are built.

Row Level Security is enabled on both tables: a user can only see/update
their own profile, and only the business their profile belongs to. See the
migration file for the exact policies, and its trailing comment block for
the pattern future multi-tenant tables (`customers`, `estimates`, etc.)
should follow to stay consistently isolated per business.

## Getting started

### Prerequisites

- Node.js 20.9+ (this project was scaffolded with Node 22)
- npm
- A Supabase project — see [`docs/SUPABASE_SETUP.md`](./docs/SUPABASE_SETUP.md)
  for step-by-step setup, written for a phone-only workflow.

### Setup

```bash
# install dependencies
npm install

# copy the environment variable template
cp .env.example .env.local
```

Then fill in `.env.local` with real values from your Supabase project (see
`docs/SUPABASE_SETUP.md`). `.env.local` is git-ignored and must never be
committed.

### Run the dev server

```bash
npm run dev
```

The app will be available at `http://localhost:3000`. Without valid
Supabase credentials set, the public pages still render, but signup/login
and the dashboard will not work.

## Available scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the local development server |
| `npm run build` | Create a production build |
| `npm run start` | Run the production build locally |
| `npm run lint` | Run ESLint |

## Environment variables

See [`.env.example`](./.env.example) for the full list of variables this
project expects, and [`docs/SUPABASE_SETUP.md`](./docs/SUPABASE_SETUP.md)
for where to find each value and how to set it. Only variable *names* are
committed — real secrets belong in `.env.local` (local development), your
Claude Code environment's variable settings, or your Vercel project's
Environment Variables settings (deployed environments) — never in source
control.

`SUPABASE_SERVICE_ROLE_KEY` in particular bypasses Row Level Security and
must never be exposed to the browser or prefixed with `NEXT_PUBLIC_`.

## Database migrations

SQL migrations live in `supabase/migrations/`. Apply them either via the
Supabase Dashboard's SQL Editor (works from any browser, no CLI needed —
see `docs/SUPABASE_SETUP.md`) or, if you're working from a machine with the
[Supabase CLI](https://supabase.com/docs/guides/cli) installed, `supabase
db push`.

## Deployment

This project is intended to be deployed on Vercel, connected to this GitHub
repository. Environment variables must be configured in the Vercel project
settings before deploying a version that depends on Supabase.

## Status

- [x] Project scaffolding
- [x] Supabase client architecture (browser, server, admin)
- [x] Authentication (signup, login, logout, password reset)
- [x] `profiles` / `businesses` tables with Row Level Security
- [ ] Core business features (customers, estimates, proposals)
- [ ] Third-party integrations (AI, payments, SMS, email)
