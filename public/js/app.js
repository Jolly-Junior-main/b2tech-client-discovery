/**
 * B2 Tech - Client Discovery & Intake CRM
 * Frontend Application Controller
 * Handles Cloudflare D1 API, Offline Fallback, Kanban CRM, Analytics & Brief Generator
 */

const LOCAL_STORAGE_KEY = "client_scout_leads_v1";
const DRAFT_KEY = "b2tech_lead_draft_v1";
const AUTH_KEY = "b2tech_auth_session_v1";

const state = {
  currentUser: null,
  leads: [],
  activeView: "intake",
  crmViewMode: "kanban", // 'kanban' | 'table'
  editingId: null,
  isCloudConnected: false,
  stats: null,
  filters: {
    q: "",
    status: "",
    industry: "",
  },
};

// DOM References
const elements = {
  loginScreen: document.getElementById("loginScreen"),
  loginForm: document.getElementById("loginForm"),
  loginErrorAlert: document.getElementById("loginErrorAlert"),
  userProfileBadge: document.getElementById("userProfileBadge"),
  loggedInUserName: document.getElementById("loggedInUserName"),
  logoutBtn: document.getElementById("logoutBtn"),

  form: document.getElementById("leadForm"),
  statusPill: document.getElementById("connectionStatusPill"),
  statusDot: document.getElementById("connectionStatusDot"),
  statusText: document.getElementById("connectionStatusText"),
  kanbanGrid: document.getElementById("kanbanGrid"),
  leadsTableBody: document.getElementById("leadsTableBody"),
  leadsCountBadge: document.getElementById("leadsCountBadge"),
  recentLeadsList: document.getElementById("recentLeadsList"),
  
  // Modals
  briefModal: document.getElementById("briefModal"),
  briefContent: document.getElementById("briefContent"),
  briefModalTitle: document.getElementById("briefModalTitle"),
  
  // Analytics Elements
  kpiTotalLeads: document.getElementById("kpiTotalLeads"),
  kpiPipelineVal: document.getElementById("kpiPipelineVal"),
  kpiWonVal: document.getElementById("kpiWonVal"),
  kpiWinRate: document.getElementById("kpiWinRate"),
  stageBreakdownContainer: document.getElementById("stageBreakdownContainer"),
  industryBreakdownContainer: document.getElementById("industryBreakdownContainer"),
};

// Initialize Application
document.addEventListener("DOMContentLoaded", async () => {
  initTheme();
  setupNavigation();
  setupEventListeners();
  initAuth();
  loadDraft();
  
  // Check Cloudflare D1 health and fetch data
  await checkCloudConnection();
  await refreshData();
});

// 1. Theme Management
function initTheme() {
  const savedTheme = localStorage.getItem("b2tech_theme") || "light";
  document.documentElement.setAttribute("data-theme", savedTheme);
  const themeBtn = document.getElementById("themeToggleBtn");
  if (themeBtn) {
    themeBtn.textContent = savedTheme === "dark" ? "☀️ Light" : "🌙 Dark";
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("b2tech_theme", next);
  const themeBtn = document.getElementById("themeToggleBtn");
  if (themeBtn) {
    themeBtn.textContent = next === "dark" ? "☀️ Light" : "🌙 Dark";
  }
}

// 2. Navigation Tabs
function setupNavigation() {
  const tabButtons = document.querySelectorAll(".tab-btn");
  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const view = btn.dataset.view;
      switchView(view);
    });
  });
}

function switchView(viewName) {
  state.activeView = viewName;
  
  // Update Tab buttons
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === viewName);
  });
  
  // Update View panels
  document.querySelectorAll(".view-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === `view-${viewName}`);
  });

  if (viewName === "crm") {
    renderCRM();
  } else if (viewName === "analytics") {
    renderAnalytics();
  }
}

// 3. Cloudflare D1 Connectivity & Sync
async function checkCloudConnection() {
  try {
    const res = await fetch("/api/health");
    if (!res.ok) throw new Error("Health check failed");
    const data = await res.json();
    
    if (data.d1_connected) {
      state.isCloudConnected = true;
      elements.statusDot.className = "status-dot online";
      elements.statusText.textContent = "Cloudflare D1 Connected";
      elements.statusPill.title = "Connected to database: " + (data.database || "D1");
    } else {
      setOfflineState("D1 Initializing / Warning");
    }
  } catch (err) {
    setOfflineState("Local Mode (Offline/Preview)");
  }
}

function setOfflineState(text) {
  state.isCloudConnected = false;
  elements.statusDot.className = "status-dot offline";
  elements.statusText.textContent = text;
  elements.statusPill.title = "Operating in offline local cache mode.";
}

