const config = require('../src/config');
const logger = require('../src/logger');
const { generateAlertImage } = require('../src/alertImage');
const WhatsAppClient = require('../src/whatsapp-baileys');

const mockAlerts = [
  {
    cat: '1',
    title: 'ירי רקטות וטילים',
    cities: ['תל אביב', 'חיפה', 'ירושלים'],
    instructions: 'היכנסו למרחב המוגן ושהו בו 10 דקות',
    source: 'manual_test',
    raw: {},
  },
  {
    cat: '6',
    title: 'חדירת כלי טיס עוין',
    cities: ['באר שבע', 'אשדוד'],
    instructions: 'היכנסו למרחב המוגן ושהו בו 10 דקות',
    source: 'manual_test',
    raw: {},
  },
  {
    cat: '10',
    title: 'מבזק חדשות',
    cities: [],
    instructions: 'עדכון חדש: מצב ביטחוני מתוח בגבול הצפון',
    source: 'manual_test',
    raw: {},
  },
  {
    cat: '10',
    title: 'האירוע הסתיים',
    cities: ['תל אביב', 'חיפה', 'ירושלים'],
    instructions: 'האירוע הסתיים - חזרה לשגרה',
    source: 'manual_test',
    raw: {},
  },
];

async function main() {
  const whatsapp = new WhatsAppClient({ groupId: config.whatsappGroupId });
  await whatsapp.initialize();
  logger.info('WhatsApp ready. Sending mock alerts...');

  for (let i = 0; i < mockAlerts.length; i++) {
    const alert = { ...mockAlerts[i], id: `mock-${Date.now()}-${i}` };
    logger.info(`Sending ${i + 1}/${mockAlerts.length}: ${alert.title}`);

    try {
      const imageBuffer = await generateAlertImage(alert);
      await whatsapp.sendImage(imageBuffer);
    } catch (err) {
      logger.warn('Image send failed', { error: err.message });
    }

    if (i < mockAlerts.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }

  logger.info('All mock alerts sent.');
  await whatsapp.destroy().catch(() => {});
  process.exit(0);
}

main().catch((err) => {
  logger.error('Mock alert error', { error: err.message });
  process.exit(1);
});
