// Live alerts.json uses matrixCatId as its `cat` field.
// Verified against https://www.oref.org.il/alerts/alertsTranslation.json
const AlertCategory = Object.freeze({
  MISSILES: '1',
  EARTHQUAKE: '3',
  RADIOLOGICAL_EVENT: '4',
  TSUNAMI: '5',
  HOSTILE_AIRCRAFT: '6',
  HAZARDOUS_MATERIALS: '7',
  HFC_UPDATE: '10',
  TERRORIST_INFILTRATION: '13',
});

// AlertsHistory.json uses catId, which is a DIFFERENT numbering scheme.
// This map converts history catId → live matrixCatId for unified handling.
const HISTORY_TO_LIVE_CAT = Object.freeze({
  1: AlertCategory.MISSILES,
  2: AlertCategory.HOSTILE_AIRCRAFT,
  7: AlertCategory.EARTHQUAKE,
  8: AlertCategory.EARTHQUAKE,
  9: AlertCategory.RADIOLOGICAL_EVENT,
  10: AlertCategory.TERRORIST_INFILTRATION,
  11: AlertCategory.TSUNAMI,
  12: AlertCategory.HAZARDOUS_MATERIALS,
  13: AlertCategory.HFC_UPDATE,
  14: AlertCategory.HFC_UPDATE,
});

function historyCatToLiveCat(historyCat) {
  return HISTORY_TO_LIVE_CAT[parseInt(historyCat)] ?? String(historyCat);
}

function isDrill(cat) {
  return parseInt(cat) >= 100;
}

module.exports = { AlertCategory, historyCatToLiveCat, isDrill };
