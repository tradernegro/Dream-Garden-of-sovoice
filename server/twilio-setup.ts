import twilio from 'twilio';

async function setupTwilioWebhooks() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const phoneNumber = process.env.TWILIO_PHONE_NUMBER;
  
  if (!accountSid || !authToken || !phoneNumber) {
    console.error('Missing Twilio credentials');
    return;
  }
  
  const client = twilio(accountSid, authToken);
  
  // Get the domain for webhook URLs
  const domain = process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS?.split(',')[0];
  if (!domain) {
    console.error('Could not determine application domain');
    return;
  }
  
  const baseUrl = `https://${domain}`;
  const voiceUrl = `${baseUrl}/api/twilio/voice`;
  const statusUrl = `${baseUrl}/api/twilio/status`;
  
  console.log('🔄 Setting up Twilio webhooks...');
  console.log(`📞 Phone Number: ${phoneNumber}`);
  console.log(`🔗 Voice URL: ${voiceUrl}`);
  console.log(`📊 Status URL: ${statusUrl}`);
  
  try {
    // Find the phone number resource
    const phoneNumbers = await client.incomingPhoneNumbers.list({
      phoneNumber: phoneNumber
    });
    
    if (phoneNumbers.length === 0) {
      console.error(`❌ Phone number ${phoneNumber} not found in your Twilio account`);
      return;
    }
    
    const phoneResource = phoneNumbers[0];
    console.log(`✅ Found phone number with SID: ${phoneResource.sid}`);
    
    // Update the phone number configuration
    await client.incomingPhoneNumbers(phoneResource.sid).update({
      voiceUrl: voiceUrl,
      voiceMethod: 'POST',
      statusCallback: statusUrl,
      statusCallbackMethod: 'POST',
      voiceFallbackUrl: voiceUrl,
      voiceFallbackMethod: 'POST'
    });
    
    console.log('✅ Twilio webhooks configured successfully!');
    console.log('\n📝 Configuration Summary:');
    console.log(`- Incoming calls will be handled by: ${voiceUrl}`);
    console.log(`- Call status updates will be sent to: ${statusUrl}`);
    console.log('\n🎉 Your phone number is now ready to receive calls!');
    
    // Also add the phone number to our database
    console.log('\n📱 Adding phone number to database...');
    const response = await fetch(`${baseUrl}/api/phone-numbers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phoneNumber: phoneNumber,
        friendlyName: 'Main Twilio Line',
        status: 'active',
        monthlyFee: '1.00',
        voiceEnabled: true,
        smsEnabled: false,
        mmsEnabled: false,
        faxEnabled: false,
        metadata: {
          twilioSid: phoneResource.sid,
          country: phoneResource.country,
          city: phoneResource.locality,
          state: phoneResource.region
        }
      })
    });
    
    if (response.ok) {
      console.log('✅ Phone number added to database');
    } else {
      const errorText = await response.text();
      console.log('⚠️ Note: Phone number may already exist in database:', errorText);
    }
    
  } catch (error) {
    console.error('❌ Error configuring Twilio webhooks:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message);
    }
  }
}

// Run the setup
setupTwilioWebhooks().then(() => {
  console.log('\n✅ Twilio setup complete!');
  process.exit(0);
}).catch((error) => {
  console.error('Setup failed:', error);
  process.exit(1);
});