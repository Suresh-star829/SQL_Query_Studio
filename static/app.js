const $ = id => document.getElementById(id);
const serverEl = $("server");
const connectBtn = $("connectServer");
const statusBadge = $("serverStatus");
const dbEl = $("database");
const tableEl = $("table");
const chatEl = $("chat");
const welcomeEl = $("welcome");
const messageEl = $("message");

let selectedTables = [];
let historyItems = [];
let busy = false;
let isConnected = false;

// API helper
async function api(url, options = {}) {
  const r = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.success === false) {
    throw Error(d.message || d.error || `Request failed (${r.status})`);
  }
  return d;
}

// Toast notification
function toast(m) {
  const e = $("toast");
  e.textContent = m;
  e.classList.add("show");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => e.classList.remove("show"), 3000);
}

// Context label update
function updateContext() {
  const s = serverEl.value.trim();
  const d = dbEl.value || "";
  const tables = selectedTables.length ? " / " + selectedTables.map(t => t.value).join(", ") : "";
  $("contextLabel").textContent = (isConnected && d) 
    ? `${s} / ${d}${tables}` 
    : (isConnected ? `${s} (Choose a database)` : "Choose a server and database");
}

// Render selected table badges
function renderTables() {
  const h = $("selectedTables");
  h.innerHTML = "";
  selectedTables.forEach((t, i) => {
    const c = document.createElement("span");
    c.className = "table-chip";
    c.append(document.createTextNode(t.value + " "));
    const b = document.createElement("button");
    b.textContent = "×";
    b.onclick = () => {
      selectedTables.splice(i, 1);
      renderTables();
    };
    c.append(b);
    h.append(c);
  });
  updateContext();
}

// Set status badge helper
function setStatus(state, text, icon) {
  statusBadge.className = `connection-status ${state}`;
  statusBadge.innerHTML = `<span class="status-icon">${icon}</span><span class="status-text">${text}</span>`;
}

// 1. Connect to SQL Server
async function connectToServer() {
  const server = serverEl.value.trim();
  if (!server) {
    toast("Please enter a SQL Server address");
    return;
  }

  setStatus("connecting", "Connecting…", "⏳");
  connectBtn.disabled = true;
  dbEl.disabled = true;
  tableEl.disabled = true;
  $("addTable").disabled = true;
  selectedTables = [];
  renderTables();

  try {
    const data = await api("/api/connect-server", {
      method: "POST",
      body: JSON.stringify({ server })
    });

    isConnected = true;
    setStatus("connected", "Connected", "✔");

    // Populate Database Dropdown
    dbEl.innerHTML = '<option value="">Select database</option>';
    const databases = data.databases || [];
    databases.forEach(db => dbEl.add(new Option(db, db)));
    dbEl.disabled = false;
    updateContext();
  } catch (err) {
    isConnected = false;
    setStatus("disconnected", "Failed", "✖");
    dbEl.innerHTML = '<option value="">Connect to server first</option>';
    toast(err.message);
  } finally {
    connectBtn.disabled = false;
  }
}

// 2. Load Tables when Database changes
async function loadTables() {
  tableEl.disabled = true;
  $("addTable").disabled = true;
  selectedTables = [];
  renderTables();

  const server = serverEl.value.trim();
  const database = dbEl.value;

  if (!database) {
    tableEl.innerHTML = '<option value="">Select database first</option>';
    updateContext();
    return;
  }

  tableEl.innerHTML = '<option value="">Loading tables…</option>';

  try {
    const data = await api("/api/tables", {
      method: "POST",
      body: JSON.stringify({ server, database })
    });

    tableEl.innerHTML = '<option value="">Select table (optional)</option>';
    const tables = data.tables || [];
    tables.forEach(t => {
      const val = typeof t === "string" ? t : (t.value || t.name);
      tableEl.add(new Option(val, val));
    });
    tableEl.disabled = false;
  } catch (err) {
    tableEl.innerHTML = '<option value="">Failed to load tables</option>';
    toast(err.message);
  }
  updateContext();
}

// Reset connection if server name is edited
serverEl.addEventListener("input", () => {
  if (isConnected) {
    isConnected = false;
    setStatus("disconnected", "Not Connected", "○");
    dbEl.disabled = true;
    dbEl.innerHTML = '<option value="">Connect to server first</option>';
    tableEl.disabled = true;
    tableEl.innerHTML = '<option value="">Select database first</option>';
    $("addTable").disabled = true;
    selectedTables = [];
    renderTables();
  }
});

// Event Listeners for controls
connectBtn.onclick = connectToServer;
serverEl.onkeydown = e => { if (e.key === "Enter") connectToServer(); };
dbEl.onchange = loadTables;
tableEl.onchange = () => { $("addTable").disabled = !tableEl.value; };

$("addTable").onclick = () => {
  if (tableEl.value && !selectedTables.some(t => t.value === tableEl.value)) {
    selectedTables.push({ value: tableEl.value });
    renderTables();
  } else {
    toast("Select a new table first");
  }
};

document.querySelectorAll(".suggestion").forEach(b => {
  b.onclick = () => {
    messageEl.value = b.dataset.prompt;
    messageEl.focus();
  };
});

