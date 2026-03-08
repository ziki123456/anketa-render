const express = require("express");
const fs = require("fs");
const path = require("path");
const morgan = require("morgan");

const app = express();
const PORT = process.env.PORT || 3000;

app.set("trust proxy", true);
app.use(
  morgan((tokens, req, res) => {
    return JSON.stringify({
      time: new Date().toISOString(),
      ip: req.ip,
      method: tokens.method(req, res),
      url: tokens.url(req, res),
      status: Number(tokens.status(req, res)),
      ms: Number(tokens["response-time"](req, res))
    });
  })
);

const POLL = {
  question: "Kolik otevřených záložek je ještě normální?",
  options: [
    { id: "A", text: "1–5 (mám to pod kontrolou)" },
    { id: "B", text: "6–15 (pracovní režim)" },
    { id: "C", text: "16+ (to už je životní styl)" }
  ]
};

const RESET_TOKEN = process.env.RESET_TOKEN || "tajny-token-123";
const GITHUB_ISSUES_URL =
  process.env.ISSUES_URL || "https://github.com/ziki123456/anketa-render/issues";

const DATA_DIR = path.join(__dirname, "data");
const VOTES_FILE = path.join(DATA_DIR, "votes.json");

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(VOTES_FILE)) {
    const initial = {};
    for (const opt of POLL.options) {
      initial[opt.id] = 0;
    }
    fs.writeFileSync(VOTES_FILE, JSON.stringify(initial, null, 2), "utf-8");
  }
}

function loadVotes() {
  ensureDataFile();
  try {
    const raw = fs.readFileSync(VOTES_FILE, "utf-8");
    const obj = JSON.parse(raw);

    for (const opt of POLL.options) {
      if (typeof obj[opt.id] !== "number") obj[opt.id] = 0;
    }
    return obj;
  } catch (e) {
    const reset = {};
    for (const opt of POLL.options) reset[opt.id] = 0;
    fs.writeFileSync(VOTES_FILE, JSON.stringify(reset, null, 2), "utf-8");
    return reset;
  }
}

function saveVotes(votes) {
  fs.writeFileSync(VOTES_FILE, JSON.stringify(votes, null, 2), "utf-8");
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const result = {};

  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    result[key] = decodeURIComponent(value);
  }

  return result;
}

function hasVoted(req) {
  const cookies = parseCookies(req);
  return cookies.voted === "true";
}

function navLinksHtml() {
  return `
    <nav class="nav">
      <a href="/">Hlasování</a>
      <a href="/results">Výsledky</a>
      <a href="/about">O anketě</a>
    </nav>
  `;
}

