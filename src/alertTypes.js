const { formatDateParts } = require('./utils');
const { HFC_UPDATE_CAT } = require('./alertCategories');
const { MAX_CITIES_DISPLAY } = require('./constants');
const alertMetadata = require('./alertMetadata');

function isReleaseMessage(alert) {
  return alertMetadata.isRelease(alert);
}

function isHfcUpdate(alert) {
  return String(alert.cat) === HFC_UPDATE_CAT;
}

function formatCityList(cities) {
  if (!cities || cities.length === 0) return 'כל הארץ';
  if (cities.length > MAX_CITIES_DISPLAY) {
    return (
      cities.slice(0, MAX_CITIES_DISPLAY).join(', ') +
      ` ועוד ${cities.length - MAX_CITIES_DISPLAY}...`
    );
  }
  return cities.join(', ');
}

function formatAlertMessage(alert) {
  const { date: dateStr, time: timeStr } = formatDateParts();
  const title = alert.title || 'התרעה';
  const cityList = formatCityList(alert.cities);

  const lines = [`*${title}*`, '', `📍 ${cityList}`];

  if (alert.instructions) {
    lines.push('', alert.instructions);
  }

  lines.push('', `🕐 נשלח ב- ${dateStr} | ${timeStr}`);
  lines.push(`📡 מקור: פיקוד העורף`);

  return lines.join('\n');
}

module.exports = { isReleaseMessage, isHfcUpdate, formatAlertMessage, formatCityList };
