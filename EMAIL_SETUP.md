# E-Mail Konfiguration für SoVoice AI

## 🚀 Schnellstart mit GoDaddy

Da Sie Ihre E-Mail `info@sovoice.ai` bei GoDaddy haben, ist das die **einfachste Lösung**!

### Schritt 1: GoDaddy E-Mail Passwort finden

1. Loggen Sie sich bei GoDaddy ein: https://www.godaddy.com
2. Gehen Sie zu "My Products" → "Email & Office"
3. Klicken Sie auf "Manage" bei Ihrer E-Mail
4. Das Passwort ist das gleiche, das Sie für Webmail verwenden

### Schritt 2: Umgebungsvariablen in Replit setzen

1. In Replit, klicken Sie auf das **🔒 Secrets** Icon (links in der Sidebar)
2. Fügen Sie diese Secrets hinzu:

```
EMAIL_PROVIDER = godaddy
GODADDY_EMAIL = info@sovoice.ai
GODADDY_PASSWORD = [Ihr E-Mail Passwort]
GODADDY_REGION = us
```

**Wichtig für GODADDY_REGION:**
- `us` für USA (Standard)
- `europe` für Europa
- `asia` für Asien

### Schritt 3: Testen

1. Öffnen Sie die **Settings** Seite in Ihrer App
2. Scrollen Sie zu "Microsoft Outlook" (E-Mail Einstellungen)
3. Klicken Sie auf **"Verbindung testen"**
4. Sie sollten eine Test-E-Mail erhalten!

## 🎯 Alternative: SendGrid (Kostenlos)

Falls GoDaddy nicht funktioniert, nutzen Sie SendGrid:

### SendGrid einrichten:

1. Kostenlosen Account erstellen: https://sendgrid.com
2. API Key generieren: Settings → API Keys → Create API Key
3. Domain verifizieren (optional aber empfohlen)

### In Replit konfigurieren:

```
EMAIL_PROVIDER = sendgrid
SENDGRID_API_KEY = [Ihr API Key]
EMAIL_ADDRESS = info@sovoice.ai
```

## 🔧 Beliebiger SMTP Server

Für andere E-Mail-Anbieter:

```
EMAIL_PROVIDER = smtp
SMTP_HOST = [mail.server.com]
SMTP_PORT = 587
SMTP_USER = [ihre-email@domain.com]
SMTP_PASSWORD = [ihr-passwort]
```

## ❓ Häufige Probleme

### "Authentication failed"
- Überprüfen Sie das Passwort
- Bei GoDaddy: Nutzen Sie das Webmail-Passwort
- Manche Anbieter brauchen App-Passwörter

### "Connection refused"
- Firewall oder falscher Port
- GoDaddy nutzt Port 465 (SSL)
- Die meisten anderen nutzen Port 587 (TLS)

### Test-E-Mail kommt nicht an
- Prüfen Sie den Spam-Ordner
- Verifizieren Sie die Absender-Domain bei SendGrid

## 💡 Tipps

1. **GoDaddy ist am einfachsten** wenn Sie dort Ihre Domain/E-Mail haben
2. **SendGrid ist zuverlässiger** für viele E-Mails (100 kostenlos pro Tag)
3. **Microsoft/Outlook** funktioniert NICHT gut in Replit wegen OAuth-Beschränkungen

## Brauchen Sie Hilfe?

Die App zeigt Ihnen in den **Settings** detaillierte Fehlermeldungen an.
Klicken Sie einfach auf "Verbindung testen" um zu sehen, was los ist!