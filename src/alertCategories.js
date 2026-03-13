// ===========================================
// Pikud HaOref alert category enum
//
// Used ONLY for internal behavioral branching
// (icon selection, color scheme, suppression).
// Display content always comes directly from
// the raw API data (title, desc, data).
// ===========================================

const AlertCategory = Object.freeze({
  MISSILES:                '1',
  HOSTILE_AIRCRAFT:        '2',
  EARTHQUAKE:              '3',
  TSUNAMI:                 '4',
  HAZARDOUS_MATERIALS:     '5',
  TERRORIST_INFILTRATION:  '6',
  RADIOLOGICAL_EVENT:      '7',
  NEWS_FLASH:              '10',
  EVENT_ENDED:             '13',
  PRE_ALERT:               '14',
});

module.exports = AlertCategory;