// 4. Data Layer: Fetch, Create, Update, Delete
async function refreshData() {
  if (state.isCloudConnected) {
    try {
      const url = new URL("/api/leads", window.location.origin);
      if (state.filters.q) url.searchParams.set("q", state.filters.q);
      if (state.filters.status) url.searchParams.set("status", state.filters.status);
      if (state.filters.industry) url.searchParams.set("industry", state.filters.industry);

      const res = await fetch(url.toString());
      if (res.ok) {
        state.leads = await res.json();
        // Update local backup
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state.leads));
      } else {
        throw new Error("Failed to fetch from Cloudflare API");
      }
    } catch (e) {
      console.warn("Cloud fetch failed, using local storage:", e);
      loadFromLocalStorage();
    }
  } else {
    loadFromLocalStorage();
  }

  updateBadgesAndSidebar();
  if (state.activeView === "crm") renderCRM();
  if (state.activeView === "analytics") renderAnalytics();
}

function loadFromLocalStorage() {
  try {
    state.leads = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || "[]");
  } catch {
    state.leads = [];
  }
}

function updateBadgesAndSidebar() {
  const count = state.leads.length;
  if (elements.leadsCountBadge) elements.leadsCountBadge.textContent = count;
  
  // Render quick recent leads in form sidebar
  if (elements.recentLeadsList) {
    elements.recentLeadsList.innerHTML = "";
    const recent = state.leads.slice(0, 5);
    if (!recent.length) {
      elements.recentLeadsList.innerHTML = '<p class="hint-text">No saved leads yet. Start by filling the form.</p>';
      return;
    }

    recent.forEach((lead) => {
      const item = document.createElement("div");
      item.className = "lead-card";
      item.style.marginBottom = "8px";
      item.innerHTML = `
        <div class="lead-card-header">
          <strong class="lead-card-title">${escapeHtml(lead.business)}</strong>
          <span class="badge ${getStatusBadgeClass(lead.status)}">${escapeHtml(lead.status || "New")}</span>
        </div>
        <div class="lead-card-meta">
          <span>${escapeHtml(lead.industry || "General")} · ${escapeHtml(lead.contact || "")}</span>
          ${lead.budget ? `<span class="lead-card-budget">${escapeHtml(lead.budget)}</span>` : ""}
        </div>
        <div class="actions-row" style="margin-top: 6px;">
          <button type="button" class="btn-outline" style="padding: 4px 8px; font-size: 11px;" onclick="viewLeadDetail('${lead.id}')">View</button>
          <button type="button" class="btn-outline" style="padding: 4px 8px; font-size: 11px;" onclick="loadLeadForEdit('${lead.id}')">Edit</button>
        </div>
      `;
      elements.recentLeadsList.appendChild(item);
    });
  }
}

// --- AUTHENTICATION & LOGIN CONTROLLER ---
function initAuth() {
  const saved = localStorage.getItem(AUTH_KEY) || sessionStorage.getItem(AUTH_KEY);
  if (saved) {
    try {
      const session = JSON.parse(saved);
      if (session && (session.username === "bahreab" || session.username === "betty")) {
        setAuthenticatedUser(session, false);
        return;
      }
    } catch {}
  }
  showLoginScreen();
}

function showLoginScreen() {
  state.currentUser = null;
  if (elements.loginScreen) elements.loginScreen.classList.remove("hidden");
  if (elements.userProfileBadge) elements.userProfileBadge.style.display = "none";
}

