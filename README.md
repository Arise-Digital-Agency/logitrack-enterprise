# LogiTrack Enterprise · Time Tracking & Logistics Portal

LogiTrack is a premium time-tracking and operations management platform designed for logistics and mission-critical workflows.

## Features
- **Live Monitoring**: Real-time time tracking with efficiency analytics.
- **Tracker Portal**: Secure, shared portals for team members to track hours, take screenshots, and record screens.
- **Client Portal**: Dedicated portals for clients to view project progress, attachments, and communicate.
- **Financial Suite**: Robust invoicing, daily reports, and billable hour management.
- **Media Tracking**: Integrated screen recording and auto-screenshot taker for proof of work.

## Setup
1. **Supabase**: Create a project and run the Master SQL script provided in the implementation plan.
2. **Environment**: Create a `.env` file with `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
3. **Edge Functions**: Deploy functions using `npx supabase functions deploy tracker-portal` and `npx supabase functions deploy client-portal`.
4. **Install**: `npm install`
5. **Dev**: `npm run dev`

## Tech Stack
- React + Vite
- Tailwind CSS
- Supabase (DB, Auth, Storage, Edge Functions)
- Lucide Icons
- Framer Motion
