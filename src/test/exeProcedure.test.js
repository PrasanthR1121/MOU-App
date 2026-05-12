    require('dotenv').config();

const { executeProcedure } = require ('../services/exeProcedure'); 

const sampleProject = {
  DB_USERNAME: 'cpaas',            
  REPORT_LINK: 'Project_rpt_calc_prc', 
  DBLINK: 'iocltn',                  
  RDN: '9961262455'                 
};

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