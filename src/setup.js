require('dotenv').config();

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  delay,
} = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const { FALLBACK_WA_VERSION, SESSION_DIR, WA_BROWSER_ID, SETUP_DELAY_MS } = require('./constants');

console.log('===========================================');
console.log('  Red Alert WhatsApp Bot — Setup');
console.log('===========================================');
console.log('');
console.log('This will connect to WhatsApp and list');
console.log('all your groups so you can find the group ID.');
console.log('');

function displayGroups(groups) {
  if (groups.length === 0) {
    console.log('\n❌ No groups found. Make sure your account has groups.');
    return;
  }

  console.log('\n===========================================');
  console.log(`  Found ${groups.length} groups:`);
  console.log('===========================================\n');

  for (const group of groups) {
    console.log(`  📌 "${group.name}"`);
    console.log(`     ID: ${group.id}`);
    console.log('');
  }

  console.log('===========================================');
  console.log('');
  console.log('Copy the ID of the group you want alerts');
  console.log('sent to, and paste it into your .env file:');
  console.log('');
  console.log('  WHATSAPP_GROUP_ID=<paste ID here>');
  console.log('');
  console.log('===========================================');
}

async function setup() {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

  let version = FALLBACK_WA_VERSION;
  try {
    const result = await fetchLatestBaileysVersion();
    if (result?.version) version = result.version;
  } catch {
    // use fallback
  }

  const sock = makeWASocket({
    auth: state,
    version,
    printQRInTerminal: false,
    browser: WA_BROWSER_ID,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n📱 Scan this QR code with WhatsApp on your phone:\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      if (statusCode === DisconnectReason.loggedOut) {
        console.error('❌ Logged out. Delete ./whatsapp-session-baileys/ and try again.');
        process.exit(1);
      } else {
        console.log(`⚠️  Connection closed (${statusCode}), reconnecting...`);
        await delay(SETUP_DELAY_MS);
        setup();
      }
      return;
    }

    if (connection === 'open') {
      console.log('\n✅ WhatsApp is connected!');
      console.log('⏳ Fetching groups...\n');

      try {
        await delay(SETUP_DELAY_MS);

        const groupData = await sock.groupFetchAllParticipating();
        const groups = Object.values(groupData).map((g) => ({
          name: g.subject,
          id: g.id,
        }));

        displayGroups(groups);
      } catch (err) {
        console.error('❌ Error fetching groups:', err.message);
        console.log('');
        console.log('   Alternative method:');
        console.log('   1. Keep this script running');
        console.log('   2. Send "!groupid" in the WhatsApp group');
        console.log('   3. The ID will appear here in the console\n');
        console.log('   Waiting for !groupid messages...');

        sock.ev.on('messages.upsert', async ({ messages }) => {
          for (const msg of messages) {
            if (!msg.message) continue;
            const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
            if (text === '!groupid' && msg.key.remoteJid.endsWith('@g.us')) {
              const groupId = msg.key.remoteJid;
              console.log(`\n📌 Group ID detected from message:`);
              console.log(`   Group: ${groupId}`);
              console.log(`   Copy this into your .env as WHATSAPP_GROUP_ID\n`);
              await sock.sendMessage(groupId, {
                text: `Group ID: ${groupId}`,
              });
            }
          }
        });
        return;
      }

      sock.end(undefined);
      process.exit(0);
    }
  });
}

setup().catch((err) => {
  console.error('❌ Setup failed:', err);
  process.exit(1);
});
