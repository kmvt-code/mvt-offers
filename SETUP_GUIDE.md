# MVT Offer Library — Setup Guide

A complete, self-hosted offer library that turns forwarded emails into a searchable internal site. No company approval required.

## What you're building

- Public site at `mvt-offers.vercel.app` (no login required, hidden from search engines)
- Forward any offer to your generated mailhook address → the offer appears on the site within minutes
- Internal MVT emails (from `@montecitovillagetravel.com` or `@ytc.com`) auto-publish if all 4 required fields are present
- Partner submissions and incomplete internal submissions go to a review queue
- Admin dashboard at `mvt-offers.vercel.app/admin` (password-protected) for approving and editing
- Email notifications when something needs review

## Required fields for auto-publish

These five must be present for an internal-sender offer to publish without review:

1. Vendor
2. Offer Overview
3. Audience
4. Offer End Date
5. Contact

Anything missing one of these goes to your review queue regardless of source.

## Vendor contact memory

The system learns each vendor's contact over time. The first time you approve an AmaWaterways offer with Jane Smith as the contact, it's saved. Next time an AmaWaterways email comes in without a contact, Jane is filled in automatically. If a future email contains a *different* contact email than what's saved, you'll be asked to pick during review.

You can view and edit all saved contacts in the **Vendor Contacts** tab of the admin dashboard.

### Internal contact filter

Many offers will be forwarded by someone at MVT — that forwarder's address is NEVER saved as the vendor contact. The system filters out any email address ending in `@montecitovillagetravel.com` or `@ytc.com` at three levels:

1. **AI extraction** — Claude is instructed to ignore internal addresses when finding a contact in the email
2. **Ingest validation** — even if Claude returns one, the server strips it before saving
3. **Memory storage** — disallowed internal addresses can never be written to the vendor contacts table

The single exception is `marketing@ytc.com`, which IS allowed as the contact for offers run by MVT itself.

## Date-window publishing

Offers are only visible on the public site between their start and end dates. Forward an offer in April that goes live May 1 → it sits in the database, shows in admin as "Scheduled," but doesn't appear publicly until May 1. After the end date it auto-disappears from the public site (still visible in admin).

## Architecture

```
Forwarded email
    ↓
Make.com mailhook
    ↓
Upload attachments to HubSpot Files
    ↓
Send email + attachment URLs to Claude API
    ↓
Claude returns JSON array of structured offers (handles multi-offer emails)
    ↓
POST to /api/ingest on Vercel site
    ↓
Site checks sender domain + required fields
    ↓
Insert into Supabase as 'published' or 'pending_review'
    ↓
Live on the site within 60 seconds
```

## Total time to set up: 2-3 hours

You'll be clicking through five accounts. Have these tabs open:

1. https://supabase.com (database + storage)
2. https://github.com (code hosting)
3. https://vercel.com (site hosting)
4. https://make.com (email pipeline)
5. https://console.anthropic.com (Claude API key)

You may also need:

6. https://app.hubspot.com (you already have this)

---

## Step 1 — Generate two random passwords

You'll need two long random strings during setup. Generate them now and keep them in a notes document.

Go to https://1password.com/password-generator/ and set:
- Length: 40 characters
- Check "Letters" and "Digits" only

