require('dotenv').config();

const oracledb = require('oracledb');
const { config } = require('../services/getConnection');
const { getOtherProjects, getCpaasProjects, getFlipkartProjects } = require('../services/getProjects');

oracledb.initOracleClient({
  libDir: config.oracleClient.libDir,
  configDir: config.oracleClient.tnsAdmin
});

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
oracledb.autoCommit = false;

async function testConnectString(name, connectString, user, password) {
  console.log(`🔑 Trying ${name} with user='${user}' password='${password}'`);
  try {
    const conn = await oracledb.getConnection({
      user,
      password,
      connectString
    });
    try {
      await conn.execute('SELECT 1 FROM DUAL');
      console.log(`✅ ${name} → OK (${user})`);
      return { name, ok: true };
    } finally {
      try {
        await conn.close();
      } catch (closeErr) {
        console.error(`⚠️  ${name} close failed: ${closeErr.message}`);
      }
    }
  } catch (err) {
    console.error(`❌ ${name} → ${err.message}`);
    return { name, ok: false, error: err.message };
  }
}

async function runTests() {
  console.log('📡 Testing local mainDb connection...');

  const results = [];
  const localResult = await testConnectString(
    'MAIN_DB',
    config.mainDb.connectString,
    config.mainDb.user,
    config.mainDb.password
  );
  results.push(localResult);

  // Fetch actual projects to get their DB_USERNAME and CIRCLE mappings
  console.log('\n📋 Fetching projects from database...\n');
  
  let allProjects = [];
  try {
    const others = await getOtherProjects();
    const cpaas = await getCpaasProjects();
    const flipkart = await getFlipkartProjects();
    allProjects = [...others, ...cpaas, ...flipkart];
    console.log(`✅ Found ${allProjects.length} total projects\n`);
  } catch (err) {
    console.error(`❌ Could not fetch projects: ${err.message}`);
    return;
  }

  // Group unique (location, USERNAME) pairs and test each
  const testedPairs = new Set();
  const locationStats = {};
  
  for (const project of allProjects) {
    const location = (project.LOCATION || '').trim();
    const user = (project.USERNAME || '').trim();
    
    if (!location || !user) continue;
    
    locationStats[location] = (locationStats[location] || 0) + 1;
  }

  console.log(`\n📊 Unique locations found:`, Object.keys(locationStats).length);
  Object.entries(locationStats).forEach(([loc, count]) => {
    console.log(`   ${loc}: ${count} projects`);
  });

  console.log(`\n🔍 Available TNS mappings: ${Object.keys(config.remoteTns).join(', ')}`);
  
  for (const project of allProjects) {
    const location = (project.LOCATION || '').trim();
    const user = (project.USERNAME || '').trim();
    const pair = `${location}|${user}`;

    if (testedPairs.has(pair) || !location || !user) continue;
    testedPairs.add(pair);

    // Case-insensitive lookup for TNS mapping
    const remoteTnsKey = Object.keys(config.remoteTns).find(key => key.toLowerCase() === location.toLowerCase());
    const remoteTns = remoteTnsKey ? config.remoteTns[remoteTnsKey] : null;
    
    if (!remoteTns) {
      console.log(`⚠️  No TNS mapping for location '${location}', skipping`);
      continue;
    }

    const password = project.PASSWORD;
    const result = await testConnectString(`${location}/${user} (${remoteTns})`, remoteTns, user, password);
    results.push(result);
  }

  const failed = results.filter(r => !r.ok);

  console.log('\n' + '='.repeat(60));
  console.log(`✅ Passed: ${results.length - failed.length}`);
  console.log(`❌ Failed: ${failed.length}`);
  console.log('='.repeat(60));

  if (failed.length > 0) {
    console.log('\n⚠️  Failed connections:');
    failed.forEach(r => console.log(`   ${r.name}: ${r.error}`));
    console.log('\n💡 Check if DB_USERNAME / password pairs are correct in Project_Mst table');
    process.exit(1);
  }

  process.exit(0);
}

runTests().catch(err => {
  console.error('💥 Test failed:', err.message);
  process.exit(1);
});
