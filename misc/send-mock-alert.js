// ===========================================
// Mock Alert Sender Script
// Run with: node misc/send-mock-alert.js
// ===========================================

require('dotenv').config();
const fs = require('fs');
const logger = require('../src/logger');
const { formatAlertMessage } = require('../src/alertTypes');
const { generateAlertImage } = require('../src/alertImage');
const AlertDeduplicator = require('../src/dedup');
const WhatsAppClient = require('../src/whatsapp');

// Ensure logs directory exists
if (!fs.existsSync('./logs')) fs.mkdirSync('./logs');

// ------------------------------------------
// Config (same as index.js)
// ------------------------------------------
const config = {
  whatsappGroupId: process.env.WHATSAPP_GROUP_ID,
  dedupWindowMs: parseInt(process.env.DEDUP_WINDOW_MS) || 60000,
};

// ------------------------------------------
// Validate
// ------------------------------------------
if (!config.whatsappGroupId) {
  logger.error('WHATSAPP_GROUP_ID is not set. Run `npm run setup` to find your group ID, then add it to .env');
  process.exit(1);
}

// ------------------------------------------
// Mock Alerts Data - Different Types
// ------------------------------------------
const mockAlerts = [
  {
    type: 'missiles',
    cities: ['תל אביב', 'חיפה', 'ירושלים'],
    instructions: 'היכנסו למרחב המוגן ושהו בו 10 דקות',
    cat: '1'
  },
  {
    type: 'hostileAircraftIntrusion',
    cities: ['באר שבע', 'אשדוד'],
    instructions: 'היכנסו למרחב המוגן ושהו בו 10 דקות',
    cat: '2'
  },
  {
    type: 'newsFlash',
    cities: [],
    instructions: 'עדכון חדש: מצב ביטחוני מתוח בגבול הצפון',
    cat: '10'
  },
  {
    type: 'preAlert',
    cities: ['גליל עליון', 'גולן'],
    instructions: 'התכוננו להיכנס למרחב המוגן',
    cat: '14'
  },
  {
    type: 'eventEnded',
    cities: ['תל אביב', 'חיפה', 'ירושלים'],
    instructions: 'האירוע הסתיים - חזרה לשגרה',
    cat: '13'
  }
];

function createMockAlert(alertData) {
  return {
    id: 'mock-' + Date.now() + '-' + alertData.type,
    type: alertData.type,
    cities: alertData.cities,
    instructions: alertData.instructions,
    source: 'manual_test',
    raw: {
      id: 'mock-' + Date.now() + '-' + alertData.type,
      cat: alertData.cat,
      title: alertData.instructions,
      desc: alertData.instructions,
      data: alertData.cities
    }
  };
}

// ------------------------------------------
// Initialize components (same as index.js)
// ------------------------------------------
const dedup = new AlertDeduplicator(config.dedupWindowMs);

const whatsapp = new WhatsAppClient({
  groupId: config.whatsappGroupId,
});

// ------------------------------------------
// Central alert handler (copied from index.js)
// ------------------------------------------
async function handleAlert(alert) {
  // At this point the alert matched our cities — always log this
  logger.info(`⚠ MOCK ALERT: ${alert.type} → ${alert.cities.join(', ')}`, {
    id: alert.raw?.id,
    cat: alert.raw?.cat,
    title: alert.raw?.title,
  });

  // Dedup check (don't mark as seen yet)
  if (dedup.isDuplicate(alert)) {
    logger.info('↑ duplicate, skipping');
    return;
  }

  // Generate alert image and send
  let sent;
  try {
    const imageBuffer = await generateAlertImage(alert);
    sent = await whatsapp.sendImage(imageBuffer);
  } catch (err) {
    // No fallback to text - only send images
    logger.warn('Image generation failed, not sending alert', { error: err.message });
    sent = false;
  }

  if (sent) {
    dedup.markSeen(alert);
    logger.info('✓ mock alert sent to WhatsApp');
  } else {
    logger.warn('✗ mock alert NOT sent — queued, will retry on next poll');
  }
}

// ------------------------------------------
// Main
// ------------------------------------------
async function main() {
  logger.info('Initializing WhatsApp for mock alerts...');

  try {
    await whatsapp.initialize();
    logger.info('WhatsApp ready. Sending different mock alerts...');

    for (let i = 0; i < mockAlerts.length; i++) {
      const alertData = mockAlerts[i];
      const mockAlert = createMockAlert(alertData);

      logger.info(`Sending alert ${i + 1}/${mockAlerts.length}: ${alertData.type}`);
      await handleAlert(mockAlert);

      // Wait 5 seconds between alerts
      if (i < mockAlerts.length - 1) {
        logger.info('Waiting 5 seconds before next alert...');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    logger.info('All mock alerts sent. Shutting down...');
    try {
      await Promise.race([
        whatsapp.destroy(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Destroy timeout')), 10000))
      ]);
    } catch (err) {
      logger.warn('WhatsApp destroy timed out or failed, forcing exit', { error: err.message });
    }
    logger.info('Done.');
    process.exit(0);
  } catch (err) {
    logger.error('Error sending mock alerts', { error: err.message });
    process.exit(1);
  }
}

main();