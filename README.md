# B2 Technologies · Client Discovery & Intake CRM

Enterprise-grade Lead Discovery and CRM platform deployed globally on **Cloudflare Workers** with **Cloudflare D1 SQL Database**.
**Headquarters**: Addis Ababa, Ethiopia · **Direct Lines**: 0919477040 / 0966726065

---

## 🌐 Live Production Deployment

- **Live URL**: [https://b2tech-client-discovery.bahreabfeleke.workers.dev](https://b2tech-client-discovery.bahreabfeleke.workers.dev)
- **Database Engine**: Cloudflare D1 (SQLite at the Edge)
- **Database Name**: `b2technology`
- **Database UUID**: `dea65ff2-4663-45b1-9afe-b22e11b2e6bc`
- **Region**: Western Europe (`WEUR`) / Edge Distributed

---

## 🔑 Login Access

| User | Username | Password | Role | Phone |
| :--- | :--- | :--- | :--- | :--- |
| **Bahreab** | `bahreab` | `admin` | Administrator | `0919477040` |
| **Betty** | `betty` | `admin` | Administrator | `0966726065` |

---

## ✨ Features & Architecture

### 1. 📝 Lead Discovery & Intake Form
- **Business Profile**: Name, Category/Industry, City/Area, Google Maps URL, Business Description.
- **Decision-Maker Details**: Contact Name, Role, Phone/WhatsApp (with Ethiopian `+251` pre-fill), Email.
- **Project Scope**: Website Objective, Current Site, Required Features, Brand Assets, Domain & Hosting, Languages.
- **Budget & Deadlines**: Expected Budget in ETB with 1-click quick chips (`30k`, `50k`, `80k`, `120k`, `250k+ ETB`), Expected Deadline, Stage Status.
- **Meeting Notes**: Discussion points, next actions, and assigned sales agent.
- **Auto-draft**: Never lose unsaved changes if the browser tab closes.

### 2. 📋 Pipeline CRM (Kanban & Table Views)
- **Kanban Pipeline Board**: Drag-and-drop / 1-click stage progression through 7 pipeline stages:
  1. *New Lead*
  2. *Interested*
  3. *Proposal Requested*
  4. *Meeting Scheduled*
  5. *Negotiating*
  6. *Won Deals 🎉*
  7. *Not Interested / Lost*
- **Interactive Data Table**: Searchable and filterable by keyword, industry, and deal stage.

### 3. 📊 Analytics & KPI Dashboard
- **Total Leads Counter**
- **Active Pipeline Value (in ETB)**
- **Closed Won Value (in ETB)**
- **Win Rate Percentage**
- **Visual Funnel Breakdown** by stage and market category.

### 4. 📲 WhatsApp & Brief Generator
- **1-Click WhatsApp Share**: Generates a cleanly formatted client discovery brief sent directly into WhatsApp chat.
- **Copy to Clipboard & Print/PDF**: Printable specification sheet for developers and project managers.

### 5. 🔄 Cloudflare D1 Sync & Data Operations
- **Real-time Edge Storage**: All leads persist directly in Cloudflare D1.
- **Offline Resilience**: Automatically falls back to local storage if offline and syncs back with 1 click.
- **CSV & JSON Exports**: Download Excel-compatible CSVs or full JSON backups.

---

## 🛠️ Project Structure

```
B2 Tech/
├── public/
│   ├── index.html        # Modern responsive UI (Intake, CRM, Analytics, Modal)
│   ├── css/
│   │   └── style.css     # Premium styling, theme variables, Kanban & badges
│   └── js/
│       └── app.js        # Frontend controller (D1 API, offline fallback, CRM, export)
├── src/
│   └── index.js          # Cloudflare Worker API & Static Assets Forwarder
├── schema.sql            # D1 database schema & performance indexes
├── wrangler.jsonc        # Cloudflare configuration with D1 & Assets bindings
└── package.json          # Deployment & maintenance scripts
```

---

## 🚀 Development & Deployment Commands

```bash
# Run local development server with local D1 emulation
npm run dev

# Re-deploy to Cloudflare Workers
npm run deploy

# Re-run remote database schema migration if tables change
npm run db:init:remote
```
