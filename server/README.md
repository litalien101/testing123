Guardian Override - Server
-------------------------

This minimal Express server provides:
- /health
- /create-checkout-session  (Stripe Checkout)
- /webhook
- /invite-therapist        (creates an invite token and optionally emails it)

Quick start (local):
1. cd server
2. npm install
3. copy .env.sample to .env and edit
4. npm start
5. npm test (runs Jest tests)

Notes:
- Stripe price IDs must be configured in env.
- For webhook testing, use stripe CLI or a public tunnel (ngrok).


Environment additions:
- ADMIN_KEY: secret key required for invite creation via /invite-therapist
- GUARDIAN_DB_PATH: optional path to sqlite file


Admin UI:
- Visit /admin to login using ADMIN_KEY and manage invites and users.
- The admin UI uses server-side sessions stored in a SQLite session store.

Registration & Verification:
- POST /register {email,name} to create a user and send a verification email (if SMTP configured).
- GET /verify-email?token=... to verify the user's email.

Stripe mapping:
- Use /create-checkout-session with {plan, email} - the server will pass client_reference_id/email to Stripe.
- Webhook maps session.client_reference_id or customer_email to the user and marks premium in DB.
