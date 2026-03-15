const alertMetadata = require('./alertMetadata');

const HFC_UPDATE_CAT = '10';

function historyCatToLiveCat(historyCat) {
  return alertMetadata.historyCatToLiveCat(historyCat);
}

module.exports = { HFC_UPDATE_CAT, historyCatToLiveCat };
