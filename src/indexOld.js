const cron = require('node-cron');
const pLimit = require('p-limit');

const { executeProcedure } = require('./services/exeProcedure');
const { saveReport } = require('./services/report');
const { getDateParams } = require('./utils/getDate');

const {
  closePool,
  getConnection,
  getConnectionByTns
} = require('./db/oracle');

const { config } = require('./services/getConnection');

const {
  logStart,
  logEnd,
  logError
} = require('./utils/logger');

const {
  getOtherProjects,
  getCpaasProjects,
  getFlipkartProjects
} = require('./services/getProjects');

const LOG = 'index.log';

let isRunning = false;

// =========================
// PROCESS GROUP
// =========================
async function processGroup(
  label,
  projects,
  fromDate,
  toDate,
  reportDate
) {

  logStart(
    LOG,
    `processGroup:${label}`,
    `${projects.length} rows`
  );

  const byLocationAndUser = {};

  // =========================
  // GROUP PROJECTS
  // =========================
  for (const p of projects) {

    const location =
      (p.LOCATION || '').trim().toLowerCase();

    const user =
      (p.USERNAME || '').trim();

    const key = `${location}|${user}`;

    if (!byLocationAndUser[key]) {
      byLocationAndUser[key] = [];
    }

    byLocationAndUser[key].push(p);
  }

  // =========================
  // FIND REMOTE TNS
  // =========================
  function findRemoteTns(project) {

    const location =
      (project.LOCATION || '').trim();

    const lookupKeys = [location].filter(Boolean);

    const entries =
      Object.entries(config.remoteTns || {});

    for (const value of lookupKeys) {

      const lower = value.toLowerCase();

      const match = entries.find(
        ([key]) => key.toLowerCase() === lower
      );

      if (match) {
        return match[1];
      }
    }

    return null;
  }

  let success = 0;
  let failed = 0;

  let localConn;

  try {

    localConn = await getConnection();

    const concurrency =
      config.parallel[label.toLowerCase()] || 4;

    const limit = pLimit(concurrency);

    // =========================
    // PROCESS EACH GROUP
    // =========================
    for (const groupKey of Object.keys(byLocationAndUser)) {

      const group = byLocationAndUser[groupKey];

      const [location] = groupKey.split('|');

      const remoteTns =
        findRemoteTns(group[0]);

      const remoteUser =
        group[0].USERNAME;

      const remotePass =
        group[0].PASSWORD;

      console.log(
        `\n🔍 DEBUG: location='${location}', remoteUser='${remoteUser}'`
      );

      if (!remoteTns) {

        console.error(
          `❌ Missing TNS mapping for location '${location}'`
        );

        failed += group.length;

        continue;
      }

      let remoteConn;

      try {

        remoteConn =
          await getConnectionByTns(
            remoteTns,
            remoteUser,
            remotePass
          );

        const tasks = group.map(project =>
          limit(async () => {

            try {

              const result =
                await executeProcedure(
                  remoteConn,
                  project,
                  fromDate,
                  toDate
                );

              await saveReport(
                localConn,
                project,
                result,
                reportDate
              );

              success++;

            } catch (err) {

              failed++;

              console.error(
                `❌ ${project.RDN}@${remoteUser}@${location}: ${err.message}`
              );
            }
          })
        );

        await Promise.all(tasks);

      } catch (err) {

        console.error(
          `💥 Remote TNS ${location}/${remoteUser}: ${err.message}`
        );

        failed += group.length;

      } finally {

        if (remoteConn) {

          try {
            await remoteConn.close();
          } catch (e) {}
        }
      }
    }

  } finally {

    if (localConn) {

      try {
        await localConn.close();
      } catch (e) {}
    }
  }

  logEnd(
    LOG,
    `processGroup:${label}`,
    `success: ${success} | failed: ${failed}`
  );

  console.log(
    `📊 ${label} Summary: ${success} successful, ${failed} failed`
  );
}

// =========================
// MAIN JOB
// =========================
async function runJob() {

  if (isRunning) {

    console.log('⚠️ Already running...');
    return;
  }

  isRunning = true;

  logStart(LOG, 'runJob');

  // =========================
  // GET YESTERDAY DATE
  // =========================
  const {
    reportDate,
    fromDate,
    toDate
  } = getDateParams(1);

  console.log('\n📅 FETCHING YESTERDAY DATA');
  console.log(`FROM : ${fromDate}`);
  console.log(`TO   : ${toDate}`);

  try {

    // =========================
    // OTHERS
    // =========================
    const others =
      await getOtherProjects();

    await processGroup(
      'OTHERS',
      others,
      fromDate,
      toDate,
      reportDate
    );

    // =========================
    // CPAAS
    // =========================
    const cpaas =
      await getCpaasProjects();

    await processGroup(
      'CPAAS',
      cpaas,
      fromDate,
      toDate,
      reportDate
    );

    // =========================
    // FLIPKART
    // =========================
    const flipkart =
      await getFlipkartProjects();

    await processGroup(
      'FLIPKART',
      flipkart,
      fromDate,
      toDate,
      reportDate
    );

    console.log('\n✅ JOB DONE');

  } catch (err) {

    logError(LOG, 'runJob', err);

    console.error(
      '💥 Job Failed:',
      err.message
    );

  } finally {

    isRunning = false;

    await closePool();
  }
}

// =========================
// MAIN EXECUTION
// =========================
if (require.main === module) {

  runJob().catch(err => {

    console.error(
      '💥 Fatal error:',
      err.message
    );

    process.exit(1);
  });
}