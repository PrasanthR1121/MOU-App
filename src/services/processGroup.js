async function processGroup(label, projects, fromDate, toDate, reportDate) {
  logStart(LOG, `processGroup:${label}`, `${projects.length} rows`);
  
  const byDblink = {};
  for (const project of projects) {
    const key = (project.DBLINK || '').trim().toLowerCase();
    if (!byDblink[key]) byDblink[key] = [];
    byDblink[key].push(project);
  }

  const dblinks = Object.keys(byDblink);

  let success = 0;
  let failed  = 0;

  for (const dblink of dblinks) {
    const group = byDblink[dblink];

    let conn;
    try {
     
      conn = await getConnection();

      for (const project of group) {
        try {
          const result = await executeProcedure(conn, project, fromDate, toDate);

          await saveReport(conn, project, result, reportDate);

          success++;

        } catch (err) {
          failed++;
          logError(LOG, `processGroup:${label}`, err);
        }
      }

    } catch (err) {
      console.error(`❌ DBLINK ${dblink} failed:`, err.message);

    } finally {
      if (conn) {
        try { await conn.close(); } catch (e) {}
      }
    }
  }

  logEnd(LOG, `processGroup:${label}`, `success: ${success} | failed: ${failed}`);
  console.log(`✅ [${label}] success: ${success} | failed: ${failed}`);
}