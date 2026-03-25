const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'data.json');

// ============ JSON FILE DATABASE ============
function loadDB() {
  try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); }
  catch { return null; }
}
function saveDB(data) { fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2)); }

function initDB() {
  let db = loadDB();
  if (!db) {
    db = {
      users: [{ id: 1, name: 'Admin', username: 'admin', password: bcrypt.hashSync('admin123', 10), role: 'manager', created_at: new Date().toISOString() }],
      tenders: [],
      activity: [],
      nextUserId: 2,
      nextTenderId: 1,
      nextNoteId: 1
    };
    saveDB(db);
  }
  return db;
}
initDB();

const STAGES = [
  'Enquiry Received', 'Kick-off', 'Site Visit', 'Raising Pre-Bid Queries',
  'Sending Enquiries to Civil Contractors', 'Sending Enquiries to RMC & Rebar Vendors',
  'Collecting Benchmarking Documents', 'Design & Estimation',
  'Review & Checking', 'Tender Submission Documentation'
];

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'tender-tracker-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, 'public')));

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  const db = loadDB();
  const user = db.users.find(u => u.id === req.session.userId);
  if (!user) return res.status(401).json({ error: 'User not found' });
  req.user = { id: user.id, name: user.name, username: user.username, role: user.role };
  next();
}
function requireManager(req, res, next) {
  if (req.user.role !== 'manager') return res.status(403).json({ error: 'Manager access required' });
  next();
}
function logActivity(text, userId) {
  const db = loadDB();
  db.activity.push({ text, user_id: userId, created_at: new Date().toISOString() });
  if (db.activity.length > 200) db.activity = db.activity.slice(-200);
  saveDB(db);
}

// ============ AUTH ============
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const db = loadDB();
  const user = db.users.find(u => u.username === username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  req.session.userId = user.id;
  res.json({ id: user.id, name: user.name, username: user.username, role: user.role });
});

app.post('/api/logout', (req, res) => { req.session.destroy(); res.json({ ok: true }); });

app.get('/api/me', requireAuth, (req, res) => { res.json(req.user); });

// ============ USERS ============
app.get('/api/users', requireAuth, (req, res) => {
  const db = loadDB();
  res.json(db.users.map(u => ({ id: u.id, name: u.name, username: u.username, role: u.role, created_at: u.created_at })));
});

app.post('/api/users', requireAuth, requireManager, (req, res) => {
  const { name, username, password, role } = req.body;
  if (!name || !username || !password) return res.status(400).json({ error: 'All fields required' });
  const db = loadDB();
  if (db.users.find(u => u.username === username.toLowerCase())) return res.status(400).json({ error: 'Username already exists' });
  const newUser = { id: db.nextUserId++, name, username: username.toLowerCase(), password: bcrypt.hashSync(password, 10), role: role || 'team', created_at: new Date().toISOString() };
  db.users.push(newUser);
  saveDB(db);
  logActivity(`${req.user.name} added team member "${name}"`, req.user.id);
  res.json({ id: newUser.id, name: newUser.name, username: newUser.username, role: newUser.role });
});

app.delete('/api/users/:id', requireAuth, requireManager, (req, res) => {
  const userId = parseInt(req.params.id);
  if (userId === req.user.id) return res.status(400).json({ error: 'Cannot remove yourself' });
  const db = loadDB();
  const user = db.users.find(u => u.id === userId);
  db.users = db.users.filter(u => u.id !== userId);
  db.tenders.forEach(t => { t.assignee_ids = (t.assignee_ids || []).filter(id => id !== userId); });
  saveDB(db);
  if (user) logActivity(`${req.user.name} removed team member "${user.name}"`, req.user.id);
  res.json({ ok: true });
});

// ============ TENDERS ============
app.get('/api/tenders', requireAuth, (req, res) => {
  const db = loadDB();
  let tenders = db.tenders;
  if (req.user.role !== 'manager') {
    tenders = tenders.filter(t => (t.assignee_ids || []).includes(req.user.id));
  }
  // Enrich with names
  const enriched = tenders.map(t => {
    const processLead = db.users.find(u => u.id === t.process_lead_id);
    const assignees = (t.assignee_ids || []).map(id => { const u = db.users.find(x => x.id === id); return u ? { id: u.id, name: u.name } : null; }).filter(Boolean);
    return { ...t, process_lead_name: processLead ? processLead.name : null, assignees };
  });
  res.json(enriched);
});

app.get('/api/tenders/:id', requireAuth, (req, res) => {
  const db = loadDB();
  const t = db.tenders.find(x => x.id === parseInt(req.params.id));
  if (!t) return res.status(404).json({ error: 'Tender not found' });
  const processLead = db.users.find(u => u.id === t.process_lead_id);
  const assignees = (t.assignee_ids || []).map(id => { const u = db.users.find(x => x.id === id); return u ? { id: u.id, name: u.name } : null; }).filter(Boolean);
  const notes = (t.notes || []).map(n => { const u = db.users.find(x => x.id === n.author_id); return { ...n, author_name: u ? u.name : 'Unknown' }; }).reverse();
  res.json({ ...t, process_lead_name: processLead ? processLead.name : null, assignees, notes });
});

