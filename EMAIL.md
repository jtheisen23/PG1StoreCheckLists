# Email

When a store completes a checklist, the people you nominate get a summary:
the score, whether it passed, and every item that failed with the reason
written at the time and any reading that caused it. A critical failure says so
in the subject line, because most of these are read as a phone notification and
never opened.

Nothing is sent until you connect an account. Until then the app runs exactly
as it does now — the setting is simply off.

## Connecting a Google account

These steps are all in a browser. The account can be a Google Workspace
address on your own domain (`audits@pg1restaurants.com`) or an ordinary Gmail
address; the Workspace one is better, and the reason is under
[Sending limits](#sending-limits).

Google will not let an application sign in with the account's normal password.
You create a separate **App Password** for this app, which you can revoke on
its own later without touching the account.

**1. Turn on 2-Step Verification** for that account, at
<https://myaccount.google.com/signinoptions/twosv>. App Passwords do not exist
until this is on.

**2. Create the App Password** at <https://myaccount.google.com/apppasswords>.
Name it something you will recognise in a year — "Store Checklists". Google
shows you 16 characters in four groups. Copy them. You cannot see it again, and
the spaces do not matter.

**3. Add three settings in Vercel**, under Settings → Environment Variables.
Tick every environment (Production, Preview and Development), the same way you
did for the database:

| Name | Value |
| --- | --- |
| `GMAIL_USER` | `audits@pg1restaurants.com` |
| `GMAIL_APP_PASSWORD` | the 16 characters from step 2 |
| `APP_URL` | your site's address, e.g. `https://checklists.pg1restaurants.com` |

`APP_URL` is what makes the "See the full submission" button in the email point
somewhere useful. Without it the email still sends, just without the link.

**4. Redeploy.** Settings only reach the app on the next deploy.

**5. Say who gets what.** Open **Admin → Checklists**, pick a checklist, and
fill in *Email this audit when it is completed*. Addresses are per checklist,
so the Facilities Audit can go to your maintenance lead while the Food Safety
Audit goes to your ops director. Leave it empty to email nobody.

## Sending limits

Google caps how much mail an account can send in a day: **2,000 messages for a
Workspace account** on your own domain, and **500 for a personal @gmail.com
address**. Each completed checklist with recipients is one message, however
many addresses are on it.

Audits are periodic, so this is not usually close. It is worth a thought before
you put recipients on a checklist every store runs several times a day: 43
stores × 3 walks is 129 messages a day from that one checklist alone.

If you outgrow it, a service built for this — Resend, Postmark, SendGrid —
lifts the ceiling and gives you delivery logs and bounce handling. Switching is
a change of settings, not of the app: see below.

## Any other mail server

Instead of the two `GMAIL_` settings, use:

| Name | Value |
| --- | --- |
| `SMTP_HOST` | e.g. `smtp.resend.com` |
| `SMTP_PORT` | `587`, or `465` for implicit TLS |
| `SMTP_USER` / `SMTP_PASSWORD` | as issued by the provider |
| `EMAIL_FROM` | the visible sender, e.g. `PG1 Restaurants <audits@pg1restaurants.com>` |

`EMAIL_FROM` also works alongside the Gmail settings when you want the sender to
read as a name rather than a bare address.

## Turning it off, and checking it

`EMAIL_DRIVER=off` stops all sending without removing anything else.
`EMAIL_DRIVER=console` prints each email to the deployment logs instead of
sending it, which is the quickest way to see exactly what would have gone out.

The build prints a warning if email is half configured — one of the two Gmail
settings missing, or a password that is not the right shape for an App Password
— rather than failing the build or, worse, going quiet.

## What happens when sending fails

Nothing that costs anyone their work. The email is handed off after the
submission is already saved, so a mail server that is down, slow, or refusing
the password cannot fail an audit somebody just spent forty minutes on. The
failure is written to the deployment logs, and the submission, its score and its
corrective actions are all in the app regardless.
