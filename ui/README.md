# FoxFang Frontend

Next.js 16 + Tailwind CSS + Local Storage

## Design System

### Color Palette
- Primary: #1a1a2e (Dark navy)
- Secondary: #16213e (Deep blue)
- Accent: #0f3460 (Medium blue)
- Highlight: #e94560 (Coral red)
- Background: #f8fafc (Light gray)
- Card: #ffffff (White)
- Text: #1e293b (Dark slate)
- Muted: #64748b (Slate)

### Layout Structure
```
┌─────────────────────────────────────────────────────────┐
│  [Logo]  FoxFang          [Project Selector]  [User]│
├──────────┬──────────────────────────────────────────────┤
│          │                                              │
│  NAV     │                                              │
│          │  Keep tasks moving through your workflow     │
│  - Overview                                        [Board] [List]│
│  - Dashboard                                       [+] [🔔] [⚙️]│
│  - Live feed                                       ┌──────────┐
│  - Boards          ┌──────────┐ ┌──────────┐       │          │
│  - Tags            │ Inbox(5) │ │In Progress│       │ Done(41) │
│                    │          │ │   (4)     │       │          │
│  BOARDS            │          │ │           │       │          │
│  - Board groups    │          │ │           │       └──────────┘
│                    └──────────┘ └──────────┘
│  SKILLS
│  - Marketplace
│  - Packs
└──────────┴──────────────────────────────────────────────┘
```

## Routes

```
/                    → Landing/Redirect
/dashboard           → Main
/boards              → Boards list
/agents              → Agents management
/settings            → User settings
```

## Environment Variables

No environment variables required for frontend.

## Features

1. **Auth**
   - Local user (no login required)
   - Protected routes middleware (optional)
   - User session management

2. **Dashboard**
   - Kanban board with columns
   - Task cards with metadata
   - Drag & drop (future)
   - Real-time updates (future)

3. **Navigation**
   - Collapsible sidebar
   - Project/team selector
   - User profile dropdown
