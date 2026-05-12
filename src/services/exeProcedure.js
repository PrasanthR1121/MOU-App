const oracledb = require('oracledb');
const { logError } = require('../utils/logger');

const LOG = 'exeProcedure.log';

function safeName(val) {
  if (!val) return '';

  if (!/^[a-zA-Z0-9_]+$/.test(val)) {
    throw new Error(`Invalid identifier: ${val}`);
  }

  return val;
}

async function executeWithRetry(fn, retries = 1) {
  try {
    return await fn();

  } catch (err) {

    const retryableErrors = [
      'NJS-040',
      'NJS-076',
      'ORA-12170',
      'ORA-12541',
      'ORA-12537',
      'ORA-3135'
    ];

    const shouldRetry = retryableErrors.some(code =>
      err.message.includes(code)
    );

    if (retries > 0 && shouldRetry) {
      console.log(`🔄 Retrying after error: ${err.message}`);

      await new Promise(r => setTimeout(r, 2000));

      return executeWithRetry(fn, retries - 1);
    }

    throw err;
  }
}

async function executeProcedure(conn, project, fromDate, toDate) {

  const tag = `${project.RDN}@${project.LOCATION || 'remote'}`;

  try {

    const procName =
      project.REPORT_PROC ||
      project.PROCEDURE ||
      project.REPORT_LINK;

    const proc = safeName(procName);

    if (!proc) {
      throw new Error(`Invalid procedure name: ${procName}`);
    }

    console.log(
      `🔍 Executing: ${proc}(${project.RDN}) for ${project.USERNAME}@${project.LOCATION}`
    );

    conn.callTimeout = 30000;

    const result = await executeWithRetry(() =>
      conn.execute(
        `
        BEGIN
          ${proc}(
            :rdn,
            :fromDate,
            :toDate,
            :d_last_update,
            :total_calls,
            :call_in,
            :mou_in,
            :call_out,
            :mou_out
          );
        END;
        `,
        {
          rdn: project.RDN,
          fromDate,
          toDate,

          d_last_update: {
            dir: oracledb.BIND_OUT,
            type: oracledb.DATE
          },

          total_calls: {
            dir: oracledb.BIND_OUT,
            type: oracledb.NUMBER
          },

          call_in: {
            dir: oracledb.BIND_OUT,
            type: oracledb.NUMBER
          },

          mou_in: {
            dir: oracledb.BIND_OUT,
            type: oracledb.NUMBER
          },

          call_out: {
            dir: oracledb.BIND_OUT,
            type: oracledb.NUMBER
          },

          mou_out: {
            dir: oracledb.BIND_OUT,
            type: oracledb.NUMBER
          }
        }
      )
    );

    const data = result.outBinds;

    if ((data.total_calls || 0) > 0) {

      console.log(
        `${project.RDN}: ${data.total_calls} calls, ` +
        `${data.mou_in} min IN, ` +
        `${data.mou_out} min OUT`
      );
    }

    return data;

  } catch (err) {

    console.error(
      `❌ Skipped: ${project.USERNAME} | ` +
      `${project.RDN} | ` +
      `${project.LOCATION} | ` +
      `Reason: ${err.message}`
    );

    logError(
      LOG,
      'executeProcedure',
      new Error(`[${tag}] ${err.message}`)
    );

    throw err;
  }
}

module.exports = { executeProcedure };