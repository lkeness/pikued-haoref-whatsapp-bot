// ===========================================
// Alert message formatting
//
// Uses raw data from Pikud HaOref directly —
// title, desc, data (cities), cat — with no
// local category-to-type mapping.
// ===========================================

const { translateCities, translateInstruction } = require('./translate');

// Keywords in the title/desc that indicate a release / all-clear message
const RELEASE_KEYWORDS = [
  'יכולים לצאת',
  'ניתן לצאת',
  'לחזור לשגרה',
  'הסתיים',
  'סיום',
];

function isReleaseMessage(alert) {
  const textToScan = [
    alert.title || '',
    alert.instructions || '',
  ].join(' ');
  return RELEASE_KEYWORDS.some((kw) => textToScan.includes(kw));
}

/**
 * Format an alert into a WhatsApp message using raw Pikud HaOref data.
 *
 * @param {Object} alert - Normalized alert object
 * @param {string} alert.cat - Raw category number from Pikud HaOref
 * @param {string} alert.title - Alert title from the API (Hebrew)
 * @param {string[]} alert.cities - List of affected city names (Hebrew)
 * @param {string} [alert.instructions] - Instructions / desc from HFC
 * @param {string} alert.id - Unique alert identifier
 * @returns {string} Formatted WhatsApp message
 */
function formatAlertMessage(alert) {
  const now = new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });
  const title = alert.title || 'התרעה';

  // Translate city names: "Tel Aviv (תל אביב), Haifa (חיפה)"
  const translatedCities = alert.cities && alert.cities.length > 0
    ? translateCities(alert.cities)
    : [];

  // Cap the city list to avoid sending enormous messages
  const MAX_CITIES_DISPLAY = 20;
  let cityList;
  if (translatedCities.length === 0) {
    cityList = 'כל הארץ';
  } else if (translatedCities.length > MAX_CITIES_DISPLAY) {
    const shown = translatedCities.slice(0, MAX_CITIES_DISPLAY).join(', ');
    const remaining = translatedCities.length - MAX_CITIES_DISPLAY;
    cityList = `${shown}\n... ועוד ${remaining} ישובים`;
  } else {
    cityList = translatedCities.join(', ');
  }

  // Release / all-clear messages get a shorter format
  if (isReleaseMessage(alert)) {
    const lines = [
      `*${title}*`,
      '',
      `📍 ${cityList}`,
    ];
    if (alert.instructions) {
      lines.push('', alert.instructions);
    }
    lines.push('', `🕐 ${now}`);
    return lines.join('\n');
  }

  // Standard alert format
  const lines = [
    `*${title}*`,
    '',
    `📍 ${cityList}`,
    '',
  ];

  if (alert.instructions) {
    const enInstruction = translateInstruction(alert.instructions);
    lines.push(alert.instructions);
    if (enInstruction) {
      lines.push(enInstruction);
    }
    lines.push('');
  }

  lines.push(`🕐 ${now}`);
  lines.push(`📡 מקור: פיקוד העורף`);

  return lines.join('\n');
}

module.exports = { isReleaseMessage, formatAlertMessage };
