/**
 * Import script: Loads tender data from CSV into the app's database.
 * Run once: node import-data.js
 */
const fs = require('fs');
const bcrypt = require('bcryptjs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data.json');
const STAGES = [
  'Enquiry Received', 'Kick-off', 'Site Visit', 'Raising Pre-Bid Queries',
  'Process Input Received',
  'Sending Enquiries to Civil Contractors', 'Sending Enquiries to RMC & Rebar Vendors',
  'Collecting Benchmarking Documents', 'Design & Estimation',
  'Review & Checking', 'Tender Documentation', 'Tender Submission Status'
];

// Team members (civil leads) - username is their name in lowercase, password is name123
const teamMembers = [
  { name: 'Senbagam', username: 'senbagam', password: 'senbagam123' },
  { name: 'Ragu', username: 'ragu', password: 'ragu123' },
  { name: 'Vivasan', username: 'vivasan', password: 'vivasan123' },
  { name: 'Keerthivasan', username: 'keerthivasan', password: 'keerthivasan123' },
  { name: 'Akshaya', username: 'akshaya', password: 'akshaya123' },
  { name: 'Radhika', username: 'radhika', password: 'radhika123' },
  { name: 'Arun', username: 'arun', password: 'arun123' },
  { name: 'Jibi', username: 'jibi', password: 'jibi123' },
];

// Initialize fresh DB
const db = {
  users: [{ id: 1, name: 'Admin', username: 'admin', password: bcrypt.hashSync('admin123', 10), role: 'manager', created_at: new Date().toISOString() }],
  tenders: [],
  activity: [],
  nextUserId: 2,
  nextTenderId: 1,
  nextNoteId: 1
};

// Add team members to DB
const userIdMap = {}; // name -> id
teamMembers.forEach(m => {
  const user = {
    id: db.nextUserId++,
    name: m.name,
    username: m.username,
    password: bcrypt.hashSync(m.password, 10),
    role: 'team',
    created_at: new Date().toISOString()
  };
  db.users.push(user);
  userIdMap[m.name.toLowerCase()] = user.id;
});

// Resolve civil lead text to user IDs
// Also handle spelling variations from the CSV
const nameAliases = {
  'keerthivashan': 'keerthivasan',
  'keerthivasan/': 'keerthivasan',
  'raguy': 'ragu',
};
function resolveAssignees(civilText) {
  if (!civilText) return [];
  const ids = new Set();
  let text = civilText.toLowerCase();
  // Replace aliases
  for (const [alias, real] of Object.entries(nameAliases)) {
    text = text.replace(alias, real);
  }
  // Check each team member name
  for (const m of teamMembers) {
    if (text.includes(m.name.toLowerCase())) {
      ids.add(userIdMap[m.name.toLowerCase()]);
    }
  }
  return [...ids];
}

// Helper to parse dates from various formats
function parseDate(val) {
  if (!val || val === '—' || val === '-' || val === '�') return null;
  val = val.trim();
  // Try DD-Mon-YY or D-Mon-YY
  const monthMap = { Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12' };
  const match = val.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
  if (match) {
    const day = match[1].padStart(2, '0');
    const mon = monthMap[match[2]] || '01';
    let year = match[3];
    if (year.length === 2) year = '20' + year;
    return `${year}-${mon}-${day}`;
  }
  // Try DD/MM/YYYY or D/M/YYYY
  const match2 = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match2) {
    return `${match2[3]}-${match2[2].padStart(2,'0')}-${match2[1].padStart(2,'0')}`;
  }
  return null;
}

// Helper to map CSV stage status to app status
function mapStatus(val) {
  if (!val || val === '�' || val === '-') return 'not_started';
  val = val.toLowerCase().trim();
  if (val.includes('completed') || val.includes('complete') || val === 'done' || val === 'received' || val.includes('ready') || val.includes('submitted')) return 'completed';
  if (val.includes('not done') || val.includes('not yet') || val.includes('yet to') || val === 'hold' || val === '-') return 'not_started';
  if (val.includes('working') || val.includes('up') || val.includes('sent') || val.includes('r0') || val.includes('r1') || val.includes('r4') || val.includes('final input')) return 'in_progress';
  if (val.includes('received')) return 'completed';
  return 'in_progress';
}

