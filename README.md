# The Last Soirée

Ticket verification and check-in for the DPSB after-party. Guests check a QR
without signing in. The organizer issues passes, downloads four per A4 sheet,
and admits guests through the private dashboard. The printed DPSB serial
identifies the pass on paper. The random QR token is required for validation.

## Deploy on Antideploy

1. Import this GitHub repository and select the `main` branch. Deploy it as a
   Next.js server app, with Postgres attached.
2. Set `DPSB_ORGANIZER_KEY` as a secret. Generate a unique 64-character key, for
   example with `openssl rand -hex 32`. Keep it in your password manager.
3. Use `npm run build` to build and `npm start` to start. The start command
   prepares the database schema and listens on the port set by Antideploy.
4. Open `/admin` and sign in with the organizer key. Open `/verify` to check a
   guest ticket. Issue one test pass and scan the QR from its printed or digital
   copy before printing the full list.

Antideploy normally supplies `DATABASE_URL`, `APP_URL` and `SESSION_SECRET`.
The organizer key and session secret must each contain at least 32 characters.
If the platform does not provide `SESSION_SECRET`, set it to a second unique
random value in the secrets settings. Keep `APP_URL` aligned with the HTTPS
domain used to open the organizer dashboard.

The Antideploy database is independent from the ChatGPT-hosted deployment.
Existing guest records do not transfer with this repository. Start with a new
guest list, or migrate records securely before issuing tickets in production.
Printed QR links keep the domain they were generated with, so download new
tickets from Antideploy when moving an event to that domain.

## Run locally

Use Node.js 22 and PostgreSQL.

1. Run `npm ci`.
2. Copy `.env.example` to `.env`. Set your PostgreSQL connection URL and two
   distinct random secrets.
3. Run `npm run db:migrate`, then `npm run dev`.
4. Open [localhost:3000/admin](http://localhost:3000/admin).
