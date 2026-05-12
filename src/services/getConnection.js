const fs   = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '../../config/config.json');

let config;

try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  console.log("✅ Config loaded");
} catch (err) {
  console.error("❌ Config load failed:", err.message);
  throw err;
}

module.exports = { config };