// Tender data from the CSV
const tenders = [
  { name: '10V2312_MEWRE_Doha_Kuwait_SWRO_Retender', type: 'DESAL', sales: 'Mani', civil: 'Senbagam', site: 'Arun', pbq: 'completed', input: 'Received', boq: 'completed', subDate: '5-Aug-25', costDate: null, remarks: null, status: 'Submitted' },
  { name: '10V2282_SWPC_HADDA_100 MLD_ISTP', type: 'STP', sales: 'Balaji', civil: 'Senbagam', site: 'Balaji', pbq: 'completed', input: 'Received', boq: 'completed', subDate: '27-Jun-25', costDate: '11-Jun-25', remarks: null, status: 'Submitted' },
  { name: '10V2281_SWPC_ARANA_250 MLD ISTP', type: 'STP', sales: 'Balaji', civil: 'Senbagam', site: 'Balaji', pbq: 'completed', input: 'Received', boq: 'completed', subDate: '27-Jun-25', costDate: '11-Jun-25', remarks: null, status: 'Submitted' },
  { name: '10V2271_JSC OTEKO_136.8 MLD DESAL', type: 'DESAL-with Marine', sales: 'Abijeet', civil: null, site: 'Not done', pbq: null, input: 'Received', boq: 'Hold', subDate: null, costDate: null, remarks: 'ntep submitted', status: null },
  { name: '10V2309_CAPW_250 MLD WWTP', type: 'WWTP', sales: 'Mani', civil: 'Ragu', site: 'Egypt team', pbq: 'completed', input: 'Final input received', boq: 'completed', subDate: '11-Nov-25', costDate: null, remarks: null, status: 'Submitted' },
  { name: '10V2311_ACWA_AL HIDD_IWP_DESAL', type: 'DESAL-with Marine', sales: 'Santhosh', civil: 'Senbagam', site: 'Not done', pbq: 'completed', input: 'Not yet', boq: 'UP', subDate: '23/1/2026', costDate: null, remarks: 'RFQ by 2nd week expected', status: null },
  { name: '10V2323_SWA_Aljouf_35 MLD BWRO', type: 'DESAL', sales: 'Mani', civil: 'Senbagam', site: 'Not done', pbq: null, input: 'Not yet', boq: 'completed', subDate: '8-Jul-25', costDate: null, remarks: null, status: 'Submitted' },
  { name: 'SWA_Aljouf_50 MLD BWRO', type: 'DESAL', sales: 'Pankaj', civil: 'Senbagam', site: 'Not done', pbq: null, input: 'Not yet', boq: 'completed', subDate: '3-Aug-25', costDate: null, remarks: null, status: 'Submitted' },
  { name: 'Dalian 100 MLD SWRO', type: 'DESAL', sales: 'Mani', civil: null, site: null, pbq: null, input: null, boq: null, subDate: null, costDate: null, remarks: null, status: null },
  { name: 'Fujairah-60 MIGD', type: 'DESAL', sales: 'Balaji', civil: 'Senbagam', site: 'Done', pbq: 'Completed', input: 'Received', boq: 'completed', subDate: '26-Sep-25', costDate: '14-Aug-25', remarks: null, status: 'Submitted' },
  { name: 'Samarkhand, Uzbekisthan -100 MLD WWTP', type: 'WWTP', sales: 'Akash', civil: null, site: null, pbq: 'Completed', input: 'Received', boq: null, subDate: '25-Jul-25', costDate: null, remarks: null, status: 'Submitted' },
  { name: 'ZULUF-307 MLD', type: 'WTP', sales: 'Mani', civil: null, site: null, pbq: 'not completed', input: null, boq: null, subDate: '30-Aug-25', costDate: null, remarks: null, status: null },
  { name: 'Namangan, Uzbekisthan -100 MLD WWTP', type: 'WWTP', sales: 'Mani', civil: 'Senbagam', site: 'Not done', pbq: null, input: 'Received', boq: 'completed', subDate: '20-Sep-25', costDate: null, remarks: null, status: 'Submitted' },
  { name: '4 Plants - Army', type: 'DESAL-with Marine', sales: 'Mani', civil: null, site: 'Not done', pbq: 'not completed', input: 'Not yet', boq: '-', subDate: '28-Sep-25', costDate: null, remarks: null, status: 'Submitted' },
  { name: 'Morrocco -PFC-Jesa', type: 'Desal-Without marine', sales: 'Mani', civil: 'Ragu/ Vivasan', site: 'Not done', pbq: 'completed', input: 'Received', boq: 'Working', subDate: '15-Sep-25', costDate: '23-Oct-25', remarks: 'Final Submission date not confirmed, currently answering post bid queries.', status: null },
  { name: 'Senegal-400 MLD', type: 'DESAL-with Marine', sales: 'Balaji', civil: null, site: 'Arun', pbq: 'Yet to share', input: 'Not yet', boq: '-', subDate: '9-Oct-25', costDate: null, remarks: 'EP Only', status: 'Submitted' },
  { name: 'Marafiq (45/60) MLD', type: 'DESAL-without Marine', sales: 'Mani', civil: 'Ragu/ Vivasan/keerthivashan', site: 'Arun', pbq: 'Received Set 1 replies', input: 'Received', boq: 'completed', subDate: '25-Nov-25', costDate: '27-Oct-25', remarks: null, status: 'Submitted' },
  { name: 'Taqa -Nareva -Oriental -822 MLD LOT 01', type: 'DESAL-with Marine', sales: 'Mani', civil: null, site: 'Not done', pbq: 'Set 1 sent', input: 'Received', boq: 'Hold', subDate: '25/1/2026', costDate: null, remarks: null, status: null },
  { name: 'Tangier- 411 mld desal', type: 'DESAL-with Marine', sales: 'Mani', civil: 'Senbagam/ Akshaya', site: 'Done', pbq: 'Set 1 sent', input: 'Not yet', boq: 'R1 - TO BE CHECKED', subDate: '23/1/2026', costDate: null, remarks: 'Standalone', status: null },
  { name: 'AL Khairan- 125 MLD SWRO', type: 'DESAL', sales: 'Balaji, Akash', civil: null, site: 'Not done', pbq: 'Set 1 sent', input: 'Only Layout recd', boq: '-', subDate: '31-Dec-25', costDate: null, remarks: 'NTEP Submitted', status: null },
  { name: 'Maurutiana- 1.5 MLD', type: 'DESAL-with Marine', sales: 'Nitish Kumar', civil: 'Jibi', site: 'Not done', pbq: null, input: null, boq: 'completed', subDate: null, costDate: null, remarks: null, status: 'Submitted' },
  { name: 'Riyadh East-200 MLD ISTP', type: 'ISTP', sales: 'Pankaj', civil: 'Keerthivasan', site: 'Not done', pbq: 'Set 1 sent', input: 'Not yet', boq: 'UP', subDate: '1-Apr-25', costDate: null, remarks: null, status: null },
  { name: 'Uzbek_Jizzakh_Fergana_2*STP+ 3*Rhab', type: 'STP', sales: 'Akash', civil: 'Ragu/ Vivasan', site: 'Not done', pbq: 'Set 1 sent', input: 'Received for Jizzah', boq: 'R0 complete', subDate: '7-Nov-25', costDate: null, remarks: 'Submission date is not confirmed yet.', status: null },
  { name: 'Tashkent 550 MLD', type: 'WTP', sales: 'Pankaj Virkar', civil: 'Radhika', site: 'Not done', pbq: 'Set 1 sent', input: 'Received', boq: 'UP', subDate: '5-Feb-26', costDate: '15-Dec-25', remarks: 'WTP plant + 50 km pipeline', status: null },
  { name: 'Ajman- 60 MLD', type: 'STP', sales: 'Pankaj Virkar', civil: 'Ragu/ Vivasan', site: 'Arun/ Balaji/Ragu', pbq: 'Set 1 sent', input: 'Received', boq: 'R4-', subDate: '5-Feb-26', costDate: '11-Jan-26', remarks: 'Support, Construction partner- Kalpataru. Civil BOQ Challenge', status: 'Submitted' },
  { name: 'King Salman- 54 MLD', type: 'WWTP', sales: 'Balaji', civil: 'Ragu/ Vivasan', site: 'Not Done', pbq: 'Set 1 sent', input: 'Received', boq: 'r0- to be checked', subDate: '14-Jan-26', costDate: null, remarks: 'EPC Bidder- Al Rawaf, EP SC- Wabag. Civil has to be done for 91 MLD', status: null },
  { name: 'Galilah 30 MIGD', type: 'IWP', sales: 'Balaji', civil: 'Ragu/ Vivasan', site: 'Ragu', pbq: 'Set 1 sent', input: 'Not yet', boq: '-', subDate: '23-Feb-26', costDate: null, remarks: null, status: null },
  { name: 'Safaniyah', type: 'Oil & gas packages/WTP', sales: 'Balaji', civil: 'Radhika', site: 'Not done', pbq: 'Set 1 sent', input: 'Not yet', boq: '-', subDate: '30-Dec-25', costDate: null, remarks: 'Oil & gas packages. Only supply, civil out of scope. NTEP submitted, civil cost not reqd', status: 'NTEP submitted' },
  { name: 'Surum-1000 MLD', type: 'WWTP', sales: 'Balaji', civil: 'Radhika', site: 'not done', pbq: 'Not yet', input: 'Not yet', boq: '-', subDate: '20-Jan-26', costDate: null, remarks: '1000 MLD WWTP, JV Kalpataru', status: null },
];

