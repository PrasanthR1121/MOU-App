const { config } = require('../services/getConnection');
const { getConnection } = require('../db/oracle');
const { logStart, logEnd, logError } = require('../utils/logger');

const LOG = 'getProjects.log';

function buildIdFilter(ids, alias = 'Dl') {
  if (!ids || ids.length === 0) {
    return {
      clause: '1 = 1',
      binds: {}
    };
  }

  const placeholders = ids.map((_, i) => `:c${i}`).join(', ');

  const bindObj = {};
  ids.forEach((id, i) => {
    bindObj[`c${i}`] = id;
  });

  return {
    clause: `${alias}.Id IN (${placeholders})`,
    binds: bindObj
  };
}

const BASE_QUERY = `
  SELECT
    Pm.Id,
    LOWER(Pm.Db_Username) AS USERNAME,
    LOWER(Pm.Db_Username) AS PASSWORD,
    Pm.Rdn,
    Pm.Report_Link AS REPORT_PROC,
    Dl.Circle AS LOCATION
  FROM Project_Mst Pm
  JOIN Dblink Dl
    ON Pm.Circle = Dl.Id
  WHERE Pm.Status = 1
    AND Pm.Db_Username IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM project_report_mou_mst r
      WHERE r.dni = Pm.rdn
    )
`;


// OTHERS
async function getOtherProjects() {
  let conn;

  logStart(LOG, 'getOtherProjects');

  try {
    conn = await getConnection();

    const { clause, binds } = buildIdFilter(config.groups.OTHERS);

    const query = `
      ${BASE_QUERY}
      AND LOWER(Pm.Db_Username) NOT IN ('cpaas', 'flipkart')
      AND EXISTS (
        SELECT 1
        FROM PJT_DB_USERNAME_CTRL C
        WHERE LOWER(TRIM(Pm.Db_Username)) = C.DB_USERNAME
          AND C.Status = 1
      )
      AND ${clause}
      ORDER BY Dl.Id
    `;

    const result = await conn.execute(query, binds);

    console.log(`OTHER projects: ${result.rows.length} fetched`);

    logEnd(LOG, 'getOtherProjects', `${result.rows.length} rows`);

    return result.rows;

  } catch (err) {
    logError(LOG, 'getOtherProjects', err);
    throw err;
  } finally {
    if (conn) await conn.close();
  }
}


// 🟡 CPAAS
async function getCpaasProjects() {
  let conn;

  logStart(LOG, 'getCpaasProjects');

  try {
    conn = await getConnection();

    const { clause, binds } = buildIdFilter(config.groups.CPAAS);

    const query = `
      ${BASE_QUERY}
      AND LOWER(Pm.Db_Username) = 'cpaas'
      AND ${clause}
      ORDER BY Dl.Id
    `;

    const result = await conn.execute(query, binds);

    console.log(`✅ CPAAS projects: ${result.rows.length} fetched`);

    logEnd(LOG, 'getCpaasProjects', `${result.rows.length} rows`);

    return result.rows;

  } catch (err) {
    console.error('❌ Failed to fetch CPAAS projects:', err.message);

    logError(LOG, 'getCpaasProjects', err);

    throw err;

  } finally {
    if (conn) await conn.close();
  }
}


// 🟣 FLIPKART
async function getFlipkartProjects() {
  let conn;

  logStart(LOG, 'getFlipkartProjects');

  try {
    conn = await getConnection();

    const { clause, binds } = buildIdFilter(config.groups.FLIPKART);

    const query = `
      ${BASE_QUERY}
      AND LOWER(Pm.Db_Username) = 'flipkart'
      AND ${clause}
      ORDER BY Dl.Id
    `;

    const result = await conn.execute(query, binds);

    console.log(`✅ FLIPKART projects: ${result.rows.length} fetched`);

    logEnd(LOG, 'getFlipkartProjects', `${result.rows.length} rows`);

    return result.rows;

  } catch (err) {
    console.error('❌ Failed to fetch FLIPKART projects:', err.message);

    logError(LOG, 'getFlipkartProjects', err);

    throw err;

  } finally {
    if (conn) await conn.close();
  }
}

module.exports = {
  getOtherProjects,
  getCpaasProjects,
  getFlipkartProjects
};