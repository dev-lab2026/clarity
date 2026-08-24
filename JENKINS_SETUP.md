# 📋 Guide de Configuration Jenkins pour Clarity

## 🔧 Installation de NodeJS dans Jenkins

### **Option 1 : Configuration Automatique (Recommandée)**

#### Étape 1 : Installer le plugin NodeJS

1. Allez sur : `http://jenkins:8080/manage/pluginManager/available`
2. Cherchez **"NodeJS Plugin"**
3. Installez-le et redémarrez Jenkins

#### Étape 2 : Configurer NodeJS Tool

1. Allez sur : `http://jenkins:8080/manage/configureSystem/`
2. Descendez jusqu'à **"NodeJS"**
3. Cliquez sur **"Add NodeJS"**
4. Configurez :
   - **Name** : `nodejs-18`
   - **Version** : `18.x`
   - **Global npm packages** : (laisser vide)
   - ✅ **Automatically install and put on PATH**
5. Cliquez **"Save"**

---

### **Option 2 : Docker Agent avec Node.js (Meilleure pour la portabilité)**

#### Étape 1 : Build l'image Docker

```bash
cd clarity
docker build -f Dockerfile.jenkins-agent -t jenkins-agent-nodejs:latest .
```

#### Étape 2 : Utiliser l'image dans Jenkins

Modifiez le Jenkinsfile :

```groovy
pipeline {
    agent {
        docker {
            image 'jenkins-agent-nodejs:latest'
            args '-v /var/run/docker.sock:/var/run/docker.sock'
        }
    }
    // reste du pipeline...
}
```

---

### **Option 3 : Installation manuelle sur l'agent**

Si vous utilisez un agent Linux, exécutez sur la machine Jenkins :

```bash
# Installation Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Vérification
node --version
npm --version
```

---

## 🔑 Configuration des Credentials GitHub

### Étape 1 : Créer un PAT GitHub

1. Allez sur : https://github.com/settings/tokens
2. **"Generate new token (classic)"**
3. Cochez les scopes :
   - ✅ `repo` (accès complet)
   - ✅ `admin:repo_hook` (webhooks)
4. **Générez et copiez** le token

### Étape 2 : Ajouter les Credentials dans Jenkins

1. Allez sur : `http://jenkins:8080/credentials/store/system/domain/_/newCredentials`
2. **Kind** : `Username with password`
3. **Username** : `dev-lab2026`
4. **Password** : Collez votre token PAT
5. **ID** : `github-credentials`
6. **Save**

---

## 🔗 Configuration du Webhook GitHub

### Étape 1 : Activer GitHub Plugin dans Jenkins

1. `Manage Jenkins` → `Plugin Manager`
2. Installez **"GitHub plugin"**

### Étape 2 : Configurer le Webhook

1. Allez sur : https://github.com/dev-lab2026/clarity/settings/hooks
2. **"Add webhook"**
3. Configurez :
   - **Payload URL** : `http://your-jenkins:8080/github-webhook/`
   - **Content type** : `application/json`
   - **Events** : Cochez "Just the push event"
   - **Active** : ✅
4. **Add webhook**

### Étape 3 : Tester le Webhook

```bash
# Dans le dépôt local
git push origin main

# Vérifier dans Jenkins que le build s'est déclenché
```

---

## 📊 Configuration du Job Jenkins

### Créer un Pipeline Job

1. **New Item** → **Pipeline**
2. **Name** : `clarity`
3. **Build Triggers** :
   - ✅ **GitHub hook trigger for GITScm polling**
4. **Pipeline** :
   - **Definition** : "Pipeline script from SCM"
   - **SCM** : Git
   - **Repository URL** : `https://github.com/dev-lab2026/clarity.git`
   - **Credentials** : Sélectionnez `github-credentials`
   - **Branch** : `*/main`
   - **Script Path** : `Jenkinsfile`
5. **Save**

---

## ✅ Vérification

### Test du Build

```bash
# Faire un push pour déclencher le build
git push origin main

# Vérifier les logs Jenkins
http://jenkins:8080/job/clarity/lastBuild/console
```

### Logs attendus

```
🔄 Cloning repository with GitHub credentials...
⚙️  Setting up environment...
+ node --version
v18.x.x
+ npm --version
9.x.x
📦 Installing dependencies...
🔨 Building application...
✅ Running tests...
📦 Archiving build artifacts...
🧹 Cleaning up old builds...
📤 Updating GitHub commit status...
✅ Build succeeded!
```

---

## 🐛 Troubleshooting

### Erreur : `node: not found`

**Solution** : Installez Node.js via l'une des 3 options ci-dessus

### Erreur : `Credentials not found`

**Solution** : Vérifiez que `github-credentials` existe dans Jenkins Credentials

### Erreur : GitHub Webhook ne déclenche pas le build

**Solution** :
1. Vérifiez l'URL webhook dans GitHub settings
2. Testez la connexion avec le bouton "Test" dans GitHub
3. Vérifiez que Jenkins est accessible depuis GitHub

### Erreur : `npm ERR! 404 Not Found`

**Solution** : Vérifiez le `package.json` et les dépendances npm

---

## 🚀 Prochaines étapes

- [ ] Configurer les notifications Slack
- [ ] Ajouter des tests de couverture de code
- [ ] Configurer le déploiement automatique
- [ ] Ajouter des étapes de sécurité (SAST, dependency scanning)

