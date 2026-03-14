const { translateCities, translateInstruction } = require('./translate');
const { formatTimestamp } = require('./utils');
const { AlertCategory } = require('./alertCategories');

const RELEASE_KEYWORDS = ['יכולים לצאת', 'ניתן לצאת', 'לחזור לשגרה', 'הסתיים', 'סיום'];

function isReleaseMessage(alert) {
  if (alert.cat !== AlertCategory.HFC_UPDATE) return false;
  const textToScan = [alert.title || '', alert.instructions || ''].join(' ');
  return RELEASE_KEYWORDS.some((kw) => textToScan.includes(kw));
}

/**
 * @param {Object} alert - Normalized alert object
 * @returns {string} Formatted WhatsApp message
 */
function formatAlertMessage(alert) {
  const now = formatTimestamp();
  const title = alert.title || 'התרעה';

  const translatedCities =
    alert.cities && alert.cities.length > 0 ? translateCities(alert.cities) : [];

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

  if (isReleaseMessage(alert)) {
    const lines = [`*${title}*`, '', `📍 ${cityList}`];
    if (alert.instructions) {
      lines.push('', alert.instructions);
    }
    lines.push('', `🕐 ${now}`);
    return lines.join('\n');
  }

  const lines = [`*${title}*`, '', `📍 ${cityList}`, ''];

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
