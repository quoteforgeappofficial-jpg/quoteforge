# QuoteForge

QuoteForge is a SaaS application for creating and managing customer quotes,
estimates, and proposals.

This repository currently contains **project scaffolding only** — routes,
layout, and configuration. No business logic, database schema, or third-party
integrations (AI, payments, SMS, email) have been implemented yet.

## Tech stack

- **Framework:** [Next.js](https://nextjs.org) (App Router) + [React](https://react.dev)
- **Language:** TypeScript
- **Styling:** [Tailwind CSS v4](https://tailwindcss.com) (CSS-first config — no `tailwind.config.js`; theme tokens live in `src/app/globals.css`)
- **Linting:** ESLint (`eslint-config-next`)
- **Database & Auth:** [Supabase](https://supabase.com) (PostgreSQL + Auth), with Row Level Security (RLS) planned for multi-tenant data isolation
- **Deployment:** [Vercel](https://vercel.com)
- **Source control:** GitHub

Supabase and Vercel are architecture decisions for this project, but no
Supabase client code, database schema, or Vercel-specific config has been
added yet — that comes in a later step.

## Project structure

```
src/
  app/
    layout.tsx              # Root layout (fonts, global metadata)
    page.tsx                 # Public landing page
    globals.css               # Tailwind import + theme tokens
    dashboard/
      layout.tsx             # Shared dashboard shell (nav sidebar)
      page.tsx                # /dashboard — overview (placeholder)
      customers/page.tsx      # /dashboard/customers (placeholder)
      estimates/page.tsx      # /dashboard/estimates (placeholder)
      proposals/page.tsx      # /dashboard/proposals (placeholder)
      settings/page.tsx       # /dashboard/settings (placeholder)
  components/
    placeholder-section.tsx  # Shared "coming soon" placeholder UI
```

All routes under `/dashboard` currently render placeholder content only —
no data fetching, authentication, or Supabase calls yet. Authentication,
Supabase queries, and RLS-backed data access will be added in a later step,
at which point `/dashboard` and its sub-routes will be protected.

## Getting started

### Prerequisites

- Node.js 20.9+ (this project was scaffolded with Node 22)
- npm

### Setup

```bash
# install dependencies
npm install

# copy the environment variable template
cp .env.example .env.local
```

Then open `.env.local` and fill in real values once a Supabase project
exists (not required yet — the app does not call Supabase at this stage).
`.env.local` is git-ignored and must never be committed.

### Run the dev server

```bash
npm run dev
```

The app will be available at `http://localhost:3000`.

## Available scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the local development server |
| `npm run build` | Create a production build |
| `npm run start` | Run the production build locally |
| `npm run lint` | Run ESLint |

## Environment variables

See [`.env.example`](./.env.example) for the full list of variables this
project expects. Only variable *names* are committed — real secrets belong
in `.env.local` (local development) or in your Vercel project's Environment
Variables settings (deployed environments), never in source control.

## Deployment

This project is intended to be deployed on Vercel, connected to this GitHub
repository. Environment variables must be configured in the Vercel project
settings before deploying a version that depends on Supabase.

## Status

- [x] Project scaffolding (this step)
- [ ] Supabase client setup and database schema
- [ ] Authentication
- [ ] Row Level Security policies for multi-tenant isolation
- [ ] Core business features (customers, estimates, proposals)
- [ ] Third-party integrations (AI, payments, SMS, email)
