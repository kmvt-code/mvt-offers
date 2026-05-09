# MVT Offer Library

Internal offer library for Montecito Village Travel. Forward offers to a dedicated email address, AI parses them, they appear on a searchable website.

## Architecture

- **Next.js** site hosted on **Vercel** (free)
- **Supabase** for the offer database (free)
- **HubSpot Files** for attachment storage (already paid for)
- **Make.com** for the email-to-database pipeline (free or $9/month)
- **Anthropic Claude** for parsing messy supplier emails (~$0.01/email)

## Quick start

See `SETUP_GUIDE.md` for the complete walkthrough.

## Project structure

```
mvt-offers/
├── app/                    # Next.js routes
│   ├── page.js             # Public homepage with offer list
│   ├── offer/[id]/page.js  # Individual offer detail page
│   ├── admin/              # Admin dashboard (password-protected)
│   ├── api/                # Backend endpoints
│   │   ├── admin/          # Admin actions (login, update offers)
│   │   └── ingest/         # Webhook called by Make.com
│   ├── globals.css         # All styles
│   └── layout.js
├── components/             # React components
├── lib/                    # Supabase client and auth helpers
├── supabase/
│   └── schema.sql          # Database schema (run in Supabase SQL editor)
├── make/
│   ├── claude_prompt.txt   # System prompt for offer extraction
│   └── scenario_blueprint.json  # Reference for Make.com setup
├── .env.local.example      # Template for environment variables
└── SETUP_GUIDE.md          # Step-by-step setup instructions
```

## Environment variables

Required in Vercel (and locally for development):

- `NEXT_PUBLIC_SUPABASE_URL` — your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — public Supabase key
- `SUPABASE_SERVICE_ROLE_KEY` — secret Supabase key (server-side only)
- `ADMIN_PASSWORD` — password for accessing /admin
- `ADMIN_SESSION_SECRET` — random string for signing session cookies
- `INGEST_SECRET` — shared secret between Make.com and the site
