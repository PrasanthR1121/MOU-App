const fs   = require('fs');
const path = require('path');

// =====================================
// LOG DIR — D:\MOU_App\Logs\YYYY-MM-DD\
// =====================================
function getLogDir() {
  const today = new Date().toISOString().slice(0, 10); 
  const dir   = path.join(__dirname, '../../Logs', today);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getLogFile(filename) {
  return path.join(getLogDir(), filename);
}

// ==============
// WRITE LOG LINE
// ==============
function writeLog(filename, level, fnName, message) {
  const ts   = new Date().toISOString();
  const line = `[${ts}] [${level}] [${fnName}] ${message}\n`;
  fs.appendFileSync(getLogFile(filename), line);
}

// ==============
// PUBLIC HELPERS
// ==============
function logStart(filename, fnName, detail = '') {
  const msg = detail ? `START — ${detail}` : 'START';
  writeLog(filename, 'INFO ', fnName, msg);
}

function logEnd(filename, fnName, detail = '') {
  const msg = detail ? `END   — ${detail}` : 'END';
  writeLog(filename, 'INFO ', fnName, msg);
}

function logError(filename, fnName, err) {
  writeLog(filename, 'ERROR', fnName, err.message || String(err));
}

function logInfo(filename, fnName, message) {
  writeLog(filename, 'INFO ', fnName, message);
}

module.exports = { logStart, logEnd, logError, logInfo };