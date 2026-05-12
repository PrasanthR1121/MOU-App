require('dotenv').config();

const fs   = require('fs');
const path = require('path');

const { executeProcedure } = require('../services/exeProcedure');
const { getDateParams }    = require('../utils/getDate');
const { closePool }        = require('../db/oracle');

const {
  getOtherProjects,
  getCpaasProjects,
  getFlipkartProjects
} = require('../services/getProjects');

// =========
// LOG SETUP
// =========
const LOG_DIR  = path.join(__dirname, '../../Logs');
const LOG_FILE = path.join(LOG_DIR, 'log.txt');

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

function logLine(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function logSeparator() {
  const line = '='.repeat(60);
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

// ============
// TIMER HELPER
// ============
function elapsed(startMs) {
  const ms  = Date.now() - startMs;
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  return min > 0 ? `${min}m ${sec % 60}s` : `${sec}s`;
}

function nowStr() {
  return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}

// =============
// DRY-RUN GROUP
// =============
async function dryRunGroup(label, projects, fromDate, toDate) {
  const groupStart = Date.now();
  logLine(`🚀 [${label}] ${projects.length} rows`);

  const byDblink = {};
  for (const project of projects) {
    const key = (project.DBLINK || '').trim().toLowerCase();
    if (!byDblink[key]) byDblink[key] = [];
    byDblink[key].push(project);
  }

  const dblinks = Object.keys(byDblink);
  logLine(`🔗 [${label}] ${dblinks.length} unique dblinks — processing serially`);

  let success = 0;
  let failed  = 0;

  for (const dblink of dblinks) {
    const group   = byDblink[dblink];
    const dlStart = Date.now();
    let dlSuccess = 0;
    let dlFailed  = 0;

    for (const project of group) {
      try {
        await executeProcedure(project, fromDate, toDate);
        dlSuccess++;
        success++;
      } catch (err) {
        dlFailed++;
        failed++;
      }
    }

    logLine(`🔗 [${label}] ${dblink} | ${group.length} projects → ✅ ${dlSuccess} ok | ❌ ${dlFailed} fail | ⏱️ ${elapsed(dlStart)}`);
  }

  const groupTime = elapsed(groupStart);
  logLine(`📊 [${label}] success: ${success} | failed: ${failed} | time: ${groupTime}`);
  return { success, failed, duration: groupTime };
}

// ============
// MAIN DRY RUN
// ============
async function runDryRun() {
  const jobStart    = Date.now();
  const startTimeStr = nowStr();

  logSeparator();
  logLine(`🧪 DRY RUN STARTED`);
  logLine(`⏰ Start Time: ${startTimeStr}`);
  logLine(`📋 NO data will be saved — procedures called only`);
  logSeparator();

  const { reportDate, fromDate, toDate } = getDateParams(1);
  logLine(`📅 Date: ${reportDate} | From: ${fromDate} | To: ${toDate}`);

  const summary = {};

  try {
    logLine(`\n⏳ Fetching OTHERS...`);
    const t1 = Date.now();
    const others = await getOtherProjects();
    logLine(`   Fetched ${others.length} rows in ${elapsed(t1)}`);
    summary.others = await dryRunGroup('OTHERS', others, fromDate, toDate);

    logLine(`\n⏳ Fetching CPAAS...`);
    const t2 = Date.now();
    const cpaas = await getCpaasProjects();
    logLine(`   Fetched ${cpaas.length} rows in ${elapsed(t2)}`);
    summary.cpaas = await dryRunGroup('CPAAS', cpaas, fromDate, toDate);

    logLine(`\n⏳ Fetching FLIPKART...`);
    const t3 = Date.now();
    const flipkart = await getFlipkartProjects();
    logLine(`   Fetched ${flipkart.length} rows in ${elapsed(t3)}`);
    summary.flipkart = await dryRunGroup('FLIPKART', flipkart, fromDate, toDate);

  } catch (err) {
    logLine(`💥 Dry run failed: ${err.message}`);

  } finally {
    await closePool();
  }

  const endTimeStr = nowStr();
  const totalTime  = elapsed(jobStart);

  const totalSuccess = Object.values(summary).reduce((a, b) => a + b.success, 0);
  const totalFailed  = Object.values(summary).reduce((a, b) => a + b.failed, 0);

  logSeparator();
  logLine(`📊 DRY RUN SUMMARY`);
  logSeparator();
  for (const [group, stats] of Object.entries(summary)) {
    logLine(`  ${group.toUpperCase().padEnd(10)} → ✅ ${stats.success} ok | ❌ ${stats.failed} fail | ⏱️ ${stats.duration}`);
  }
  logSeparator();
  logLine(`  TOTAL      → ✅ ${totalSuccess} ok | ❌ ${totalFailed} fail`);
  logLine(`  ⏰ Start    : ${startTimeStr}`);
  logLine(`  ⏰ End      : ${endTimeStr}`);
  logLine(`  ⏱️  Duration : ${totalTime}`);
  logSeparator();
}

runDryRun();