function setAuthenticatedUser(user, isNewLogin = true) {
  state.currentUser = user;
  if (elements.loginScreen) elements.loginScreen.classList.add("hidden");
  if (elements.userProfileBadge) {
    elements.userProfileBadge.style.display = "inline-flex";
    if (elements.loggedInUserName) elements.loggedInUserName.textContent = user.displayName || user.username;
  }

  // Pre-fill "Collected by (Agent Name)" in lead intake form
  const agentInput = document.getElementById("agent");
  if (agentInput && !agentInput.value.trim()) {
    agentInput.value = user.displayName || user.username;
  }

  if (isNewLogin) {
    showToast(`Welcome back, ${user.displayName || user.username}!`, "success");
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const usernameInput = document.getElementById("loginUsername");
  const passwordInput = document.getElementById("loginPassword");
  const rememberCheckbox = document.getElementById("rememberMeCheckbox");
  const submitBtn = document.getElementById("loginSubmitBtn");

  const username = (usernameInput.value || "").trim().toLowerCase();
  const password = (passwordInput.value || "").trim();

  if (!username || !password) return;

  if (elements.loginErrorAlert) elements.loginErrorAlert.style.display = "none";
  submitBtn.disabled = true;
  submitBtn.textContent = "Verifying...";

  let authenticated = false;
  let userData = null;

  // 1. Attempt API login
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        authenticated = true;
        userData = data.user;
      }
    }
  } catch (err) {
    console.warn("API login check failed, using local verification:", err);
  }

  // 2. Direct fallback (for offline or instantaneous verify)
  if (!authenticated) {
    const VALID = {
      bahreab: { displayName: "Bahreab", role: "Administrator" },
      betty: { displayName: "Betty", role: "Administrator" },
    };

    if (VALID[username] && password === "admin") {
      authenticated = true;
      userData = {
        username,
        displayName: VALID[username].displayName,
        role: VALID[username].role,
      };
    }
  }

  submitBtn.disabled = false;
  submitBtn.textContent = "Login";

  if (authenticated && userData) {
    const storage = rememberCheckbox && rememberCheckbox.checked ? localStorage : sessionStorage;
    storage.setItem(AUTH_KEY, JSON.stringify(userData));
    setAuthenticatedUser(userData, true);
    usernameInput.value = "";
    passwordInput.value = "";
  } else {
    if (elements.loginErrorAlert) {
      elements.loginErrorAlert.textContent = "Invalid username or password. Usernames are 'bahreab' or 'betty'.";
      elements.loginErrorAlert.style.display = "block";
    }
    const card = document.querySelector(".login-card");
    if (card) {
      card.style.animation = "shake 0.3s ease";
      setTimeout(() => { card.style.animation = ""; }, 400);
    }
  }
}

window.quickFillUser = function (user) {
  const uInput = document.getElementById("loginUsername");
  const pInput = document.getElementById("loginPassword");
  if (!uInput || !pInput) return;

  if (user === "betty") {
    uInput.value = "betty";
    pInput.value = "admin";
  } else {
    uInput.value = "bahreab";
    pInput.value = "admin";
  }

  // Auto-submit login form
  const form = document.getElementById("loginForm");
  if (form) {
    if (typeof form.requestSubmit === "function") {
      form.requestSubmit();
    } else {
      handleLogin(new Event("submit"));
    }
  }
};

window.logout = function () {
  localStorage.removeItem(AUTH_KEY);
  sessionStorage.removeItem(AUTH_KEY);
  showLoginScreen();
  showToast("Logged out successfully.", "info");
};

window.showLoginHint = function () {
  alert("Authorized Usernames:\n• bahreab\n• betty\n\nPassword: admin");
};

window.togglePasswordVisibility = function () {
  const pInput = document.getElementById("loginPassword");
  const icon = document.getElementById("eyeIcon");
  if (!pInput) return;
  const isPass = pInput.type === "password";
  pInput.type = isPass ? "text" : "password";
  if (icon) {
    icon.style.stroke = isPass ? "#559cf4" : "currentColor";
  }
};