// Map each tender's CSV columns to 11 stages
function buildStages(t) {
  // CSV columns map to stages:
  // 0: Enquiry Received -> all tenders have this (completed)
  // 1: Kick-off -> infer from overall progress
  // 2: Site Visit -> t.site
  // 3: Raising Pre-Bid Queries -> t.pbq
  // 4: Process Input Received -> t.input
  // 5: Sending Enquiries to Civil Contractors -> infer from civil lead
  // 6: Sending Enquiries to RMC & Rebar Vendors -> infer from civil lead
  // 7: Collecting Benchmarking Documents -> infer
  // 8: Design & Estimation -> t.boq
  // 9: Review & Checking -> infer from status
  // 10: Tender Submission Documentation -> t.status

  const stages = STAGES.map((s, i) => ({ stage_index: i, stage_name: s, status: 'not_started' }));

  // Stage 0: Enquiry Received - always completed for existing tenders
  stages[0].status = 'completed';

  // Stage 1: Kick-off - completed if any other stage has progress
  stages[1].status = 'completed';

  // Stage 2: Site Visit
  if (t.site) {
    const sv = t.site.toLowerCase();
    if (sv === 'not done' || sv === 'not done') stages[2].status = 'not_started';
    else if (sv === 'done' || sv.includes('completed')) stages[2].status = 'completed';
    else stages[2].status = 'completed'; // person name means done
  }

  // Stage 3: Raising Pre-Bid Queries
  if (t.pbq) stages[3].status = mapStatus(t.pbq);

  // Stage 4: Process Input Received
  if (t.input) stages[4].status = mapStatus(t.input);

  // Stage 5 & 6: Enquiries to contractors/vendors - infer from civil lead
  if (t.civil) {
    stages[5].status = 'completed';
    stages[6].status = 'completed';
  }

  // Stage 7: Collecting Benchmarking Documents - infer
  if (t.boq && mapStatus(t.boq) !== 'not_started') {
    stages[7].status = 'completed';
  }

  // Stage 8: Design & Estimation (= BOQ status)
  if (t.boq) stages[8].status = mapStatus(t.boq);

  // Stage 9: Review & Checking
  if (t.status && t.status.toLowerCase().includes('submitted')) {
    stages[9].status = 'completed';
  }

  // Stage 10: Tender Documentation
  if (t.status && t.status.toLowerCase().includes('submitted')) {
    stages[10].status = 'completed';
  }

  // Stage 11: Tender Submission Status (Submitted / Hold / Not Submitted)
  if (t.status) {
    const st = t.status.toLowerCase();
    if (st.includes('submitted')) stages[11].status = 'completed'; // Submitted
    else if (st.includes('hold')) stages[11].status = 'in_progress'; // Hold
    else stages[11].status = 'not_started'; // Not Submitted
  }

  return stages;
}

// Build tenders
tenders.forEach(t => {
  const tender = {
    id: db.nextTenderId++,
    name: t.name,
    type: t.type || null,
    sales_lead: t.sales || null,
    process_lead: null,
    civil_lead: t.civil || null,
    cost_date: parseDate(t.costDate),
    submission_date: parseDate(t.subDate),
    remarks: t.remarks || null,
    assignee_ids: resolveAssignees(t.civil),
    stages: buildStages(t),
    notes: [],
    created_by: 1,
    created_at: new Date().toISOString()
  };
  db.tenders.push(tender);
});

db.activity.push({ text: 'Imported 28 tenders from spreadsheet', user_id: 1, created_at: new Date().toISOString() });

fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
console.log(`Successfully imported ${tenders.length} tenders into data.json`);
console.log('You can now run: npm start');
