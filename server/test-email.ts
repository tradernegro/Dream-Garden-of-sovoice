import { emailService } from "./services/email-service.js";

async function sendTestEmail() {
  console.log("Sending test email to kerhanking@gmail.com...");
  
  const result = await emailService.sendEmail({
    to: "kerhanking@gmail.com",
    subject: "Terminbestätigung - SoVoice AI",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #f8f9fa; border-radius: 10px; padding: 30px;">
          <h2 style="color: #333; margin-bottom: 20px;">Terminbestätigung</h2>
          
          <div style="background-color: white; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
            <p style="font-size: 18px; color: #333; margin: 0;">
              <strong>Morgen Termin</strong>
            </p>
            <p style="font-size: 24px; color: #ea580c; font-weight: bold; margin: 10px 0;">
              12:00 Uhr
            </p>
            <p style="font-size: 18px; color: #666; margin: 0;">
              📍 Praxis Matrix
            </p>
          </div>
          
          <p style="color: #666; font-size: 14px; margin-top: 20px;">
            Diese E-Mail wurde automatisch von SoVoice AI versendet.
          </p>
        </div>
        
        <p style="color: #999; font-size: 12px; text-align: center; margin-top: 20px;">
          SoVoice AI - Ihr intelligenter Anrufassistent<br>
          info@sovoice.ai
        </p>
      </div>
    `,
    text: "Terminbestätigung\n\nMorgen Termin\n12:00 Uhr\nPraxis Matrix\n\nDiese E-Mail wurde automatisch von SoVoice AI versendet."
  });

  if (result.success) {
    console.log("✅ Test email sent successfully!");
    console.log("Message ID:", result.messageId);
  } else {
    console.error("❌ Failed to send test email:", result.error);
  }
  
  process.exit(result.success ? 0 : 1);
}

// Run the test
sendTestEmail().catch(error => {
  console.error("Error:", error);
  process.exit(1);
});