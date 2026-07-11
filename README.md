# TechSteal Minecraft Server Website

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create a `.env` file from the example:
   ```bash
   cp .env.example .env
   ```
3. Fill in your Exaroton credentials:
   - `EXAROTON_API_TOKEN`
   - `EXAROTON_SERVER_ID`
4. Start the app:
   ```bash
   npm run dev
   ```

## Security notes

- Never expose the Exaroton token in the frontend.
- All Exaroton API requests are made server-side through the Express backend.
- The token is read from environment variables only.

## Features

- Secure Exaroton server status dashboard
- Start / stop / restart actions via server-side API calls
- Admin season editor for the How to Join section
- Auto-refreshing status UI
