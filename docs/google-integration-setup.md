# Google Calendar & Gmail Integration Setup

Die Google Integration wurde vollständig in Ihrer Anwendung implementiert. Um sie zu aktivieren, müssen Sie nur noch die Google OAuth Credentials einrichten.

## 🎯 Was wurde implementiert

### Für jedes Projekt können Sie:
- **Google Account verbinden** - Jedes Projekt kann seinen eigenen Google Account haben
- **Google Calendar Integration**
  - Termine anzeigen
  - Neue Termine erstellen
  - Termine bearbeiten und löschen
- **Gmail Integration**  
  - E-Mails lesen
  - E-Mails senden
  - E-Mail-Verlauf anzeigen

### UI Features
- Neuer "Google" Tab in der Projekt-Detailansicht
- Übersichtliche Anzeige des Verbindungsstatus
- Ein-Klick Verbindung/Trennung
- Kalenderansicht mit den nächsten 5 Terminen
- E-Mail-Übersicht mit den neuesten Nachrichten
- Dialoge zum Erstellen von Terminen und Senden von E-Mails

## 📝 Anleitung zur Einrichtung der Google OAuth Credentials

### Schritt 1: Google Cloud Console öffnen
1. Gehen Sie zu https://console.cloud.google.com/
2. Melden Sie sich mit Ihrem Google Account an

### Schritt 2: Projekt erstellen
1. Klicken Sie oben auf "Projekt auswählen"
2. Klicken Sie auf "Neues Projekt"
3. Geben Sie einen Projektnamen ein (z.B. "SoVoice Integration")
4. Klicken Sie auf "Erstellen"

### Schritt 3: APIs aktivieren
1. Gehen Sie zu "APIs & Dienste" → "Bibliothek"
2. Suchen Sie nach "Google Calendar API" und klicken Sie darauf
3. Klicken Sie auf "Aktivieren"
4. Wiederholen Sie dies für "Gmail API"

### Schritt 4: OAuth Consent Screen konfigurieren
1. Gehen Sie zu "APIs & Dienste" → "OAuth-Zustimmungsbildschirm"
2. Wählen Sie "Extern" und klicken Sie auf "Erstellen"
3. Füllen Sie aus:
   - App-Name: "SoVoice AI"
   - Support-E-Mail: Ihre E-Mail
   - Entwickler-Kontakt-E-Mail: Ihre E-Mail
4. Klicken Sie auf "Speichern und fortfahren"
5. Bei "Bereiche" klicken Sie auf "Bereiche hinzufügen oder entfernen"
6. Suchen und wählen Sie:
   - `https://www.googleapis.com/auth/calendar`
   - `https://www.googleapis.com/auth/gmail.modify`
7. Klicken Sie auf "Aktualisieren" und dann "Speichern und fortfahren"
8. Bei "Testnutzer" können Sie Ihre E-Mail hinzufügen
9. Klicken Sie auf "Speichern und fortfahren"

### Schritt 5: OAuth 2.0 Credentials erstellen
1. Gehen Sie zu "APIs & Dienste" → "Anmeldedaten"
2. Klicken Sie auf "Anmeldedaten erstellen" → "OAuth-Client-ID"
3. Wählen Sie "Webanwendung"
4. Name: "SoVoice Web Client"
5. Unter "Autorisierte Weiterleitungs-URIs" fügen Sie hinzu:
   - Für lokale Entwicklung: `http://localhost:5000/api/google/callback`
   - Für Produktion: `https://ihre-domain.replit.app/api/google/callback`
6. Klicken Sie auf "Erstellen"
7. **WICHTIG**: Kopieren Sie die Client-ID und das Client-Secret

### Schritt 6: Environment Variables einrichten
Fügen Sie diese Umgebungsvariablen in Replit hinzu:
```
GOOGLE_CLIENT_ID=ihre-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=ihr-client-secret
GOOGLE_REDIRECT_URI=http://localhost:5000/api/google/callback
```

Für Produktion ändern Sie GOOGLE_REDIRECT_URI zu:
```
GOOGLE_REDIRECT_URI=https://ihre-domain.replit.app/api/google/callback
```

## 🚀 Verwendung

Nach der Einrichtung:
1. Öffnen Sie ein Projekt
2. Gehen Sie zum "Google" Tab
3. Klicken Sie auf "Connect Google Account"
4. Autorisieren Sie die App in Google
5. Sie werden zurück zur App geleitet und können nun:
   - Kalendertermine verwalten
   - E-Mails senden und empfangen

## 🔒 Sicherheit

- OAuth Tokens werden verschlüsselt in der Datenbank gespeichert
- Jedes Projekt hat seine eigenen Tokens
- Tokens können jederzeit widerrufen werden
- Refresh Tokens ermöglichen langfristige Verbindungen

## 📌 Wichtige Hinweise

- Im Testmodus laufen Refresh Tokens nach 7 Tagen ab
- Für Produktion sollte die App bei Google verifiziert werden
- Stellen Sie sicher, dass alle Redirect URIs korrekt konfiguriert sind
- Die Tokens sind projektspezifisch - jedes Projekt kann einen anderen Google Account verwenden

## 🛠 Troubleshooting

### "Google account not connected" Fehler
- Stellen Sie sicher, dass die Environment Variables gesetzt sind
- Überprüfen Sie, ob die Redirect URI korrekt ist

### OAuth Fehler beim Verbinden
- Überprüfen Sie die Client ID und Secret
- Stellen Sie sicher, dass die APIs aktiviert sind
- Prüfen Sie, ob die Redirect URI in Google Console eingetragen ist

### Token läuft ab
- Im Testmodus normal nach 7 Tagen
- App für Produktion verifizieren lassen für dauerhafte Tokens