// 5. Form Handling & Submission
function setupEventListeners() {
  // Login Form & Auth listeners
  elements.loginForm?.addEventListener("submit", handleLogin);
  document.getElementById("togglePasswordBtn")?.addEventListener("click", togglePasswordVisibility);
  elements.logoutBtn?.addEventListener("click", logout);

  // Theme toggle
  document.getElementById("themeToggleBtn")?.addEventListener("click", toggleTheme);

  // New Lead Top Button
  document.getElementById("newLeadBtn")?.addEventListener("click", () => {
    resetForm();
    switchView("intake");
  });

  // Budget Quick Chips
  document.querySelectorAll(".chip-btn").forEach((chip) => {
    chip.addEventListener("click", () => {
      const val = chip.dataset.val;
      const budgetInput = document.getElementById("budget");
      if (budgetInput) {
        budgetInput.value = val;
        saveDraft();
      }
    });
  });

  // Phone auto-helper (+251)
  const phoneInput = document.getElementById("phone");
  phoneInput?.addEventListener("focus", () => {
    if (!phoneInput.value.trim()) {
      phoneInput.value = "+251 ";
    }
  });

  // Auto-save form inputs to draft
  elements.form?.addEventListener("input", saveDraft);

  // Form Submit (Save Lead)
  elements.form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!elements.form.reportValidity()) return;
    await handleFormSubmit();
  });

  // Form Reset
  document.getElementById("resetBtn")?.addEventListener("click", resetForm);

  // Share Brief via WhatsApp
  document.getElementById("shareBriefBtn")?.addEventListener("click", () => {
    if (!elements.form.reportValidity()) return;
    const current = getFormData();
    shareViaWhatsApp(generateBrief(current));
  });

  // Copy Brief
  document.getElementById("copyBriefBtn")?.addEventListener("click", async () => {
    if (!elements.form.reportValidity()) return;
    const current = getFormData();
    await copyToClipboard(generateBrief(current));
  });

  // Preview Brief
  document.getElementById("previewBriefBtn")?.addEventListener("click", () => {
    const current = getFormData();
    openBriefModal(current);
  });

  // CRM Search & Filters
  document.getElementById("crmSearch")?.addEventListener("input", (e) => {
    state.filters.q = e.target.value.trim().toLowerCase();
    renderCRM();
  });

  document.getElementById("crmIndustryFilter")?.addEventListener("change", (e) => {
    state.filters.industry = e.target.value;
    renderCRM();
  });

  document.getElementById("crmStatusFilter")?.addEventListener("change", (e) => {
    state.filters.status = e.target.value;
    renderCRM();
  });

  // CRM View Toggle (Kanban vs Table)
  document.getElementById("viewKanbanBtn")?.addEventListener("click", () => {
    state.crmViewMode = "kanban";
    document.getElementById("viewKanbanBtn").classList.add("primary");
    document.getElementById("viewKanbanBtn").classList.remove("outline");
    document.getElementById("viewTableBtn").classList.add("outline");
    document.getElementById("viewTableBtn").classList.remove("primary");
    renderCRM();
  });

  document.getElementById("viewTableBtn")?.addEventListener("click", () => {
    state.crmViewMode = "table";
    document.getElementById("viewTableBtn").classList.add("primary");
    document.getElementById("viewTableBtn").classList.remove("outline");
    document.getElementById("viewKanbanBtn").classList.add("outline");
    document.getElementById("viewKanbanBtn").classList.remove("primary");
    renderCRM();
  });

  // Export & Data Sync triggers
  document.getElementById("exportJsonBtn")?.addEventListener("click", exportJSON);
  document.getElementById("exportCsvBtn")?.addEventListener("click", exportCSV);
  document.getElementById("syncLocalToCloudBtn")?.addEventListener("click", syncLocalLeadsToCloud);
  
  // Close Modal
  document.getElementById("closeModalBtn")?.addEventListener("click", closeBriefModal);
  elements.briefModal?.addEventListener("click", (e) => {
    if (e.target === elements.briefModal) closeBriefModal();
  });
}

function getFormData() {
  const fd = new FormData(elements.form);
  const data = Object.fromEntries(fd.entries());
  if (state.editingId) data.id = state.editingId;
  return data;
}

function saveDraft() {
  const data = getFormData();
  localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
}

function loadDraft() {
  if (state.editingId) return; // don't overwrite if editing
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
    if (draft && draft.business) {
      for (const [key, val] of Object.entries(draft)) {
        const input = elements.form.elements[key];
        if (input && val !== undefined) input.value = val;
      }
    }
  } catch {}
}

function clearDraft() {
  localStorage.removeItem(DRAFT_KEY);
}

function resetForm() {
  elements.form.reset();
  state.editingId = null;
  clearDraft();
  const title = document.getElementById("formCardTitle");
  if (title) title.textContent = "New client discovery form";
  showToast("Form cleared. Ready for new lead.", "info");
}

