const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const SERVICE_ACCOUNT_PATH = path.resolve(__dirname, '..', 'tiaras-website-firebase-adminsdk-fbsvc-9428e3c305.json');

if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  console.error('Service account not found at', SERVICE_ACCOUNT_PATH);
  process.exit(2);
}

admin.initializeApp({ credential: admin.credential.cert(require(SERVICE_ACCOUNT_PATH)) });

async function main() {
  const email = process.argv[2] || `e2e_user_${Date.now()}@example.com`;
  const password = process.argv[3] || 'TestPass123!';
  console.log('Creating test user:', email);
  try {
    const user = await admin.auth().createUser({ email, password });
    console.log('Created user:', user.uid);
    console.log('Use these credentials in the client page:');
    console.log('EMAIL:', email);
    console.log('PASSWORD:', password);
  } catch (e) {
    console.error('Failed to create user:', e.message || e);
    process.exit(1);
  }
}

main();
