# SoVoice AI - API Integration Guide

## Übersicht

Diese Anleitung zeigt Ihnen, wie Sie SoVoice AI in Ihre externe Webseite integrieren können, um automatische Telefonanrufe durchzuführen.

## 1. API-Key erstellen

1. Gehen Sie zu **Settings** in Ihrer SoVoice AI Anwendung
2. Scrollen Sie zum Bereich **API Keys**
3. Klicken Sie auf **Create Key**
4. Geben Sie einen Namen ein (z.B. "Meine Webseite")
5. Klicken Sie auf **Generate Key**
6. **WICHTIG:** Kopieren Sie den API-Key sofort - er wird nur einmal angezeigt!

Ihr API-Key sieht so aus: `sk_live_abc123...`

## 2. API-Endpunkt für ausgehende Anrufe

### Endpunkt
```
POST https://[IHR-REPLIT-DOMAIN]/api/calls
```

### Header
```
Authorization: Bearer sk_live_[IHR-API-KEY]
Content-Type: application/json
```

### Request Body
```json
{
  "phoneNumber": "+4915112345678",
  "direction": "outbound",
  "agentId": "optional-agent-id"
}
```

### Beispiel-Response (Erfolg)
```json
{
  "id": "call-123",
  "phoneNumber": "+4915112345678",
  "direction": "outbound",
  "status": "queued",
  "createdAt": "2025-01-19T19:00:00.000Z"
}
```

### Beispiel-Response (Fehler)
```json
{
  "error": "Invalid API key"
}
```

## 3. HTML/JavaScript Beispiel

Hier ist ein vollständiges Beispiel für Ihre Webseite:

```html
<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SoVoice AI Beratung</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 600px;
            margin: 50px auto;
            padding: 20px;
        }
        .form-group {
            margin-bottom: 15px;
        }
        label {
            display: block;
            margin-bottom: 5px;
            font-weight: bold;
        }
        input {
            width: 100%;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 16px;
        }
        button {
            background-color: #4CAF50;
            color: white;
            padding: 12px 30px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 16px;
            width: 100%;
        }
        button:hover {
            background-color: #45a049;
        }
        button:disabled {
            background-color: #cccccc;
            cursor: not-allowed;
        }
        .status {
            margin-top: 20px;
            padding: 15px;
            border-radius: 4px;
            display: none;
        }
        .status.success {
            background-color: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }
        .status.error {
            background-color: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }
    </style>
</head>
<body>
    <h1>Kostenlose AI-Beratung</h1>
    <p>Geben Sie Ihren Namen und Ihre Telefonnummer ein, und wir rufen Sie sofort für eine kostenlose Beratung an!</p>
    
    <form id="callForm">
        <div class="form-group">
            <label for="name">Ihr Name:</label>
            <input type="text" id="name" name="name" required placeholder="Max Mustermann">
        </div>
        
        <div class="form-group">
            <label for="phone">Ihre Telefonnummer:</label>
            <input type="tel" id="phone" name="phone" required placeholder="+49 151 12345678">
        </div>
        
        <button type="submit" id="submitBtn">Jetzt anrufen lassen</button>
    </form>
    
    <div id="status" class="status"></div>

    <script>
        // WICHTIG: Ersetzen Sie diese Werte mit Ihren eigenen!
        const API_KEY = 'sk_live_[IHR-API-KEY]';
        const API_ENDPOINT = 'https://[IHR-REPLIT-DOMAIN]/api/calls';

        document.getElementById('callForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const submitBtn = document.getElementById('submitBtn');
            const statusDiv = document.getElementById('status');
            const phoneInput = document.getElementById('phone');
            const nameInput = document.getElementById('name');
            
            // Button deaktivieren während des Requests
            submitBtn.disabled = true;
            submitBtn.textContent = 'Anruf wird initiiert...';
            statusDiv.style.display = 'none';
            
            try {
                const response = await fetch(API_ENDPOINT, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${API_KEY}`
                    },
                    body: JSON.stringify({
                        phoneNumber: phoneInput.value,
                        direction: 'outbound',
                        metadata: {
                            name: nameInput.value,
                            source: 'website'
                        }
                    })
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    // Erfolg!
                    statusDiv.className = 'status success';
                    statusDiv.style.display = 'block';
                    statusDiv.textContent = `Perfekt, ${nameInput.value}! Wir rufen Sie gleich an der Nummer ${phoneInput.value} an.`;
                    
                    // Formular zurücksetzen
                    document.getElementById('callForm').reset();
                } else {
                    // Fehler vom Server
                    throw new Error(data.error || 'Unbekannter Fehler');
                }
            } catch (error) {
                // Fehler anzeigen
                statusDiv.className = 'status error';
                statusDiv.style.display = 'block';
                statusDiv.textContent = `Fehler: ${error.message}. Bitte versuchen Sie es erneut oder kontaktieren Sie uns.`;
                console.error('API Error:', error);
            } finally {
                // Button wieder aktivieren
                submitBtn.disabled = false;
                submitBtn.textContent = 'Jetzt anrufen lassen';
            }
        });
    </script>