async function handleFormSubmit() {
  const leadData = getFormData();
  const isUpdating = Boolean(state.editingId);

  // Optimistic ID creation
  if (!leadData.id) {
    leadData.id = `lead_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  }
  leadData.updated_at = new Date().toISOString();

  let savedSuccessfully = false;

  // 1. Try Saving to Cloudflare D1
  if (state.isCloudConnected) {
    try {
      const endpoint = isUpdating ? `/api/leads/${leadData.id}` : "/api/leads";
      const method = isUpdating ? "PUT" : "POST";
      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(leadData),
      });

      if (res.ok) {
        savedSuccessfully = true;
        showToast(isUpdating ? "Lead updated in Cloudflare D1!" : "Lead successfully saved to Cloudflare D1!", "success");
      }
    } catch (err) {
      console.error("Cloud save failed:", err);
    }
  }

  // 2. Fallback / Local sync
  const existingIdx = state.leads.findIndex((x) => x.id === leadData.id);
  if (existingIdx >= 0) {
    state.leads[existingIdx] = leadData;
  } else {
    state.leads.unshift(leadData);
  }
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state.leads));

  if (!savedSuccessfully && !state.isCloudConnected) {
    showToast("Lead saved in offline storage. Connect Cloudflare to sync.", "info");
  }

  clearDraft();
  state.editingId = leadData.id;
  updateBadgesAndSidebar();
  
  // Prompt option to share brief
  const title = document.getElementById("formCardTitle");
  if (title) title.textContent = `Editing: ${leadData.business}`;
}

// 6. Lead Editing & Loading
window.loadLeadForEdit = function (id) {
  const lead = state.leads.find((x) => x.id === id);
  if (!lead) return;

  state.editingId = id;
  for (const el of elements.form.elements) {
    if (el.name && lead[el.name] !== undefined) {
      el.value = lead[el.name];
    }
  }

  const title = document.getElementById("formCardTitle");
  if (title) title.textContent = `Editing: ${lead.business}`;

  switchView("intake");
  window.scrollTo({ top: 0, behavior: "smooth" });
  showToast(`Loaded "${lead.business}" for editing.`, "info");
};

// 7. CRM View Rendering (Kanban & Table)
const CRM_STAGES = [
  { id: "New lead", label: "New Lead", badge: "badge-new" },
  { id: "Interested", label: "Interested", badge: "badge-interested" },
  { id: "Proposal requested", label: "Proposal Sent", badge: "badge-proposal" },
  { id: "Meeting scheduled", label: "Meeting Scheduled", badge: "badge-meeting" },
  { id: "Negotiating", label: "Negotiating", badge: "badge-negotiating" },
  { id: "Won", label: "Won Deals 🎉", badge: "badge-won" },
  { id: "Not interested", label: "Not Interested / Lost", badge: "badge-lost" },
];

function renderCRM() {
  const filtered = filterLeads(state.leads);

  if (state.crmViewMode === "kanban") {
    document.getElementById("kanbanContainer").style.display = "block";
    document.getElementById("tableContainer").style.display = "none";
    renderKanban(filtered);
  } else {
    document.getElementById("kanbanContainer").style.display = "none";
    document.getElementById("tableContainer").style.display = "block";
    renderTable(filtered);
  }
}

function filterLeads(leads) {
  return leads.filter((lead) => {
    // Search query
    if (state.filters.q) {
      const hay = [
        lead.business,
        lead.contact,
        lead.phone,
        lead.industry,
        lead.location,
        lead.agent,
        lead.notes,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(state.filters.q)) return false;
    }

    // Status filter
    if (state.filters.status && lead.status !== state.filters.status) {
      return false;
    }

    // Industry filter
    if (state.filters.industry && lead.industry !== state.filters.industry) {
      return false;
    }

    return true;
  });
}

function renderKanban(leads) {
  elements.kanbanGrid.innerHTML = "";

  CRM_STAGES.forEach((stage) => {
    const stageLeads = leads.filter((l) => (l.status || "New lead") === stage.id);
    const col = document.createElement("div");
    col.className = "kanban-col";

    col.innerHTML = `
      <div class="kanban-col-header">
        <span>${stage.label}</span>
        <span class="col-badge">${stageLeads.length}</span>
      </div>
      <div class="kanban-cards" id="stage-${encodeURIComponent(stage.id)}"></div>
    `;

    const cardsContainer = col.querySelector(".kanban-cards");

    if (stageLeads.length === 0) {
      cardsContainer.innerHTML = '<p class="hint-text" style="text-align: center; padding: 20px 0;">No leads</p>';
    } else {
      stageLeads.forEach((lead) => {
        const card = document.createElement("div");
        card.className = "lead-card";
        card.innerHTML = `
          <div class="lead-card-header">
            <strong class="lead-card-title">${escapeHtml(lead.business)}</strong>
          </div>
          <div class="lead-card-meta">
            <span>🏷️ ${escapeHtml(lead.industry || "General")}</span>
            <span>👤 ${escapeHtml(lead.contact || "N/A")}</span>
            ${lead.phone ? `<span>📞 <a href="tel:${escapeHtml(lead.phone)}" style="color:inherit">${escapeHtml(lead.phone)}</a></span>` : ""}
            ${lead.budget ? `<span class="lead-card-budget">💰 ${escapeHtml(lead.budget)}</span>` : ""}
          </div>
          <div class="lead-card-footer">
            <span>${formatDate(lead.created_at || lead.updated_at)}</span>
            <div class="actions-row">
              <button type="button" class="btn-outline" style="padding: 3px 6px; font-size: 11px;" onclick="viewLeadDetail('${lead.id}')">Brief</button>
              <button type="button" class="btn-outline" style="padding: 3px 6px; font-size: 11px;" onclick="promptChangeStatus('${lead.id}')">Stage</button>
            </div>
          </div>
        `;
        cardsContainer.appendChild(card);
      });
    }

    elements.kanbanGrid.appendChild(col);
  });
}

function renderTable(leads) {
  elements.leadsTableBody.innerHTML = "";
  if (!leads.length) {
    elements.leadsTableBody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center; padding: 30px;" class="hint-text">
          No matching leads found.
        </td>
      </tr>
    `;
    return;
  }

  leads.forEach((lead) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${escapeHtml(lead.business)}</strong></td>
      <td><span class="badge ${getStatusBadgeClass(lead.status)}">${escapeHtml(lead.status || "New lead")}</span></td>
      <td>${escapeHtml(lead.industry || "General")}</td>
      <td>${escapeHtml(lead.contact || "N/A")}</td>
      <td>${escapeHtml(lead.phone || "N/A")}</td>
      <td><strong>${escapeHtml(lead.budget || "Not set")}</strong></td>
      <td>
        <div class="actions-row">
          <button type="button" class="btn-outline" style="padding: 4px 8px; font-size: 11px;" onclick="viewLeadDetail('${lead.id}')">View Brief</button>
          <button type="button" class="btn-outline" style="padding: 4px 8px; font-size: 11px;" onclick="loadLeadForEdit('${lead.id}')">Edit</button>
          <button type="button" class="btn-danger" style="padding: 4px 8px; font-size: 11px;" onclick="confirmDeleteLead('${lead.id}')">Delete</button>
        </div>
      </td>
    `;
    elements.leadsTableBody.appendChild(tr);
  });
}

// 8. Analytics View
async function renderAnalytics() {
  let stats = {
    total: state.leads.length,
    active_pipeline_etb: 0,
    won_value_etb: 0,
    won_count: 0,
    by_status: [],
    by_industry: [],
  };

  // Try API stats first
  if (state.isCloudConnected) {
    try {
      const res = await fetch("/api/stats");
      if (res.ok) {
        stats = await res.json();
      }
    } catch (e) {
      console.warn("Could not fetch API stats, computing locally:", e);
    }
  }

  // Fallback to local computation if values 0
  if (!stats.active_pipeline_etb && state.leads.length) {
    state.leads.forEach((l) => {
      const num = extractNumericBudget(l.budget);
      if (l.status === "Won") {
        stats.won_value_etb += num;
        stats.won_count++;
      } else if (l.status !== "Not interested") {
        stats.active_pipeline_etb += num;
      }
    });
  }

  // Render KPI Cards
  elements.kpiTotalLeads.textContent = stats.total;
  elements.kpiPipelineVal.textContent = formatCurrency(stats.active_pipeline_etb);
  elements.kpiWonVal.textContent = formatCurrency(stats.won_value_etb);

  const winRate = stats.total > 0 ? Math.round((stats.won_count / stats.total) * 100) : 0;
  elements.kpiWinRate.textContent = `${winRate}%`;

  // Render Status Distribution
  elements.stageBreakdownContainer.innerHTML = "";
  CRM_STAGES.forEach((stage) => {
    const count = state.leads.filter((l) => (l.status || "New lead") === stage.id).length;
    const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;

    const row = document.createElement("div");
    row.style.marginBottom = "10px";
    row.innerHTML = `
      <div style="display:flex; justify-content:space-between; font-size:12px; font-weight:600; margin-bottom:4px;">
        <span>${stage.label}</span>
        <span>${count} (${pct}%)</span>
      </div>
      <div style="height:8px; background:var(--bg-subtle); border-radius:4px; overflow:hidden;">
        <div style="height:100%; width:${pct}%; background:var(--primary); border-radius:4px;"></div>
      </div>
    `;
    elements.stageBreakdownContainer.appendChild(row);
  });

  // Render Industry Distribution
  elements.industryBreakdownContainer.innerHTML = "";
  const industries = {};
  state.leads.forEach((l) => {
    const ind = l.industry || "Other";
    industries[ind] = (industries[ind] || 0) + 1;
  });

  Object.entries(industries)
    .sort((a, b) => b[1] - a[1])
    .forEach(([ind, cnt]) => {
      const pct = stats.total > 0 ? Math.round((cnt / stats.total) * 100) : 0;
      const row = document.createElement("div");
      row.style.marginBottom = "10px";
      row.innerHTML = `
        <div style="display:flex; justify-content:space-between; font-size:12px; font-weight:600; margin-bottom:4px;">
          <span>${escapeHtml(ind)}</span>
          <span>${cnt} (${pct}%)</span>
        </div>
        <div style="height:8px; background:var(--bg-subtle); border-radius:4px; overflow:hidden;">
          <div style="height:100%; width:${pct}%; background:var(--secondary); border-radius:4px;"></div>
        </div>
      `;
      elements.industryBreakdownContainer.appendChild(row);
    });
}

// 9. Brief Modal, Sharing & Actions
window.viewLeadDetail = function (id) {
  const lead = state.leads.find((x) => x.id === id);
  if (!lead) return;
  openBriefModal(lead);
};

function openBriefModal(lead) {
  const text = generateBrief(lead);
  elements.briefContent.textContent = text;
  elements.briefModalTitle.textContent = `${lead.business || "Client"} · Discovery Brief`;
  
  // Set modal action buttons
  const bahreabBtn = document.getElementById("modalWhatsAppBahreabBtn");
  const bettyBtn = document.getElementById("modalWhatsAppBettyBtn");
  
  if (bahreabBtn) bahreabBtn.onclick = () => shareToContact("251919477040", text);
  if (bettyBtn) bettyBtn.onclick = () => shareToContact("251966726065", text);

  document.getElementById("modalCopyBtn").onclick = () => copyToClipboard(text);
  document.getElementById("modalPrintBtn").onclick = () => window.print();
  document.getElementById("modalEditBtn").onclick = () => {
    closeBriefModal();
    loadLeadForEdit(lead.id);
  };

  elements.briefModal.classList.add("active");
}

function closeBriefModal() {
  elements.briefModal.classList.remove("active");
}

function generateBrief(d) {
  const agentName = d.agent || (state.currentUser ? state.currentUser.displayName : "B2 Tech Representative");
  return [
    "==================================================",
    "       B2 TECHNOLOGIES · CLIENT DISCOVERY BRIEF    ",
    "         Ideas / Websites / Solutions             ",
    "==================================================",
    `Headquarters    : Addis Ababa, Ethiopia`,
    `Contact Hotline : +251 91 947 7040 / +251 96 672 6065`,
    `Date Generated  : ${new Date().toLocaleDateString()}`,
    "",
    "1. BUSINESS PROFILE",
    `   • Business Name   : ${d.business || "Not specified"}`,
    `   • Industry        : ${d.industry || "Not specified"}`,
    `   • Location / Area : ${d.location || "Not specified"}`,
    `   • Google Maps     : ${d.maps || "Not provided"}`,
    `   • Description     : ${d.description || "Not provided"}`,
    "",
    "2. DECISION-MAKER CONTACT",
    `   • Contact Name    : ${d.contact || "Not specified"}`,
    `   • Role / Position : ${d.role || "Not specified"}`,
    `   • Phone / WhatsApp: ${d.phone || "Not specified"}`,
    `   • Email Address   : ${d.email || "Not specified"}`,
    "",
    "3. PROJECT SPECIFICATIONS",
    `   • Website Goal    : ${d.siteType || d.site_type || "New website"}`,
    `   • Current Website : ${d.currentSite || d.current_site || "None"}`,
    `   • Required Features: ${d.features || "Standard pages"}`,
    `   • Brand Assets    : ${d.branding || "Unknown"}`,
    `   • Domain & Hosting: ${d.hosting || "Unknown"}`,
    `   • Preferred Lang  : ${d.language || "English, Amharic"}`,
    `   • Expected Budget : ${d.budget ? `${d.budget} ETB` : "Not discussed"}`,
    `   • Expected Deadline: ${d.timeline || "Not specified"}`,
    `   • Current Status  : ${d.status || "New lead"}`,
    "",
    "4. INTERNAL NOTES & COORDINATION",
    `   • Notes / Follow-up: ${d.notes || "None"}`,
    `   • Collected By    : ${agentName}`,
    "==================================================",
    "B2 Technologies · Building a Smarter Tomorrow",
    "Addis Ababa, Ethiopia · +251 91 947 7040 / +251 96 672 6065",
    "Website Development · Cloud & Hosting · Custom Solutions",
  ].join("\n");
}

function shareToContact(phone, text) {
  const url = `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(text)}`;
  window.open(url, "_blank", "noopener,noreferrer");
  showToast(`Opening WhatsApp chat with +${phone}...`, "success");
}

window.shareBriefWithContact = function(person) {
  const current = getFormData();
  const brief = generateBrief(current);
  if (person === "betty") {
    shareToContact("251966726065", brief);
  } else {
    shareToContact("251919477040", brief);
  }
};

function shareViaWhatsApp(text) {
  const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank", "noopener,noreferrer");
  showToast("Opening WhatsApp with formatted brief...", "success");
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast("Brief copied to clipboard! Ready to paste.", "success");
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    showToast("Brief copied to clipboard!", "success");
  }
}

// 10. Status Changer Prompt & Delete
window.promptChangeStatus = async function (id) {
  const lead = state.leads.find((x) => x.id === id);
  if (!lead) return;

  const current = lead.status || "New lead";
  const stageList = CRM_STAGES.map((s, idx) => `${idx + 1}. ${s.label}`).join("\n");
  const choice = prompt(`Select new stage for "${lead.business}":\n\nCurrent: ${current}\n\n${stageList}\n\nEnter number (1-7):`);

  if (!choice) return;
  const num = parseInt(choice, 10);
  if (num >= 1 && num <= CRM_STAGES.length) {
    const newStatus = CRM_STAGES[num - 1].id;
    lead.status = newStatus;
    lead.updated_at = new Date().toISOString();

    // Update remote if online
    if (state.isCloudConnected) {
      try {
        await fetch(`/api/leads/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(lead),
        });
      } catch (err) {
        console.error("Failed to update status on cloud:", err);
      }
    }

    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state.leads));
    renderCRM();
    showToast(`Stage updated to "${newStatus}"`, "success");
  }
};

