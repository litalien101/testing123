// server.js - updated with admin UI, sessions, registration & verification, stripe customer mapping
'use strict';

const express = require('express');
const bodyParser = require('body-parser');
const Stripe = require('stripe');
const { v4: uuidv4 } = require('uuid');
const nodemailer = require('nodemailer');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const path = require('path');
const db = require('./db');
const app = express();
app.use(bodyParser.json());

const STRIPE_SECRET = process.env.STRIPE_SECRET || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const PORT = process.env.PORT || 4242;
const ADMIN_KEY = process.env.ADMIN_KEY || ''; // server-side key for admin operations (invite creation)
const APP_BASE_URL = process.env.APP_BASE_URL || 'https://example.com';
const SMTP_FROM = process.env.SMTP_FROM || 'no-reply@example.com';

const stripe = STRIPE_SECRET ? Stripe(STRIPE_SECRET) : null;

// Session middleware for admin UI (secure cookie)
app.use(session({
  store: new SQLiteStore({ db: 'sessions.sqlite', dir: __dirname }),
  secret: process.env.SESSION_SECRET || 'change_this_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, secure: false } // set secure:true behind HTTPS
}));

// Serve admin static files from /admin
app.use('/admin/static', express.static(path.join(__dirname, 'admin')));

// Simple middleware to protect admin routes
function requireAdminSession(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  res.status(401).send('Unauthorized');
}

// Basic health check
app.get('/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// Admin UI main page (simple)
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'admin.html'));
});

// Admin login (POST): set session if ADMIN_KEY matches posted key
app.post('/admin-login', (req, res) => {
  const { key } = req.body;
  if (!key || !ADMIN_KEY || key !== ADMIN_KEY) return res.status(401).json({ error: 'invalid key' });
  req.session.isAdmin = true;
  res.json({ ok: true });
});

// Admin logout
app.post('/admin-logout', requireAdminSession, (req, res) => {
  req.session.destroy(err => { if (err) console.error(err); res.json({ ok: true }); });
});

// Admin APIs: create invite, list users, toggle premium
app.post('/admin/create-invite', requireAdminSession, (req, res) => {
  const { email, name } = req.body;
  if (!email) return res.status(400).json({ error: 'email required' });
  const token = uuidv4();
  const expiresAt = Math.floor(Date.now()/1000) + 7*24*60*60;
  db.createInvite(token, email, name, expiresAt, (err) => {
    if (err) return res.status(500).json({ error: 'failed to create invite' });
    res.json({ token, expiresIn: 7*24*60*60, inviteUrl: APP_BASE_URL + '/therapist-invite?token=' + token });
  });
});

app.get('/admin/users', requireAdminSession, (req, res) => {
  db.listUsers((err, rows) => {
    if (err) return res.status(500).json({ error: 'db error' });
    res.json({ users: rows });
  });
});

app.post('/admin/set-premium', requireAdminSession, (req, res) => {
  const { email, premium } = req.body;
  if (!email) return res.status(400).json({ error: 'email required' });
  db.setPremiumByEmail(email, !!premium, (err) => {
    if (err) return res.status(500).json({ error: 'failed to set premium' });
    res.json({ ok: true });
  });
});

// Admin: serve invite creation page (simple)
// client-side admin UI will call /admin/create-invite etc via fetch with session cookie

// User registration: creates a user and sends verification email with a token
app.post('/register', (req, res) => {
  const { email, name } = req.body;
  if (!email) return res.status(400).json({ error: 'email required' });
  const userId = uuidv4();
  db.createUser(userId, email, name || null, null, (err) => {
    if (err) return res.status(500).json({ error: 'failed to create user' });
    const token = uuidv4();
    const expiresAt = Math.floor(Date.now()/1000) + 24*60*60; // 24 hours
    db.createVerification(token, email, expiresAt, (err2) => {
      if (err2) console.error('create verification failed', err2);
      // send email with verification link if SMTP configured
      if (process.env.SEND_INVITES_EMAIL === 'true') {
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT||'587',10),
          secure: false,
          auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        });
        const verifyUrl = APP_BASE_URL + '/verify-email?token=' + token;
        transporter.sendMail({
          from: SMTP_FROM,
          to: email,
          subject: 'Verify your email for Guardian',
          text: `Click to verify: ${verifyUrl}`
        }).catch(e => console.error('email send failed', e));
      }
      res.json({ ok: true, verificationSent: process.env.SEND_INVITES_EMAIL === 'true' });
    });
  });
});