$("clearChat").onclick = () => {
  historyItems = [];
  chatEl.innerHTML = "";
  chatEl.classList.remove("active");
  welcomeEl.style.display = "";
  messageEl.value = "";
};

// Chat message rendering
function addMessage(role, content) {
  welcomeEl.style.display = "none";
  chatEl.classList.add("active");
  const row = document.createElement("div");
  row.className = "message-row " + role;
  const av = document.createElement("div");
  av.className = "avatar";
  av.textContent = role === "user" ? "Y" : "✦";
  const body = document.createElement("div");
  body.className = "message-body";
  const head = document.createElement("div");
  head.className = "message-head";
  head.textContent = role === "user" ? "You" : "SQL Query Studio";
  const txt = document.createElement("div");
  txt.className = "message-text";
  txt.textContent = content;
  body.append(head, txt);
  row.append(av, body);
  chatEl.append(row);
  chatEl.scrollTop = chatEl.scrollHeight;
  return { row, body, txt };
}

function renderAnswer(body, answer) {
  body.innerHTML = "";
  const h = document.createElement("div");
  h.className = "message-head";
  h.textContent = "SQL Query Studio";
  body.append(h);

  const parts = answer.split(/```(?:sql|tsql)?\s*([\s\S]*?)```/gi);
  parts.forEach((p, i) => {
    p = p.trim();
    if (!p) return;
    if (i % 2) {
      const pre = document.createElement("pre");
      pre.className = "sql-block";
      pre.textContent = p;
      body.append(pre);

      const tools = document.createElement("div");
      tools.className = "sql-tools";

      const copy = document.createElement("button");
      copy.className = "small-button";
      copy.textContent = "Copy SQL";
      copy.onclick = async () => {
        await navigator.clipboard.writeText(p);
        toast("Copied");
      };

      const run = document.createElement("button");
      run.className = "small-button primary";
      run.textContent = "Run read-only query";
      run.onclick = () => executeSql(p, body);

      tools.append(copy, run);
      body.append(tools);
    } else {
      const el = document.createElement("div");
      el.className = "message-text";
      el.textContent = p;
      body.append(el);
    }
  });
  chatEl.scrollTop = chatEl.scrollHeight;
}

// Send user query to Gemini
async function sendMessage(prefill) {
  if (busy) return;
  const msg = (prefill ?? messageEl.value).trim();
  if (!msg) return;

  if (!isConnected || !dbEl.value) {
    toast("Connect to a server and select a database first");
    return;
  }

  addMessage("user", msg);
  historyItems.push({ role: "user", content: msg });
  messageEl.value = "";
  busy = true;
  $("send").disabled = true;

  const pending = addMessage("assistant", "Thinking…");
  try {
    const r = await api("/api/chat", {
      method: "POST",
      body: JSON.stringify({
        server: serverEl.value.trim(),
        database: dbEl.value,
        tables: selectedTables.map(t => t.value),
        message: msg,
        history: historyItems.slice(-8)
      })
    });
    pending.row.remove();
    renderAnswer(addMessage("assistant", "").body, r.answer);
    historyItems.push({ role: "assistant", content: r.answer });
  } catch (e) {
    pending.txt.className = "error";
    pending.txt.textContent = e.message;
  } finally {
    busy = false;
    $("send").disabled = false;
  }
}

// Execute generated SQL safely
async function executeSql(sql, body) {
  if (!confirm("Execute this query using the application's read-only Windows identity? Review the SQL first.")) return;
  const s = document.createElement("div");
  s.className = "message-text";
  s.textContent = "Running…";
  body.append(s);

  try {
    const r = await api("/api/execute", {
      method: "POST",
      body: JSON.stringify({
        server: serverEl.value.trim(),
        database: dbEl.value,
        sql
      })
    });
    s.remove();

    if (!r.columns || !r.columns.length) {
      const n = document.createElement("div");
      n.textContent = r.message || "Query executed. No tabular results returned.";
      body.append(n);
      return;
    }

    const wrap = document.createElement("div");
    wrap.className = "result-wrap";
    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const tr = document.createElement("tr");

    r.columns.forEach(c => {
      const th = document.createElement("th");
      th.textContent = c;
      tr.append(th);
    });
    thead.append(tr);
    table.append(thead);

    const tb = document.createElement("tbody");
    r.rows.forEach(row => {
      const rowEl = document.createElement("tr");
      row.forEach(v => {
        const td = document.createElement("td");
        td.textContent = v ?? "NULL";
        td.title = v ?? "";
        rowEl.append(td);
      });
      tb.append(rowEl);
    });
    table.append(tb);
    wrap.append(table);
    body.append(wrap);

    const n = document.createElement("div");
    n.className = "message-text";
    n.textContent = `${r.rows.length} row(s) shown${r.truncated ? " (limited to 500)" : ""}`;
    body.append(n);
  } catch (e) {
    s.className = "error";
    s.textContent = e.message;
  }
  chatEl.scrollTop = chatEl.scrollHeight;
}

// Input bindings
$("send").onclick = () => sendMessage();
messageEl.onkeydown = e => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
};
messageEl.oninput = () => {
  messageEl.style.height = "auto";
  messageEl.style.height = Math.min(messageEl.scrollHeight, 160) + "px";
};