window.confirmDeleteLead = async function (id) {
  const lead = state.leads.find((x) => x.id === id);
  if (!lead) return;

  if (!confirm(`Are you sure you want to delete "${lead.business}"?`)) return;

  if (state.isCloudConnected) {
    try {
      await fetch(`/api/leads/${id}`, { method: "DELETE" });
    } catch (err) {
      console.warn("Could not delete from cloud:", err);
    }
  }

  state.leads = state.leads.filter((x) => x.id !== id);
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state.leads));
  updateBadgesAndSidebar();
  renderCRM();
  showToast(`Lead "${lead.business}" deleted.`, "info");
};

// 11. Bulk Migration from Local Storage to Cloudflare D1
async function syncLocalLeadsToCloud() {
  if (!state.isCloudConnected) {
    showToast("Cloudflare D1 is currently offline. Please ensure deployment is active.", "error");
    return;
  }

  const localLeads = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || "[]");
  if (!localLeads.length) {
    showToast("No leads stored locally to synchronize.", "info");
    return;
  }

  try {
    showToast(`Uploading ${localLeads.length} leads to Cloudflare D1...`, "info");
    const res = await fetch("/api/leads/bulk-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(localLeads),
    });

    if (res.ok) {
      const data = await res.json();
      showToast(`Success: ${data.synced_count} leads synchronized with Cloudflare D1!`, "success");
      await refreshData();
    } else {
      throw new Error("Bulk sync failed");
    }
  } catch (err) {
    showToast("Error synchronizing with Cloudflare: " + err.message, "error");
  }
}