</body>
</html>
```

## 4. Wichtige Hinweise

### Sicherheit
- **Bewahren Sie Ihren API-Key sicher auf!** Teilen Sie ihn niemandem mit
- Für produktive Webseiten sollten Sie den API-Key auf Ihrem eigenen Server speichern, nicht im Frontend-Code
- Der API-Key ermöglicht es, Anrufe zu tätigen - schützen Sie ihn wie ein Passwort

### Telefonnummer-Format
- Verwenden Sie das internationale Format: `+[Ländervorwahl][Nummer]`
- Deutschland: `+4915112345678`
- Schweiz: `+41791234567`
- Österreich: `+436641234567`

### Rate Limits
- Vermeiden Sie zu viele Anfragen in kurzer Zeit
- Implementieren Sie eine "Cooldown"-Periode nach jedem Anruf

### Error Handling
Mögliche Fehlermeldungen:
- `Invalid API key` - API-Key ist ungültig oder fehlt
- `API key has expired` - API-Key ist abgelaufen
- `Missing or invalid Authorization header` - Authorization Header fehlt oder ist falsch formatiert

## 5. Backend-Integration (Empfohlen für Produktion)

Für produktive Systeme empfehlen wir, den API-Key auf Ihrem eigenen Backend-Server zu speichern:

### PHP Beispiel
```php
<?php
// config.php
define('SOVOICE_API_KEY', 'sk_live_[IHR-API-KEY]');
define('SOVOICE_API_ENDPOINT', 'https://[IHR-REPLIT-DOMAIN]/api/calls');

// call.php
<?php
require_once 'config.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$data = json_decode(file_get_contents('php://input'), true);

$phoneNumber = $data['phoneNumber'] ?? '';
$name = $data['name'] ?? '';

if (empty($phoneNumber)) {
    http_response_code(400);
    echo json_encode(['error' => 'Phone number is required']);
    exit;
}

$ch = curl_init(SOVOICE_API_ENDPOINT);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
    'Authorization: Bearer ' . SOVOICE_API_KEY
]);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
    'phoneNumber' => $phoneNumber,
    'direction' => 'outbound',
    'metadata' => [
        'name' => $name,
        'source' => 'website'
    ]
]));

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

http_response_code($httpCode);
echo $response;
?>
```

## 6. Testen

Sie können die API auch mit `curl` testen:

```bash
curl -X POST https://[IHR-REPLIT-DOMAIN]/api/calls \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk_live_[IHR-API-KEY]" \
  -d '{
    "phoneNumber": "+4915112345678",
    "direction": "outbound"
  }'
```

## Support

Bei Fragen oder Problemen:
1. Überprüfen Sie, ob Ihr API-Key korrekt ist
2. Stellen Sie sicher, dass das Telefonnummer-Format korrekt ist
3. Prüfen Sie die Browser-Konsole auf Fehler
4. Kontaktieren Sie den Support

---

**Viel Erfolg mit Ihrer Integration!** 🚀