function pageShell(title, content) {
  return `
<!doctype html>
<html lang="cs">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f4f7fb;
      --card: #ffffff;
      --text: #18212f;
      --muted: #667085;
      --line: #dbe3ef;
      --primary: #2563eb;
      --primary-dark: #1d4ed8;
      --success-bg: #ecfdf3;
      --success-text: #027a48;
      --shadow: 0 12px 30px rgba(16, 24, 40, 0.08);
      --radius: 18px;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      font-family: Arial, Helvetica, sans-serif;
      background: linear-gradient(180deg, #eef3fb 0%, #f8fafc 100%);
      color: var(--text);
    }

    .wrap {
      max-width: 860px;
      margin: 0 auto;
      padding: 24px 16px 48px;
    }

    .card {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      padding: 24px;
    }

    h1 {
      margin: 0 0 12px;
      font-size: clamp(28px, 4vw, 42px);
      line-height: 1.15;
    }

    h2 {
      margin-top: 0;
      font-size: 22px;
    }

    p {
      line-height: 1.6;
    }

    .muted {
      color: var(--muted);
    }

    .nav {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      margin: 0 0 22px;
    }

    .nav a,
    .link-btn {
      text-decoration: none;
      color: var(--primary);
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      padding: 10px 14px;
      border-radius: 999px;
      display: inline-block;
      font-weight: 700;
    }

    .question {
      font-size: clamp(22px, 3vw, 32px);
      line-height: 1.3;
      margin: 6px 0 22px;
    }

    form { margin: 0; }

    .options {
      display: grid;
      gap: 14px;
      margin-bottom: 22px;
    }

    .option {
      display: flex;
      gap: 14px;
      align-items: center;
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 18px;
      background: #fbfdff;
      cursor: pointer;
      transition: 0.2s ease;
      min-height: 68px;
    }

    .option:hover {
      border-color: #93c5fd;
      background: #f0f7ff;
      transform: translateY(-1px);
    }

    .option input[type="radio"] {
      width: 24px;
      height: 24px;
      margin: 0;
      accent-color: var(--primary);
      flex: 0 0 auto;
    }

    .option-text {
      font-size: 20px;
      line-height: 1.4;
    }

    .actions {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      margin-top: 10px;
    }

    button,
    .btn {
      border: 0;
      border-radius: 12px;
      padding: 14px 18px;
      font-size: 16px;
      font-weight: 700;
      cursor: pointer;
      text-decoration: none;
      display: inline-block;
    }

    .btn-primary {
      background: var(--primary);
      color: white;
    }

    .btn-primary:hover {
      background: var(--primary-dark);
    }

    .btn-secondary {
      background: #eef2ff;
      color: #3730a3;
      border: 1px solid #c7d2fe;
    }

    .notice {
      background: var(--success-bg);
      color: var(--success-text);
      border: 1px solid #abefc6;
      border-radius: 14px;
      padding: 16px;
      margin-bottom: 18px;
      font-weight: 700;
    }

    .result-item {
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 16px;
      margin-bottom: 14px;
      background: #fcfdff;
    }

    .result-top {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 10px;
      font-weight: 700;
    }

    .bar {
      width: 100%;
      height: 14px;
      background: #e5edf8;
      border-radius: 999px;
      overflow: hidden;
    }

    .bar-fill {
      height: 100%;
      background: linear-gradient(90deg, #60a5fa 0%, #2563eb 100%);
      border-radius: 999px;
    }

    .small-link {
      margin-top: 24px;
      text-align: right;
      font-size: 14px;
    }

    .small-link a {
      color: var(--muted);
      text-decoration: none;
    }

    details {
      margin-top: 18px;
      border: 1px dashed #cbd5e1;
      border-radius: 14px;
      padding: 14px;
      background: #fafafa;
    }

    summary {
      cursor: pointer;
      font-weight: 700;
      color: var(--muted);
    }

    .field {
      display: grid;
      gap: 8px;
      margin-top: 12px;
    }

    input[type="password"] {
      width: 100%;
      max-width: 300px;
      padding: 12px 14px;
      border: 1px solid #cbd5e1;
      border-radius: 12px;
      font-size: 16px;
    }

    code {
      background: #f1f5f9;
      padding: 2px 6px;
      border-radius: 6px;
    }

    @media (max-width: 640px) {
      .wrap { padding: 16px 12px 28px; }
      .card { padding: 18px; }
      .option { padding: 16px; min-height: 72px; }
      .option-text { font-size: 18px; }
      button, .btn { width: 100%; text-align: center; }
      .actions { display: grid; }
      .result-top { flex-direction: column; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      ${navLinksHtml()}
      ${content}
    </div>
  </div>
</body>
</html>
  `.trim();
}

app.use(express.urlencoded({ extended: false }));

