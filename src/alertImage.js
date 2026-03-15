const sharp = require('sharp');
const fs = require('fs');
const { isReleaseMessage, isHfcUpdate, formatCityList } = require('./alertTypes');
const { formatDateParts } = require('./utils');
const { PIKUD_LOGO_PATH } = require('./constants');

const PIKUD_LOGO_B64 = fs.readFileSync(PIKUD_LOGO_PATH).toString('base64');

const COLORS = {
  active: {
    bg: '#DC2626',
    cardBg: '#FFFFFF',
    title: '#DC2626',
    city: '#DC2626',
    instructions: '#DC2626',
    instructionsOpacity: '0.75',
    timestamp: '#FFFFFF',
    iconStroke: '#DC2626',
  },
  eventEnded: {
    bg: '#2D4A6F',
    cardBg: '#FFFFFF',
    cardTopBg: '#C8CDD3',
    title: '#333333',
    city: '#333333',
    instructions: '#444444',
    instructionsOpacity: '1',
    timestamp: '#FFFFFF',
    iconStroke: '#2D4A6F',
  },
  newsFlash: {
    bg: '#EA780E',
    cardBg: '#FFFFFF',
    title: '#EA780E',
    city: '#EA780E',
    instructions: '#EA780E',
    instructionsOpacity: '0.75',
    timestamp: '#FFFFFF',
    iconStroke: '#EA780E',
  },
};

function getColors(alert) {
  if (isHfcUpdate(alert)) {
    return isReleaseMessage(alert) ? COLORS.eventEnded : COLORS.newsFlash;
  }
  return COLORS.active;
}

function isEventEndedStyle(alert) {
  return isHfcUpdate(alert) && isReleaseMessage(alert);
}

function arcPath(cx, cy, r, startAngle, endAngle) {
  const startRad = (startAngle * Math.PI) / 180;
  const endRad = (endAngle * Math.PI) / 180;
  const x1 = cx + r * Math.cos(startRad);
  const y1 = cy + r * Math.sin(startRad);
  const x2 = cx + r * Math.cos(endRad);
  const y2 = cy + r * Math.sin(endRad);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
}

function iconBroadcast(cx, cy, color) {
  return `<g>
    <circle cx="${cx}" cy="${cy}" r="36" fill="white" stroke="${color}" stroke-width="3"/>
    <circle cx="${cx}" cy="${cy}" r="9" fill="${color}"/>
    <path d="${arcPath(cx, cy, 18, -45, 45)}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>
    <path d="${arcPath(cx, cy, 18, 135, 225)}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>
    <path d="${arcPath(cx, cy, 27, -50, 50)}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>
    <path d="${arcPath(cx, cy, 27, 130, 230)}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>
  </g>`;
}

function iconExclamation(cx, cy, color) {
  return `<g>
    <circle cx="${cx}" cy="${cy}" r="36" fill="white" stroke="${color}" stroke-width="3"/>
    <line x1="${cx}" y1="${cy - 16}" x2="${cx}" y2="${cy + 5}" stroke="${color}" stroke-width="4.5" stroke-linecap="round"/>
    <circle cx="${cx}" cy="${cy + 16}" r="3.5" fill="${color}"/>
  </g>`;
}

function getIcon(alert, cx, cy, color) {
  if (isHfcUpdate(alert)) {
    return iconExclamation(cx, cy, color);
  }
  return iconBroadcast(cx, cy, color);
}

