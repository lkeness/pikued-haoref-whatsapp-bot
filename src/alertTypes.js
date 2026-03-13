// ===========================================
// Alert type mappings and message formatting
// ===========================================

// Map Pikud HaOref category numbers to alert types
const ALERT_CATEGORIES = {
  1: { he: 'ירי רקטות וטילים', en: 'Rocket & Missile Fire', emoji: '🚀🔴' },
  2: { he: 'חדירת כלי טיס עוין', en: 'Hostile Aircraft Intrusion', emoji: '✈️🔴' },
  3: { he: 'רעידת אדמה', en: 'Earthquake', emoji: '🌍⚠️' },
  4: { he: 'צונאמי', en: 'Tsunami', emoji: '🌊⚠️' },
  5: { he: 'חומרים מסוכנים', en: 'Hazardous Materials', emoji: '☣️⚠️' },
  6: { he: 'חדירת מחבלים', en: 'Terrorist Infiltration', emoji: '⚠️🔴' },
  7: { he: 'אירוע רדיולוגי', en: 'Radiological Event', emoji: '☢️⚠️' },
  10: { he: 'עדכון מיוחד', en: 'Special Update / News Flash', emoji: '📢' },
  13: { he: 'האירוע הסתיים', en: 'Event Ended - All Clear', emoji: '✅' },
  14: { he: 'התרעה מקדימה', en: 'Pre-Alert Warning', emoji: '⚡⚠️' },
};

// Alert type lookup by normalized key
const ALERT_TYPE_MAP = {
  'missiles': { he: 'ירי רקטות וטילים', en: 'Rocket & Missile Fire', emoji: '🚀🔴' },
  'radiologicalEvent': { he: 'אירוע רדיולוגי', en: 'Radiological Event', emoji: '☢️⚠️' },
  'earthQuake': { he: 'רעידת אדמה', en: 'Earthquake', emoji: '🌍⚠️' },
  'tsunami': { he: 'צונאמי', en: 'Tsunami', emoji: '🌊⚠️' },
  'hostileAircraftIntrusion': { he: 'חדירת כלי טיס עוין', en: 'Hostile Aircraft Intrusion', emoji: '✈️🔴' },
  'hazardousMaterials': { he: 'חומרים מסוכנים', en: 'Hazardous Materials', emoji: '☣️⚠️' },
  'terroristInfiltration': { he: 'חדירת מחבלים', en: 'Terrorist Infiltration', emoji: '⚠️🔴' },
  'newsFlash': { he: 'עדכון מיוחד', en: 'Special Update / News Flash', emoji: '📢' },
  'eventEnded': { he: 'האירוע הסתיים', en: 'Event Ended - All Clear', emoji: '✅' },
  'preAlert': { he: 'התרעה מקדימה', en: 'Pre-Alert Warning', emoji: '⚡⚠️' },
};

const { translateCities, translateInstruction } = require('./translate');

/**
 * Format an alert into a bilingual WhatsApp message.
 *
 * @param {Object} alert - Normalized alert object
 * @param {string} alert.type - Alert type key (e.g. 'missiles')
 * @param {string[]} alert.cities - List of affected city names (Hebrew)
 * @param {string} [alert.instructions] - Instructions from HFC
 * @param {string} alert.id - Unique alert identifier
 * @returns {string} Formatted WhatsApp message
 */
function formatAlertMessage(alert) {
  const typeInfo = ALERT_TYPE_MAP[alert.type]
    || ALERT_CATEGORIES[alert.type]
    || null;

  // Unknown alert type — show raw data transparently, don't guess
  if (!typeInfo) {
    const now = new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });
    const translatedCities = alert.cities && alert.cities.length > 0
      ? translateCities(alert.cities)
      : [];
    const cityList = translatedCities.length > 0
      ? translatedCities.join(', ')
      : 'כל הארץ / Nationwide';

    const lines = [
      `⚠️ *התרעה לא מזוהה / UNRECOGNIZED ALERT* ⚠️`,
      '',
      `🔢 *קטגוריה / Category:* ${alert.raw?.cat || alert.type}`,
    ];
    if (alert.raw?.title) {
      lines.push(`📝 *כותרת / Title:* ${alert.raw.title}`);
    }
    lines.push('', `📍 ${cityList}`);
    if (alert.instructions) {
      const enInstruction = translateInstruction(alert.instructions);
      lines.push('', `📋 ${alert.instructions}`);
      if (enInstruction) lines.push(enInstruction);
    }
    lines.push('', `🕐 ${now}`);
    return lines.join('\n');
  }

  const now = new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });
  const isEventEnded = alert.type === 'eventEnded';
  const isPreAlert = alert.type === 'preAlert';

  // For "event ended" and "pre-alert", use the title from the API directly
  const heTitle = ((isEventEnded || isPreAlert) && alert.raw && alert.raw.title)
    ? alert.raw.title
    : typeInfo.he;
  const enTitle = typeInfo.en;

  // Translate city names: "Tel Aviv (תל אביב), Haifa (חיפה)"
  const translatedCities = alert.cities && alert.cities.length > 0
    ? translateCities(alert.cities)
    : [];

  // Cap the city list to avoid sending enormous messages
  const MAX_CITIES_DISPLAY = 20;
  let cityList;
  if (translatedCities.length === 0) {
    cityList = 'כל הארץ / Nationwide';
  } else if (translatedCities.length > MAX_CITIES_DISPLAY) {
    const shown = translatedCities.slice(0, MAX_CITIES_DISPLAY).join(', ');
    const remaining = translatedCities.length - MAX_CITIES_DISPLAY;
    cityList = `${shown}\n... ועוד ${remaining} ישובים / and ${remaining} more`;
  } else {
    cityList = translatedCities.join(', ');
  }

  // Shorter format for "event ended"
  if (isEventEnded) {
    const lines = [
      `✅ *${heTitle}*`,
      `✅ *${enTitle}*`,
      '',
      `📍 ${cityList}`,
      '',
      `🕐 ${now}`,
    ];
    return lines.join('\n');
  }

  const lines = [
    `${typeInfo.emoji} *התרעה / ALERT* ${typeInfo.emoji}`,
    '',
    `🇮🇱 *${heTitle}*`,
    `🇬🇧 *${enTitle}*`,
    '',
    `📍 *אזורים / Areas:*`,
    cityList,
    '',
  ];

  if (alert.instructions) {
    const enInstruction = translateInstruction(alert.instructions);
    lines.push(`📋 *הנחיות / Instructions:*`);
    lines.push(alert.instructions);
    if (enInstruction) {
      lines.push(enInstruction);
    }
    lines.push('');
  }

  lines.push(`🕐 ${now}`);
  lines.push(`📡 מקור / Source: פיקוד העורף / Home Front Command`);

  return lines.join('\n');
}

module.exports = { ALERT_CATEGORIES, ALERT_TYPE_MAP, formatAlertMessage };
