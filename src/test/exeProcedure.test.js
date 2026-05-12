    require('dotenv').config();

const { executeProcedure } = require ('../services/exeProcedure'); // adjust path if needed

// 🔴 Use ONE real project row (hardcoded for testing)
const sampleProject = {
  DB_USERNAME: 'cpaas',              // change to real
  REPORT_LINK: 'Project_rpt_calc_prc', // change to real
  DBLINK: 'iocltn',                  // change to real
  RDN: '9961262455'                  // change to real
};

// sample date format (same as your job)
const fromDate = '16042026000000';
const toDate   = '16042026235959';

(async () => {
  try {
    console.log("🧪 Testing executeProcedure...");

    const result = await executeProcedure(
      sampleProject,
      fromDate,
      toDate
    );

    console.log("📦 OUTPUT:", result);

  } catch (err) {
    console.error("💥 ERROR:", err.message);
  }
})();