app.get("/", (req, res) => {
  const voted = hasVoted(req);

  const voteBlock = voted
    ? `
      <div class="notice">Už jsi hlasoval. Formulář už znovu neukazuju, aby nešlo hlasovat pořád dokola.</div>
      <div class="actions">
        <a class="btn btn-primary" href="/results">Zobrazit výsledky</a>
      </div>
    `
    : `
      <form method="post" action="/vote">
        <div class="options">
          ${POLL.options
            .map(
              (o) => `
                <label class="option">
                  <input type="radio" name="option" value="${escapeHtml(o.id)}" required>
                  <span class="option-text"><strong>${escapeHtml(o.id)})</strong> ${escapeHtml(o.text)}</span>
                </label>
              `
            )
            .join("")}
        </div>

        <div class="actions">
          <button class="btn btn-primary" type="submit">Odeslat hlas</button>
          <a class="btn btn-secondary" href="/results">Zobrazit výsledky bez hlasování</a>
        </div>
      </form>
    `;

  const html = pageShell(
    "Anketa",
    `
      <h1>Anketa</h1>
      <p class="question">${escapeHtml(POLL.question)}</p>
      ${voteBlock}
      <div class="small-link">
        <a href="/about#admin-reset">Admin reset</a>
      </div>
    `
  );

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

app.get("/search", (req, res) => {
  const q = req.query.q || "";
  const safe = escapeHtml(q);

  const html = pageShell(
    "Search",
    `
      <h1>Search</h1>
      <p class="muted">Testovací stránka pro logy a XSS pokus.</p>
      <p>q = <code>${safe}</code></p>
      <div class="actions">
        <a class="btn btn-primary" href="/">Zpět</a>
      </div>
    `
  );

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

app.post("/vote", (req, res) => {
  if (hasVoted(req)) {
    res.redirect("/results");
    return;
  }

  const optionId = req.body.option;
  const validIds = new Set(POLL.options.map((o) => o.id));

  if (!validIds.has(optionId)) {
    res.status(400).send("Neplatná volba.");
    return;
  }

  const votes = loadVotes();
  votes[optionId] = (votes[optionId] || 0) + 1;
  saveVotes(votes);

  res.setHeader("Set-Cookie", "voted=true; Max-Age=31536000; Path=/; HttpOnly; SameSite=Lax");
  res.redirect("/results?justVoted=1");
});

app.get("/results", (req, res) => {
  const votes = loadVotes();
  const totalVotes = POLL.options.reduce((sum, o) => sum + (votes[o.id] || 0), 0);
  const justVoted = req.query.justVoted === "1";

  const rows = POLL.options
    .map((o) => {
      const count = typeof votes[o.id] === "number" ? votes[o.id] : 0;
      const percent = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;

      return `
        <div class="result-item">
          <div class="result-top">
            <span>${escapeHtml(o.id)}) ${escapeHtml(o.text)}</span>
            <span>${count} hlasů (${percent} %)</span>
          </div>
          <div class="bar">
            <div class="bar-fill" style="width: ${percent}%;"></div>
          </div>
        </div>
      `;
    })
    .join("");

  const html = pageShell(
    "Výsledky",
    `
      <h1>Výsledky</h1>
      ${justVoted ? '<div class="notice">Hlas se uložil a už je započítaný ve výsledcích.</div>' : ""}
      <p class="question">${escapeHtml(POLL.question)}</p>
      <p class="muted">Celkem hlasů: <strong>${totalVotes}</strong></p>
      ${rows}
      <div class="actions">
        <a class="btn btn-primary" href="/">Zpět na anketu</a>
      </div>
    `
  );

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

app.get("/about", (req, res) => {
  const html = pageShell(
    "O anketě",
    `
      <h1>O anketě</h1>
      <p>
        Tahle mini anketa vznikla jako jednoduchý webový projekt na téma hlasování.
        Otázka je schválně trochu ze života, protože počet otevřených záložek je pro spoustu lidí skoro samostatná disciplína.
      </p>
      <p>
        Výsledky se průběžně sčítají pro všechny návštěvníky a na stránce výsledků je teď i jednoduchý graf,
        aby bylo hned líp vidět, jak anketa dopadá.
      </p>

      <h2>Nahlášení chyby</h2>
      <p>
        Pokud najdeš chybu nebo máš nápad na zlepšení, napiš to prosím do GitHub Issues.
      </p>
      <div class="actions">
        <a class="btn btn-primary" href="${escapeHtml(GITHUB_ISSUES_URL)}" target="_blank" rel="noreferrer">Otevřít Issues</a>
      </div>

      <details id="admin-reset">
        <summary>Admin reset hlasování</summary>
        <p class="muted">Zadejte token pro reset hlasování.</p>
        <form method="post" action="/reset">
          <div class="field">
            <label for="token">Token</label>
            <input id="token" type="password" name="token" required>
          </div>
          <div class="actions">
            <button class="btn btn-secondary" type="submit">Resetovat hlasy</button>
          </div>
        </form>
      </details>
    `
  );

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

app.post("/reset", (req, res) => {
  const token = req.body.token;

  if (token !== RESET_TOKEN) {
    res.status(403).send("Špatný token. Reset se neprovedl.");
    return;
  }

  const resetVotes = {};
  for (const opt of POLL.options) {
    resetVotes[opt.id] = 0;
  }
  saveVotes(resetVotes);

  res.setHeader("Set-Cookie", "voted=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax");
  res.redirect("/results");
});

app.listen(PORT, () => {
  ensureDataFile();
  console.log(`Server běží na http://localhost:${PORT}`);
});