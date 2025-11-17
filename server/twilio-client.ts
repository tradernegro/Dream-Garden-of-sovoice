// Twilio integration using the connector blueprint
import twilio from 'twilio';

let connectionSettings: any;
let cachedCredentials: any = null;

async function getCredentials() {
  // Return cached credentials if available
  if (cachedCredentials) {
    return cachedCredentials;
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    console.error('❌ Twilio Auth Error: X_REPLIT_TOKEN not found');
    throw new Error('Twilio authentication failed: Missing Replit token. Please reconnect Twilio in the Secrets/Integrations panel.');
  }

  if (!hostname) {
    console.error('❌ Twilio Auth Error: REPLIT_CONNECTORS_HOSTNAME not found');
    throw new Error('Twilio authentication failed: Connector hostname missing.');
  }

  console.log('🔄 Fetching Twilio credentials from connector...');

  const response = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=twilio',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  );

  if (!response.ok) {
    console.error(`❌ Twilio Connector Error: HTTP ${response.status}`);
    const errorText = await response.text();
    console.error('Response:', errorText);
    throw new Error(`Twilio authentication failed (HTTP ${response.status}). Please reconnect Twilio in the Integrations panel.`);
  }

  const data = await response.json();
  connectionSettings = data.items?.[0];

  if (!connectionSettings) {
    console.error('❌ Twilio Error: No connection settings found');
    console.error('Response data:', JSON.stringify(data, null, 2));
    throw new Error('Twilio not connected. Please set up Twilio integration in the Integrations panel.');
  }

  const settings = connectionSettings.settings;
  if (!settings.account_sid || !settings.api_key || !settings.api_key_secret) {
    console.error('❌ Twilio Error: Missing required credentials');
    console.error('Available settings:', Object.keys(settings));
    throw new Error('Twilio credentials incomplete. Please reconnect Twilio in the Integrations panel.');
  }

  console.log('✅ Twilio credentials loaded successfully');

  cachedCredentials = {
    accountSid: settings.account_sid,
    apiKey: settings.api_key,
    apiKeySecret: settings.api_key_secret,
    phoneNumber: settings.phone_number
  };

  return cachedCredentials;
}

export async function getTwilioClient() {
  const { accountSid, apiKey, apiKeySecret } = await getCredentials();
  return twilio(apiKey, apiKeySecret, {
    accountSid: accountSid
  });
}

export async function getTwilioFromPhoneNumber() {
  const { phoneNumber } = await getCredentials();
  return phoneNumber;
}
