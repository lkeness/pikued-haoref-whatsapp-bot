// ===========================================
// Hebrew → English Translation
//
// Uses the official Pikud HaOref city names
// dictionary (1,449 cities + 33 zones) and
// a static map of known instruction texts.
// ===========================================

const translations = require('./translations.json');
const logger = require('./logger');

// ------------------------------------
// City name translation
// ------------------------------------
// The API returns city names exactly as they appear in the dictionary,
// so a direct lookup works for the vast majority of cases.

function translateCity(hebrewName) {
  const trimmed = hebrewName.trim();

  // 1. Exact match
  if (translations.cities[trimmed]) return translations.cities[trimmed];

  // 2. Fuzzy match — find dictionary entries sharing the same base city name,
  //    then pick the one with the most overlapping words.
  const baseName = trimmed.split(' - ')[0].split(',')[0].trim();
  const inputWords = new Set(trimmed.split(/[\s,\-]+/).filter(Boolean));

  let bestMatch = null;
  let bestOverlap = 0;

  for (const [he, en] of Object.entries(translations.cities)) {
    const dictBase = he.split(' - ')[0].split(',')[0].trim();
    if (dictBase !== baseName) continue;

    // Count overlapping words
    const dictWords = he.split(/[\s,\-]+/).filter(Boolean);
    let overlap = 0;
    for (const w of dictWords) {
      if (inputWords.has(w)) overlap++;
    }

    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      bestMatch = en;
    }
  }

  if (bestMatch) return bestMatch;

  // Not found — return null (Hebrew name will be shown as-is)
  logger.debug(`No English translation found for city: "${hebrewName}"`);
  return null;
}

function translateCities(hebrewCities) {
  return hebrewCities.map((city) => {
    const en = translateCity(city);
    return en ? `${en} (${city})` : city;
  });
}

// ------------------------------------
// Instruction / title translation
// ------------------------------------
// The "title" field from the API is a short Hebrew instruction string.
// There is a small, fixed set of known instructions. We map them here.

const INSTRUCTION_MAP = {
  // Missiles / Rockets
  'היכנסו למרחב המוגן ושהו בו 10 דקות': 'Enter the protected space and stay for 10 minutes',
  'היכנסו למרחב המוגן': 'Enter the protected space',
  'היכנסו מיד למקלט או למרחב המוגן': 'Enter the shelter or protected space immediately',
  'היכנסו למרחב המוגן ושהו בו 10 דקות. במידה ואין מרחב מוגן, היכנסו לחדר פנימי': 'Enter the protected space and stay for 10 minutes. If no protected space is available, enter an inner room',

  // Hostile aircraft intrusion
  'היכנסו למבנה': 'Enter a building',
  'היכנסו למבנה, נעלו את הדלתות וסגרו את החלונות': 'Enter a building, lock the doors and close the windows',

  // Earthquake
  'התרחקו מבניינים ועמדו בשטח פתוח': 'Move away from buildings and stand in an open area',
  'צאו לשטח פתוח או היכנסו לממ"ד': 'Go to open area or enter the safe room (mamad)',

  // Tsunami
  'התרחקו מקו החוף': 'Move away from the coastline',
  'עלו לקומה שנייה ומעלה': 'Go to the second floor or above',

  // Hazardous materials
  'היכנסו למבנה, סגרו חלונות ודלתות': 'Enter a building, close windows and doors',
  'היכנסו למבנה, סגרו דלתות, חלונות ותריסים': 'Enter a building, close doors, windows and shutters',

  // Radiological event
  'היכנסו למבנה וסגרו חלונות ודלתות': 'Enter a building and close windows and doors',

  // Terrorist infiltration
  'היכנסו למבנה, נעלו דלתות וחלונות': 'Enter a building, lock doors and windows',
  'הסתגרו בתוך מבנה': 'Barricade inside a building',

  // Event ended / all clear
  'האירוע הסתיים': 'Event ended - all clear',
  'ניתן לצאת מהמרחב המוגן': 'You may leave the protected space',
  'ניתן לצאת מהמרחב המוגן ולחזור לשגרה': 'You may leave the protected space and return to routine',

  // General / news flash
  'התעדכנו בהנחיות פיקוד העורף': 'Follow Home Front Command instructions',

  // Pre-alert
  'בדקות הקרובות צפויות להתקבל התרעות באזורך': 'Alerts are expected in your area in the coming minutes',
  'הנחיה מקדימה': 'Pre-alert warning',
};

function translateInstruction(hebrewText) {
  if (!hebrewText) return null;

  const trimmed = hebrewText.trim();

  // Direct match
  if (INSTRUCTION_MAP[trimmed]) {
    return INSTRUCTION_MAP[trimmed];
  }

  // Partial match — some instructions may have minor variations
  for (const [he, en] of Object.entries(INSTRUCTION_MAP)) {
    if (trimmed.includes(he) || he.includes(trimmed)) {
      return en;
    }
  }

  logger.debug(`No English translation found for instruction: "${hebrewText}"`);
  return null;
}

module.exports = {
  translateCity,
  translateCities,
  translateInstruction,
};
