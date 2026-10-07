const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "db.json");
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({
    users: {},
    sessions: {},
    telemetry: {},
    events: []
  }, null, 2));
}

function loadDB() {
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}
function saveDB(db) {
  const tmp = DATA_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}
function id(prefix="") {
  return prefix + crypto.randomBytes(18).toString("hex");
}
function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}
function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return { salt, hash };
}
function verifyPassword(password, record) {
  const result = crypto.scryptSync(String(password), record.salt, 64).toString("hex");
  const a = Buffer.from(result, "hex");
  const b = Buffer.from(record.hash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function parseCookies(req) {
  const raw = req.headers.cookie || "";
  const out = {};
  for (const piece of raw.split(";")) {
    const i = piece.indexOf("=");
    if (i > -1) out[piece.slice(0,i).trim()] = decodeURIComponent(piece.slice(i+1).trim());
  }
  return out;
}
function setSessionCookie(res, token) {
  res.setHeader("Set-Cookie",
    `go_ahead_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS/1000)}`);
}
function clearSessionCookie(res) {
  res.setHeader("Set-Cookie",
    "go_ahead_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
}
function auth(req, res, next) {
  const cookies = parseCookies(req);
  const token = cookies.go_ahead_session;
  const db = loadDB();
  const session = token ? db.sessions[token] : null;
  if (!session || Date.now() > session.expiresAt) {
    if (token && db.sessions[token]) {
      delete db.sessions[token];
      saveDB(db);
    }
    return res.status(401).json({ error: "Authentication required" });
  }
  session.lastSeenAt = Date.now();
  saveDB(db);
  req.userId = session.userId;
  req.sessionToken = token;
  next();
}
function publicUser(user) {
  return { id:user.id, name:user.name, email:user.email, createdAt:user.createdAt };
}

app.use(express.json({ limit: "50kb" }));

app.post("/api/register", (req, res) => {
  const name = String(req.body?.name || "").trim();
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || "");
  const confirm = String(req.body?.confirmPassword || "");

  if (name.length < 2) return res.status(400).json({ error:"Please enter a valid name." });
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error:"Please enter a valid email." });
  if (password.length < 8) return res.status(400).json({ error:"Password must be at least 8 characters." });
  if (password !== confirm) return res.status(400).json({ error:"Passwords do not match." });

  const db = loadDB();
  if (Object.values(db.users).some(u => u.email === email)) {
    return res.status(409).json({ error:"An account with this email already exists." });
  }

  const creds = hashPassword(password);
  const user = {
    id:id("usr_"),
    name,
    email,
    password:creds,
    createdAt:new Date().toISOString()
  };
  db.users[user.id] = user;
  const token = id("sess_");
  db.sessions[token] = { userId:user.id, createdAt:Date.now(), lastSeenAt:Date.now(), expiresAt:Date.now()+SESSION_TTL_MS };
  saveDB(db);
  setSessionCookie(res, token);
  res.json({ ok:true, user:publicUser(user) });
});

app.post("/api/login", (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || "");
  const db = loadDB();
  const user = Object.values(db.users).find(u => u.email === email);
  if (!user || !verifyPassword(password, user.password)) {
    return res.status(401).json({ error:"Email or password is incorrect." });
  }
  const token=id("sess_");
  db.sessions[token]={userId:user.id,createdAt:Date.now(),lastSeenAt:Date.now(),expiresAt:Date.now()+SESSION_TTL_MS};
  saveDB(db);
  setSessionCookie(res, token);
  res.json({ ok:true, user:publicUser(user) });
});

app.get("/api/me", (req,res) => {
  const cookies=parseCookies(req);
  const token=cookies.go_ahead_session;
  const db=loadDB();
  const session=token ? db.sessions[token] : null;
  if(!session || Date.now()>session.expiresAt) return res.status(401).json({error:"Not signed in"});
  const user=db.users[session.userId];
  if(!user) return res.status(401).json({error:"Account not found"});
  res.json({ok:true,user:publicUser(user)});
});

app.post("/api/logout", auth, (req,res) => {
  const db=loadDB();
  delete db.sessions[req.sessionToken];
  saveDB(db);
  clearSessionCookie(res);
  res.json({ok:true});
});

app.post("/api/telemetry", auth, (req,res) => {
  const db=loadDB();
  db.telemetry[req.userId] = {
    ...db.telemetry[req.userId],
    ...req.body,
    updatedAt:new Date().toISOString()
  };
  saveDB(db);
  res.json({ok:true, telemetry:db.telemetry[req.userId]});
});

app.get("/api/telemetry", auth, (req,res) => {
  const db=loadDB();
  res.json({ok:true, telemetry:db.telemetry[req.userId] || null});
});

app.post("/api/checkin", auth, (req,res) => {
  const db=loadDB();
  const event={id:id("evt_"),userId:req.userId,type:"checkin",...req.body,at:new Date().toISOString()};
  db.events.unshift(event);
  db.events=db.events.slice(0,1000);
  saveDB(db);
  res.json({ok:true,event});
});

app.post("/api/sos", auth, (req,res) => {
  const db=loadDB();
  const event={id:id("evt_"),userId:req.userId,type:"demo_sos",...req.body,at:new Date().toISOString()};
  db.events.unshift(event);
  db.events=db.events.slice(0,1000);
  saveDB(db);
  res.json({ok:true,event});
});

app.get("/api/events", auth, (req,res) => {
  const db=loadDB();
  res.json({ok:true,events:db.events.filter(e=>e.userId===req.userId).slice(0,50)});
});

app.get("/health", (req,res) => res.json({status:"ok",service:"GO AHEAD",time:new Date().toISOString()}));

app.use(express.static(path.join(__dirname, "public")));
app.get(/.*/, (req,res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, () => console.log(`GO AHEAD running on http://localhost:${PORT}`));