// 12. Export Tools
function exportJSON() {
  const blob = new Blob([JSON.stringify(state.leads, null, 2)], { type: "application/json" });
  downloadBlob(blob, `b2tech-leads-${new Date().toISOString().slice(0, 10)}.json`);
}

function exportCSV() {
  if (!state.leads.length) {
    showToast("No leads available to export.", "info");
    return;
  }

  const headers = [
    "ID", "Business", "Industry", "Location", "Maps URL", "Contact",
    "Role", "Phone", "Email", "Website Goal", "Current Site",
    "Branding", "Hosting", "Budget (ETB)", "Timeline", "Status",
    "Notes", "Agent", "Created At"
  ];

  const rows = state.leads.map((l) => [
    l.id,
    l.business || "",
    l.industry || "",
    l.location || "",
    l.maps || "",
    l.contact || "",
    l.role || "",
    l.phone || "",
    l.email || "",
    l.siteType || l.site_type || "",
    l.currentSite || l.current_site || "",
    l.branding || "",
    l.hosting || "",
    l.budget || "",
    l.timeline || "",
    l.status || "",
    (l.notes || "").replace(/\n/g, " "),
    l.agent || "",
    l.created_at || ""
  ]);

  const csvContent = [
    headers.map(escapeCsvValue).join(","),
    ...rows.map((row) => row.map(escapeCsvValue).join(","))
  ].join("\r\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, `b2tech-leads-${new Date().toISOString().slice(0, 10)}.csv`);
}

function escapeCsvValue(val) {
  const str = String(val ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
}

// 13. UI Helpers
function showToast(message, type = "info", duration = 3500) {
  let container = document.getElementById("toastContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "toastContainer";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(10px)";
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

function getStatusBadgeClass(status) {
  switch (status) {
    case "New lead": return "badge-new";
    case "Interested": return "badge-interested";
    case "Proposal requested": return "badge-proposal";
    case "Meeting scheduled": return "badge-meeting";
    case "Negotiating": return "badge-negotiating";
    case "Won": return "badge-won";
    case "Not interested": return "badge-lost";
    default: return "badge-new";
  }
}

function extractNumericBudget(val) {
  if (!val) return 0;
  const cleaned = String(val).toLowerCase().replace(/,/g, "").trim();
  if (cleaned.includes("k")) {
    const num = parseFloat(cleaned.replace(/[^0-9.]/g, ""));
    return isNaN(num) ? 0 : num * 1000;
  }
  const match = cleaned.match(/([0-9]+(?:\.[0-9]+)?)/);
  if (match) {
    const n = parseFloat(match[1]);
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

function formatCurrency(val) {
  if (!val) return "0 ETB";
  return new Intl.NumberFormat("en-US").format(val) + " ETB";
}

function formatDate(isoStr) {
  if (!isoStr) return "";
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return isoStr;
  }
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
