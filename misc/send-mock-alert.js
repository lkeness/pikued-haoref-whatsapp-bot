const config = require('../src/config');
const logger = require('../src/logger');
const { generateAlertImage } = require('../src/alertImage');
const AlertDeduplicator = require('../src/dedup');
const WhatsAppClient = require('../src/whatsapp-baileys');

if (!config.whatsappGroupId) {
  logger.error('WHATSAPP_GROUP_ID is not set. Run `npm run setup` first, then add it to .env');
  process.exit(1);
}

const mockAlerts = [
  {
    type: 'missiles',
    title: 'ירי רקטות וטילים',
    cities: ['תל אביב', 'חיפה', 'ירושלים'],
    instructions: 'היכנסו למרחב המוגן ושהו בו 10 דקות',
    cat: '1',
  },
  {
    type: 'hostileAircraftIntrusion',
    title: 'חדירת כלי טיס עוין',
    cities: ['באר שבע', 'אשדוד'],
    instructions: 'היכנסו למרחב המוגן ושהו בו 10 דקות',
    cat: '2',
  },
  {
    type: 'newsFlash',
    title: 'מבזק חדשות',
    cities: [],
    instructions: 'עדכון חדש: מצב ביטחוני מתוח בגבול הצפון',
    cat: '10',
  },
  {
    type: 'preAlert',
    title: 'הנחיה מקדימה',
    cities: ['גליל עליון', 'גולן'],
    instructions: 'התכוננו להיכנס למרחב המוגן',
    cat: '14',
  },
  {
    type: 'eventEnded',
    title: 'האירוע הסתיים',
    cities: ['תל אביב', 'חיפה', 'ירושלים'],
    instructions: 'האירוע הסתיים - חזרה לשגרה',
    cat: '13',
  },
];

function createMockAlert(alertData) {
  const id = `mock-${Date.now()}-${alertData.type}`;
  return {
    id,
    cat: alertData.cat,
    title: alertData.title,
    cities: alertData.cities,
    instructions: alertData.instructions,
    source: 'manual_test',
    raw: {
      id,
      cat: alertData.cat,
      title: alertData.title,
      desc: alertData.instructions,
      data: alertData.cities,
    },
  };
}

const dedup = new AlertDeduplicator(config.dedupWindowMs);

const whatsapp = new WhatsAppClient({
  groupId: config.whatsappGroupId,
});

async function handleAlert(alert) {
  logger.info(`⚠ MOCK ALERT: ${alert.cat} → ${(alert.cities || []).join(', ')}`, {
    id: alert.raw?.id,
    cat: alert.cat,
    title: alert.title,
  });

  if (dedup.isDuplicate(alert)) {
    logger.info('Duplicate, skipping');
    return;
  }

  let sent;
  try {
    const imageBuffer = await generateAlertImage(alert);
    sent = await whatsapp.sendImage(imageBuffer);
  } catch (err) {
    logger.warn('Image generation failed', { error: err.message });
    sent = false;
  }

  if (sent) {
    dedup.markSeen(alert);
    logger.info('Mock alert sent');
  } else {
    logger.warn('Mock alert NOT sent');
  }
}

async function main() {
  logger.info('Initializing WhatsApp for mock alerts...');

  try {
    await whatsapp.initialize();
    logger.info('WhatsApp ready. Sending mock alerts...');

    for (let i = 0; i < mockAlerts.length; i++) {
      const mockAlert = createMockAlert(mockAlerts[i]);
      logger.info(`Sending alert ${i + 1}/${mockAlerts.length}: ${mockAlerts[i].type}`);
      await handleAlert(mockAlert);

      if (i < mockAlerts.length - 1) {
        logger.info('Waiting 5 seconds...');
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }

    logger.info('All mock alerts sent. Shutting down...');
    try {
      await Promise.race([
        whatsapp.destroy(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Destroy timeout')), 10000)),
      ]);
    } catch (err) {
      logger.warn('Destroy timed out', { error: err.message });
    }
    logger.info('Done.');
    process.exit(0);
  } catch (err) {
    logger.error('Error sending mock alerts', { error: err.message });
    process.exit(1);
  }
}

main();
