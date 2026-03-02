const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const morgan = require("morgan");

// aby req.ip na Renderu bralo IP z proxy (jinak uvidíš jen proxy IP)
app.set("trust proxy", true);

// access log do stdout -> uvidíš v Render Logs
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

// ---- Nastavení ankety (klidně změň otázku a odpovědi) ----
const POLL = {
  question: "Kolik otevřených záložek je ještě normální?",
  options: [
    { id: "A", text: "1–5 (mám to pod kontrolou)" },
    { id: "B", text: "6–15 (pracovní režim)" },
    { id: "C", text: "16+ (to už je životní styl)" }
  ]
};

// Token pro reset (může být natvrdo nebo z env proměnné)
const RESET_TOKEN = process.env.RESET_TOKEN || "tajny-token-123";

// SEM DOPLŇ svůj odkaz na GitHub Issues (až budeš mít repo)
const GITHUB_ISSUES_URL =
  process.env.ISSUES_URL || "https://github.com/ziki123456/anketa-render/issues";

// Soubor s hlasy (sdílené pro všechny uživatele, drží po refreshi stránky)
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

function navLinksHtml() {
  return `
  <nav>
    <a href="/">Hlasování</a> |
    <a href="/results">Výsledky</a> |
    <a href="/about">O anketě</a>
  </nav>
  `.trim();
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
  ${navLinksHtml()}
  <hr>

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

  <hr>

  <h2>Reset hlasování</h2>
  <p>Reset je schválně chráněný tokenem, aby to nemohl smazat kdokoli.</p>
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

app.get("/search", (req, res) => {
  const q = req.query.q || "";

  // schválně to escapujeme, aby to nebylo XSS zranitelné
  const safe = escapeHtml(q);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`
    <!doctype html>
    <html lang="cs">
    <head><meta charset="utf-8"><title>Search</title></head>
    <body>
      <h1>Search</h1>
      <p>q = <code>${safe}</code></p>
      <p><a href="/">Zpět</a></p>
    </body>
    </html>
  `);
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
  ${navLinksHtml()}
  <hr>

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

// Stránka O anketě
app.get("/about", (req, res) => {
  const html = `
<!doctype html>
<html lang="cs">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>O anketě</title>
</head>
<body>
  <h1>O anketě</h1>
  ${navLinksHtml()}
  <hr>

  <p>
    Tahle mini anketa vznikla jako jednoduchý webový projekt na téma hlasování.
    Otázka je schválně trochu „ze života“: záložky v prohlížeči jsou dneska skoro jako druhá paměť.
  </p>

  <p>
    Hlasuje se jen jednou volbou a výsledky se průběžně sčítají pro všechny návštěvníky.
    Reset je chráněný tokenem, aby někdo nemohl výsledky jen tak vynulovat.
  </p>

  <h2>Nahlášení chyby</h2>
  <p>
    Pokud najdeš chybu (technickou nebo třeba překlep), napiš ji prosím do GitHub Issues:
    <a href="${escapeHtml(GITHUB_ISSUES_URL)}" target="_blank" rel="noreferrer">Otevřít stránku Issues</a>
  </p>

  <p>
    Do hlášení napiš: co přesně nefunguje, na jaké stránce (URL) a co jsi dělal předtím.
    Když přidáš screenshot, je to nejlepší.
  </p>
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