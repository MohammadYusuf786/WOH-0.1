# WORLD OF HACKER 0.1 — Cyber Learning Hub

A responsive cybersecurity learning portal with a public course/tutorial catalogue, learner sign-up and sign-in, and an administrator workspace for managing content and members.

## Included features

- Public landing page with course and tutorial catalogues, category filters, and responsive mobile layout.
- User registration and sign-in. New accounts are created as learners.
- Passwords are hashed with bcryptjs; session cookies are HTTP-only and SameSite=Lax.
- Admin-only dashboard with overview metrics, content management, and member management.
- Create, edit, and delete courses and tutorials.
- Creator media feed: publish photos, videos, and text announcements from the admin dashboard; all visitors can view public posts. Admins can edit or delete posts.
- Upload one attachment per course/tutorial (PDF, MP4, WEBM, ZIP, TXT, JPG, PNG, WEBP; maximum 100 MB).
- Media posts accept JPG, PNG, WEBP, GIF photos and MP4/WEBM videos (maximum 100 MB per file). Text-only announcements are also supported.
- Learners can enrol in courses. Administrators can change account roles, suspend/activate accounts, or remove learner accounts.
- Data is stored in `storage/db.json`; uploaded files are stored in `uploads/`. Public posts are saved in the same database and appear in the Posts section for visitors.
- Starter courses and tutorials are seeded automatically on first start.

## Requirements

- Node.js 18 or newer
- npm

## Run locally

1. Extract this folder.
2. Open a terminal in this folder.
3. Install dependencies:

   ```bash
   npm install
   ```

4. Copy `.env.example` to `.env` and change the session secret and admin password before sharing the app. You can keep the demo values for local testing.
5. Start the server:

   ```bash
   npm start
   ```

6. Open `http://localhost:3000` in your browser.

### Demo administrator

- **Email:** `admin@worldofhacker.in`
- **Password:** `WOHAdmin@2026`

The demo administrator is created automatically the first time the app starts. If you change `ADMIN_EMAIL` or `ADMIN_PASSWORD` in `.env` after the admin already exists, the existing account is not overwritten. To reset a local demo database, stop the server and remove `storage/db.json`, then restart it. This also resets demo users and seeded content.

## Environment variables

| Variable | Purpose |
|---|---|
| `PORT` | Server port (default `3000`) |
| `NODE_ENV` | Set to `production` for production cookie settings |
| `SESSION_SECRET` | Long random secret used to sign sessions |
| `ADMIN_NAME` | Name for the first seeded admin |
| `ADMIN_EMAIL` | Email for the first seeded admin |
| `ADMIN_PASSWORD` | Password for the first seeded admin |

## Before deploying publicly

This project is a usable starter application, not a fully managed production service. Before exposing it to the public internet:

- Change the demo administrator password and set a long, unique `SESSION_SECRET`.
- Use HTTPS and set `NODE_ENV=production`.
- Use a persistent server volume for `storage/` and `uploads/`; ephemeral hosting storage can erase accounts and uploaded materials on redeploy.
- Replace the JSON file store and Express's default in-memory session store with a managed database and persistent session store for multi-instance/high-traffic hosting.
- Set up automated backups, upload scanning, monitoring, and an administrator recovery process.
- Review privacy, data-retention, and local legal requirements before collecting real learner information.

The demo credentials are intentionally visible in this README for testing. Do not keep them on a public deployment.
