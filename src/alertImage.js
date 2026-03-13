// ===========================================
// Alert image generator — Pikud HaOref style
//
// Generates a dynamic PNG image for each alert
// using SVG → sharp. No Chromium/Canvas needed.
//
// Design matches the official Pikud HaOref app:
//   Red    (#DC2626) — active alerts + pre-alerts
//   Blue   (#2D4A6F) — event ended / all clear
//   Orange (#EA780E) — newsFlash (informational)
//
// Layout: colored background with white card inset
//         + "מקור: פיקוד העורף" header banner with official logo
// ===========================================

const sharp = require('sharp');
const path = require('path');
const os = require('os');
const { ALERT_TYPE_MAP, ALERT_CATEGORIES } = require('./alertTypes');

// ------------------------------------------
// Official Pikud HaOref logo as base64 PNG
// ------------------------------------------
const PIKUD_LOGO_B64 = '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';

// ------------------------------------------
// Color scheme by alert type
// ------------------------------------------
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

const RELEASE_KEYWORDS = [
  'יכולים לצאת',
  'ניתן לצאת',
  'לחזור לשגרה',
  'הסתיים',
  'סיום',
];

function isReleaseMessage(alert) {
  const textToScan = [
    alert.instructions || '',
    alert.raw?.title || '',
    alert.raw?.desc || '',
  ].join(' ');
  return RELEASE_KEYWORDS.some((kw) => textToScan.includes(kw));
}

function getColors(alert) {
  if (alert.type === 'eventEnded') return COLORS.eventEnded;
  if (alert.type === 'newsFlash') {
    return isReleaseMessage(alert) ? COLORS.eventEnded : COLORS.newsFlash;
  }
  return COLORS.active;
}

function isEventEndedStyle(alert) {
  return alert.type === 'eventEnded' || (alert.type === 'newsFlash' && isReleaseMessage(alert));
}

// ------------------------------------------
// SVG icons matching official Pikud HaOref app
// ------------------------------------------

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
  if (alert.type === 'eventEnded' || alert.type === 'preAlert' || alert.type === 'newsFlash') {
    return iconExclamation(cx, cy, color);
  }
  return iconBroadcast(cx, cy, color);
}

