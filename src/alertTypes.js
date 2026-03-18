const { formatDateParts } = require('./utils');
const { MAX_CITIES_DISPLAY, HFC_UPDATE_CAT } = require('./constants');
const alertMetadata = require('./alertMetadata');

function isReleaseMessage(alert) {
  return alertMetadata.isRelease(alert);
}

function isHfcUpdate(alert) {
  return Number(alert.cat) === HFC_UPDATE_CAT;
}

function historyCatToLiveCat(historyCat) {
  return alertMetadata.historyCatToLiveCat(historyCat);
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

function formatAdjacentAlertMessage(alert) {
  const { date: dateStr, time: timeStr } = formatDateParts();
  const title = alert.title || 'התרעה';

  const lines = [
    '*התרעה ביישובים סמוכים*',
    '',
    `📍 ${title}`,
    '',
    'ייתכן ותשמעו צפירות',
    '',
    `🕐 נשלח ב- ${dateStr} | ${timeStr}`,
    `📡 מקור: פיקוד העורף`,
  ];

  return lines.join('\n');
}

module.exports = {
  isReleaseMessage,
  isHfcUpdate,
  historyCatToLiveCat,
  formatAlertMessage,
  formatAdjacentAlertMessage,
  formatCityList,
};
