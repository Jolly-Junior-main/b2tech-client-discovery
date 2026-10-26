/**
 * B2 Tech - Client Discovery & Lead Intake Backend
 * Cloudflare Worker with D1 Database & Static Assets Binding
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// Helper for JSON responses
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });
}

// Helper to extract a numeric value from budget strings (e.g., "50,000 ETB", "100k", etc.)
function parseNumericBudget(budgetStr) {
  if (!budgetStr) return 0;
  const cleaned = String(budgetStr).toLowerCase().replace(/,/g, "").trim();
  if (cleaned.includes("k")) {
    const num = parseFloat(cleaned.replace(/[^0-9.]/g, ""));
    return isNaN(num) ? 0 : num * 1000;
  }
  const match = cleaned.match(/([0-9]+(?:\.[0-9]+)?)/);
  if (match) {
    const val = parseFloat(match[1]);
    return isNaN(val) ? 0 : val;
  }
  return 0;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Handle CORS pre-flight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    // Only process /api/* routes here; everything else is served via static assets
    if (url.pathname.startsWith("/api/")) {
      try {
        return await handleApi(request, env, url);
      } catch (err) {
        console.error("API Error:", err);
        return jsonResponse(
          {
            error: "Internal Server Error",
            message: err.message || String(err),
          },
          500
        );
      }
    }

    // Serve static files from ./public directory via Cloudflare Assets
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("Not Found", { status: 404 });
  },
};

async function handleApi(request, env, url) {
  const path = url.pathname.replace(/^\/api/, "");
  const method = request.method;

  // 1. Health check & D1 status
  if (path === "/health" || path === "") {
    if (!env.DB) {
      return jsonResponse({
        status: "degraded",
        d1_connected: false,
        message: "D1 database binding 'DB' is not configured.",
        timestamp: new Date().toISOString(),
      });
    }

    try {
      const check = await env.DB.prepare(
        "SELECT count(*) as count FROM leads"
      ).first();
      return jsonResponse({
        status: "ok",
        d1_connected: true,
        database: "b2technology",
        leads_count: check ? check.count : 0,
        timestamp: new Date().toISOString(),
      });
    } catch (e) {
      return jsonResponse({
        status: "warning",
        d1_connected: false,
        message: "Database accessible but 'leads' table may need initialization.",
        error: e.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // 1.1 Authentication endpoints: /api/auth/login & /api/auth/verify
  if (path === "/auth/login" && method === "POST") {
    try {
      const { username, password } = await request.json();
      const cleanUser = (username || "").trim().toLowerCase();
      const cleanPass = (password || "").trim();

      const VALID_USERS = {
        bahreab: { displayName: "Bahreab", role: "Administrator" },
        betty: { displayName: "Betty", role: "Administrator" },
      };

      if (VALID_USERS[cleanUser] && cleanPass === "admin") {
        const sessionData = {
          username: cleanUser,
          displayName: VALID_USERS[cleanUser].displayName,
          role: VALID_USERS[cleanUser].role,
          exp: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
        };
        const token = btoa(JSON.stringify(sessionData));
        return jsonResponse({
          success: true,
          user: sessionData,
          token,
        });
      }

      return jsonResponse(
        { success: false, error: "Invalid username or password" },
        401
      );
    } catch (e) {
      return jsonResponse({ success: false, error: "Bad request" }, 400);
    }
  }

  if (path === "/auth/verify") {
    const authHeader = request.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return jsonResponse({ valid: false }, 401);
    try {
      const data = JSON.parse(atob(token));
      if (data.exp && data.exp > Date.now()) {
        return jsonResponse({ valid: true, user: data });
      }
    } catch {}
    return jsonResponse({ valid: false }, 401);
  }

  // Ensure DB is present for all following endpoints
  if (!env.DB) {
    return jsonResponse(
      {
        error: "Database configuration missing",
        message: "Cloudflare D1 binding (DB) is not available.",
      },
      503
    );
  }

  // 2. Aggregate Statistics: /api/stats
  if (path === "/stats" && method === "GET") {
    const totalRow = await env.DB.prepare("SELECT COUNT(*) as total FROM leads").first();
    const wonRow = await env.DB.prepare(
      "SELECT COUNT(*) as won_count, COALESCE(SUM(budget_numeric), 0) as won_val FROM leads WHERE status = 'Won'"
    ).first();
    const pipelineRow = await env.DB.prepare(
      "SELECT COALESCE(SUM(budget_numeric), 0) as pipeline_val FROM leads WHERE status NOT IN ('Won', 'Not interested')"
    ).first();

    const statusCounts = await env.DB.prepare(
      "SELECT status, COUNT(*) as count FROM leads GROUP BY status ORDER BY count DESC"
    ).all();

    const industryCounts = await env.DB.prepare(
      "SELECT industry, COUNT(*) as count FROM leads GROUP BY industry ORDER BY count DESC"
    ).all();

    const recentRow = await env.DB.prepare(
      "SELECT COUNT(*) as recent FROM leads WHERE created_at >= datetime('now', '-7 days')"
    ).first();

    return jsonResponse({
      total: totalRow?.total || 0,
      active_pipeline_etb: pipelineRow?.pipeline_val || 0,
      won_value_etb: wonRow?.won_val || 0,
      won_count: wonRow?.won_count || 0,
      recent_7d: recentRow?.recent || 0,
      by_status: statusCounts?.results || [],
      by_industry: industryCounts?.results || [],
    });
  }

  // 3. Bulk Sync: /api/leads/bulk-sync
  if (path === "/leads/bulk-sync" && method === "POST") {
    const body = await request.json();
    const leads = Array.isArray(body) ? body : body.leads || [];

    if (!leads.length) {
      return jsonResponse({ message: "No leads provided for sync", count: 0 });
    }

    const statements = leads.map((lead) => {
      const id = lead.id || `lead_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const budgetNumeric = parseNumericBudget(lead.budget);
      const now = new Date().toISOString();

      return env.DB.prepare(`
        INSERT INTO leads (
          id, business, industry, location, maps, description,
          contact, role, phone, email, site_type, current_site,
          features, branding, hosting, language, budget, budget_numeric,
          timeline, status, notes, agent, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          COALESCE(?, datetime('now')),
          datetime('now')
        )
        ON CONFLICT(id) DO UPDATE SET
          business = excluded.business,
          industry = excluded.industry,
          location = excluded.location,
          maps = excluded.maps,
          description = excluded.description,
          contact = excluded.contact,
          role = excluded.role,
          phone = excluded.phone,
          email = excluded.email,
          site_type = excluded.site_type,
          current_site = excluded.current_site,
          features = excluded.features,
          branding = excluded.branding,
          hosting = excluded.hosting,
          language = excluded.language,
          budget = excluded.budget,
          budget_numeric = excluded.budget_numeric,
          timeline = excluded.timeline,
          status = excluded.status,
          notes = excluded.notes,
          agent = excluded.agent,
          updated_at = datetime('now')
      `).bind(
        id,
        lead.business || "Untitled Business",
        lead.industry || "Other",
        lead.location || "",
        lead.maps || "",
        lead.description || "",
        lead.contact || "Unknown Contact",
        lead.role || "",
        lead.phone || "",
        lead.email || "",
        lead.siteType || lead.site_type || "New business website",
        lead.currentSite || lead.current_site || "",
        lead.features || "",
        lead.branding || "Unknown",
        lead.hosting || "Unknown",
        lead.language || "",
        lead.budget || "",
        budgetNumeric,
        lead.timeline || "",
        lead.status || "New lead",
        lead.notes || "",
        lead.agent || "",
        lead.created_at || lead.updatedAt || now
      );
    });

    // Execute in batch
    await env.DB.batch(statements);

    return jsonResponse({
      success: true,
      synced_count: leads.length,
      message: `Successfully synchronized ${leads.length} leads.`,
    });
  }

  // 4. Query / List Leads: GET /api/leads
  if (path === "/leads" && method === "GET") {
    const q = url.searchParams.get("q") || "";
    const status = url.searchParams.get("status") || "";
    const industry = url.searchParams.get("industry") || "";
    const sort = url.searchParams.get("sort") || "created_at";
    const order = (url.searchParams.get("order") || "DESC").toUpperCase() === "ASC" ? "ASC" : "DESC";

    let query = "SELECT * FROM leads WHERE 1=1";
    const params = [];

    if (q) {
      query += " AND (business LIKE ? OR contact LIKE ? OR phone LIKE ? OR location LIKE ? OR notes LIKE ? OR agent LIKE ?)";
      const pattern = `%${q}%`;
      params.push(pattern, pattern, pattern, pattern, pattern, pattern);
    }

    if (status) {
      query += " AND status = ?";
      params.push(status);
    }

    if (industry) {
      query += " AND industry = ?";
      params.push(industry);
    }

    // Allowed sort columns
    const allowedSorts = ["created_at", "updated_at", "budget_numeric", "business", "status"];
    const sortCol = allowedSorts.includes(sort) ? sort : "created_at";

    query += ` ORDER BY ${sortCol} ${order} LIMIT 250`;

    const stmt = params.length > 0 ? env.DB.prepare(query).bind(...params) : env.DB.prepare(query);
    const { results } = await stmt.all();

    return jsonResponse(results || []);
  }

  // 5. Create Lead: POST /api/leads
  if (path === "/leads" && method === "POST") {
    const data = await request.json();

    if (!data.business || !data.contact || !data.phone) {
      return jsonResponse(
        { error: "Validation error: 'business', 'contact', and 'phone' are required fields." },
        400
      );
    }

    const id = data.id || `lead_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const budgetNumeric = parseNumericBudget(data.budget);

    const insertQuery = `
      INSERT INTO leads (
        id, business, industry, location, maps, description,
        contact, role, phone, email, site_type, current_site,
        features, branding, hosting, language, budget, budget_numeric,
        timeline, status, notes, agent, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `;

    await env.DB.prepare(insertQuery)
      .bind(
        id,
        data.business,
        data.industry || "Other",
        data.location || "",
        data.maps || "",
        data.description || "",
        data.contact,
        data.role || "",
        data.phone,
        data.email || "",
        data.siteType || data.site_type || "New business website",
        data.currentSite || data.current_site || "",
        data.features || "",
        data.branding || "Unknown",
        data.hosting || "Unknown",
        data.language || "",
        data.budget || "",
        budgetNumeric,
        data.timeline || "",
        data.status || "New lead",
        data.notes || "",
        data.agent || ""
      )
      .run();

    const created = await env.DB.prepare("SELECT * FROM leads WHERE id = ?").bind(id).first();
    return jsonResponse(created, 201);
  }

  // 6. Match lead by ID: /api/leads/:id
  const leadIdMatch = path.match(/^\/leads\/([^/]+)$/);
  if (leadIdMatch) {
    const id = decodeURIComponent(leadIdMatch[1]);

    if (method === "GET") {
      const lead = await env.DB.prepare("SELECT * FROM leads WHERE id = ?").bind(id).first();
      if (!lead) return jsonResponse({ error: "Lead not found" }, 404);
      return jsonResponse(lead);
    }

    if (method === "PUT") {
      const data = await request.json();
      const budgetNumeric = parseNumericBudget(data.budget);

      const updateQuery = `
        UPDATE leads SET
          business = COALESCE(?, business),
          industry = COALESCE(?, industry),
          location = ?,
          maps = ?,
          description = ?,
          contact = COALESCE(?, contact),
          role = ?,
          phone = COALESCE(?, phone),
          email = ?,
          site_type = ?,
          current_site = ?,
          features = ?,
          branding = ?,
          hosting = ?,
          language = ?,
          budget = ?,
          budget_numeric = ?,
          timeline = ?,
          status = COALESCE(?, status),
          notes = ?,
          agent = ?,
          updated_at = datetime('now')
        WHERE id = ?
      `;

      await env.DB.prepare(updateQuery)
        .bind(
          data.business,
          data.industry,
          data.location ?? null,
          data.maps ?? null,
          data.description ?? null,
          data.contact,
          data.role ?? null,
          data.phone,
          data.email ?? null,
          data.siteType || data.site_type || null,
          data.currentSite || data.current_site || null,
          data.features ?? null,
          data.branding ?? null,
          data.hosting ?? null,
          data.language ?? null,
          data.budget ?? null,
          budgetNumeric,
          data.timeline ?? null,
          data.status,
          data.notes ?? null,
          data.agent ?? null,
          id
        )
        .run();

      const updated = await env.DB.prepare("SELECT * FROM leads WHERE id = ?").bind(id).first();
      return jsonResponse(updated);
    }

    if (method === "DELETE") {
      await env.DB.prepare("DELETE FROM leads WHERE id = ?").bind(id).run();
      return jsonResponse({ success: true, message: "Lead deleted successfully", id });
    }
  }

  return jsonResponse({ error: "Endpoint not found", path }, 404);
}