// Verify email endpoint: token -> mark user verified
app.get('/verify-email', (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(400).send('token required');
  db.getVerification(token, (err, row) => {
    if (err) return res.status(500).send('db error');
    if (!row) return res.status(404).send('not found');
    if (row.used) return res.status(400).send('already used');
    const now = Math.floor(Date.now()/1000);
    if (row.expires_at && now > row.expires_at) return res.status(400).send('expired');
    db.setVerified(row.email, (err2) => {
      if (err2) console.error('failed to set verified', err2);
      db.markVerificationUsed(token, (err3) => {
        if (err3) console.error('failed to mark verification used', err3);
      });
      res.send('Email verified. Thank you.');
    });
  });
});

// Accept invite (unchanged)
app.post('/accept-invite', (req, res) => {
  const { token, name, email } = req.body;
  if (!token || !email) return res.status(400).json({ error: 'token and email required' });
  db.getInvite(token, (err, invite) => {
    if (err) return res.status(500).json({ error: 'db error' });
    if (!invite) return res.status(404).json({ error: 'invite not found' });
    if (invite.used) return res.status(400).json({ error: 'invite already used' });
    const now = Math.floor(Date.now()/1000);
    if (invite.expires_at && now > invite.expires_at) return res.status(400).json({ error: 'invite expired' });
    const userId = uuidv4();
    db.createUser(userId, email, name || null, null, (err2) => {
      if (err2) return res.status(500).json({ error: 'failed to create user' });
      db.markInviteUsed(token, (err3) => {
        if (err3) console.warn('failed to mark invite used', err3);
        res.json({ ok: true, userId });
      });
    });
  });
});

// User status (unchanged)
app.get('/user-status', (req, res) => {
  const email = (req.query.email || '').toString();
  if (!email) return res.status(400).json({ error: 'email required' });
  db.getUserByEmail(email, (err, user) => {
    if (err) return res.status(500).json({ error: 'db error' });
    if (!user) return res.json({ premium: false, trialEnd: null, isActive: false });
    const trialEnd = user.trial_end ? parseInt(user.trial_end,10) : null;
    const now = Math.floor(Date.now()/1000);
    const isActive = (user.premium === 1) || (trialEnd && trialEnd > now);
    res.json({ premium: !!user.premium, trialEnd, isActive, verified: !!user.verified, stripeCustomerId: user.stripe_customer_id || null });
  });
});

// Create a Stripe Checkout session - accept client_reference_id (email or userId) and create customer mapping
app.post('/create-checkout-session', async (req, res) => {
  const { plan, email } = req.body;
  if (!stripe) return res.status(500).json({ error: 'Stripe not configured' });
  const priceMap = {
    monthly: process.env.STRIPE_PRICE_MONTHLY || 'price_monthly_placeholder',
    annual: process.env.STRIPE_PRICE_ANNUAL || 'price_annual_placeholder'
  };
  const priceId = priceMap[plan] || priceMap.monthly;
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: process.env.SUCCESS_URL || (APP_BASE_URL + '/success'),
      cancel_url: process.env.CANCEL_URL || (APP_BASE_URL + '/cancel'),
      customer_email: email || undefined,
      client_reference_id: email || undefined
    });
    res.json({ url: session.url, id: session.id });
  } catch (err) {
    console.error('Stripe error', err);
    res.status(500).json({ error: 'failed to create checkout session' });
  }
});

// Stripe webhook - map by client_reference_id or customer_email to user and set premium + stripe customer id
app.post('/webhook', bodyParser.raw({type: 'application/json'}), (req, res) => {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    console.warn('Webhook received but stripe/webhook secret not configured');
    return res.status(200).send('ok');
  }
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.warn('Webhook signature verification failed', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const email = session.customer_email || session.client_reference_id;
    const stripeCustomerId = session.customer || null;
    if (email) {
      db.setPremiumByEmail(email, true, (err) => {
        if (err) console.error('failed to set premium', err);
        if (stripeCustomerId) db.setStripeCustomerId(email, stripeCustomerId, (e)=>{ if (e) console.error('failed to set stripe id', e); });
      });
    }
  }
  res.json({ received: true });
});

app.listen(PORT, () => console.log(`Guardian server listening on ${PORT}`));
module.exports = app;
