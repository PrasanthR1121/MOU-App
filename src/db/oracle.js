require('dotenv').config();

const oracledb = require('oracledb');
const { config } = require('../services/getConnection');

oracledb.initOracleClient({ 
  libDir: config.oracleClient.libDir,
  configDir: config.oracleClient.tnsAdmin
});

// Set TNS_ADMIN environment variable as fallback
process.env.TNS_ADMIN = config.oracleClient.tnsAdmin;
console.log(`🔧 Oracle client initialized with TNS_ADMIN: ${process.env.TNS_ADMIN}`);

oracledb.outFormat   = oracledb.OUT_FORMAT_OBJECT;
oracledb.autoCommit  = false;
oracledb.callTimeout = 60000;

const poolCache = {};

async function getPool(tnsName) {
  if (poolCache[tnsName]) return poolCache[tnsName];
  console.log(`🚀 Creating pool → TNS: "${tnsName}"`);
  const pool = await oracledb.createPool({
    user:          config.mainDb.user,
    password:      config.mainDb.password,
    connectString: tnsName,
    poolMin:       2,
    poolMax:       20,
    poolIncrement: 2,
    poolTimeout:   60
  });
  poolCache[tnsName] = pool;
  return pool;
}

async function getDedicatedConnection() {
  const tnsName = config.mainDb.connectString;
  return oracledb.getConnection({
    user: config.mainDb.user,
    password: config.mainDb.password,
    connectString: tnsName
  });
}

async function getConnection() {
  const tnsName = config.mainDb.connectString;
  console.log(`📡 master → ${tnsName}`);
  const pool = await getPool(tnsName);
  return pool.getConnection();
}

async function getConnectionByTns(tnsName, user, password) {
  if (!tnsName || !user || !password) {
    throw new Error('Missing TNS name, user, or password');
  }
  console.log(`📡 remote → ${tnsName}`);
  console.log(`🔑 Connecting with user='${user}' password='${password}'`);
  try {
    const conn = await oracledb.getConnection({
      user,
      password,
      connectString: tnsName
    });
    console.log(`✅ Connected successfully to ${tnsName} as ${user}`);
    return conn;
  } catch (err) {
    console.error(`❌ Connection failed to ${tnsName} as ${user}: ${err.message}`);
    throw err;
  }
}

async function closePool() {
  console.log("🛑 Closing all Oracle pools...");
  for (const tns in poolCache) {
    try {
      await poolCache[tns].close(10);
      console.log(`✅ Closed pool: ${tns}`);
    } catch (err) {
      console.error(`❌ Error closing ${tns}:`, err.message);
    }
  }
}

module.exports = { getConnection, getConnectionByTns, getDedicatedConnection, closePool };