app.post('/api/tenders', requireAuth, requireManager, (req, res) => {
  const { name, sales_lead, process_lead_id, cost_date, submission_date, assignee_ids } = req.body;
  if (!name) return res.status(400).json({ error: 'Tender name required' });
  const db = loadDB();
  const tender = {
    id: db.nextTenderId++,
    name, sales_lead: sales_lead || null,
    process_lead_id: process_lead_id ? parseInt(process_lead_id) : null,
    cost_date: cost_date || null, submission_date: submission_date || null,
    assignee_ids: (assignee_ids || []).map(Number),
    stages: STAGES.map((s, i) => ({ stage_index: i, stage_name: s, status: 'not_started' })),
    notes: [],
    created_by: req.user.id, created_at: new Date().toISOString()
  };
  db.tenders.push(tender);
  saveDB(db);
  logActivity(`${req.user.name} created tender "${name}"`, req.user.id);
  res.json({ id: tender.id });
});

app.put('/api/tenders/:id', requireAuth, requireManager, (req, res) => {
  const { name, sales_lead, process_lead_id, cost_date, submission_date, assignee_ids } = req.body;
  const db = loadDB();
  const t = db.tenders.find(x => x.id === parseInt(req.params.id));
  if (!t) return res.status(404).json({ error: 'Not found' });
  t.name = name; t.sales_lead = sales_lead || null;
  t.process_lead_id = process_lead_id ? parseInt(process_lead_id) : null;
  t.cost_date = cost_date || null; t.submission_date = submission_date || null;
  t.assignee_ids = (assignee_ids || []).map(Number);
  saveDB(db);
  logActivity(`${req.user.name} updated tender "${name}"`, req.user.id);
  res.json({ ok: true });
});

app.delete('/api/tenders/:id', requireAuth, requireManager, (req, res) => {
  const db = loadDB();
  const t = db.tenders.find(x => x.id === parseInt(req.params.id));
  db.tenders = db.tenders.filter(x => x.id !== parseInt(req.params.id));
  saveDB(db);
  if (t) logActivity(`${req.user.name} deleted tender "${t.name}"`, req.user.id);
  res.json({ ok: true });
});

// ============ STAGES ============
app.put('/api/tenders/:id/stages/:index', requireAuth, (req, res) => {
  const { status } = req.body;
  const db = loadDB();
  const t = db.tenders.find(x => x.id === parseInt(req.params.id));
  if (!t) return res.status(404).json({ error: 'Not found' });
  if (req.user.role !== 'manager' && !(t.assignee_ids || []).includes(req.user.id)) {
    return res.status(403).json({ error: 'Not assigned' });
  }
  const idx = parseInt(req.params.index);
  if (t.stages[idx]) t.stages[idx].status = status;
  saveDB(db);
  logActivity(`${req.user.name} updated "${STAGES[idx]}" to ${status.replace(/_/g,' ')} on ${t.name}`, req.user.id);
  res.json({ ok: true });
});

// ============ NOTES ============
app.post('/api/tenders/:id/notes', requireAuth, (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'Note text required' });
  const db = loadDB();
  const t = db.tenders.find(x => x.id === parseInt(req.params.id));
  if (!t) return res.status(404).json({ error: 'Not found' });
  if (!t.notes) t.notes = [];
  t.notes.push({ id: db.nextNoteId++, text, author_id: req.user.id, created_at: new Date().toISOString() });
  saveDB(db);
  logActivity(`${req.user.name} added a note on "${t.name}"`, req.user.id);
  res.json({ ok: true });
});

// ============ ACTIVITY & DIGEST ============
app.get('/api/activity', requireAuth, (req, res) => {
  const db = loadDB();
  const recent = db.activity.slice(-20).reverse().map(a => {
    const u = db.users.find(x => x.id === a.user_id);
    return { ...a, user_name: u ? u.name : 'System' };
  });
  res.json(recent);
});

app.get('/api/digest', requireAuth, (req, res) => {
  const db = loadDB();
  const today = new Date().toISOString().split('T')[0];
  let tenders = db.tenders;
  if (req.user.role !== 'manager') {
    tenders = tenders.filter(t => (t.assignee_ids || []).includes(req.user.id));
  }
  const result = { overdue: [], due_soon: [], not_updated: [], updated_today: [] };
  for (const t of tenders) {
    const completed = (t.stages || []).filter(s => s.status === 'completed').length;
    const progress = Math.round((completed / STAGES.length) * 100);
    const daysLeft = t.submission_date ? Math.round((new Date(t.submission_date) - new Date(today)) / 86400000) : 999;
    const notesToday = (t.notes || []).filter(n => n.created_at && n.created_at.startsWith(today)).length;
    const item = { id: t.id, name: t.name, progress };

    if (progress < 100 && t.submission_date && daysLeft < 0) result.overdue.push({ ...item, days_overdue: Math.abs(daysLeft) });
    else if (progress < 100 && daysLeft >= 0 && daysLeft <= 7) result.due_soon.push({ ...item, days_left: daysLeft });
    if (progress < 100 && notesToday === 0) result.not_updated.push(item);
    if (notesToday > 0) result.updated_today.push(item);
  }
  res.json(result);
});

app.get('*', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });

app.listen(PORT, () => { console.log(`Tender Tracker running on http://localhost:${PORT}`); });