// ------------------------------------------
// SVG text helpers
// ------------------------------------------

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
    if (current && (current.length + 1 + word.length) > maxChars) {
      lines.push(current);
      current = word;
    } else {
      current = current ? current + ' ' + word : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// ------------------------------------------
// Main image generator
// ------------------------------------------

async function generateAlertImage(alert) {
  const colors = getColors(alert);
  const eventEndedLook = isEventEndedStyle(alert);

  const typeInfo = ALERT_TYPE_MAP[alert.type]
    || ALERT_CATEGORIES[alert.type]
    || null;

  const isNewsFlashRelease = alert.type === 'newsFlash' && isReleaseMessage(alert);

  let title;
  if (isNewsFlashRelease) {
    title = alert.raw?.title || 'עדכון';
  } else if (alert.raw?.title) {
    title = alert.raw.title;
  } else {
    title = typeInfo ? typeInfo.he : 'התרעה';
  }

  const MAX_CITIES = 15;
  const cities = alert.cities || [];
  let cityText;
  if (cities.length === 0) {
    cityText = 'כל הארץ';
  } else if (cities.length > MAX_CITIES) {
    cityText = cities.slice(0, MAX_CITIES).join(', ') + ` ועוד ${cities.length - MAX_CITIES}...`;
  } else {
    cityText = cities.join(', ');
  }

  const instructions = alert.instructions || '';

  const nowObj = new Date();
  const dd = String(nowObj.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem', day: '2-digit' })).padStart(2, '0');
  const mm = String(nowObj.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem', month: '2-digit' })).padStart(2, '0');
  const yyyy = nowObj.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem', year: 'numeric' });
  const timeStr = nowObj.toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem', hour12: false });
  const dateStr = `${dd}/${mm}/${yyyy}`;

  // ------------------------------------------
  // Layout
  // ------------------------------------------
  const WIDTH = 420;
  const CARD_MARGIN = 20;
  const CARD_WIDTH = WIDTH - CARD_MARGIN * 2;
  const FONT = 'FreeSans, DejaVu Sans, sans-serif';

  // Header banner: "מקור: פיקוד העורף" with official logo
  const HEADER_HEIGHT = 44;
  const HEADER_TOP = 10;
  const HEADER_RADIUS = 22; // pill shape

  const ICON_RADIUS = 36;
  const ICON_TOP_MARGIN = 45;

  const GAP_ICON_TO_TITLE = 40;
  const GAP_TITLE_TO_CITY = 50;
  const GAP_CITY_TO_INSTRUCTIONS = 30;

  // Card starts below the header
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

  const grayZoneContentEnd = CARD_TOP
    + ICON_TOP_MARGIN + ICON_RADIUS * 2 + GAP_ICON_TO_TITLE
    + titleLines.length * TITLE_LINE_HEIGHT
    + GAP_TITLE_TO_CITY
    + cityLines.length * CITY_LINE_HEIGHT
    + 15;

  // ------------------------------------------
  // Header layout
  // ------------------------------------------
  const headerCenterY = HEADER_TOP + HEADER_HEIGHT / 2;
  const headerPillWidth = 270;
  const headerPillX = (WIDTH - headerPillWidth) / 2;

  // Logo on the right side of the pill (RTL: visually right = start of reading)
  const LOGO_SIZE = 34;
  const logoX = headerPillX + headerPillWidth - 10 - LOGO_SIZE; // 10px padding from right edge
  const logoY = headerCenterY - LOGO_SIZE / 2;

  // Text centered in remaining space (left of logo)
  const textAreaRight = logoX - 6;
  const textAreaLeft = headerPillX + 10;
  const textCenterX = (textAreaLeft + textAreaRight) / 2;

  // ------------------------------------------
  // Build SVG
  // ------------------------------------------
  let svg = `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs>
    <style>text { font-family: '${FONT}'; }</style>
    <clipPath id="cardClip">
      <rect x="${CARD_MARGIN}" y="${CARD_TOP}" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" rx="${CARD_RADIUS}"/>
    </clipPath>
  </defs>

  <!-- Colored background -->
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${colors.bg}"/>

  <!-- Header banner: "מקור: פיקוד העורף" with official logo -->
  <rect x="${headerPillX}" y="${HEADER_TOP}" width="${headerPillWidth}" height="${HEADER_HEIGHT}" rx="${HEADER_RADIUS}" fill="rgba(0,0,0,0.25)"/>
  <text x="${textCenterX}" y="${headerCenterY + 6}" text-anchor="middle" direction="rtl"
    font-size="18" font-weight="bold" fill="white">&#x200F;מקור: פיקוד העורף&#x200E;</text>
  <image x="${logoX}" y="${logoY}" width="${LOGO_SIZE}" height="${LOGO_SIZE}"
    href="data:image/png;base64,${PIKUD_LOGO_B64}"/>

  <!-- White card -->
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
      const instrStartY = whiteZoneTop + (whiteZoneHeight - instrBlockHeight) / 2 + INSTR_LINE_HEIGHT * 0.7;

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
  svg += `  <text x="${WIDTH / 2}" y="${tsY}" text-anchor="middle" direction="rtl" font-size="16" font-weight="bold" fill="${colors.timestamp}">` +
    `&#x200F;נשלח ב- &#x200E;${dateStr}&#x200E; | &#x200E;${timeStr}&#x200E;&#x200F;` +
    `</text>\n`;

  svg += `</svg>`;

  const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
  return pngBuffer;
}

async function generateAlertImageFile(alert) {
  const buffer = await generateAlertImage(alert);
  const filePath = path.join(os.tmpdir(), `alert_${Date.now()}.png`);
  require('fs').writeFileSync(filePath, buffer);
  return filePath;
}

module.exports = { generateAlertImage, generateAlertImageFile };
