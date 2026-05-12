const cron = require('node-cron');
const pLimit = require('p-limit');

const { executeProcedure } = require('./services/exeProcedure');
const { saveReport }       = require('./services/report');
const { getDateParams, getMonthParams, getLastMonthParams } = require('./utils/getDate');
const { closePool, getConnection, getConnectionByTns } = require('./db/oracle');
const { config } = require('./services/getConnection');
const { logStart, logEnd, logError, logInfo } = require('./utils/logger');

const {
  getOtherProjects,
  getCpaasProjects,
  getFlipkartProjects
} = require('./services/getProjects');

const LOG = 'index.log';

let isRunning = false;

// =========================
// PROCESS GROUP (BY CIRCLE)
// =========================
async function processGroup(label, projects, fromDate, toDate, reportDate) {
  logStart(LOG, `processGroup:${label}`, `${projects.length} rows`);

  // Group by (location, USERNAME) since each project specifies its own DB username
  const byLocationAndUser = {};

  for (const p of projects) {
    const location = (p.LOCATION || '').trim().toLowerCase();
    const user = (p.USERNAME || '').trim();
    const key = `${location}|${user}`;
    if (!byLocationAndUser[key]) byLocationAndUser[key] = [];
    byLocationAndUser[key].push(p);
  }

  function findRemoteTns(project) {
    const location = (project.LOCATION || '').trim();
    const lookupKeys = [location].filter(Boolean);
    const entries = Object.entries(config.remoteTns || {});

    for (const value of lookupKeys) {
      const lower = value.toLowerCase();
      const match = entries.find(([key]) => key.toLowerCase() === lower);
      if (match) return match[1];
    }
    return null;
  }

  let success = 0;
  let failed  = 0;
  let localConn;

  try {
    localConn = await getConnection();
    const concurrency = config.parallel[label.toLowerCase()] || 4;
    const limit = pLimit(concurrency);

    for (const groupKey of Object.keys(byLocationAndUser)) {
      const group = byLocationAndUser[groupKey];
      const [location] = groupKey.split('|');
      const remoteTns = findRemoteTns(group[0]);
      const remoteUser = group[0].USERNAME;
      const remotePass = group[0].PASSWORD;

      console.log(`\n🔍 DEBUG: location='${location}', remoteUser='${remoteUser}', remotePass='${remotePass}'`);

      if (!remoteTns) {
        console.error(`❌ Missing TNS mapping for location '${location}'`);
        failed += group.length;
        continue;
      }

      let remoteConn;
      try {
        remoteConn = await getConnectionByTns(remoteTns, remoteUser, remotePass);

        const tasks = group.map(project =>
          limit(async () => {
            try {
              const result = await executeProcedure(remoteConn, project, fromDate, toDate);
              await saveReport(localConn, project, result, reportDate);
              success++;
            } catch (err) {
              failed++;
              console.error(`❌ ${project.RDN}@${remoteUser}@${location}: ${err.message}`);
            }
          })
        );
        await Promise.all(tasks);
      } catch (err) {
        console.error(`Remote TNS ${location}/${remoteUser}: ${err.message}`);
        failed += group.length;
      } finally {
        if (remoteConn) {
          try { await remoteConn.close(); } catch (e) {}
        }
      }
    }
  } finally {
    if (localConn) {
      try { await localConn.close(); } catch (e) {}
    }
  }

  logEnd(LOG, `processGroup:${label}`, `success: ${success} | failed: ${failed}`);
  console.log(`${label} Summary: ${success} successful, ${failed} failed`);
}

// =========================
// MAIN JOB
// =========================
async function runJob() {
  if (isRunning) {
    console.log("⚠️ Already running...");
    return;
  }

  isRunning = true;

  logStart(LOG, 'runJob');

  const now = new Date();
  const defaultYear = now.getMonth() + 1 > 4 ? now.getFullYear() : now.getFullYear() - 1;
  const defaultTargetMonth = `${defaultYear}-04`;
  const targetMonth = process.env.TARGET_MONTH || defaultTargetMonth;
  const [targetYear, targetMonthNumber] = targetMonth.split('-').map(Number);
  const { reportDate, fromDate, toDate } = getMonthParams(targetYear, targetMonthNumber);
  console.log(`📅 Target month: ${targetYear}-${String(targetMonthNumber).padStart(2, '0')}`);

  try {
    const others = await getOtherProjects();
    await processGroup('OTHERS', others, fromDate, toDate, reportDate);

    const cpaas = await getCpaasProjects();
    await processGroup('CPAAS', cpaas, fromDate, toDate, reportDate);

    const flipkart = await getFlipkartProjects();
    await processGroup('FLIPKART', flipkart, fromDate, toDate, reportDate);

    console.log("JOB DONE");
    
    // Generate MOU report table
    await generateMouReport(targetYear, targetMonthNumber);

  } catch (err) {
    logError(LOG, 'runJob', err);
    console.error("💥 Job Failed:", err.message);

  } finally {
    isRunning = false;
    await closePool();
  }
}

