# LeadDesk

**Open-source outreach CRM** — Import leads from Google Maps, run WhatsApp & email campaigns, manage clients, all from one self-hosted dashboard.

![LeadDesk](https://paoloothedev.com/leaddesk-preview.png)

## Features

- **Google Maps Lead Import** — Scrape and import leads directly from Google Maps
- **WhatsApp Campaigns** — Send bulk WhatsApp messages with delay control and delivery tracking
- **Email Campaigns** — Create and manage email outreach campaigns with templates
- **CRM / Client Pipeline** — Convert leads to clients, track stages, manage relationships
- **Analytics Dashboard** — Real-time stats, stage breakdowns, tag insights
- **Lead Management** — Advanced filtering, bulk actions, tagging, verification
- **Team Accounts** — Multi-user with role-based permissions
- **CSV Import/Export** — Import leads from CSV, export full backups
- **Dark Mode** — Built-in dark/light theme toggle

## Quick Start

### Docker (Recommended)

The easiest way to run LeadDesk. One command, works on Windows, Mac, and Linux.

1. Install [Docker](https://docs.docker.com/get-docker/) (if you don't have it)
2. Clone and start:

```bash
git clone https://github.com/paoloothedev/leaddesk.git
cd leaddesk
docker compose up -d
```

3. Open **http://localhost:3001** (or `http://your-ip:3001` from another device on your network)
4. Login with default credentials:

   - **Username:** `admin`
   - **Password:** `admin`

   > Change the password after first login in Settings → Accounts.

To change the port, create a `.env` file in the project root:
```
PORT=8080
```
Then restart: `docker compose up -d`

Your data (database + WhatsApp session) is saved in Docker volumes and persists between restarts.

### Updating

When a new version is released, just run:

```bash
git pull
docker compose up -d --build
```

This pulls the latest code, rebuilds the Docker image, and restarts. Your data is safe — it lives in Docker volumes, not in the container.

### Manual Setup

Requires [Node.js 18+](https://nodejs.org/) installed.

```bash
git clone https://github.com/paoloothedev/leaddesk.git
cd leaddesk
npm run setup
npm run build
npm start
```

## Tech Stack

- **Frontend:** React 18, Vite, Tailwind CSS, Framer Motion, Phosphor Icons
- **Backend:** Node.js, Express, better-sqlite3
- **WhatsApp:** Baileys (unofficial WhatsApp Web API)
- **Scraper:** Playwright

## Project Structure

```
leaddesk/
├── client/          # React frontend
│   └── src/
│       ├── components/   # UI components
│       └── api.js        # API client
├── server/          # Express backend
│   ├── routes/      # API routes
│   └── db.js        # SQLite database
├── Dockerfile
├── docker-compose.yml
└── package.json
```

## Environment

LeadDesk uses SQLite — no external database required. The database file is created automatically at `server/leaddesk.db`.

## Contributing

Contributions are welcome! Feel free to open issues and pull requests.

## License

[MIT](LICENSE)

## Author

Built by [PaoloTheDev](https://paoloothedev.com)

## Support

If you find LeadDesk useful, consider supporting the project:

[![Donate via PayPal](https://img.shields.io/badge/Donate-PayPal-blue.svg)](https://paypal.me/youssef.mohamad.abdallah)
