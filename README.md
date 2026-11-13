# TSKR

Services marketplace for the Philippines. This repo follows the **TSKR App – Developer Guide (Nov 7, 2026)**.

```
tskr-app/
  supabase/migrations/   database: tables, security (RLS), server functions, seed data
  mobile/                React Native (Expo) app — client sign-up done, rest in progress
```

## Status

| Part | Status |
|---|---|
| Supabase project `TSKR` (Singapore, ref `kgewevgkqxvwdwaxizri`) | Live |
| Database schema: users, consents, OTP, KYC, skills, addresses, coin ledger, bookings, chat, fees, strikes, reviews, tickets, notifications | Done |
| Security: RLS on every table; apps write only through server functions | Done, tested |
| Booking state machine §6.2 (requested → … → completed / cancelled), coins charged only at Start job | Done, tested end-to-end |
| Cancellations §8 (free / free this month / ₱100 fee to tasker QR / strikes 100-200-pause) | Done, tested |
| Skills §4.1 (2 free, max 5, banned words), discovery/search §5.3, name masking §7.1 | Done, tested |
| Seed: all §11 config values, 48 skills in 16 categories, banned terms, Terms/Privacy v1.0 + ID consent | Done |
| Mobile: client sign-up (Welcome → read-to-agree → Google → name → email code → mobile → SMS → done) | Done (needs a device test) |
| Mobile: client Home/booking/chat/tracking, tasker app, Become a Tasker | Next |
| Admin panel (Next.js) | Next |
| Real SMS (Semaphore), Google OAuth, PayMongo/Xendit, KYC/OCR, FCM, maps, WebRTC | Needs company accounts |

## Run the mobile app

```bash
cd mobile
cp env.example .env         # Supabase URL + publishable key + demo switch
npm install
npx expo install --fix      # aligns package versions with the installed Expo SDK
npx expo start              # press i (iOS sim), a (Android), or scan the QR with Expo Go
```

### One-time Supabase settings (dashboard)

1. **Authentication › Sign In / Providers › Email** → turn **Confirm email OFF** (needed for the demo accounts while `EXPO_PUBLIC_DEMO_AUTH=true`).
2. Later, for real Google sign-in: **Authentication › Providers › Google** → add the company Google Cloud OAuth client; add `tskr://auth-callback` to **URL Configuration › Redirect URLs**; then set `EXPO_PUBLIC_DEMO_AUTH=false` in `mobile/.env`.

## Testing mode (turn OFF before launch)

These live in table `app_config` (editable without an app release):

| key | testing value | production |
|---|---|---|
| `otp_demo_mode` | `true` → email code **482913**, SMS **135790**, arrival code **4827** | `false` + `send-otp` Edge Function (Semaphore) |
| `payments_demo_mode` | `true` → *Buy coins* works without a gateway | `false` + PayMongo/Xendit webhook |
| `require_payment_qr` | `true` | `true` |

Make yourself an admin (to approve taskers):
```sql
insert into admin_users(user_id) select id from profiles where email = 'you@company.com';
```

## Server functions the apps call (`supabase.rpc(...)`)

Sign-up: `record_signup_consents`, `update_legal_name`, `request_otp`, `verify_otp`, `accept_policy`, `pending_consents`
Client: `search_taskers`, `create_booking`, `my_booking_block`, `negotiate_offer`, `accept_offer`, `respond_final_price`, `client_mark_paid`, `submit_fee_reference`
Tasker: `submit_tasker_verification`, `add_tasker_skill`, `remove_tasker_skill`, `set_payment_qr`, `buy_coins_demo`, `tasker_wallet`, `tasker_reply`, `tasker_decline`, `send_offer`, `update_eta`, `confirm_arrival`, `confirm_items_ok`, `send_final_price`, `start_job`, `set_proof_of_delivery`, `complete_job`, `answer_fee`
Both: `get_booking` (masks names until offer accepted), `cancel_preview`, `cancel_booking`, `submit_review`, `report_user`, `report_booking_problem`, `trigger_sos`, `close_account`, `reactivate_account`
Admin / scheduler: `admin_review_verification`, `mark_no_show`, `charge_weekly_skills`

Errors come back as plain user-facing sentences (e.g. "That code is incorrect. Try again or resend.").
