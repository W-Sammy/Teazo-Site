# TEAZO Developer Guide

Everything you need to run the whole site on your own machine, with a working
database, file storage, sign-in, bot check and email, and to build against
them. Deploying to Cloudflare is separate infrastructure work; you don't need
any of it to build your feature.

Commands assume a bash shell. On Windows, use **Git Bash**, not PowerShell.

---

## Contents

1. [The stack in one minute](#1-the-stack-in-one-minute)
2. [Set up your machine](#2-set-up-your-machine)
   - [2.1 Start the database and storage](#21-start-the-database-and-storage)
   - [2.2 Start the app](#22-start-the-app)
   - [2.3 Sign in locally](#23-sign-in-locally)
   - [2.4 Reset](#24-reset)
   - [2.5 Set up and test the new features](#25-set-up-and-test-the-new-features): email and its limits, the bot check, the contact form, admin invites and roles, storage limits, the file sweeper
   - [2.6 Every environment variable](#26-every-environment-variable)
   - [2.7 Scripts](#27-scripts)
   - [2.8 Checking a production build locally](#28-checking-a-production-build-locally)
3. [Talking to the database](#3-talking-to-the-database)
4. [Storing files](#4-storing-files)
5. [Authentication](#5-authentication)
6. [The database](#6-the-database)
7. [Changing the schema](#7-changing-the-schema)
8. [How your code reaches production](#8-how-your-code-reaches-production)
9. [Gotchas](#9-gotchas)
10. [Where everything else lives](#10-where-everything-else-lives)

---

## 1. The stack in one minute

```
your app (Next.js) ──HTTP──▶ proxy Worker ──▶ D1   the database
                                          └─▶ R2   file storage
```

- The app runs on **Vercel**. It never talks to the database or the storage
  directly: every query and every file goes through one small Cloudflare
  Worker, `teazo-d1-proxy/`, using one token.
- **On your machine, that same Worker runs locally with a simulated database
  and a simulated bucket.** No Cloudflare account, no Cloudflare credentials,
  nothing shared with anyone. Break it freely.
- **Square owns the product catalog, photos included.** Item names, prices,
  sizes, photos and sold-out state are edited in Square, never in our database.

The app also talks to a few outside services. What each one needs on your
machine:

| Service | What it does | On your machine |
|---|---|---|
| Google (through NextAuth) | Admin sign-in | The team's OAuth client id and secret (§2.3) |
| Square | The product catalog | The team's sandbox token, only for Square, menu admin or events work (§2.2) |
| Cloudflare Turnstile | The contact form's bot check | Nothing. Test keys are used automatically, but you need an internet connection (§2.5) |
| Brevo | Email in production | Nothing. Email is printed in your terminal, or caught by Mailpit (§2.5) |

**What is real today:**

- Google sign-in, checked against the `admin_user` table, and a guard on every
  admin page and admin write route (§5).
- The contact form: bot-checked, saved to the database, and emailed to the
  owner.
- The PDF menu: uploaded from `/admin/menu`, stored in R2, and served on
  `/static-menu`.
- The Worker's billing limits on R2 and the storage usage report (§2.5).

**Still sample data or hardcoded:** the Settings admins table, the events,
gallery and website content admin pages, and the content of every public page
(address, hours, menu, gallery). Those are waiting for their features.

---

## 2. Set up your machine

You need **Node.js 22 or newer** and **Git**. Wrangler refuses to start on
anything older, and it says which version it wants.

> **Windows: keep the repo at a short path**, such as `C:\dev\Teazo-Site`. The
> local database file sits about 140 characters deep inside the repo, so if the
> repo folder's own path is longer than about 115 characters, Windows'
> 260-character limit is reached. Every local `wrangler d1` command, and
> `npm run db:seed:local`, then fails with `internal error; reference = ...`,
> which says nothing about paths, and `git clone` and `npm install` give no
> warning first. The Worker still starts, but every query it runs fails the
> same way, so the check in §2.1 shows that error and the app's terminal prints
> it after `Contact form submission failed:`. Turning on Windows' long path
> setting doesn't help. To check, run `pwd -W | awk '{print length}'` in the
> repo folder and keep it under 100.
>
> If it is longer, move the repo. In the repo folder, note the path that `pwd`
> prints. Stop the Worker and the app (Ctrl+C in terminals 1 and 2), and run
> `cd /c` in every terminal that is inside the repo, including your editor's,
> or close it. While a program or a terminal is inside one of the repo's
> folders, Windows won't move it and `mv` says `Permission denied`. Then run
> `mkdir -p /c/dev && mv "<that path>" /c/dev/Teazo-Site`, run
> `npm run db:migrate:local` again from `/c/dev/Teazo-Site/teazo-d1-proxy`, and
> start the Worker and the app again from their new folders.
>
> To clone into `C:\dev` in the first place, run `mkdir -p /c/dev && cd /c/dev`
> in Git Bash before the `git clone` in §2.1.

**What you need from someone else:**

- **Google sign-in:** the team's `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`.
  Ask Sammy. Needed for sign-in and anything under `/admin`.
- **Square:** the team's sandbox access token. Ask whoever holds the team's
  Square developer account. Needed only for Square, the menu admin (including
  the PDF menu upload) and the events admin.

Nothing else. You don't need a Cloudflare, Brevo or Turnstile account, and you
never need `wrangler login` for local work.

**Terminals and ports.** Keep these open while you work:

| Terminal | Runs | Port |
|---|---|---|
| 1 | The Worker, from `teazo-d1-proxy` (§2.1) | `8787` |
| 2 | The app, from `teazo-site` (§2.2) | `3000` |
| 3 | Mailpit, optional (§2.5) | `8025` (and `1025`, which the app doesn't use) |
| 4 | Everything else: seeding, queries, git | |

The app must stay on port **3000**: Google sign-in is registered for it. If
3000 is taken, `npm run dev` doesn't ask. It prints `Port 3000 is in use by
process <pid>, using available port 3001 instead.` and starts on 3001, where
sign-in fails. If that process is another `npm run dev` from this folder, it
prints `Another next dev server is already running.` instead and exits. Either
way, press Ctrl+C if it is still running, stop that process
(`taskkill //PID <pid> //F` in Git Bash, `kill <pid>` on macOS or Linux), and
start the app again. Type the slashes doubled: the `taskkill /PID <pid> /F`
that Next.js suggests fails in Git Bash. On Windows, a program that holds 3000
for only one of `localhost` and `127.0.0.1` gets no warning. If
`http://localhost:3000` shows something other than the site, stop the app, run
`netstat -ano | grep ':3000 ' | grep LISTENING`, and stop each process id at
the end of those lines.

### 2.1 Start the database and storage

```bash
git clone https://github.com/W-Sammy/Teazo-Site.git
cd Teazo-Site/teazo-d1-proxy
npm install
npm run db:migrate:local
echo "PROXY_TOKEN=local-dev-token" > .dev.vars
npm run dev
```

`db:migrate:local` may ask before applying migrations; press Enter or `y`. It
creates your database with the full schema and its starting data (the real
address and hours, the menu sections, the admin roles). `npm run dev` then
starts the Worker on `http://127.0.0.1:8787`. **Leave it running.** Each time
it starts, wrangler prints a yellow warning that scheduled Workers are not
triggered during local development. That is expected (§2.5).

Check it from another terminal:

```bash
curl -s http://127.0.0.1:8787/query -H 'authorization: Bearer local-dev-token' -H 'content-type: application/json' -d '{"sql":"SELECT label FROM role ORDER BY id"}'
```

You should see `Owner`, `Can Edit` and `Can View`.

**Looking inside your database.** The quickest way needs no token and no
running Worker. From the repo root:

```bash
cd teazo-d1-proxy
npx wrangler d1 execute teazo-db --local --command "SELECT email_normalized, role_id, status FROM admin_user"
```

Until you add yourself in §2.3 this prints `"results": []`, an empty list.
That is not an error.

`.dev.vars` holds the Worker's local settings. The `echo ... >` above creates
it; when you add a line later, append with `>>` or edit the file, because `>`
replaces everything in it.

### 2.2 Start the app

In a second terminal, from the repo root, create `teazo-site/.env.local` and
start the app:

```bash
cat > teazo-site/.env.local <<'EOF'
D1_PROXY_URL=http://127.0.0.1:8787
PROXY_TOKEN=local-dev-token
R2_PUBLIC_BASE=http://127.0.0.1:8787/media
EOF
cd teazo-site
npm install
npm run dev
```

`PROXY_TOKEN` must match the one in `teazo-d1-proxy/.dev.vars`. The `cat >`
line creates the file and replaces anything already in it, so run it once.
The sections below add more lines to `.env.local`: open it in your editor to
add them, and restart `npm run dev` afterwards.

Open **`http://localhost:3000`**. Use `localhost`, not `127.0.0.1` or the
network address Next.js prints. On those addresses the page's scripts never
start. Links still work, but **Continue with Google** does nothing, the contact
form's bot check never appears, and Submit on `/contact` answers "Please wait
for the security check above the Submit button to finish, then try again." The
first time you open one of them after starting the app, its terminal prints
`Blocked cross-origin request to Next.js dev resource /_next/hmr` (§9).

**If you are working on Square, the menu admin or the events admin**, add
these lines to `.env.local`:

```ini
SQUARE_ACCESS_TOKEN=<the team's sandbox token>
NEXT_PUBLIC_BASE_URL=http://localhost:3000/
```

The trailing `/` matters: `/admin/menu` and `/admin/events` build the request
as `${NEXT_PUBLIC_BASE_URL}api/square/products`. Without these two the public
pages still run, but `/api/square/*`, `/admin/menu` (and with it the PDF menu
upload) and `/admin/events` fail. The Square client is fixed to Square's
**sandbox**, and the sandbox catalog is shared by the whole team, so only
create or delete test items, never other people's.

**The contact form, email and the bot check need no setup.** §2.5 shows how to
try each of them, and how to see emails in a local inbox.

### 2.3 Sign in locally

**Every page under `/admin` needs sign-in**, so do this if you work on anything
there. Add these lines to `teazo-site/.env.local`:

```ini
AUTH_SECRET=<a long random string, from `openssl rand -base64 33`>
AUTH_GOOGLE_ID=<the team's Google OAuth client id>
AUTH_GOOGLE_SECRET=<the team's Google OAuth client secret>
```

`AUTH_SECRET` is yours; generate your own. Get the Google id and secret from
Sammy, and never commit them (`.env*` files are gitignored). Leave `AUTH_URL`
and `AUTH_TRUST_HOST` unset: NextAuth trusts `localhost` in development.

Until these are set, every `/admin` page sends you to `/login` and the app's
terminal prints an `[auth][error] MissingSecret` error. That is expected.

Sign-in reads the database, so **the Worker must be running**. Your Google
account also needs an admin row in your own database. From the repo root, in
your spare terminal:

```bash
cd teazo-d1-proxy
npm run db:seed:local -- you@gmail.com
```

Use the Google address you sign in with. The first address you seed becomes
the Owner, and any address added after that gets Can Edit. Pass `--role 2`
(Can Edit) or `--role 3` (Can View) to choose. Running it again for an address
you already added keeps its role unless you pass `--role`, and never adds a
second row. It applies any new migrations first, and only ever touches your
local database. Uploads and Square edits need Owner or Can Edit.

Then open `http://localhost:3000/login` and choose **Continue with Google**.
The email and password fields and "Forgot password?" on that page are
placeholders: there is no password sign-in yet. Don't type a real password
into them; the form puts what you type into the page's URL. The red "Email or
password cannot be empty" line belongs to that placeholder form and shows
while either of its fields is empty. It is not a sign-in error.

**If sign-in fails:**

| You see | Cause | Fix |
|---|---|---|
| "This Google account does not have admin access" | No live admin row for that exact address, or it is suspended | `npm run db:seed:local -- <that address>` |
| "We could not verify your access" | The database lookup failed | Start the Worker, and check `D1_PROXY_URL` and `PROXY_TOKEN` in `.env.local` |
| Sent back to `/login` with no message, or with "Sign-in could not be completed. Please try again." | A missing `AUTH_SECRET`, or a wrong `AUTH_GOOGLE_SECRET` | Read the `[auth][error]` line in the `npm run dev` terminal. `MissingSecret` means `AUTH_SECRET` is not set. `CallbackRouteError` after you chose your Google account usually means `AUTH_GOOGLE_SECRET` is wrong: check it against what Sammy sent |
| Google's `redirect_uri_mismatch` | The app isn't on port 3000 (see **Terminals and ports** in §2), or the redirect isn't registered | Start the app on port 3000 and open `http://localhost:3000`. The OAuth client must list `http://localhost:3000/api/auth/callback/google` |
| **Continue with Google** does nothing | You opened `127.0.0.1` or the network address, where the page's scripts never start | Open `http://localhost:3000/login` |
| Google shows an error page before ours, such as `access_denied`, `org_internal`, `admin_policy_enforced` or `invalid_client` | `access_denied`: the OAuth app's settings don't admit this account. `org_internal`: the OAuth client only admits accounts from one organization. `admin_policy_enforced`: a work or school account whose administrator blocks outside apps. `invalid_client` ("The OAuth client was not found"): `AUTH_GOOGLE_ID` in `.env.local` is missing or wrong | For `invalid_client`, set `AUTH_GOOGLE_ID` to exactly what Sammy sent and restart `npm run dev`. For `admin_policy_enforced`, try a personal Google account. For `access_denied` or `org_internal`, send Sammy your Google address and the error code |

### 2.4 Reset

Your database is disposable. To start clean:

1. Stop the Worker (Ctrl+C in its terminal). A running Worker keeps the old
   files open.
2. From `teazo-d1-proxy`:

   ```bash
   rm -rf .wrangler/state
   npm run db:seed:local -- you@gmail.com
   npm run dev
   ```

The seed recreates the schema and your admin row. A reset also empties your
local bucket, so any menu PDF you uploaded is gone and `/static-menu` goes
back to the bundled PDF.

**After every pull:** stop the Worker and the app (Ctrl+C in terminals 1 and
2). On Windows, `npm install` fails with `EBUSY` if the Worker is still running
when a pull updates wrangler. Then, in terminal 4, from the repo root:

```bash
cd teazo-d1-proxy
npm install
npm run db:migrate:local
cd ../teazo-site
npm install
cd ..
```

`npm run db:seed:local -- you@gmail.com` from `teazo-d1-proxy` also migrates,
so you can run it in place of `db:migrate:local`. Then start both again with
`npm run dev`: the Worker from `teazo-d1-proxy` in terminal 1, and the app from
`teazo-site` in terminal 2.

### 2.5 Set up and test the new features

The contact form, email, the bot check, the storage limits and the file
sweeper were added recently. None of them needs an account or a key on your
machine, and each one can be tried locally. Only testing admin roles needs
sign-in from §2.3. Start the Worker (§2.1) and the app (§2.2) first.

**Already set up before these features?** Your local database is missing
migrations `0003` (the contact form switch) and `0004` (the storage record).
Follow **After every pull** in §2.4, which applies them. Until you do, Submit
on `/contact` answers "Your message could not be sent right now" even with the
Worker running, `/usage` answers `usage_unavailable`, and uploads fail: the
Worker answers `503 limits_unavailable`, which `/admin/menu` shows as "The
upload could not be confirmed" (the app's terminal has the code, after `Menu
PDF upload failed:`). Nothing new goes in `.env.local` or `.dev.vars`. Files you
uploaded before the pull are not in the new storage record, so `/usage` leaves
them out; `/usage?verify=1` counts them as `driftBytes`, and a reset (§2.4)
removes them.

| Feature | What to set up | How to try it |
|---|---|---|
| Email | Nothing: emails are printed in the app's terminal. Mailpit is optional | [Email](#email) |
| Bot check (Cloudflare Turnstile) | Nothing: test keys are used automatically. Needs an internet connection | [The bot check](#the-bot-check) |
| Contact form | Nothing | [The contact form](#the-contact-form) |
| Limits on the owner's emails | Nothing | [The email limits](#the-email-limits) |
| Admin invite email | Nothing. Nothing sends it until Settings saves admins | [Admin invites](#admin-invites) |
| Admin roles | Sign-in from §2.3: `AUTH_SECRET`, the Google id and secret from Sammy, and your admin row | [Each admin role](#each-admin-role) |
| Storage limits and usage | Nothing | [Storage limits and usage](#storage-limits-and-usage) |
| File sweeper | Nothing | [The file sweeper](#the-file-sweeper) |

A change to `teazo-site/.env.local` takes effect when you restart the app's
`npm run dev`, and a change to `teazo-d1-proxy/.dev.vars` when you restart the
Worker. Remove each test line when you are done.

#### Email

Where an email goes is decided when it is sent, in this order:

1. `BREVO_API_KEY` is set: it is sent for real through Brevo. Production only.
   Never put a Brevo key in `.env.local`.
2. `MAILPIT_URL` is set: it is delivered to your local Mailpit inbox.
3. Neither: it is printed in the terminal running the app's `npm run dev`.

**By default, emails are printed.** There is nothing to set, and nothing
reaches a real inbox. Submit the form on `/contact` and the app's terminal
shows something like:

```text
[email] Not sent (no BREVO_API_KEY or MAILPIT_URL). This is what would go out:
To: owner@teazo.test
Reply-To: ana@example.com
Subject: New website message from Ana: Catering

New message from the contact form on the TEAZO website.
...
```

Only the plain text version is printed. To see the formatted version, use
Mailpit.

**To see emails in an inbox, run [Mailpit](https://mailpit.axllent.org/)**, a
free inbox that runs on your machine and never sends anything on:

1. Install it:
   - **Windows:** download `mailpit-windows-amd64.zip` from the
     [latest release](https://github.com/axllent/mailpit/releases/latest) and
     unzip it.
   - **macOS:** `brew install mailpit`
   - **Linux:** follow the [install page](https://mailpit.axllent.org/docs/install/).
   - **Docker, on any system:** with Docker running, run
     `docker run -d --name mailpit -p 127.0.0.1:8025:8025 axllent/mailpit`
     once and skip step 2. After that, including after you restart your
     computer, start it with `docker start mailpit` and stop it with
     `docker stop mailpit`. Running `docker run` again fails because the name
     `mailpit` is already taken.
2. Start it in terminal 3 and leave it running:
   `mailpit --listen 127.0.0.1:8025 --smtp 127.0.0.1:1025`. On Windows, run
   `./mailpit.exe --listen 127.0.0.1:8025 --smtp 127.0.0.1:1025` from the
   unzipped folder. These addresses keep Mailpit reachable only from your own
   machine. Without `--smtp`, it also listens for mail from your network on
   port 1025, and Windows may ask whether to let it through the firewall.
3. Add `MAILPIT_URL=http://127.0.0.1:8025` to `teazo-site/.env.local` and
   restart the app.
4. Open `http://127.0.0.1:8025` and submit the contact form. The email appears
   within a few seconds, and Mailpit shows both versions of it. Mailpit keeps
   emails only while it runs, so stopping it empties the inbox.

While `MAILPIT_URL` is set, Mailpit must be running. If it isn't, the form
still thanks the visitor as usual, so check the app's terminal: it shows `A
contact message was saved, but the notification email failed` and `could not
reach Mailpit`. The message itself is still saved.
Remove the line and restart the app to go back to printed emails.

The emails the site sends:

| Subject | How to trigger it locally | Goes to |
|---|---|---|
| "New website message from ..." | Submit the form on `/contact` | `owner@teazo.test`, or `CONTACT_NOTIFY_TO` if you set it |
| "Website contact form: email alerts paused" | See [the email limits](#the-email-limits) | Same |
| "You've been added as an admin of the TEAZO website" | Not yet: see [admin invites](#admin-invites) | The new admin's address |

A contact email's reply address is the visitor's, so the owner can answer with
Reply. In Mailpit, emails come from `website@teazo.test` ("TEAZO website")
unless you set `EMAIL_FROM` or `EMAIL_FROM_NAME`.

#### The bot check

The contact form is protected by Cloudflare Turnstile. A small widget above
Submit checks the visitor, and the server checks the widget's answer with
Cloudflare before it saves anything. With no keys set, your machine uses
Cloudflare's public test keys, which always pass, and the widget says it is for
testing only. Leave `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`
unset for everyday work.

It needs an internet connection, even with test keys. Offline, the widget
can't load, the form says "The security check couldn't load", and nothing can
be sent.

To see what a visitor sees when the check goes wrong, add one of these lines
to `.env.local`, restart the app, and submit the form:

| Line to add | What you see |
|---|---|
| `TURNSTILE_SECRET_KEY=2x0000000000000000000000000000000AA` | The widget passes, but Submit answers "The security check didn't pass. Please try it again." |
| `TURNSTILE_SECRET_KEY=3x0000000000000000000000000000000AA` | The same answer, as if the visitor's check had already been used |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY=2x00000000000000000000AB` | The widget fails, the form says "The security check couldn't load", and Submit answers "Please wait for the security check above the Submit button to finish, then try again." |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY=3x00000000000000000000FF` | The widget asks for a click before it passes. After the click, Submit sends the message as usual, and the widget asks for a click again after each message |

In the first two rows Cloudflare refuses the widget's answer, and the app's
terminal logs `Turnstile rejected a contact form submission:` with Cloudflare's
error code (`invalid-input-response` or `timeout-or-duplicate`). The third row
logs no refusal: the widget never gives the form an answer, so the server turns
it away without asking Cloudflare. Instead the terminal repeats `[browser]
[Cloudflare Turnstile] Error: 600010.` while the page is open. That is the
widget's own error, copied from the browser, not a problem with the server.

**The hidden field.** The form also has a `company` field that people never
see and bots fill in. A submission with it filled in gets the usual thank-you
but is thrown away, with no saved message and no email. To try it, open
`/contact` and fill in at least the first name, email and message. Then run
`document.querySelector('input[name=company]').value = 'x'` in the browser's
developer console and choose **Submit**. The form thanks you, but no email is
printed or appears in Mailpit, and the query in step 4 of
[the contact form](#the-contact-form) shows no new row. The form clears after
each submission, so run the line again before the next try.

#### The contact form

1. Open `http://localhost:3000/contact`. Fill in at least the first name, email
   and message, wait for the widget's check mark, and choose **Submit**.
2. The form clears and says "Thank you. Your message was sent, and we will get
   back to you soon."
3. The owner's email is printed in the app's terminal, or appears in Mailpit.
4. The message is saved. In terminal 4, from `teazo-d1-proxy`:

   ```bash
   npx wrangler d1 execute teazo-db --local --command "SELECT created_at, email, subject FROM contact_message ORDER BY created_at DESC"
   ```

**Turning the form off.** The owner will switch it from the admin panel, which
doesn't exist yet. Until then, from `teazo-d1-proxy`:

```bash
npx wrangler d1 execute teazo-db --local --command "UPDATE business_profile SET contact_form_enabled = 0 WHERE id = 1"
```

Reload `/contact` and the CONTACT US section is gone. A form that was already
open answers "The contact form is not accepting messages right now." To bring
the form back:

```bash
npx wrangler d1 execute teazo-db --local --command "UPDATE business_profile SET contact_form_enabled = 1 WHERE id = 1"
```

If the app can't use the database, `/contact` still shows the form, and
Submit answers "Your message could not be sent right now." This can happen
with the Worker running too. The app's terminal then prints `Contact form
submission failed:` with the reason on the same line. `could not reach the
database proxy` means the Worker isn't running or `D1_PROXY_URL` in
`.env.local` is wrong. `unauthorized` means `PROXY_TOKEN` in `.env.local`
doesn't match the one in `teazo-d1-proxy/.dev.vars`. `no such column:
contact_form_enabled` means your database is missing migration `0003`: run
`npm run db:migrate:local` from `teazo-d1-proxy`. `internal error; reference =
...` usually means the repo's path is too long (§2).

#### The email limits

So a flood of spam can't use up Brevo's 300 free emails a day, the owner gets
at most 20 contact emails in any 60 minutes and 100 in any 24 hours. The
message that takes a count past its limit (the 21st in 60 minutes, or the 101st
in 24 hours) sends one "Website contact form: email alerts paused" email
instead, and later messages are saved with no email. Emails resume once the
count drops back under the limit, and going over the hourly limit again sends
another notice. Past 100 in 24 hours nothing more is sent, so however a flood
is paced, the owner gets at most 101 emails in any 24 hours.

To see it without sending 21 messages, fill the last hour up to 20 with test
rows, from `teazo-d1-proxy`:

```bash
npx wrangler d1 execute teazo-db --local --command "WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 20) INSERT INTO contact_message (first_name, email, message) SELECT 'Filler', 'filler@example.com', 'Filler ' || i FROM n WHERE i <= 20 - (SELECT count(*) FROM contact_message WHERE created_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 hour'))"
```

Wrangler doesn't say how many rows an INSERT added, so an empty `results` list
here is normal. The command adds only what the last hour is missing, so
running it twice never takes the hour past 20. To check the count:

```bash
npx wrangler d1 execute teazo-db --local --command "SELECT (SELECT count(*) FROM contact_message WHERE created_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 hour')) AS last_hour, (SELECT count(*) FROM contact_message WHERE created_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 day')) AS last_day"
```

`last_hour` should be 20, and `last_day` 98 or less. A higher `last_day` puts
the day near its own limit too, and the steps below go differently. Your local
messages are only test data, so empty the table with
`npx wrangler d1 execute teazo-db --local --command "DELETE FROM contact_message"`,
then run the filler command again.

Submit the form once: the "alerts paused" email arrives instead of the usual
one. Submit again: no email, and the app's terminal says `Contact message saved
without an email: the hourly or daily email cap was reached.` Then remove the
test rows, and the next message is emailed as usual:

```bash
npx wrangler d1 execute teazo-db --local --command "DELETE FROM contact_message WHERE email = 'filler@example.com'"
```

#### Admin invites

When an admin adds someone in Settings, the new admin gets an email that
explains how to sign in (`sendAdminInvite` in `app/lib/admin-invite.ts`, see
§5). Nothing sends it yet, because the Settings admins table doesn't save to
the database. Once it does, adding an admin prints the invite in the app's
terminal, or shows it in Mailpit, addressed to the new admin. Its sign-in link
is built from `NEXT_PUBLIC_BASE_URL`, or `http://localhost:3000` when that
isn't set.

#### Each admin role

Every admin check reads your local `admin_user` table on each request, so you
can test each role by changing your own row. The change applies on your next
page load, without signing in again. From `teazo-d1-proxy`:

```bash
npm run db:seed:local -- you@gmail.com --role 3    # Can View
npm run db:seed:local -- you@gmail.com --role 2    # Can Edit
npm run db:seed:local -- you@gmail.com --role 1    # Owner again
```

- **Can View** opens every admin page, and the server refuses every admin
  write with `403`. Today the only page that writes to the server is the menu
  PDF upload on `/admin/menu`, and its button is disabled for Can View. The
  Square product routes also refuse Can View. The other admin pages only
  change the page in your browser for now, so their buttons seem to work at
  any role and the changes are gone when you reload. Use the terminal check
  below to see the `403`.
- **Can Edit** and **Owner** can also upload and edit.
- **Suspended** can't open any admin page. Suspend yourself with
  `npx wrangler d1 execute teazo-db --local --command "UPDATE admin_user SET status = 'suspended' WHERE email_normalized = 'you@gmail.com'"`,
  writing your address in lowercase, exactly as the seed printed it. Wrangler
  reports success even when no row matched, so check it with the `SELECT` from
  §2.1. The next admin page sends you to `/login` with "This Google account
  does not have admin access". Running the seed for your address makes you
  `active` again.

`/admin/menu` and `/admin/events` also need the Square lines from §2.2.
Without them those two pages fail for every role, Owner included, so a failure
there is not a role problem.

To check the write rule from a terminal, copy your `authjs.session-token`
cookie as in §5 and send an empty upload:

```bash
curl -s -X POST http://localhost:3000/api/admin/menu/upload -H "Origin: http://localhost:3000" -H "Cookie: authjs.session-token=<your cookie>"
```

As Can View the answer is `{"error":"You do not have permission to perform
this action."}`. As Can Edit or Owner it is `{"error":"Expected a file-upload
form."}`, which means the role check passed and only the missing file stopped
it.

#### Storage limits and usage

R2 bills for anything past its free allowance, so the Worker refuses uploads
before that happens (the full rules are in [ENDPOINTS.md](ENDPOINTS.md)). Your
local Worker runs with production's share: a 9.5 GB storage cap and 25,000
uploads a day. To see how full your local storage is:

```bash
curl -s http://127.0.0.1:8787/usage -H 'authorization: Bearer local-dev-token'
```

`r2.uploadsBlocked` is `true` when no upload can succeed. Add `?verify=1` to
also list the bucket and compare; that spends at least one upload from the
day's budget.

To upload a test file without the admin pages, run this from `teazo-d1-proxy`.
It stores the menu PDF that ships with the app:

```bash
curl -s -X PUT http://127.0.0.1:8787/media/test/sample.pdf -H 'authorization: Bearer local-dev-token' -H 'content-type: application/pdf' --data-binary @../teazo-site/public/teazo-menu.pdf
```

You should see `{"key":"test/sample.pdf","size":114913,"bucket":"teazo-media"}`,
and the file opens at `http://127.0.0.1:8787/media/test/sample.pdf`.

To make an upload fail on purpose, try one of these lines at a time. From
`teazo-d1-proxy`, stop the Worker, append the line to `.dev.vars`, start the
Worker again, and run the test upload above again. Before you try the other
line, stop the Worker and delete the line you added from `.dev.vars`. `.dev.vars` overrides the
values in `wrangler.jsonc` on your machine only, and the Worker reads it only
when it starts.

```bash
echo "R2_STORAGE_CAP_BYTES=1000" >> .dev.vars    # the upload gets 507 storage_full
```

```bash
echo "R2_CLASS_A_DAILY_BUDGET=1" >> .dev.vars     # after today's first upload, every upload gets 429 r2_daily_limit
```

Don't add both at once: the Worker counts each upload toward the day's budget
before it checks the storage cap, so with both lines only the day's first
upload can get 507, and every upload after it gets 429.

The Worker's startup banner shows an overridden value as `(hidden)`, so check
`/usage` instead (`r2.limitBytes` and `r2.classAToday.budget`). Every upload
attempt counts toward the day's budget, even one refused with 507, and the
count lasts until midnight UTC, so with a budget of 1 your first upload may
already get 429. When you are done, stop the Worker, delete those lines from
`.dev.vars`, and start it again.

A `503 limits_unavailable` on upload means the limits couldn't be checked,
and its `message` says why. If it says the two values "must be set in
wrangler.jsonc", either a limit you added to `.dev.vars` is not a whole number
above zero (write `1000`, not `1,000` or `0`), or `R2_STORAGE_CAP_BYTES` or
`R2_CLASS_A_DAILY_BUDGET` is missing from the `vars` block of `wrangler.jsonc`
(from `teazo-d1-proxy`, `git diff wrangler.jsonc` shows what changed). Fix or
delete the line in `.dev.vars`, or put the value back in `wrangler.jsonc`, then
restart the Worker. Until you do, `/usage` fails the same way, with
`503 usage_unavailable`. Any other message, such as
`no such table: r2_class_a_day`, means your database is missing a migration:
run `npm run db:migrate:local`.

#### The file sweeper

Deleting a file queues its bytes in `pending_r2_deletion`, and an hourly job in
the Worker removes them once they are 24 hours old (§4.2). `npm run dev` never
runs that job on its own; that is the yellow warning wrangler prints when it
starts. To run it by hand, with the Worker running:

1. Queue a file that is already due. No page deletes files yet, so queue one
   yourself, for example the test upload from
   [Storage limits and usage](#storage-limits-and-usage). From
   `teazo-d1-proxy`:

   ```bash
   npx wrangler d1 execute teazo-db --local --command "INSERT INTO pending_r2_deletion (r2_bucket, r2_key, queued_at) VALUES ('teazo-media', 'test/sample.pdf', strftime('%Y-%m-%dT%H:%M:%fZ','now','-25 hours'))"
   ```

2. Run the job: `curl "http://127.0.0.1:8787/cdn-cgi/local/scheduled?cron=0+*+*+*+*"`.
   It prints `ok`.
3. The Worker terminal prints `sweep ok: {"reaped":1,...}`, and
   `http://127.0.0.1:8787/media/test/sample.pdf` now returns 404.

Use `teazo-media` as the bucket: the local Worker only removes files from its
own bucket. The older address, `/__scheduled`, only works under
`npm run dev:cron`; on plain `npm run dev` it returns `405`.

To sweep files that your own delete code queued (§4.2), make them due instead
of inserting a row, then run step 2:

```bash
npx wrangler d1 execute teazo-db --local --command "UPDATE pending_r2_deletion SET queued_at = strftime('%Y-%m-%dT%H:%M:%fZ','now','-25 hours') WHERE deleted_at IS NULL"
```

### 2.6 Every environment variable

**`teazo-site/.env.local`**

| Variable | Local value | Needed for |
|---|---|---|
| `D1_PROXY_URL` | `http://127.0.0.1:8787` | Everything that reads or writes the database: sign-in, `/admin`, the contact form, the PDF menu, storage usage |
| `PROXY_TOKEN` | `local-dev-token` | Same. Must match `teazo-d1-proxy/.dev.vars` |
| `R2_PUBLIC_BASE` | `http://127.0.0.1:8787/media` | Serving stored files. Keep exactly this; `next.config.ts` allows images from that address |
| `AUTH_SECRET` | your own random string | Sign-in and `/admin` (§2.3) |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | from Sammy | Sign-in and `/admin` (§2.3) |
| `SQUARE_ACCESS_TOKEN` | the team's sandbox token | `/api/square/*`, `/admin/menu`, `/admin/events` |
| `NEXT_PUBLIC_BASE_URL` | `http://localhost:3000/` | `/admin/menu`, `/admin/events`, and the sign-in link in invite emails |
| `MAILPIT_URL` | `http://127.0.0.1:8025` (optional) | Sending email to Mailpit instead of the terminal |
| `CONTACT_NOTIFY_TO` | optional | Where contact emails go. Under `npm run dev` it defaults to `owner@teazo.test`; a production build has no default |
| `EMAIL_FROM`, `EMAIL_FROM_NAME` | optional | The sender. Defaults to `website@teazo.test` and "TEAZO website" |

**Leave unset for everyday work** (§2.5 and §2.8 set some of these only while
you test): `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` (test
keys are used automatically), `BREVO_API_KEY` and
`BREVO_SANDBOX` (production only), `AUTH_URL` and `AUTH_TRUST_HOST`,
`NODE_ENV` (Next.js sets it: `development` under `npm run dev`, `production`
under `npm run build` and `npm start`; the test keys, printed email, the
`owner@teazo.test` fallback and the local image host all depend on it), and
the variables Vercel sets itself: `VERCEL`, `VERCEL_ENV`,
`VERCEL_PROJECT_PRODUCTION_URL`.

**`teazo-d1-proxy/.dev.vars`**

| Variable | Local value | Notes |
|---|---|---|
| `PROXY_TOKEN` | `local-dev-token` | Must match `.env.local` |
| `R2_STORAGE_CAP_BYTES`, `R2_CLASS_A_DAILY_BUDGET` | normally not set | Come from `wrangler.jsonc`. Override only to test the limits (§2.5) |
| `MEDIA_BUCKET_NAME` | never set | Comes from `wrangler.jsonc` (`teazo-media`). The storage limits and the sweeper both match stored files by this name, so don't override it |

The values for Vercel are in §8.1.

### 2.7 Scripts

| Where | Script | What it does | Run it locally? |
|---|---|---|---|
| `teazo-d1-proxy` | `npm run dev` | Starts the Worker | Yes |
| | `npm run dev:cron` | Same, and also answers the older `/__scheduled` address (§2.5) | Not needed |
| | `npm run db:migrate:local` | Applies new migrations to your database | Yes |
| | `npm run db:seed:local -- <email>` | Migrates, then gives that address an admin role | Yes |
| | `npm run typegen` | Generates Cloudflare types | Not needed |
| | `npm run tail`, `npm run db:backup` | Read the real Worker and database | No: they need the team Cloudflare account |
| `teazo-site` | `npm run dev` | Starts the app | Yes |
| | `npm run lint` | Lints the app | Yes, before a pull request. It fails on a clean checkout today (the pdf.js copies in `public/` and four older errors), so check the files you changed with `npx eslint "<file>"` and add no new errors. Keep the quotes: bash rejects paths such as `app/(site)/contact/actions.ts` without them |
| | `npm run build`, `npm start` | A production build | Only as in §2.8 |

### 2.8 Checking a production build locally

Everyday work uses `npm run dev`. A production build behaves differently: the
development defaults are off, so the test keys and printed email stop. To try
one anyway:

```ini
# teazo-site/.env.local, in addition to the usual lines
SQUARE_ACCESS_TOKEN=<any value, if you don't have the real one>
NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
AUTH_TRUST_HOST=true
MAILPIT_URL=http://127.0.0.1:8025
CONTACT_NOTIFY_TO=owner@teazo.test
```

Stop `npm run dev` first, because `npm start` also uses port 3000. Then run
`npm run build` and `npm start`, and start Mailpit (§2.5).

- The build fails without `SQUARE_ACCESS_TOKEN`, because the Square client
  checks for it as soon as it loads.
- While it generates pages, the build prints `Admin page authorization lookup
  failed.` several times. The build still succeeds; the admin pages are checked
  once without a request, and that check's error handler logs it.
- Emails only reach Mailpit in this mode; they are never printed.

When you are done, stop `npm start` and delete the lines you added only for
this. With `MAILPIT_URL` left in, every email under `npm run dev` goes to
Mailpit and fails whenever Mailpit isn't running.

---

## 3. Talking to the database

`teazo-site/app/lib/d1.ts` is the only way the app reaches the database.
Import from it; don't copy it.

| Export | What it does |
|---|---|
| `prepare(sql)` | Builds one statement. Chain `.bind(...)`, then `.all()`, `.first()` or `.run()` |
| `batch([...])` | Runs up to 40 statements as one transaction |
| `D1Error` | Thrown on failure. `message` is the database's own message, or the Worker's error code (such as `payload_too_large`) when the Worker refuses the request, and `status` is the HTTP status. `status` is undefined when no answer came back: a `batch()` with no statements or more than 40, missing settings, or a Worker that can't be reached |
| `D1Result` | The type `.all()` and `.run()` return, including `meta.changes` |
| `MAX_STATEMENTS` | The batch limit, 40 |

Using it:

```ts
import { prepare, batch } from "@/app/lib/d1";

const { results: hours } = await prepare(
  "SELECT day_of_week, display_text FROM business_hours ORDER BY day_of_week"
).all<{ day_of_week: number; display_text: string }>();

const profile = await prepare("SELECT * FROM business_profile WHERE id = ?1").bind(1).first();
```

Parameters are positional (`?1`, `?2`, and so on), bound in order with `.bind()`.

Rules:

- **Server only.** Call it from server components, route handlers and server
  actions, never from client components. `PROXY_TOKEN` must never be named
  `NEXT_PUBLIC_*`: it gives full access to the database.
- **`batch()` is the only transaction.** Writes that must succeed or fail
  together go in one `batch()` call. Two calls are two transactions.
- **At most 40 statements per `batch()`, and at least one.** `batch()` throws a
  `D1Error` before sending anything otherwise. Each statement takes at most 100
  values (`?1` to `?100`) and at most 100,000 bytes of SQL, so pass long text
  as a value and split big inserts. One request is sent as JSON, and the whole
  body, the SQL and its values plus field names, quotes and escapes, must be at
  most 1,000,000 bytes, or the Worker refuses it with a `D1Error` whose
  `status` is 413. So keep the SQL plus its values well under that.
- **Every call is a network round trip**, so fetch what a page needs in as few
  calls as you can. Pages that read the database render on every request; if
  a public page needs caching, ask Juan. Before a pull request, check that your
  pages still build with `npm run build` (§2.8).

### 3.1 Writing queries for your feature

Put the SQL for your feature in its own file under `teazo-site/app/lib/queries/`,
one file per feature, with one function for each thing a page needs, named for
what it does. Pages call those functions and never contain SQL themselves.
Whoever builds a feature writes its query file, in the same pull request.

Two real ones to copy from: `queries/contact.ts` (a read, an insert, and an
update that checks it really changed a row) and `queries/menu-documents.ts`
(several writes in one `batch()`).

For example, whoever builds the gallery would write something like:

```ts
// teazo-site/app/lib/queries/gallery.ts
import { prepare } from "@/app/lib/d1";

type Image = { id: string; name: string; media_id: string };

export function listGalleryImages() {
  return prepare(
    `SELECT id, name, media_id FROM gallery_image
     WHERE deleted_at IS NULL ORDER BY name_sort_key, id`
  ).all<Image>();
}

export function renameGalleryImage(id: string, name: string) {
  return prepare("UPDATE gallery_image SET name = ?1, name_sort_key = ?2 WHERE id = ?3")
    .bind(name, sortKey(name), id)
    .run();
}

export function sortKey(name: string) {
  return name.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}
```

Rules for query files:

- **Server code only.** Never import one into a `"use client"` component.
- **Pass values with `?1`, `?2` and `.bind()`.** Never build SQL by pasting
  values into the string.
- **Filter out deleted rows.** Add `WHERE deleted_at IS NULL` when reading
  `gallery_image`, `event`, `media_asset` or `admin_user`.
- **End every `ORDER BY` with the table's primary key** (usually `id`), so rows
  that tie keep a stable order.
- **Group writes that belong together** in one `batch([...])`.
- **Check that a write happened** when it must: `result.meta.changes === 0`
  means no row matched. Never test for exactly 1: `changes` also counts rows
  that triggers write, so a one-row update of `admin_user`, `gallery_image`,
  `event`, `content_block` or `menu_item_display` usually reports 2 (their
  triggers in `0001_init.sql` also set `updated_at`). `queries/contact.ts` can
  check for 1 only because `business_profile` has no trigger.
- **Set the computed columns when you write.** `gallery_image.name_sort_key`,
  `gallery_tag.name_normalized` and `admin_user.email_normalized` are not filled
  in for you. Write `email_normalized` with `normalizeEmail()` from
  `app/lib/admin-whitelist.ts`, the same function sign-in uses, or the admin
  can't sign in. Write `gallery_tag.name_normalized` as the name trimmed, with
  each run of spaces collapsed to one, and lowercased:
  `name.trim().replace(/\s+/g, " ").toLowerCase()`, as `0002_seed.sql` does.
- **Deleting anything with a file attached** takes ordered steps. Follow §4.2.

---

## 4. Storing files

**Product photos are not in our storage.** They stay at Square. Today the photo
URL comes live from Square's API (`app/lib/square-helpers.ts`); once the
catalog sync exists it will be cached in `catalog_item_cache.square_image_url`.
Our bucket is for what Square can't hold: gallery photos, the home carousel,
event flyers and the PDF menu.

**The database stores a file's key, never its URL.** A key looks like
`gallery/2026/09/<uuid>.webp`. The URL is built when the page renders, from
`R2_PUBLIC_BASE`, so the same row works locally, on preview and in production.

`teazo-site/app/lib/media.ts` has everything for files. Import from it.

| Export | What it does |
|---|---|
| `putMedia(key, bytes, type)` | Stores a file and returns `{ key, size, bucket }`. Record `bucket` in `media_asset.r2_bucket` |
| `StoredMedia` | The type `putMedia` returns; pass it to your query function |
| `mintKey(prefix, ext)` | Creates a new key such as `gallery/2026/09/<uuid>.webp`. Keys are never reused |
| `toPublicUrl(key)` | Builds the public URL for a key. The only place a URL is ever built |
| `deleteMediaNow(key)` | Removes bytes immediately. Only for a file whose rows were never saved (§4.1) |
| `MEDIA_TYPES`, `MediaType` | The accepted types: jpeg, png, webp and pdf |
| `MAX_MEDIA_BYTES` | 10 MB. `putMedia` refuses anything larger |
| `MediaError` | Thrown on failure, with the HTTP `status` when the Worker answered |

`putMedia` accepts a Node `Buffer`, so the output of `sharp` can be passed
straight in.

Locally, uploads land in your simulated bucket and are served by your Worker at
`http://127.0.0.1:8787/media/<key>`. `next.config.ts` already lets `<Image>`
show files from there in development, as long as `R2_PUBLIC_BASE` is exactly
`http://127.0.0.1:8787/media`. Before a page shows stored images with
`<Image>` on Vercel, add the Worker's `workers.dev` hostnames to
`app/lib/imageHosts.ts`.

Keys start with a prefix that matches `media_asset.purpose`. The Worker
doesn't check prefixes, but the database checks `purpose`:

| Key prefix | `media_asset.purpose` |
|---|---|
| `gallery/` | `gallery` |
| `carousel/` | `carousel` |
| `events/` | `event` |
| `documents/menu/` | `document` (and `/api/menu/pdf` only serves this prefix) |
| `branding/` | `branding` |

**An upload can be refused**, so show the admin a clear message rather than a
generic failure. `putMedia` throws a `MediaError` with the `status`:

| Status | Why |
|---|---|
| `413` | Over 10 MB |
| `429` | The day's upload budget is used up. It resets at midnight UTC |
| `503` | The limits couldn't be checked. Locally: a missing migration, or a limit in `.dev.vars` that is not a whole number above zero (§2.5) |
| `507` | This upload would take storage past the cap, which keeps the client from ever being billed |

`docs/ENDPOINTS.md` has the details. To show how full storage is, for example
on the dashboard, use `getStorageUsage()` from `app/lib/usage.ts`; it reports
bytes and limits for both the database and storage, and `r2.uploadsBlocked`.
It throws a `UsageError` on failure, with the HTTP `status` when the Worker
answered, such as `503` (`usage_unavailable`) while migration `0004` is missing
(§2.5). Uncaught, it replaces the whole page with an error, so catch it and
show the page without the numbers.

### 4.1 Saving a file

Every file follows the same three steps: resize (images only), store the bytes,
record the rows.

**The working example is the PDF menu:** `app/api/admin/menu/upload/route.ts`
(the route), `app/lib/menu-upload.ts` (the file checks shared by the browser
and the server), `app/lib/queries/menu-documents.ts` (the rows) and
`app/api/menu/pdf/route.ts` (serving it). PDFs skip the resize. Its failure
handling is the one part not to copy: it leaves the stored file behind when
the database refuses the rows. Follow the template below for that step.

For images, a new upload would look like this. It is a template; no gallery
route exists yet. As in §3.1, the SQL goes in the feature's query file:

```ts
// teazo-site/app/lib/queries/gallery.ts, the file from §3.1. Replace its
// import line with these two, and add the function after sortKey.
import { batch, prepare } from "@/app/lib/d1";
import type { StoredMedia } from "@/app/lib/media";

/** Both rows or neither. Call only after requireAdminApi(request, 2) and putMedia. */
export function recordGalleryUpload(input: {
  mediaId: string;
  stored: StoredMedia;
  width: number;
  height: number;
  originalFilename: string;
  name: string;
  adminId: string;
}) {
  const { mediaId, stored, width, height, originalFilename, name, adminId } = input;
  return batch([
    prepare(
      `INSERT INTO media_asset (id, r2_bucket, r2_key, mime_type, byte_size, width, height,
                                original_filename, purpose, uploaded_by)
       VALUES (?1, ?2, ?3, 'image/webp', ?4, ?5, ?6, ?7, 'gallery', ?8)`
    ).bind(mediaId, stored.bucket, stored.key, stored.size, width, height, originalFilename, adminId),
    prepare(`INSERT INTO gallery_image (id, media_id, name, name_sort_key) VALUES (?1, ?2, ?3, ?4)`)
      .bind(crypto.randomUUID(), mediaId, name, sortKey(name)),
  ]);
}
```

And the route:

```ts
// teazo-site/app/api/admin/gallery/route.ts
import sharp from "sharp";
import { D1Error } from "@/app/lib/d1";
import { putMedia, mintKey, deleteMediaNow, MediaError } from "@/app/lib/media";
import { requireAdminApi } from "@/app/lib/admin";
import { recordGalleryUpload } from "@/app/lib/queries/gallery";

export async function POST(request: Request) {
  const access = await requireAdminApi(request, 2); // Can Edit or above, see §5
  if (!access.ok) return access.response;
  const admin = access.admin;

  const form = await request.formData();
  const file = form.get("file");
  const name = String(form.get("name") ?? "").trim();
  if (!(file instanceof File) || !name) {
    return Response.json({ error: "file and name are required" }, { status: 400 });
  }

  // 1. Resize. Re-encoding to webp at most 2000px wide turns a 1.6 MB phone
  //    photo into a few hundred KB. Photo size is what fills the free storage.
  const { data, info } = await sharp(Buffer.from(await file.arrayBuffer()))
    .rotate()
    .resize({ width: 2000, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });

  // 2. Store the bytes first, so a failure never leaves rows pointing at nothing.
  let stored;
  try {
    stored = await putMedia(mintKey("gallery", "webp"), data, "image/webp");
  } catch (error) {
    if (error instanceof MediaError && error.status === 507) {
      return Response.json({ error: "Storage is full. Delete some photos first." }, { status: 507 });
    }
    if (error instanceof MediaError && error.status === 429) {
      return Response.json({ error: "Too many uploads today. Try again tomorrow." }, { status: 429 });
    }
    if (error instanceof MediaError && error.status === 503) {
      return Response.json({ error: "Uploads are paused right now. Try again later." }, { status: 503 });
    }
    throw error;
  }

  // 3. Record it: both rows or neither.
  const mediaId = crypto.randomUUID();
  try {
    await recordGalleryUpload({
      mediaId,
      stored,
      width: info.width,
      height: info.height,
      originalFilename: file.name,
      name,
      adminId: admin.id,
    });
  } catch (error) {
    // The database refused the rows, so nothing points at the file: remove it.
    // With no status the outcome is unknown, so leave it rather than risk a
    // row that points at nothing.
    if (error instanceof D1Error && error.status !== undefined && error.status < 500) {
      await deleteMediaNow(stored.key);
    }
    throw error;
  }

  return Response.json({ mediaId, key: stored.key }, { status: 201 });
}
```

A file left behind by a failed save keeps counting toward the storage cap,
because nothing cleans it up later. That is why the template removes it when
the database definitely refused the rows.

The resize needs `sharp`. It already imports, because Next.js ships it as an
optional dependency, but add it to `teazo-site/package.json`
(`npm install sharp`) so its version is pinned.

> **Vercel rejects request bodies over 4.5 MB**, before your route even runs,
> and phone photos are often bigger. Shrink them in the browser first:
>
> ```ts
> async function shrink(file: File, max = 2000): Promise<File> {
>   const img = await createImageBitmap(file);
>   const scale = Math.min(1, max / Math.max(img.width, img.height));
>   const canvas = new OffscreenCanvas(Math.round(img.width * scale), Math.round(img.height * scale));
>   canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
>   const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.9 });
>   return new File([blob], file.name.replace(/\.[^.]*$/, "") + ".jpg", { type: "image/jpeg" });
> }
> ```

### 4.2 Deleting a file

**Never delete the bytes yourself.** Retire the rows and queue the bytes, in one
`batch()`. The Worker removes queued bytes 24 hours later, which leaves a day to
undo a mistake. Copy the bucket and key from the media row so they can't be
mistyped:

```ts
await batch([
  prepare("UPDATE gallery_image SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?1").bind(imageId),
  prepare("UPDATE media_asset SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?1").bind(mediaId),
  prepare("INSERT INTO pending_r2_deletion (r2_bucket, r2_key) SELECT r2_bucket, r2_key FROM media_asset WHERE id = ?1").bind(mediaId),
]);
```

The order matters. The database refuses to retire a `media_asset` while
anything still uses it, so whatever uses it goes first:

| What uses the file | First statement |
|---|---|
| `gallery_image`, or an `event` being deleted | Set its `deleted_at` |
| An admin's avatar, or the image of an event you are keeping | Set `admin_user.avatar_media_id` or `event.image_media_id` to `NULL` |
| `content_block.media_id`, `site_link.icon_media_id` | Set the reference to `NULL` |
| `carousel_slide`, `menu_document` | Delete the row |

If the file is still used somewhere else, the batch fails with a `D1Error`
whose message contains `media_asset is still referenced`. Return a 409. The
error doesn't say where the file is used; run a query first if you want to tell
the admin.

**Old menu PDFs are kept on purpose.** Replacing the menu keeps every earlier
version. Removing one means deleting its `menu_document` row, then retiring and
queueing its media, in the same batch.

**To undo a deletion** within the 24 hours, reverse the delete batch in one
batch: clear `deleted_at` on the media row, put back what used it, and remove
the queued row with
`DELETE FROM pending_r2_deletion WHERE r2_bucket = ?1 AND r2_key = ?2 AND deleted_at IS NULL`.
Putting it back means clearing `deleted_at` (`gallery_image`, `event`), setting
the reference back to the media id (the avatar, a kept event's image,
`content_block`, `site_link`), or inserting the `carousel_slide` or
`menu_document` row again from values you read before deleting it.

Refuse the undo once the deletion is 24 hours old. After that the sweeper may
already have removed the file, and the undo batch still succeeds, bringing back
rows whose file is gone. If
`SELECT deleted_at FROM pending_r2_deletion WHERE r2_bucket = ?1 AND r2_key = ?2 ORDER BY queued_at DESC, id LIMIT 1`
returns a timestamp, the file is already gone.

§2.5 shows how to run the sweeper locally, including on rows your own code
queued.

---

## 5. Authentication

**How sign-in works.** Sign-in is Google only, through NextAuth
(`teazo-site/auth.ts`). `/login` is both the sign-in page and where errors are
shown. After Google, NextAuth admits the person only if Google has verified
their email and it matches a live `admin_user` row with status `active` or
`invited`; everyone else sees "This Google account does not have admin
access". If the database lookup fails, for example because the Worker can't
be reached or refuses the app's `PROXY_TOKEN`, sign-in stops with "We could not
verify your access" instead (§2.3). The session is an encrypted cookie that lasts 8 hours; the database
holds no sessions. After sign-in the admin lands on `/admin`, and signs out
from the admin navigation.

The admin check runs twice: once at sign-in, and again on every admin page and
admin API request. So removing or suspending an admin takes effect on their
next request, even though their cookie is still valid.

**The helpers.** Import them; never write your own check.

| From | Export | Use it in | What it does |
|---|---|---|---|
| `app/lib/admin.ts` | `requireAdminPage(minRole = 3)` | Pages, layouts, server actions | Returns the admin, or redirects to `/login` (not signed in), `/login?error=AccessDenied` (not enough access) or `/login?error=ServiceUnavailable` (the database lookup failed) |
| | `requireAdminApi(request, minRole = 3)` | Route handlers | Returns `{ ok: true, admin }`, or `{ ok: false, response }` with a ready 401, 403 or 503 |
| | `getAdmin(minRole)` | Code that must branch without redirecting | Returns the admin or `null`. With a session, it throws a `D1Error` if the database lookup fails; with no session it returns `null` without asking the database |
| | `Admin` | | `{ id, username, role_id, can_invite_users }` |
| `app/lib/admin-whitelist.ts` | `normalizeEmail(email)` | Anything that writes `admin_user.email_normalized` | Trims and lowercases, exactly as sign-in does |
| | `findAuthorizedAdmin(email)`, `AdminRole` | Rarely needed directly | The sign-in lookup |

Roles: 1 Owner, 2 Can Edit, 3 Can View. A lower number is more access, so
`minRole = 2` lets in Owners and Can Edit.

In a page:

```ts
const admin = await requireAdminPage(2);
```

In a route handler:

```ts
const access = await requireAdminApi(request, 2);
if (!access.ok) return access.response;
const admin = access.admin;
```

Three rules:

- **Every page under `/admin` calls `requireAdminPage` itself**, even though
  `app/admin/layout.tsx` also does. A layout isn't re-run on every client
  navigation, and it never protects route handlers or server actions.
- **Every admin route handler calls `requireAdminApi(request, n)` first.**
- **In an admin server action**, call `await requireAdminPage(n)` at the top.

**Who can reach what today:**

| Route | Who |
|---|---|
| Every page under `/admin` | Any admin (Can View and up) |
| `POST /api/square/products`, `PUT` and `DELETE /api/square/products/[id]`, `POST /api/admin/menu/upload` | Can Edit and up |
| `GET /api/square/*`, `GET /api/menu/pdf`, `/api/auth/*`, the contact form | Everyone, on purpose |
| `/account` | Anyone signed in |

**Testing an admin write from a terminal.** `requireAdminApi` refuses a write
(anything but `GET`, `HEAD` or `OPTIONS`) unless its `Origin` header is the
site's own, so send one along with your session cookie (copy
`authjs.session-token` from your browser's cookies for `localhost:3000`):

```bash
curl -X POST http://localhost:3000/api/... -H "Origin: http://localhost:3000" -H "Cookie: authjs.session-token=..."
```

Otherwise you get 403 "Request origin is not allowed." Never call an admin
route from server code; call the query function directly.

**Adding admins.** Settings doesn't save to the database yet, so on your
machine the only way to add an admin is `npm run db:seed:local` (§2.3). When
the add-admin route is built, it inserts the row with status `invited` and then
emails the new admin how to sign in:

```ts
import { after } from "next/server";
import { sendAdminInvite } from "@/app/lib/admin-invite";

// once the admin_user row is saved
after(() => sendAdminInvite({ email, username, role, canManageAdmins, invitedBy: admin.username }));
```

`after()` sends it once the response is on its way, so the admin panel doesn't
wait. `sendAdminInvite` never throws: a failed email is logged, and the new
admin can still sign in. Locally the invite is printed or caught by Mailpit
(§2.5). Both `invited` and `active` can sign in, and nothing in the app
changes one into the other yet (re-running `npm run db:seed:local` for an
address sets it to `active`, whatever its status). The database allows at most one Owner, and the handlers must
refuse to delete or demote the Owner.

**There are no passwords.** Sign-in is Google only, so there is no password
reset email. The "Forgot password?" link on `/login` is a placeholder. An admin
who loses their Google account is removed and added again under their new
address. Once Settings saves admins, adding them again sends a new invite.
Until then, on your machine, use
`npm run db:seed:local -- <new address> --role <their role>`, which sends no
email. Only one Owner is allowed, so to give the new address `--role 1`, reset
your database first (§2.4).

---

## 6. The database

27 tables, created by the migrations in `teazo-site/migrations/` (most of them
in `0001_init.sql`). Open them when you need exact columns.

**In use today:**

| Table | Holds | Written by | Read by |
|---|---|---|---|
| `admin_user` | admin accounts | `npm run db:seed:local` today; the Settings handlers once built | sign-in, `requireAdminPage`, `requireAdminApi` |
| `business_profile` | address, phone, email, and `contact_form_enabled` (one row) | the seed; the switch has a setter with no caller yet | `/contact` and its action, which read the switch only |
| `contact_message` | contact form messages | the public contact form, after the bot check | the contact form's action, which counts recent rows for the email limits (§2.5). Messages past those limits are not emailed, and there is no inbox page yet, so they can be read only from the database |
| `media_asset` | one row per stored file | the PDF menu upload | `/api/menu/pdf` |
| `menu_document` | the PDF menu, versioned | the PDF menu upload on `/admin/menu` | `/api/menu/pdf`, used by `/static-menu` and `/admin/menu` |
| `pending_r2_deletion` | files waiting to be removed | delete handlers (none yet, §4.2) | the Worker's hourly sweeper, which marks rows done |
| `r2_object`, `r2_class_a_day` | what is stored in R2, and uploads per day | **the Worker only**, never app code | the Worker's billing limits and `GET /usage` |
| `role` | Owner / Can Edit / Can View | the seed | the `admin_user.role_id` foreign key. The app uses the ids 1 to 3 directly |

**Built, waiting for their features** (seeded by `0002_seed.sql` or empty):

| Table | Holds | Will be written by | Will be read by |
|---|---|---|---|
| `business_hours` | one row per day of the week, 0 = Monday (§9) | `/admin/website-content` | `/contact` |
| `hours_exception` | holiday closures, by date | `/admin/website-content` | `/contact` |
| `site_link` | social and delivery links | `/admin/website-content` | `/`, `/contact`, `/delivery` |
| `content_block` | editable text on the site | `/admin/website-content` | public pages |
| `carousel_slide` | home page carousel | no admin page yet | `/` |
| `gallery_image` | gallery entries | `/admin/gallery` | `/gallery` |
| `gallery_tag` | tag names | the seed, then uploads | gallery filter |
| `gallery_image_tag` | image ↔ tag | uploads | gallery filter |
| `event` | events: name, image, start and end | `/admin/events` | public pages |
| `event_item`, `event_category` | which Square items or categories an event covers | `/admin/events` | public pages |
| `square_sync_state` | where the Square sync is up to | the sync | the sync |
| `catalog_item_cache` | Square items, cached, including Square's photo URL | the sync | `/menu`, `/admin/menu` |
| `catalog_variation_cache` | **sizes and prices** | the sync | `/menu` |
| `catalog_category_cache` | Square categories, cached | the sync | `/menu` |
| `menu_section` | menu sections and subtitles | `/admin/menu` | `/menu` |
| `menu_section_item` | which items, in what order | `/admin/menu` | `/menu` |
| `menu_item_display` | badge, featured, hidden | `/admin/menu` | `/menu` |

Whoever wires holidays: the admin page treats a holiday as a month and day
that repeats every year, while `hours_exception` stores one row per date.
Decide how to map them before building it.

There are no passwords, reset tokens or invitation tokens in the schema:
sign-in is Google only (§5). Password sign-in would need a new migration (§7)
and a new provider in `auth.ts`.

### Columns that look odd but matter

| Column | Why it is there |
|---|---|
| `square_env` | Square's sandbox and production catalogs share no ids. Every Square-keyed row says which one it belongs to. |
| `square_version` | Tells you whether a cached price is stale. A stale price is a customer-facing error. |
| `name_sort_key` | SQLite cannot sort the way the admin UI does, and names are bilingual. Computed when you write the row. |
| `email_normalized`, `name_normalized` | Stop `Karen@x.com` / `karen@x.com` and `Matcha` / `matcha` being two different things. Write `email_normalized` with `normalizeEmail()`. |
| `status` (`admin_user`) | `active` and `invited` can sign in; `suspended` cannot. |
| `can_invite_users` | Per-admin flag, valid only for role 2. |
| `contact_form_enabled` | 1 shows the public contact form; 0 hides it, and the form's action refuses messages. |
| `r2_bucket` | Always record the `bucket` that `putMedia` returns. The sweeper only removes files from its own bucket, which keeps a preview from ever deleting production files. |
| `is_current` | At most one live PDF menu. None means the site serves the bundled `public/teazo-menu.pdf`. |
| `deleted_at` | `admin_user`, `media_asset`, `gallery_image` and `event` are soft-deleted: filter `WHERE deleted_at IS NULL`. In `pending_r2_deletion` it means the bytes are gone. |

SQLite has no `BOOLEAN` (use `INTEGER` 0/1), no `ENUM` (`TEXT` with a
`CHECK`), no JSON type (`TEXT`, validated) and no `UUID` (`TEXT` ids).
Timestamps are ISO-8601 text in UTC, written with
`strftime('%Y-%m-%dT%H:%M:%fZ','now')`.

### The Square cache

`catalog_item_cache`, `catalog_variation_cache` and `catalog_category_cache`
will be a copy of Square, filled by a sync that doesn't exist yet. Whoever
writes it:

- Key every row by the Square id **and** `square_env` (`sandbox` or
  `production`), because the two catalogs share no ids. The Square client in
  `app/lib/square.ts` is fixed to the sandbox, so set `square_env` from
  configuration, not from the client.
- Store `square_version`, so a stale price can be detected.
- One `catalog_variation_cache` row per size, never just the first.
- Never delete a `catalog_item_cache` or `catalog_category_cache` row: set
  `is_deleted = 1`, because menu sections point at cached items.
  `catalog_variation_cache` has no `is_deleted`; nothing references it, so
  delete a size's row when Square removes that size.
- `square_image_url` is Square's own photo URL. The photo stays at Square.
- Events can name Square items before the sync has ever run, so when showing
  an event, skip item ids the cache doesn't have.
- Read the Square gotcha in §9 first.

---

## 7. Changing the schema

A schema change is a new migration file, reviewed in a pull request like any
other code.

1. Add `teazo-site/migrations/000N_what_it_does.sql`, taking the next number
   (currently `0005`). The descriptive name keeps two people's migrations from
   colliding.
2. Apply it on top of your existing data. From the repo root:
   `cd teazo-d1-proxy && npm run db:migrate:local`
3. Prove it also works from empty: stop the Worker, then from `teazo-d1-proxy`
   run `rm -rf .wrangler/state && npm run db:seed:local -- you@gmail.com`
   (the seed migrates and restores your admin row), and start the Worker again
   with `npm run dev`. Like any reset (§2.4), this empties your local bucket.
   **Nothing checks migrations automatically**, so say in the pull request that
   you did both.
4. Once it merges, everyone else runs `npm run db:migrate:local` (or the seed).

**Never edit a migration after it has merged.** It is recorded as applied, so
your edit silently never runs on any database that already has it. Write a new
migration instead.

One pull request is enough for a new table, an index, a nullable column, or a
new column with a constant `DEFAULT` such as `0` or `'active'` (it may carry
its own `CHECK`, as `0003` does, and every existing row must pass it). SQLite
can't add a column whose default is an expression, such as the `strftime(...)`
timestamps in `0001`, or a `UNIQUE` column. Add those as nullable columns that
your code fills in, with a separate `CREATE UNIQUE INDEX` for uniqueness.
Except for `UNIQUE`, SQLite refuses these, a `NOT NULL` column without a
default, and a `CHECK` the default fails only when the table already has rows.
Most tables are empty on your machine, so such a migration can pass steps 2
and 3 and then fail in production. Before step 2, put at least one row in each
table your migration changes.

Removing a column needs **two** pull requests merged separately: first the
code that stops using the column, then the migration, because migrations are
applied before the new code goes live. If an index or a trigger names the
column, including the `AFTER UPDATE OF` lists of the `_touch` triggers, the
migration must drop it first and create it again without that column, or
SQLite refuses with `error in index ... after drop column` or
`error in trigger ... after drop column`. A primary key or `UNIQUE` column
can't be dropped without rebuilding the table. A `CHECK` on the column itself
is removed with it.

Don't rename a column. If you must, raise it in the channel first, because it
takes three pull requests: the first adds the new column, copies the old values
into it, and changes the code to read the new column and write both; the
second stops the code using the old column, with a migration that copies the
values again, for the rows the old code wrote while the first one was
deploying; the third removes the old column as above. If the old column is
`NOT NULL` with no `DEFAULT`, the code can't stop writing it without
rebuilding the table.

Adding a foreign key or a `CHECK` to an existing column, or making it
`NOT NULL`, means rebuilding the whole table. Newer SQLite can add a `CHECK` or
`NOT NULL` with `ALTER TABLE`, but your local Worker refuses both with
`not authorized to use function: sqlite_fail`, and nobody has checked the real
D1, so plan on the rebuild. For `NOT NULL`, first merge code that always fills
the column. Rows written before it went live are still `NULL`, so the rebuild
migration must fill them first
(`UPDATE <table> SET <column> = ... WHERE <column> IS NULL`), or copying them
into the new table fails with `NOT NULL constraint failed`. Raise any rebuild
in the channel before you start.

---

## 8. How your code reaches production

**The site deploys to Vercel, but the Worker doesn't exist yet**, so nothing
there can reach a database. Vercel builds production from `dev`, and every
other pushed branch gets its own preview. On Vercel today, sign-in fails with "We could not
verify your access", the contact form refuses every message, and the PDF menu
link returns an error. Test anything that involves the database, storage,
sign-in or email on your machine.

Two D1 databases exist on the team Cloudflare account, `teazo-db` and
`teazo-db-preview`, with migrations `0001` and `0002`. The Worker and the R2
buckets are waiting on the account's payment setup. When they go live, the
order is: apply the missing migrations (without `0004` every upload is
refused, and without `0003` the contact form refuses every message), then
deploy the Worker, then the app. Build as though that is already true and nothing you write now will
need reworking.

While that is pending:

- **Nothing validates your migrations for you.** Test them yourself (§7).
- **Nothing you merge reaches those databases.** The app can only reach them
  through the deployed Worker.
- `npm run tail` and `npm run db:backup` work on the real Worker and database
  and need the team Cloudflare account. Leave them to Juan.

### 8.1 Settings for Vercel

Save each variable marked Secret in the Notes column as Vercel's Secret type
(the Sensitive switch on older screens), which hides its value once saved. Set
it for Production and Preview as the table shows. If Vercel won't let you
change a variable you already saved as Config (plain) into a Secret, delete it
and add it again. Never prefix a secret with `NEXT_PUBLIC_`. Vercel applies a variable only to
deployments made after you save it, so redeploy after adding or changing any
of these. That includes the `NEXT_PUBLIC_` ones, which are built into the
pages.

| Variable | Production | Preview | Notes |
|---|---|---|---|
| `D1_PROXY_URL` | the production Worker's `workers.dev` URL | the preview Worker's URL | |
| `PROXY_TOKEN` | the production Worker's secret | the preview Worker's secret | Secret. Must match `wrangler secret put PROXY_TOKEN` for that Worker |
| `R2_PUBLIC_BASE` | the production Worker URL + `/media` | the preview Worker URL + `/media` | |
| `AUTH_SECRET` | a long random string | its own string | Secret |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | the team OAuth client | the same | Secret. The OAuth client must list `https://teazo-site.vercel.app/api/auth/callback/google`. Google allows no wildcards, and each commit's preview gets a new address, so a preview can sign in only at its branch URL (shown on the deployment's page in Vercel, like `https://teazo-site-git-<branch>-<team>.vercel.app`), and only after Sammy adds that URL's `/api/auth/callback/google` |
| `SQUARE_ACCESS_TOKEN` | the sandbox token, for now | the same | Secret. The Square client is fixed to the sandbox |
| `NEXT_PUBLIC_BASE_URL` | `https://teazo-site.vercel.app/` | the same | Trailing `/`. Also the sign-in link in invite emails. Each preview commit gets a new address, so previews use production's, and their `/admin/menu` and `/admin/events` read the product list through production |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | the production widget's site key | `1x00000000000000000000AA` | Public |
| `TURNSTILE_SECRET_KEY` | the production widget's secret | `1x0000000000000000000000000000000AA` | Secret |
| `BREVO_API_KEY` | the Brevo API key | leave unset | Secret. Unset means the deployment sends no email |
| `EMAIL_FROM` | a sender address verified in Brevo | | Required whenever `BREVO_API_KEY` is set, or every email fails |
| `EMAIL_FROM_NAME` | optional | | Defaults to "TEAZO website" |
| `CONTACT_NOTIFY_TO` | the owner's inbox | | Required. Without it, contact messages are saved but nobody is emailed, and the logs say `CONTACT_NOTIFY_TO is not set` |

Vercel sets `NODE_ENV`, `VERCEL`, `VERCEL_ENV` and
`VERCEL_PROJECT_PRODUCTION_URL` itself; don't add them. `BREVO_SANDBOX=1`,
added to Production next to the key, makes Brevo accept each email and deliver
nothing, with nothing in its logs. It only shows the request is well formed,
not that email arrives. Delete it and redeploy when you are done, or no email
is ever delivered.

**The Worker's own settings** live in `teazo-d1-proxy/wrangler.jsonc`: the
bucket name and each deployment's R2 storage cap and daily upload budget. Its
one secret is set with `npx wrangler secret put PROXY_TOKEN` (and again with
`--env preview`).

Previews use Cloudflare's Turnstile test keys because each preview gets its own
`*.vercel.app` address, and a widget only covers the hostnames listed on it. On
the production deployment the code ignores a test secret, so every submission
is refused until the real one is set; a test site key there is logged as an
error. Either way the check fails closed, never open: the visitor sees "The
security check isn't working right now", and the logs show `TURNSTILE_SECRET_KEY
is one of Cloudflare's test secrets`, plus `NEXT_PUBLIC_TURNSTILE_SITE_KEY is
missing or is a Cloudflare test key on production` for a test site key. To see
this on your machine, follow §2.8 and start the app with
`VERCEL_ENV=production npm start`. With `VERCEL_ENV=preview`, the same test
keys pass.

**Turnstile.** On the team Cloudflare account, open Turnstile, add a widget in
Managed mode, and list the production hostname (`teazo-site.vercel.app` for
now, plus the shop's own domain later). It is free, and the site does not need
to be on Cloudflare.

**Brevo** (free plan: 300 emails a day, never billed while no card is added):

1. The client opens the account. The free plan allows one login.
2. Add the sender address under Settings > Senders, Domains, IPs > Senders >
   Add a sender, save it, and enter the 6-digit code Brevo emails to that
   address.
3. Create an API key under Settings > SMTP & API > API Keys & MCP > Generate a
   new API key. Choose no expiration, copy the key right away (Brevo shows it
   only once), and add it to Vercel for Production only.
4. Keep Brevo's IP blocking for API keys off. Vercel sends from changing
   addresses, and while blocking is on, Brevo refuses email from any address it
   hasn't seen before. A new account starts with blocking off. Brevo switches it
   on by itself once no new address has used the key for 30 days, and emails
   the account owner when it blocks one. When that email comes, and about a
   month after the site starts sending, open Settings > Security > Authorized
   IPs. If the API keys row says Activated, choose "Deactivate for API". Don't
   authorize IPs by hand, because that switches blocking on.
5. Never add a card or buy credits. Buying credits replaces the free 300 a day.
6. Brevo expires a key that goes unused for 90 days and emails a warning 7 days
   before. If the site goes that long without sending an email, create a new
   key.
7. Without the shop's own domain, Brevo rewrites the sender address, and
   Hotmail and Gmail may file the emails as junk. Have the owner mark the first
   one "Not junk", and tell new admins to check their spam folder for the
   invite. A domain fixes this for good.
8. Once the site is live, send one message through the contact form and check
   that it reaches `CONTACT_NOTIFY_TO` (look in junk too). If it doesn't, check
   that `BREVO_SANDBOX` is not set, then search the Vercel logs for
   `notification email failed`, `CONTACT_NOTIFY_TO is not set` and
   `[email] Not sent`. If the failed line says `Brevo refused the email` and
   that the account is not yet activated, the client asks Brevo to activate
   transactional email in a support ticket from inside Brevo.

A failed email never loses a contact message: it is saved before the email is
attempted, and a failure is only logged. The owner gets at most 20 contact
emails in any 60 minutes and 100 in any 24 hours, and the message that takes a
count past its limit sends an "alerts paused" email instead (§2.5). However a
flood is paced, that is at most 101 emails in any 24 hours, so spam can't use
up Brevo's 300 a day, and every message is still saved. Admin invites come out
of the same 300 a day.

---

## 9. Gotchas

- **`business_hours.day_of_week` is 0 = Monday.** JavaScript's `getDay()` is
  0 = Sunday, and so is the hours list on `/admin/website-content`, which
  starts with Sunday. Convert either one to `day_of_week` with `(day + 6) % 7`,
  and back with `(day_of_week + 1) % 7`, for example to fill that list from the
  table. Used directly, a Saturday reads Sunday's hours. Work out today's day
  in the shop's time zone (`business_profile.timezone`), not the server's,
  which is UTC on Vercel. `getDay()` always uses the server's, so use
  `["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone }).format(new Date()))`,
  which gives the same number in that zone.
- **Compare timestamps only in the same format.** Comparing a column against
  `datetime('now', …)` compares `'2026-09-08T…'` with `'2026-09-08 …'` as
  text and silently gives the wrong answer. Use
  `strftime('%Y-%m-%dT%H:%M:%fZ', 'now', …)` on both sides.
- **End every `ORDER BY` with the primary key** (`…, id`). Rows that tie come
  back in whatever order SQLite's query plan reaches them, so the order changes
  when the query, an index or the rows change, and a paged list can repeat or
  skip rows.
- **Never gate anything on `auth()` alone.** Removing or suspending an admin
  does not end their session. The cookie lasts 8 hours from when it was last
  renewed, and every request to `/api/auth/session` renews it, so a removed
  admin can keep it alive indefinitely. Use `requireAdminPage` or
  `requireAdminApi` (§5), which check `admin_user` on every request.
- **Leave `GET /api/square/*` public.** `/admin/menu` and `/admin/events` fetch
  it from the server without your cookie, so guarding it would break both
  pages. Guard only the writes.
- **Use `http://localhost:3000`, never `127.0.0.1:3000` or the network
  address.** In development Next.js lets only `localhost` open its live-reload
  connection, so on any other address the page's scripts never start. Links
  still work, but the Google button does nothing, the contact form's bot check
  never appears, and Submit answers "Please wait for the security check...".
  The first time you open one of those addresses after starting the app, the
  terminal prints `Blocked cross-origin request to Next.js dev resource
  /_next/hmr`. Your sign-in cookie also belongs to `localhost` only.
- **Renaming a gallery image means recomputing `name_sort_key`.**
- **Tag names are unique ignoring case** only because `name_normalized` is
  written lowercased (§3.1). Add a tag with
  `INSERT … ON CONFLICT(name_normalized) DO NOTHING`, then read its id with
  `SELECT id FROM gallery_tag WHERE name_normalized = ?1`, because
  `DO NOTHING` returns no row when the tag already exists.
- **Building the Square sync?** The Square routes will corrupt the cache if the
  sync copies them. `PUT /api/square/products/[id]` sends Square only the first
  size, so every other size is dropped, and it leaves out the item's photo ids,
  which may clear its photo.
  `POST` creates a single size named "Regular", and the list and helper code
  read only the first size's price. `app/lib/square.ts` also replaces
  `BigInt.prototype.toJSON` with a lossy `Number(this)`, which every price
  passes through. Fix these before caching anything.

---

## 10. Where everything else lives

| What | Where |
|---|---|
| The schema: every table, column, constraint and trigger | `teazo-site/migrations/`, read in order (`0001` creates most tables, `0003` adds the contact form switch, `0004` adds the R2 ledger) |
| The starting data: roles, address, hours, links, content blocks, menu sections, gallery tags (no admins) | `teazo-site/migrations/0002_seed.sql` |
| Giving yourself an admin role locally | `teazo-d1-proxy/scripts/seed-local.mjs` (`npm run db:seed:local`) |
| The proxy Worker: the only file with Cloudflare bindings | `teazo-d1-proxy/src/index.ts` |
| Its bindings, cron schedule, bucket names, and each deployment's R2 cap and daily budget | `teazo-d1-proxy/wrangler.jsonc` |
| Every Worker endpoint, limit and error code | `docs/ENDPOINTS.md` |
| Database, storage, usage, email and bot-check helpers | `teazo-site/app/lib/` (`d1.ts`, `media.ts`, `usage.ts`, `email.ts`, `turnstile.ts`) |
| The emails the site sends | `teazo-site/app/lib/contact-notification.ts`, `teazo-site/app/lib/admin-invite.ts`, and the "alerts paused" email and the email limits in `teazo-site/app/(site)/contact/actions.ts` |
| Feature SQL | `teazo-site/app/lib/queries/` |
| Sign-in and admin checks | `teazo-site/auth.ts`, `teazo-site/app/lib/admin.ts`, `teazo-site/app/lib/admin-whitelist.ts` |

**The migrations are the source of truth** for columns, constraints and
triggers. If this guide disagrees with them, they win; say so in the channel
and the guide gets corrected. Their prose comments can lag behind the code,
because a merged migration is never edited.

Creating the real Cloudflare resources and deploying (databases, buckets,
secrets, going live) is tracked separately as infrastructure work.

If you get stuck on setup, post the command and its full output in the channel
rather than a screenshot of the error line. The useful part is usually three
lines above it.
