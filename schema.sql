-- B2 Tech Client Discovery & Lead Intake Schema for Cloudflare D1
CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY,
    business TEXT NOT NULL,
    industry TEXT NOT NULL,
    location TEXT,
    maps TEXT,
    description TEXT,
    contact TEXT NOT NULL,
    role TEXT,
    phone TEXT NOT NULL,
    email TEXT,
    site_type TEXT,
    current_site TEXT,
    features TEXT,
    branding TEXT,
    hosting TEXT,
    language TEXT,
    budget TEXT,
    budget_numeric REAL DEFAULT 0,
    timeline TEXT,
    status TEXT DEFAULT 'New lead',
    notes TEXT,
    agent TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_industry ON leads(industry);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_business ON leads(business);
