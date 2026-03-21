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

function getAlertEmoji(alert) {
  if (isHfcUpdate(alert)) {
    return isReleaseMessage(alert) ? '🔵' : '🟠';
  }
  return '🔴';
}

function formatAlertMessage(alert) {
  const { time: timeStr } = formatDateParts();
  const title = alert.title || 'התרעה';
  return `${getAlertEmoji(alert)} ${title} | ${timeStr}`;
}

function formatAdjacentAlertMessage(alert, adjacentCities) {
  const { time: timeStr } = formatDateParts();
  const title = alert.title || 'התרעה';
  const cityList = formatCityList(adjacentCities);
  return `${getAlertEmoji(alert)} ${title} (ביישובים סמוכים) | ${cityList} | ${timeStr}`;
}

module.exports = {
  isReleaseMessage,
  isHfcUpdate,
  historyCatToLiveCat,
  formatAlertMessage,
  formatAdjacentAlertMessage,
  formatCityList,
};
