# Walkthru

Record your screen and camera, share a link instantly, and collect timestamped feedback. AI transcripts, summaries and chapters are built in.

## Features

- Record screen + camera, screen only, or camera only, right in the browser
- Shareable link the moment you stop recording
- Comments pinned to exact timestamps, with markers on the timeline
- Emoji reactions and view counts
- Live speech transcript (Chrome and Edge), turned into a summary and chapters

## Stack

Next.js (App Router), TypeScript, Tailwind CSS, Supabase (auth, Postgres, storage), deployed on Vercel.

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in your Supabase values
npm run dev
```

### Environment variables

| Name | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Your Supabase publishable key |
| `ANTHROPIC_API_KEY` | Optional. Enables Claude-written summaries and chapters. Without it a simple extractive fallback is used. |

### Supabase setup

1. Create a project and apply the schema (tables `profiles`, `videos`, `comments`, `reactions`, the `increment_view` function, and a public `recordings` storage bucket, all with row-level security).
2. In Authentication → URL Configuration, set the Site URL to your deployed URL and add `<your-url>/**` to Redirect URLs.

## Notes

This project uses a recent Next.js with Cache Components enabled. Pages that read the user session export `instant = false`, and `src/proxy.ts` (formerly middleware) refreshes auth sessions.
