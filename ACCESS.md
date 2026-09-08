# Passwords and getting back in

There are three ways a password gets set, for three different situations.

## Someone forgot theirs

**Admin → People → Reset password**, next to their name. Type a new one and
give it to them directly — nothing is emailed. Every device that account was
signed in on is signed out at the same moment, which is the point: the old
password is no longer trusted.

They can change it to something of their own afterwards.

## Changing your own

The avatar in the top right → **Your account**. You need your current password,
so someone who finds an unlocked phone cannot take the account over. Your other
devices are signed out; the one you are using stays signed in.

## The last administrator is locked out

Everything above needs somebody already signed in. If the only administrator
account cannot get in, nobody can — and inside is a fleet's operating record.

This is the way back. It is switched off until you switch it on.

**1. Invent a long random code.** Thirty characters or so of letters and
numbers. Anything shorter than 24 characters is refused, because a short one is
guessable and a guessable one is a way into every store's records.

**2. In Vercel → Settings → Environment Variables**, add:

| Name | Value |
| --- | --- |
| `ADMIN_RECOVERY_TOKEN` | the code from step 1 |

Tick every environment, the same way you did for the database.

**3. Redeploy.** Settings only reach the app on the next deploy.

**4. Go to `/recover`** on your site — for example
`https://checklists.pg1restaurants.com/recover`. Enter the administrator's
email address, the code, and a new password.

**5. Sign in, then delete `ADMIN_RECOVERY_TOKEN` and redeploy.** Leaving it in
place leaves a second key to the building lying under the mat.

### What it will and will not do

- It only works for an **active administrator** account. A code that is correct
  but names a general manager is refused, and that person's password is left
  alone.
- With `ADMIN_RECOVERY_TOKEN` unset, `/recover` does not exist — the page
  returns 404, so there is nothing to find or attack.
- A token shorter than 24 characters keeps the page switched off and logs a
  warning, rather than pretending to protect anything.
- The reset is written to the activity log against that account, so an
  out-of-band password change is visible afterwards rather than silent.

## What does not exist yet

There is no "forgot my password" email, because it needs a mail account
connected — see `EMAIL.md`. Once one is, this is the obvious next thing to
build, and it would replace step 3 of the admin reset above for everyone
except a locked-out administrator.
