// Twilio integration using environment variables (Secrets)
import twilio from 'twilio';

let cachedCredentials: any = null;

async function getCredentials() {
  // Return cached credentials if available
  if (cachedCredentials) {
    return cachedCredentials;
  }

  console.log('🔄 Loading Twilio credentials from environment...');

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const phoneNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !phoneNumber) {
    console.error('❌ Twilio Error: Missing environment variables');
    console.error('Required: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER');
    throw new Error('Twilio not configured. Please add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER to Secrets.');
  }

  console.log('✅ Twilio credentials loaded successfully');
  console.log(`📞 Phone number: ${phoneNumber}`);

  cachedCredentials = {
    accountSid,
    authToken,
    phoneNumber
  };

  return cachedCredentials;
}

export async function getTwilioClient() {
  const { accountSid, authToken } = await getCredentials();
  return twilio(accountSid, authToken);
}

export async function getTwilioFromPhoneNumber() {
  const { phoneNumber } = await getCredentials();
  return phoneNumber;
}
