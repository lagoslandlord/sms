#  Twilio SMS Drip Campaign

Automated 5-step SMS re-engagement campaign for returning clients, built with **Node.js**, **Twilio**, and **MongoDB**.

---

## What It Does

Sends a sequence of personalised SMS messages to enrolled clients on a scheduled interval. Tracks campaign state per client and logs every send.

---

## Tech Stack

- **Express** — REST API & webhook endpoint
- **Mongoose** — MongoDB data models
- **Twilio** — SMS sending & inbound webhook validation
- **node-cron** — campaign scheduler
- **Winston** — structured file + console logging
- **dotenv** — environment config

---

## Prerequisites

- **Node.js** v18+
- **MongoDB** — [Atlas](https://cloud.mongodb.com) (recommended) or local
- **Twilio account** — Account SID, Auth Token, and an SMS-enabled phone number

---

## Installation

```bash
# 1. Clone the repo
git clone https://github.com/lagoslandlord/sms.git
cd sms

# 2. Install dependencies
npm install

# 3. Create your environment file at src/.env (see below)

# 4. (Optional) Seed sample clients
node src/seedClients.js

# 5. Start the server
npm run dev       # development (auto-restarts with nodemon)
npm start         # production
```

---

## Environment Variables

Create `src/.env`:

```env
PORT=your-port
NODE_ENV=development

# MongoDB
MONGO_URI=********

# Twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1XXXXXXXXXX

# Campaign
TEST_MODE=true                   # true = sends every few mins | false = weekly
CAMPAIGN_INTERVAL_MINUTES=5      # mins between messages per client (use 10080 for 7 days)
SMS_CONCURRENCY_LIMIT=10         # max parallel Twilio calls
CRON_TIMEZONE=Africa/Lagos

# Production only (Render keep-alive)
# RENDER_EXTERNAL_URL=https://your-app.onrender.com
```

> The `.env` file must be placed inside `src/`, not the project root.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/clients` | List all clients |
| `POST` | `/api/clients` | Add a client (`name`, `phone` required) |
| `PATCH` | `/api/clients/:id/enroll` | Enrol client (pass `{ "resetSequence": true }` to restart) |
| `PATCH` | `/api/clients/:id/unenroll` | Pause client's campaign |
| `DELETE` | `/api/clients/:id` | Delete a client |
| `POST` | `/api/campaign/run-now` | Manually trigger campaign |
| `GET` | `/api/campaign/logs` | View send history (`?limit=N&status=sent\|failed`) |
| `POST` | `/api/campaign/reset-all` | Re-enrol all clients from Step 1 |