Generate **three** of these. Label them:
- ADMIN_PASSWORD (this is what you'll type to log in to /admin)
- ADMIN_SESSION_SECRET
- INGEST_SECRET

You will paste these in several places throughout setup.

---

## Step 2 — Set up Supabase (database)

1. Go to https://supabase.com and sign up with your email (free tier is plenty).
2. Create a new project. Name it `mvt-offers`. Pick the closest region. Set a strong database password and save it.
3. Wait ~2 minutes for the project to provision.
4. Once ready, go to **SQL Editor** (left sidebar).
5. Click **New query**.
6. Open the file `supabase/schema.sql` from this package, copy its contents, paste into the SQL editor, and click **Run**.
7. You should see "Success. No rows returned." That's correct — the schema was created.
8. Now go to **Project Settings → API** (gear icon, lower left).
9. Copy these three values into your notes document:
   - **Project URL** (looks like `https://abc123.supabase.co`)
   - **anon public** key (long JWT string)
   - **service_role** key (different long JWT string — keep this secret, treat it like a password)

---

## Step 3 — Set up the GitHub repo

1. Go to https://github.com and sign up if you haven't.
2. Create a new repository called `mvt-offers`. Make it private. Don't initialize with a README.
3. On your computer, install Node.js if you haven't (https://nodejs.org, get the LTS).
4. Open Terminal/Command Prompt and run:
   ```
   cd ~/Downloads
   ```
   (or wherever you've downloaded this package)
5. Initialize and push the code:
   ```
   cd mvt-offers
   git init
   git add .
   git commit -m "Initial setup"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/mvt-offers.git
   git push -u origin main
   ```
   (Replace YOUR_USERNAME with your GitHub username. You may be prompted to authenticate.)

---

## Step 4 — Deploy to Vercel

1. Go to https://vercel.com and sign up using your GitHub account.
2. Click **Add New → Project**.
3. Import the `mvt-offers` repository.
4. Before clicking Deploy, click **Environment Variables** and add all of these:

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | (your Supabase Project URL from step 2) |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | (anon public key from step 2) |
   | `SUPABASE_SERVICE_ROLE_KEY` | (service_role key from step 2) |
   | `ADMIN_PASSWORD` | (the password you generated in step 1) |
   | `ADMIN_SESSION_SECRET` | (the session secret from step 1) |
   | `INGEST_SECRET` | (the ingest secret from step 1) |

5. Click **Deploy**. Wait ~1 minute.
6. Once deployed, click the URL Vercel gives you (something like `mvt-offers-abc123.vercel.app`).
7. You should see the empty offer library. Visit `/admin/login`, paste your ADMIN_PASSWORD — you should see the empty admin dashboard.

If you want to lock in a cleaner URL, in Vercel go to **Settings → Domains** and add a custom subdomain, or rename the project to make the auto-generated URL `mvt-offers.vercel.app` directly.

---

## Step 5 — Get your Claude API key

1. Go to https://console.anthropic.com and sign up.
2. Add a payment method under **Billing**. Add $20 in credits (this will last months).
3. Go to **API Keys** → **Create Key**. Name it "MVT Offer Library."
4. Copy the key (starts with `sk-ant-`) and save it in your notes document.

---

## Step 6 — Configure HubSpot Files

1. In HubSpot, go to **Library → Files**.
2. Click **New folder**, name it `Offer Attachments`.
3. That's it. Make.com will upload here automatically once connected.

---

## Step 7 — Set up Make.com

This is the most clicking-intensive step but follows a pattern.

1. Go to https://make.com and sign up. Free tier is 1,000 ops/month which covers ~300 offers.
2. Click **Create a new scenario**.

### Module 1: Mailhook trigger

1. Click the big circle in the canvas. Search for **Mailhook → Receive an email**.
2. Click **Add** to create a new mailhook. Name it `MVT Offers`.
3. Make.com will generate an email address like `xyz123abc@hook.us2.make.com`. **Copy this — this is your offers@ address.** Save it in your notes.
4. Click **OK**.

### Module 2: Iterator (split attachments)

1. Click the `+` next to module 1. Search for **Flow Control → Iterator**.
2. In "Array," click the field, then in the Variables panel pick `1. Attachments` from the mailhook.

### Module 3: HubSpot — Upload a File

1. Add a new module. Search for **HubSpot → Upload a File**.
2. Connect your HubSpot account (OAuth login).
3. Configure:
   - **Source File** → File data: from iterator (variable `2.Data`); File name: from iterator (variable `2.File Name`)
   - **Folder**: select `Offer Attachments`
   - **Access**: `PUBLIC_INDEXABLE`
   - **Duplicate validation strategy**: `REJECT`

### Module 4: Array Aggregator (collect uploaded URLs)

1. Add **Flow Control → Array aggregator**.
2. **Source Module**: select Iterator (module 2)
3. **Aggregated fields**: just `URL` from the HubSpot upload step
4. This bundles all attachment URLs into a single array.

### Module 5: Anthropic Claude — Create a Message

1. Add **Anthropic Claude → Create a Message**.
2. Connect: paste your Claude API key from step 5.
3. **Model**: `claude-sonnet-4-20250514`
4. **Max Tokens**: `4000`
5. **System Prompt**: Open `make/claude_prompt.txt` from this package, copy the entire contents, paste here.
6. **Messages**:
   - Role: `user`
   - Content:
     ```
     Email Subject: {{1.Subject}}
     Email From: {{1.From Address}}
     Email Body:
     {{1.Text Content}}

     Attachment URLs (already uploaded):
     {{4.array[].url}}
     ```
   (Use Make.com's Variables panel to insert the bracketed pieces — don't type them by hand.)

### Module 6: JSON Parse

1. Add **JSON → Parse JSON**.
2. **JSON string**: insert `5.Content[].Text` (the Claude response).
3. **Data structure**: click "Generate" and paste a sample like:
   ```json
   [{"vendor":"X","supplier_type":"X","offer_start_date":"","offer_end_date":"","travel_start_window":"","travel_end_window":"","audience":"","offer_overview":"","full_details":"","book_through":"","voyage_list":"","offer_details":"","client_facing_content":"","contact":""}]
   ```

### Module 7: HTTP — Make a request (post to your site)

1. Add **HTTP → Make a request**.
2. Configure:
   - **URL**: `https://YOUR-VERCEL-URL.vercel.app/api/ingest`
   - **Method**: `POST`
   - **Headers**: `Content-Type: application/json`
   - **Body type**: `Raw`
   - **Content type**: `JSON (application/json)`
   - **Request content**:
     ```json
     {
       "secret": "YOUR_INGEST_SECRET_HERE",
       "sender_email": "{{1.From Address}}",
       "subject": "{{1.Subject}}",
       "body": "{{1.Text Content}}",
       "attachment_urls": {{4.array[].url}},
       "offers": {{6}}
     }
     ```
   - Replace `YOUR-VERCEL-URL` and `YOUR_INGEST_SECRET_HERE` with your actual values from steps 4 and 1.
   - Use the Variables panel to insert the bracketed values, but type the JSON structure by hand.
   - **Parse response**: Yes

### Module 8: Filter (only notify when review needed)

1. Click the connecting line right before the next module you'll add. Click **Set up a filter**.
2. **Condition**: `7.Data.needs_review` `Equal to` `true`

### Module 9: Email — Send an email (notification to you)

1. Add **Email → Send an Email** (uses Make.com's free SMTP).
2. Configure:
   - **To**: your email address
   - **Subject**: `MVT Offer Library — review needed`
   - **Content type**: HTML
   - **Content**:
     ```html
     <p>An offer was received that needs your review.</p>
     <p><strong>From:</strong> {{1.From Address}}<br/>
     <strong>Subject:</strong> {{1.Subject}}</p>
     <p><a href="https://YOUR-VERCEL-URL.vercel.app/admin">Open admin dashboard</a></p>
     ```

3. Click **Save** at the bottom of the canvas.
4. Toggle the scenario from **OFF** to **ON** (top left).

---

## Step 8 — Test it end to end

1. From your work email, forward a real offer email to your mailhook address (the `xyz@hook.us2.make.com` address from step 7).
2. Within 1-2 minutes:
   - Make.com should show a successful execution (green checkmarks)
   - The offer should appear on your Vercel site (refresh the page)
   - If the sender wasn't internal OR a required field was missing, it appears in `/admin` instead and you get a notification email.

If something's broken, click into the Make.com execution to see which module failed. The error message usually tells you exactly what went wrong (most commonly: a misformatted variable reference).

---

## Step 9 — Make forwarding easy

In Outlook, set up a quick step or rule so you can forward to the mailhook address with one click. The cleanest setup:

1. In Outlook, go to **File → Manage Rules & Alerts** → **New Rule**.
2. Don't apply automatic rules — instead, set up a **Quick Step**:
   - Home → Quick Steps → Create New
   - Name: "Send to Offer Library"
   - Action: Forward
   - To: your mailhook address
   - Optionally: assign a keyboard shortcut

Now you can hit one button to forward any offer to the library.

You can also share your mailhook address with marketing partners who should be submitting offers. Their submissions will land in your review queue.

---

## Maintenance and growth

### Cost expectations

- Vercel: free (Hobby plan covers this)
- Supabase: free (under 500MB)
- Make.com: free up to 1,000 ops/month, then $9/month for 10,000
- HubSpot Files: included in your existing plan
- Claude API: roughly $0.005-0.02 per email parsed; $20 of credit lasts most users 6+ months

### When something breaks

- Most issues show up clearly in the Make.com execution log. Look there first.
- If the site stops loading, check Vercel's deployment status.
- If offers stop being inserted, check Supabase logs (under Logs → Database).

### Adding a custom domain later

When you're ready to formalize this:
1. Either buy a domain and connect it in Vercel under Settings → Domains
2. Or ask IT to set up a reverse proxy from `montecitovillagetravel.com/offerlibrary` to your Vercel URL

### Editing the site

The code is all standard React/Next.js. Once it's running, you can change colors, layouts, or add fields by editing the files in your GitHub repo. Pushing to `main` automatically redeploys to Vercel.
