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
  let settled = false;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error(`Timed out after ${ms}ms`));
      }
    }, ms);
    promise.then(
      (val) => {
        clearTimeout(timer);
        if (!settled) {
          settled = true;
          resolve(val);
        }
      },
      (err) => {
        clearTimeout(timer);
        if (!settled) {
          settled = true;
          reject(err);
        }
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
  const rawTime = now.toLocaleTimeString(LOCALE, { timeZone: TIMEZONE, hour12: false });
  const time = rawTime.padStart(8, '0');
  return { date: `${dd}/${mm}/${yyyy}`, time };
}

function createMutex() {
  let pending = Promise.resolve();
  return function (fn) {
    const result = pending.then(() => fn());
    pending = result.then(
      () => {},
      () => {},
    );
    return result;
  };
}

module.exports = { atomicWriteSync, withTimeout, formatTimestamp, formatDateParts, createMutex };
