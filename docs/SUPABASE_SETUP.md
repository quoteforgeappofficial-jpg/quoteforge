# Connecting QuoteForge to Supabase

The app's code (Supabase clients, auth pages, middleware, RLS policies) is
already written and expects a Supabase project to exist. This doc walks
through creating that project and wiring it up — all of it doable from a
phone browser, no desktop or terminal required except where noted.

Every step that happens outside Claude Code is labeled **ANDROID ACTION**.

## 1. Create a Supabase project

**ANDROID ACTION:**
1. In your phone's browser, go to [supabase.com](https://supabase.com) and
   sign in (or create an account).
2. Create a new project. Pick any name (e.g. "QuoteForge") and a strong
   database password — save that password somewhere safe (a password
   manager), you won't need it for this setup but it's your Postgres
   superuser password.
3. Pick a region close to your users. Wait for the project to finish
   provisioning (a minute or two).

## 2. Collect your API credentials

**ANDROID ACTION:**
1. In the Supabase dashboard, open your project → **Project Settings** →
   **API**.
2. Copy three values, you'll need all of them:
   - **Project URL** → this is `NEXT_PUBLIC_SUPABASE_URL`
   - **anon / public key** → this is `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role key** → this is `SUPABASE_SERVICE_ROLE_KEY`
     ⚠️ This key bypasses Row Level Security. Treat it like a password —
     never paste it into a browser console, a public repo, or share it.

## 3. Set the environment variables

You have two options. **Option A is preferred** because the values never
pass through this chat.

### Option A — set them in the Claude Code environment (preferred)

**ANDROID ACTION:**
1. In the Claude Code web/mobile interface, open this environment's
   settings (the environment this session is running in).
2. Find **Environment Variables** and add:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_SITE_URL` — set this to your Vercel deployment URL once
     you have one (e.g. `https://quoteforge.vercel.app`); use
     `http://localhost:3000` for now if you're not deployed yet.
3. Save. These will be available automatically the next time a session
   runs in this environment — no `.env.local` file needed for that
   session's dev server.

### Option B — tell Claude Code the values directly

If Option A isn't available to you, paste the four values into the chat
and ask Claude Code to write them into a local `.env.local` file (that
file is already git-ignored, so it won't be committed). Note that the
values will then exist in this conversation's transcript — fine for a
personal project, but Option A is cleaner if you have access to it.

### For Vercel deployments

**ANDROID ACTION:** Whichever option you used above, also add the same
four variables in your Vercel project → **Settings** → **Environment
Variables**, once the project is connected to Vercel. Local env vars and
Vercel's env vars are separate — setting one does not set the other.

## 4. Run the database migrations

Each file in `supabase/migrations/` must be run once, **in filename
order** (each one assumes the previous ones already ran):

```
supabase/migrations/20260908120000_init_auth_foundation.sql   -- businesses, profiles, RLS
supabase/migrations/20260909100000_customers.sql               -- customers, RLS
```

**ANDROID ACTION — run each one via the Supabase SQL Editor (works fine
on mobile, no CLI needed):**
1. In the Supabase dashboard, open **SQL Editor**.
2. Open a migration file above (ask Claude Code to show you its
   contents, or view it on GitHub) and copy its full contents.
3. Paste into a new query in the SQL Editor and click **Run**.
4. Confirm it succeeded with no errors, then repeat for the next
   migration file. You should end up with `businesses`, `profiles`, and
   `customers` tables under **Table Editor**, all with RLS enabled.

*(Alternative for later: if you ever work from a desktop with the
[Supabase CLI](https://supabase.com/docs/guides/cli) installed, `supabase
db push` applies every migration in this folder the same way.)*

## 5. Configure auth redirect URLs

The signup, email-confirmation, and password-reset flows redirect back to
`/auth/callback` on your own domain. Supabase only allows redirects to
URLs you've explicitly allow-listed.

**ANDROID ACTION:**
1. In the Supabase dashboard: **Authentication** → **URL Configuration**.
2. Set **Site URL** to your app's primary URL (your Vercel URL once
   deployed; `http://localhost:3000` while only testing locally).
3. Under **Redirect URLs**, add:
   - `http://localhost:3000/auth/callback` (local dev)
   - `https://<your-vercel-domain>/auth/callback` (production, once you
     have a Vercel URL)

## 6. Test it

Once steps 1–5 are done and `npm run dev` is running with the env vars
available:

1. Visit `/signup`, create an account.
2. Check the confirmation email (Supabase sends it via its own mailer by
   default — check spam if it's not in your inbox) and click the link.
3. You should land on `/dashboard`, signed in.
4. Try `/forgot-password` → follow the emailed link → you should land on
   `/reset-password` able to set a new password.
5. Confirm `/dashboard` redirects to `/login` when you're signed out, and
   that `/login` redirects to `/dashboard` when you're already signed in.

## What these migrations do **not** do yet

No `estimates`, `estimate_items`, or `proposals` tables exist yet — those
come in a later phase. The auth-foundation migration set up the
`public.current_business_id()` helper, which the `customers` migration
(and every future business-scoped table) reuses for its RLS policy, so
multi-tenant isolation stays consistent across all of them.
