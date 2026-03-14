const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { TIMEZONE, LOCALE } = require('./constants');

function atomicWriteSync(filePath, data) {
  const dir = path.dirname(filePath);
  const tmp = path.join(
    dir,
    `.${path.basename(filePath)}.${crypto.randomBytes(4).toString('hex')}.tmp`,
  );
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, filePath);
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function formatTimestamp() {
  return new Date().toLocaleString(LOCALE, { timeZone: TIMEZONE });
}

function formatDateParts() {
  const now = new Date();
  const dd = String(
    now.toLocaleDateString(LOCALE, { timeZone: TIMEZONE, day: '2-digit' }),
  ).padStart(2, '0');
  const mm = String(
    now.toLocaleDateString(LOCALE, { timeZone: TIMEZONE, month: '2-digit' }),
  ).padStart(2, '0');
  const yyyy = now.toLocaleDateString(LOCALE, { timeZone: TIMEZONE, year: 'numeric' });
  const time = now.toLocaleTimeString(LOCALE, { timeZone: TIMEZONE, hour12: false });
  return { date: `${dd}/${mm}/${yyyy}`, time };
}

module.exports = { atomicWriteSync, withTimeout, formatTimestamp, formatDateParts };
