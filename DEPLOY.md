# Shipping Recordcrate

Three stages: database, local check, deploy. About 20 minutes end to end.

---

## 1. Create the Supabase database

1. Go to [supabase.com](https://supabase.com) → **New project**. Pick a region near you
   and save the database password it generates — you need it in a moment.
2. In the project, go to **Project Settings → Database → Connection string → URI**.
3. You need *two* forms of that string. Supabase shows both under "Connection pooling":
   - **Pooled** (port `6543`) — what the app uses at runtime
   - **Direct** (port `5432`) — what migrations use

Put both in `.env.local`, replacing `[PASSWORD]` and `[PROJECT-REF]`:

```
DATABASE_URL="postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres"
```

The `?pgbouncer=true&connection_limit=1` on the pooled URL is not optional — without it
Prisma exhausts Supabase's connection pool from serverless functions.

Also set a real contact for MusicBrainz (it blocks fake User-Agents):

```
MB_CONTACT="your-email@example.com"
```

### Create the tables

```bash
npx prisma migrate deploy
```

The initial migration is already committed at
`prisma/migrations/20260819000000_init/`, so this just applies it. Verify with
`npm run db:studio`, which should show 6 tables: User, Account, Session,
VerificationToken, AlbumLog, Review.

> The old local SQLite database is **not** migrated — the schema moved to Postgres and
> any dev data stays behind. If you want your old library rows, say so and I'll write
> a one-off copy script.

---

## 2. Check it locally

```bash
npm run dev
```

Walk the core loop once:

1. `/register` → create an account → you land on `/login` with a confirmation
2. Sign in
3. Search `radiohead` → you should see their studio albums, oldest first, plus songs
4. Hover a cover → click **+** → set a status, drag the slider, **Save rating**
5. `/library` → the item is there with its rating; filters and sorting work
6. Click an album cover → tracklist and detail page load

First search after a cold start takes a couple of seconds (MusicBrainz is throttled to
one request per second, and search costs up to three). Repeat searches are cached for
an hour.

---

## 3. Deploy to Vercel

```bash
git push
```

Then at [vercel.com/new](https://vercel.com/new): import the repo, framework
auto-detects as Next.js, and add these environment variables:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | pooled Supabase URL (port 6543, with `?pgbouncer=true&connection_limit=1`) |
| `DIRECT_URL` | direct Supabase URL (port 5432) |
| `AUTH_SECRET` | `openssl rand -base64 32` — generate a **new** one for production |
| `AUTH_URL` | your deployed URL, e.g. `https://recordcrate.vercel.app` |
| `MB_CONTACT` | your email or site URL |

`prisma generate` runs automatically via the `postinstall` script, so the build works
without extra configuration.

### After the first deploy

- Register an account on the live site and confirm a rating saves and survives a reload.
  If ratings vanish, `DATABASE_URL` is wrong or still pointing at SQLite.
- If sign-in redirects to the wrong host, `AUTH_URL` is missing.
- Add GitHub OAuth later by setting `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET`; the
  provider is already wired up in `src/lib/auth.ts`.

---

## Rolling features back in

Everything cut for the MVP is described in `ARCHIVE.md` and preserved at the git tag
`pre-mvp-archive`. Ask: *"pull the location pages back in"* (or genre pages, artist
pages, decade pages, Wikipedia enrichment, the discover carousels…).

Cheapest and highest value first: **Wikipedia enrichment** (section 6), then
**artist pages** (section 4).