function esc(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrapText(text, maxChars) {
  const words = text.split(/\s+/);
  const lines = [];
  let current = '';
  for (const word of words) {
    if (current && current.length + 1 + word.length > maxChars) {
      lines.push(current);
      current = word;
    } else {
      current = current ? current + ' ' + word : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

async function generateAlertImage(alert) {
  const colors = getColors(alert);
  const eventEndedLook = isEventEndedStyle(alert);

  const title = alert.title || 'התרעה';

  const cityText = formatCityList(alert.cities);

  const instructions = alert.instructions || '';

  const { date: dateStr, time: timeStr } = formatDateParts();

  const WIDTH = 420;
  const CARD_MARGIN = 20;
  const CARD_WIDTH = WIDTH - CARD_MARGIN * 2;
  const FONT = 'FreeSans, DejaVu Sans, sans-serif';

  const HEADER_HEIGHT = 44;
  const HEADER_TOP = 10;
  const HEADER_RADIUS = 22;

  const ICON_RADIUS = 36;
  const ICON_TOP_MARGIN = 45;

  const GAP_ICON_TO_TITLE = 40;
  const GAP_TITLE_TO_CITY = 50;
  const GAP_CITY_TO_INSTRUCTIONS = 30;

  const CARD_TOP = HEADER_TOP + HEADER_HEIGHT + 14;

  let cardH = 0;
  cardH += ICON_TOP_MARGIN + ICON_RADIUS * 2 + GAP_ICON_TO_TITLE;

  const titleLines = wrapText(title, 24);
  const TITLE_FONT_SIZE = 26;
  const TITLE_LINE_HEIGHT = 34;
  cardH += titleLines.length * TITLE_LINE_HEIGHT;

  cardH += GAP_TITLE_TO_CITY;

  const cityLines = wrapText(cityText, 18);
  const CITY_FONT_SIZE = 32;
  const CITY_LINE_HEIGHT = 40;
  cardH += cityLines.length * CITY_LINE_HEIGHT;

  let instructionLines = [];
  const INSTR_FONT_SIZE = 22;
  const INSTR_LINE_HEIGHT = 32;
  if (instructions) {
    const instrMaxChars = eventEndedLook ? 24 : 28;
    instructionLines = wrapText(instructions, instrMaxChars);
    if (eventEndedLook) {
      const instrBlockHeight = instructionLines.length * INSTR_LINE_HEIGHT;
      const minWhiteZone = instrBlockHeight + 60;
      cardH += minWhiteZone;
    } else {
      cardH += GAP_CITY_TO_INSTRUCTIONS;
      cardH += instructionLines.length * INSTR_LINE_HEIGHT;
    }
  }

  cardH += 35;

  const CARD_HEIGHT = cardH;
  const TIMESTAMP_AREA = 55;
  const HEIGHT = CARD_TOP + CARD_HEIGHT + TIMESTAMP_AREA;
  const CARD_RADIUS = 16;

  const iconCx = WIDTH / 2;
  const iconCy = CARD_TOP + ICON_TOP_MARGIN + ICON_RADIUS;

  const grayZoneContentEnd =
    CARD_TOP +
    ICON_TOP_MARGIN +
    ICON_RADIUS * 2 +
    GAP_ICON_TO_TITLE +
    titleLines.length * TITLE_LINE_HEIGHT +
    GAP_TITLE_TO_CITY +
    cityLines.length * CITY_LINE_HEIGHT +
    15;

  const headerCenterY = HEADER_TOP + HEADER_HEIGHT / 2;
  const headerPillWidth = 270;
  const headerPillX = (WIDTH - headerPillWidth) / 2;

  const LOGO_SIZE = 34;
  const logoX = headerPillX + headerPillWidth - 10 - LOGO_SIZE;
  const logoY = headerCenterY - LOGO_SIZE / 2;

  const textAreaRight = logoX - 6;
  const textAreaLeft = headerPillX + 10;
  const textCenterX = (textAreaLeft + textAreaRight) / 2;

  let svg = `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs>
    <style>text { font-family: '${FONT}'; }</style>
    <clipPath id="cardClip">
      <rect x="${CARD_MARGIN}" y="${CARD_TOP}" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" rx="${CARD_RADIUS}"/>
    </clipPath>
  </defs>

  <rect width="${WIDTH}" height="${HEIGHT}" fill="${colors.bg}"/>

  <rect x="${headerPillX}" y="${HEADER_TOP}" width="${headerPillWidth}" height="${HEADER_HEIGHT}" rx="${HEADER_RADIUS}" fill="rgba(0,0,0,0.25)"/>
  <text x="${textCenterX}" y="${headerCenterY + 6}" text-anchor="middle" direction="rtl"
    font-size="18" font-weight="bold" fill="white">&#x200F;מקור: פיקוד העורף&#x200E;</text>
  <image x="${logoX}" y="${logoY}" width="${LOGO_SIZE}" height="${LOGO_SIZE}"
    href="data:image/png;base64,${PIKUD_LOGO_B64}"/>

  <rect x="${CARD_MARGIN}" y="${CARD_TOP}" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" rx="${CARD_RADIUS}" fill="${colors.cardBg}"/>
`;

  if (eventEndedLook && colors.cardTopBg) {
    svg += `  <rect x="${CARD_MARGIN}" y="${CARD_TOP}" width="${CARD_WIDTH}" height="${grayZoneContentEnd - CARD_TOP}" clip-path="url(#cardClip)" fill="${colors.cardTopBg}"/>\n`;
  }

  svg += getIcon(alert, iconCx, iconCy, colors.iconStroke);

  let curY = CARD_TOP + ICON_TOP_MARGIN + ICON_RADIUS * 2 + GAP_ICON_TO_TITLE;

  for (const line of titleLines) {
    curY += TITLE_LINE_HEIGHT;
    svg += `  <text x="${WIDTH / 2}" y="${curY}" text-anchor="middle" direction="rtl"
      font-size="${TITLE_FONT_SIZE}" font-weight="bold" fill="${colors.title}">${esc(line)}</text>\n`;
  }

  curY += GAP_TITLE_TO_CITY;

  for (const line of cityLines) {
    svg += `  <text x="${WIDTH / 2}" y="${curY}" text-anchor="middle" direction="rtl"
      font-size="${CITY_FONT_SIZE}" font-weight="bold" fill="${colors.city}">${esc(line)}</text>\n`;
    curY += CITY_LINE_HEIGHT;
  }

  if (instructionLines.length > 0) {
    if (eventEndedLook) {
      const whiteZoneTop = grayZoneContentEnd;
      const whiteZoneBottom = CARD_TOP + CARD_HEIGHT - 10;
      const whiteZoneHeight = whiteZoneBottom - whiteZoneTop;
      const instrBlockHeight = instructionLines.length * INSTR_LINE_HEIGHT;
      const instrStartY =
        whiteZoneTop + (whiteZoneHeight - instrBlockHeight) / 2 + INSTR_LINE_HEIGHT * 0.7;

      let instrY = instrStartY;
      for (const line of instructionLines) {
        svg += `  <text x="${WIDTH / 2}" y="${instrY}" text-anchor="middle" direction="rtl"
          font-size="${INSTR_FONT_SIZE}" font-weight="bold" fill="${colors.instructions}" fill-opacity="${colors.instructionsOpacity}">${esc(line)}</text>\n`;
        instrY += INSTR_LINE_HEIGHT;
      }
    } else {
      curY += GAP_CITY_TO_INSTRUCTIONS;
      for (const line of instructionLines) {
        svg += `  <text x="${WIDTH / 2}" y="${curY}" text-anchor="middle" direction="rtl"
          font-size="${INSTR_FONT_SIZE}" font-weight="bold" fill="${colors.instructions}" fill-opacity="${colors.instructionsOpacity}">${esc(line)}</text>\n`;
        curY += INSTR_LINE_HEIGHT;
      }
    }
  }

  const tsY = CARD_TOP + CARD_HEIGHT + 35;
  svg +=
    `  <text x="${WIDTH / 2}" y="${tsY}" text-anchor="middle" direction="rtl" font-size="16" font-weight="bold" fill="${colors.timestamp}">` +
    `&#x200F;נשלח ב- &#x200E;${dateStr}&#x200E; | &#x200E;${timeStr}&#x200E;&#x200F;` +
    `</text>\n`;

  svg += `</svg>`;

  return await sharp(Buffer.from(svg)).png().toBuffer();
}

module.exports = { generateAlertImage };