// =========================
// GENERATE MOU REPORT
// =========================
async function generateMouReport(year, month) {
  const fs = require('fs').promises;
  const path = require('path');
  
  const monthName = getMonthName(month - 1);
  const tableName = `MOU_${monthName}_${year}`;
  const reportsDir = path.join(__dirname, '..', 'logs', 'reports');
 
  await fs.mkdir(reportsDir, { recursive: true });
  
  const startDate = `01${String(month).padStart(2, '0')}${year}`;
  const endDate = new Date(year, month, 0).getDate().toString().padStart(2, '0') + String(month).padStart(2, '0') + year;
  const nextMonthStart = `01${String(month + 1).padStart(2, '0')}${month === 12 ? year + 1 : year}`;
  
  const sql = `CREATE TABLE ${tableName} AS
SELECT b.Rdn,
       B.TOLLFREE,
       c.Circle,
       S.SERVICE SERVICE_TYPE,
       Replace(b.Prj_Name, Chr(9), '') Prj_Name,
       TRUNC(b.started_date) STARTED_DATE,
       TRUNC(TO_DATE('${nextMonthStart}', 'DDMMYYYY')) -
       TRUNC(GREATEST(TO_DATE('${startDate}', 'DDMMYYYY'), B.STARTED_DATE)) ACTIVE_DAYS,
       CASE
         WHEN CEIL(SUM(Nvl(a.total_calls, 0))) >=
              Ceil(Sum(Nvl(a.Mou_In, 0))) THEN
          CEIL(SUM(Nvl(a.total_calls, 0)))
         ELSE
          Ceil(Sum(Nvl(a.Mou_In, 0)))
       END mou_IN,
       Ceil(Sum(Nvl(a.Mou_Out, 0))) mou_OUT
  From (SELECT *
          FROM Project_Report_Mou_Mst a
         WHERE a.Report_Date Between To_Date('${startDate}', 'DDMMYYYY') And
               To_Date('${endDate}', 'DDMMYYYY')) A,
       Project_Mst b,
       Dblink c,
       SERVICE_TYPE_MST S
 Where b.Rdn = a.Dni(+)
   And b.Billing_Circle_Id = c.Id
   AND S.ID = B.SERVICE_TYPE
   And b.Status = 1 
 Group By b.Rdn,
          c.Circle,
          S.SERVICE,
          b.tollfree,
          b.Prj_Name,
          b.Imsi,
          b.Status,
          b.Started_Date,
          b.Last_Update
 Order By b.started_date;`;
 
  const exportPath = path.join(reportsDir, `${tableName}.sql`);
  await fs.writeFile(exportPath, sql);
  console.log(`MOU report SQL saved to: ${exportPath}`);
  
  // Check if table already exists
  let conn;
  try {
    conn = await getConnection();
    
    const checkResult = await conn.execute(
      `SELECT COUNT(*) as table_count FROM user_tables WHERE table_name = :tableName`,
      { tableName }
    );
    
    const tableExists = checkResult.rows[0].TABLE_COUNT > 0;
    
    if (tableExists) {
      console.log(`⚠️  MOU table ${tableName} already exists, skipping creation`);
      return;
    }
    
    // Execute the SQL to create the table
    await conn.execute(sql);
    await conn.commit();
    console.log(`✅ MOU table ${tableName} created successfully`);
    
  } catch (err) {
    console.error(`❌ Failed to create MOU table: ${err.message}`);
  } finally {
    if (conn) await conn.close();
  }
}

function getMonthName(monthIndex) {
  const months = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 
                  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
  return months[monthIndex];
}

// =========================
// MAIN EXECUTION
// =========================
if (require.main === module) {
  runJob().catch(err => {
    console.error('💥 Fatal error:', err.message);
    process.exit(1);
  });
}