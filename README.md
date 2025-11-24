# Dashboard (vibe-coded)

Lightweight dashboard to monitor TrueNAS and Unraid systems, organize apps, and save per-user layouts. Built fast, tuned for vibes.

## Features
- Profiles: create/switch/delete without passwords; copy configs between users.
- Systems: add TrueNAS/Unraid hosts, toggle enabled state, test connections, and manage API keys.
- Apps: drag-and-drop ordering and grouping, hide/show, open links, per-app icon overrides.
- UPS (NUT): optional status display with charge/runtime when configured.
- Mobile: profile actions and settings accessible via compact controls.

## Stack
- Next.js (App Router) + TypeScript
- Tailwind + shadcn/ui + lucide-react
- Prisma (SQLite) for prefs/system configs
- dnd-kit for drag/drop, sonner for toasts

## Development
```bash
npm install
npm run dev
```
Open http://localhost:3000

## Notes
- Profiles persist in SQLite via `/api/preferences`.
- Missing profiles are never auto-created; use the profile menu to create.
- Delete clears stored profile so it won’t resurrect on refresh.
