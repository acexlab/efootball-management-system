# E-Football Club Management System

A high-end cyberpunk esports dashboard built with Next.js App Router, Tailwind CSS, Motion, and Supabase Auth.

## Run locally

```bash
npm install
npm run dev
```

## Supabase config

The app is already wired to this Supabase project in `.env.local`:

- Project ID: `tganiweppfstinjhtzkl`
- URL: `https://tganiweppfstinjhtzkl.supabase.co`
- Publishable key: configured as `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

If you want to recreate the env manually:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://tganiweppfstinjhtzkl.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_lOqWcX_WVKYVAOVKbPPT5w_yO9LSzhE
```

## Google sign-in setup

The home page now uses `Continue with Google` through Supabase Auth.

In your Supabase dashboard, do this:

1. Go to `Authentication > Sign In / Providers`
2. Enable `Google`
3. Paste your Google `Client ID` and `Client Secret`
4. Save changes

In Google Cloud, configure the OAuth app like this:

1. `Authorized JavaScript origins`
   Add `http://localhost:3000`
2. `Authorized redirect URIs`
   Add `https://tganiweppfstinjhtzkl.supabase.co/auth/v1/callback`

In Supabase, also check:

1. `Authentication > URL Configuration`
2. `Site URL` should be `http://localhost:3000`
3. Add `http://localhost:3000` under `Redirect URLs`

## What changed

- The home page now shows Google sign-in and the club leaderboard only.
- Signing in uses Supabase Google OAuth.
- After signing in, use `Seed Data to Supabase` on the dashboard to write the club rows.
- If the database table is missing, or RLS blocks writes, the app falls back to local club data and shows the SQL you need.

## Manual database setup

If `club_leaderboard` does not exist in Supabase yet, open the Supabase SQL Editor and run:

1. Open the Supabase dashboard for project `tganiweppfstinjhtzkl`
2. Go to `SQL Editor`
3. Open [supabase/manual-setup.sql](supabase/manual-setup.sql)
4. Paste the full file contents into the editor
5. Run it once
6. Sign in to the app with Google
7. Click `Seed Data to Supabase` on the dashboard

## Full role-based schema

To enable the wider role-based club system from the latest build, run [supabase/full-management-setup.sql](supabase/full-management-setup.sql) after `manual-setup.sql`.

That script adds:

- `profiles` with `Super Admin`, `Admin`, `Captain`, and `Player`
- automatic profile creation after auth signup
- `tournaments`
- `tournament_players`
- `matches`
- role-aware RLS policies for management flows

## Included views

- Dashboard home with Supabase login + club leaderboard
- Tournaments
- Matches
- Players
- League leaderboard
- Reports
- Settings
- Result entry

## Notes

- Remote football photography is loaded from Pexels.
- The dashboard uses local fallback data until Supabase auth and the `club_leaderboard` table are ready.
