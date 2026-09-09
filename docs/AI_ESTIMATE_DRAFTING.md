# AI-assisted estimate drafting (Phase 5)

Lets a contractor describe a job in plain English on the New Estimate page
and get back a structured draft — title, customer-facing scope, and
suggested labor/materials/equipment/other line items — to review and edit
before saving. The contractor always presses **Create estimate** themselves;
nothing is saved automatically by generating a draft.

## What this does *not* do

- **It never sets prices.** The AI response schema
  (`src/lib/ai/schema.ts`) has no field for unit cost, markup, minimum
  price, final price, or profit — there is no code path from an AI
  response to any pricing field in the app. Markup, minimum job price,
  and final selling price are only ever set by the contractor, exactly as
  before this phase.
- **It doesn't touch the database directly.** The Server Action
  (`generateEstimateDraft` in `src/lib/estimates/ai-actions.ts`) only
  returns a draft to the browser to pre-fill the existing New Estimate
  form. Saving still goes through the same `createEstimate` Server Action
  and `estimates`/`estimate_line_items` tables from Phase 4 — no new
  tables, no separate "AI draft" storage, and nothing about a prompt or
  response is written to the database.
- **It doesn't affect the Edit flow.** AI drafting only appears on New
  Estimate; editing an existing estimate is unchanged.

## 1. Get an Anthropic API key

**ANDROID ACTION:**
1. Go to [console.anthropic.com](https://console.anthropic.com) and sign
   in (or create an account).
2. Open **Settings → API Keys** and create a new key.
3. Copy it — this is your `ANTHROPIC_API_KEY`.
   ⚠️ Treat it like a password: never paste it into a browser console, a
   public repo, or share it. It is a server-side secret and must never be
   prefixed with `NEXT_PUBLIC_` or referenced from a Client Component.

## 2. Set the environment variable

Same two options as the Supabase credentials in
[`SUPABASE_SETUP.md`](./SUPABASE_SETUP.md) — add `ANTHROPIC_API_KEY`
alongside the existing Supabase variables:

- **Preferred:** add it in the Claude Code environment's **Environment
  Variables** settings (or your deployment platform's env var settings),
  so it never passes through this chat.
- **Alternative:** ask Claude Code to write it into a local `.env.local`
  (already git-ignored).

**For Vercel:** add `ANTHROPIC_API_KEY` under your Vercel project →
**Settings → Environment Variables**, same as the Supabase variables —
local and Vercel env vars are separate.

## 3. Nothing to run in Supabase

No new migration for this phase — see the note at the bottom of this doc
for why. If you've already applied the Phase 3/4 migrations, there is
nothing further to do on the database side for AI drafting to work.

## 4. Try it

1. Go to **Dashboard → Estimates → New estimate**.
2. Under **Describe the job**, type a plain-English description (e.g. "Clean
   up an overgrown backyard, two workers for about six hours, haul away
   debris, probably need 30 bags and rent a trailer.").
3. Press **Generate estimate draft**.
4. Review the populated title, scope, and line items — and any
   "Assumptions" / "Questions to confirm" shown below the button. Edit,
   add, or remove anything freely.
5. Fill in unit costs, markup, minimum job price, and final selling price
   yourself — the AI never sets these.
6. Press **Create estimate** to save, same as a manually-built estimate.

If `ANTHROPIC_API_KEY` isn't set, pressing Generate shows a friendly
"AI drafting isn't available right now" message — the rest of the form
(and the rest of the app) works normally either way.

## Model and cost

Uses `claude-haiku-4-5` (Anthropic's current lowest-cost model) with a
short, fixed system prompt and a ~2K output token cap per request — one
call per "Generate" press, no follow-up calls. To change the model later,
edit the single `MODEL_ID` constant in `src/lib/ai/provider.ts`; nothing
else in the app needs to change, since everything else depends on the
`EstimateDraftProvider` interface in that file, not on Anthropic
specifically.

## Why no new database migration

The `estimate_line_items` table (Phase 4) has no `unit` column, and this
phase doesn't add one. The AI's suggested `unit`, `needsContractorInput`,
and `note` fields are drafting-only metadata — they're folded into the
line item's editable description text on the way into the form (see
`src/lib/estimates/ai-line-item-transform.ts`) rather than persisted
anywhere, so nothing about them requires a schema change. If a future
phase wants these as first-class, queryable columns, that would be a
deliberate follow-up migration, not something this phase needed.
