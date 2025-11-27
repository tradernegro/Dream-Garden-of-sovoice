# Replit ↔ Cursor Synchronisation Guide

## Option 1: Git-Integration (Empfohlen)

### Schritt 1: Git in Replit einrichten

1. In Replit Terminal öffnen
2. Git initialisieren (falls noch nicht geschehen):
```bash
git init
git config user.name "Dein Name"
git config user.email "deine@email.com"
```

3. Dateien committen:
```bash
git add .
git commit -m "Initial commit"
```

4. GitHub/GitLab Repository erstellen und verbinden:
```bash
git remote add origin https://github.com/dein-username/dein-repo.git
git branch -M main
git push -u origin main
```

### Schritt 2: Lokal klonen

```bash
cd ~/Desktop
git clone https://github.com/dein-username/dein-repo.git DreamGardenMagic
cd DreamGardenMagic
```

### Schritt 3: Workflow für Synchronisation

**Von Cursor → Replit:**
```bash
# In Cursor/Terminal:
git add .
git commit -m "Beschreibung der Änderungen"
git push

# In Replit Terminal:
git pull
```

**Von Replit → Cursor:**
```bash
# In Replit Terminal:
git add .
git commit -m "Beschreibung der Änderungen"
git push

# In Cursor/Terminal:
git pull
```

---

## Option 2: Replit CLI (Direkte Synchronisation)

### Installation

```bash
npm install -g @replit/cli
```

### Authentifizierung

```bash
replit auth
```

### Projekt verbinden

```bash
# In deinem lokalen Projekt-Verzeichnis:
replit sync <deine-replit-repl-id>
```

### Synchronisation

```bash
# Von lokal → Replit:
replit push

# Von Replit → lokal:
replit pull
```

---

## Option 3: Manuelle Datei-Synchronisation

### Mit rsync (falls SSH-Zugriff auf Replit)

```bash
# Von lokal → Replit:
rsync -avz --exclude 'node_modules' --exclude 'dist' \
  ./ replit-user@replit-host:/path/to/project/

# Von Replit → lokal:
rsync -avz --exclude 'node_modules' --exclude 'dist' \
  replit-user@replit-host:/path/to/project/ ./
```

---

## Option 4: VS Code Remote Development (Erweitert)

1. VS Code Remote-SSH Extension installieren
2. SSH-Zugriff auf Replit einrichten
3. Projekt direkt in VS Code öffnen
4. Cursor kann dann auf die gleichen Dateien zugreifen

---

## Empfohlener Workflow

1. **Git als Single Source of Truth verwenden**
2. **Lokale Entwicklung in Cursor** (bessere AI-Integration)
3. **Testing/Deployment in Replit** (bessere Deployment-Integration)
4. **Regelmäßig pushen/pullen** um beide Umgebungen synchron zu halten

---

## Wichtige Hinweise

- **node_modules** und **dist** sollten in `.gitignore` sein (sind bereits drin)
- **Environment Variables** müssen in beiden Umgebungen separat konfiguriert werden
- **Database Migrations** sollten über Git synchronisiert werden
- **Secrets** niemals in Git committen!

