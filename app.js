const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 3000;

// ---- Nastavení ankety (změň si otázku a odpovědi klidně) ----
const POLL = {
  question: "Kolik otevřených záložek je ještě normální?",
  options: [
    { id: "A", text: "1–5" },
    { id: "B", text: "6–15" },
    { id: "C", text: "16+" }
  ]
};

// Token pro reset (může být natvrdo nebo z env proměnné)
const RESET_TOKEN = process.env.RESET_TOKEN || "tajny-token-123";

// Soubor s hlasy (sdílené pro všechny uživatele, drží po refreshi)
const DATA_DIR = path.join(__dirname, "data");
const VOTES_FILE = path.join(DATA_DIR, "votes.json");

// ---- Pomocné funkce pro uložení/načtení ----
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

    // doplnění chybějících klíčů, kdyby někdo změnil options
    for (const opt of POLL.options) {
      if (typeof obj[opt.id] !== "number") obj[opt.id] = 0;
    }
    return obj;
  } catch (e) {
    // když je soubor rozbitý, uděláme nový
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

// ---- Middleware ----
app.use(express.urlencoded({ extended: false }));

// ---- Routes ----

// Hlavní stránka s hlasováním
app.get("/", (req, res) => {
  const html = `
<!doctype html>
<html lang="cs">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Anketa</title>
</head>
<body>
  <h1>Anketa</h1>
  <p><strong>${escapeHtml(POLL.question)}</strong></p>

  <form method="post" action="/vote">
    ${POLL.options
      .map(
        (o) => `
      <label>
        <input type="radio" name="option" value="${escapeHtml(o.id)}" required>
        ${escapeHtml(o.id)}) ${escapeHtml(o.text)}
      </label><br>
    `
      )
      .join("")}

    <br>
    <button type="submit">Hlasovat</button>
  </form>

  <p><a href="/results">Zobrazit výsledky</a></p>

  <hr>

  <h2>Reset hlasování</h2>
  <form method="post" action="/reset">
    <label>Token:
      <input type="password" name="token" required>
    </label>
    <button type="submit">Reset</button>
  </form>
</body>
</html>
  `.trim();

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

// Uloží hlas a přesměruje na výsledky
app.post("/vote", (req, res) => {
  const optionId = req.body.option;

  const validIds = new Set(POLL.options.map((o) => o.id));
  if (!validIds.has(optionId)) {
    res.status(400).send("Neplatná volba.");
    return;
  }

  const votes = loadVotes();
  votes[optionId] = (votes[optionId] || 0) + 1;
  saveVotes(votes);

  res.redirect("/results");
});

// Zobrazí výsledky bez hlasování
app.get("/results", (req, res) => {
  const votes = loadVotes();

  const rows = POLL.options
    .map((o) => {
      const count = typeof votes[o.id] === "number" ? votes[o.id] : 0;
      return `<li>${escapeHtml(o.id)}) ${escapeHtml(o.text)} — <strong>${count}</strong> hlasů</li>`;
    })
    .join("");

  const html = `
<!doctype html>
<html lang="cs">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Výsledky</title>
</head>
<body>
  <h1>Výsledky</h1>
  <p><strong>${escapeHtml(POLL.question)}</strong></p>

  <ul>
    ${rows}
  </ul>

  <p><a href="/">Zpět na hlasování</a></p>
</body>
</html>
  `.trim();

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

// Reset hlasování (jen se správným tokenem)
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

  res.redirect("/results");
});

// ---- Start ----
app.listen(PORT, () => {
  ensureDataFile();
  console.log(`Server běží na http://localhost:${PORT}`);
});