# Offer Library v4: setup steps

Nothing has been changed in GitHub, Supabase, Make or Vercel. Everything below is for you to apply, in this order. Step 1 has to come before step 2, or the ingest will fail on the new columns.

## 1. Supabase (5 minutes)

Open the SQL editor, paste PART 1 of `supabase/migration_v4_pipeline.sql` (everything above the PART 2 heading) and run it. It adds columns and three tables and is safe to run twice.

Leave PART 2 for step 5.

## 2. GitHub (10 minutes)

Unzip the package. On the repo page choose Add file, then Upload files, and drag the contents of the unzipped folder (the `app`, `components`, `lib`, `make`, `supabase` folders and this file) onto the page. GitHub keeps the folder structure and replaces the files with the same path. Commit to main. Vercel deploys on its own.

Changed: `app/admin/page.js`, `app/api/admin/offers/bulk/route.js`, `app/api/admin/offers/duplicate/route.js`, `app/api/admin/offers/update/route.js`, `app/api/ingest/route.js`, `app/globals.css`, `app/offer/[id]/page.js`, `app/page.js`, `components/AdminDashboard.js`, `components/OfferList.js`, `lib/dates.js`, `lib/duplicates.js`, `make/claude_prompt.txt`

New: `app/api/admin/activity/undo/route.js`, `app/api/admin/settings/route.js`, `app/api/admin/updates/route.js`, `app/news/page.js`, `lib/activity.js`, `lib/attachments.js`, `lib/merge.js`, `lib/scoring.js`, `lib/settings.js`, `make/output_schema.json`, `make/user_message_template.txt`, `supabase/migration_v4_pipeline.sql`

The new ingest still accepts what Make sends today, so mail keeps flowing between this deploy and step 3. Until step 3 is done, items will not carry evidence quotes, so most will wait for review as they do now.

## 3. Make (20 minutes)

Open the scenario and click Edit. Save once at the end.

1. Signature images. Click the empty filter between Iterator (2) and HubSpot Upload a File (3). Label it `Documents only`. Condition one: Iterator `MIME type`, Text operator "Does not contain", value `image/`. Add an AND rule: Iterator `MIME type`, "Not equal to", value `text/calendar`.
2. Claude module (5):
   - System Prompt: paste all of `make/claude_prompt.txt`.
   - Message 1, Content 1: replace the text with `make/user_message_template.txt`. Remap the pills to the same items Content 1 and Content 2 use now: the mailhook Subject, Email address, Text, HTML content, and the Array from the Array aggregator. Keep the first line exactly: `Today's date: {{formatDate(now; "YYYY-MM-DD"; "America/Los_Angeles")}}`.
   - Delete Content 2. It sent the email a second time.
   - Temperature: `0`.
   - Output Format, Schema: paste all of `make/output_schema.json`.
3. One request per email. The JSON Parse module (6) splits the AI's list into separate bundles, which is why each offer was posted and emailed separately. Right click it and delete it. If Tools Set variable (9) only holds the Claude text, delete it as well, then connect Claude straight to HTTP.
4. HTTP module (7), data structure `MVT Offer Ingest`: click Edit on the structure and add two Text fields, `extraction` and `html`. Map `extraction` to the Claude module's text output, the same item JSON Parse was reading. Map `html` to the mailhook HTML content. Clear the old `offers` field, or leave it empty.
5. Outlook email (8): in the body, use `review_summary_html` from the HTTP output. It now lists each held offer and why it was held.
6. Save. Then forward the Six Senses Rome and London email to the mailhook. You should see:
   - One HTTP call and at most one review email.
   - Six Senses Rome published by itself. It is already in the library, so you may instead see it merged into the existing record, listed on the Activity tab.
   - Six Senses London on the News tab, not in offers.
   - No image001.jpg attached.

## 4. Admin settings

The new Settings tab has the two sliders. They start at 75% for publishing and 90% for merging. Under each slider is a count of how many recent items would have gone through at that setting. The count fills in once emails have come through the new pipeline. Every action taken without you is listed on the Activity tab with an Undo button.

## 5. Cleanup of what is already there

Run PART 2 of the migration one block at a time. Run each preview SELECT first and check the rows before you run the UPDATE under it.

- 2a gives the 20 waiting offers their travel end date as the end date.
- 2b gives the remaining waiting offers an estimated end date.
- 2c removes image files from every offer's attachments.
- 2d lists published offers whose year looks wrong, like the Holland America ones. Fix those by hand.

Then on Pending Review:

1. The matching has been tightened, so the match percentages update on reload.
2. Select the obvious repeats and use "Merge all into matches".
3. Select the news items (Collette webinar, Rental Escapes, the Holland America newsletter) and use "Move all to News".

## What changed in behavior

- End dates:
  - The booking deadline is used first, then the last travel date, then the arrival date plus 60 days.
  - An estimated date is shown to advisors as "estimated", with a note on the offer page telling them to confirm with the supplier.
  - A year that lands well before the email arrived is moved forward one year.
- News: openings, renovations, webinars and events go to /news, linked from the site header. Advisors see them for 90 days. You can hide any item from the News tab in the admin.
- Matching:
  - Two offers with no end date now count as agreeing on dates.
  - Wording is compared on the supplier's own text as well as the AI summary.
  - Less than 50% shared wording is never a match.
  - Different named hotels are never a match.
- Automatic publish: only from MVT senders, and only when the benefit line the AI quotes is found word for word in the email. Contact mismatches no longer hold an offer; they lower its score by 10.
- Attachments: only PDFs and documents. Images are dropped both in Make and in the code.

## Not verified

- I could not run this against your live database or Make. The code builds and the logic passed tests built from your real examples (Six Senses, Rocco Forte, Auberge, TBO, Holland America). The first live email in step 3.6 is the real test.
- I assumed Make's Array aggregator still outputs an empty list when the new filter drops every attachment. The scenario already handles emails with no attachments that way, but check one email that only has a signature image.
- The pill names in the Make template are my best reading of your scenario. Map them to whatever Content 1 uses today.
