# 🔨 Bot Discord — Enchères

Bot Discord complet pour organiser des enchères avec panneau admin, gestion d'objets et interface joueur par boutons.

---

## 📋 Fonctionnalités

- **Panneau admin** via `/config` : configurer les salons, rôles, monnaie
- **Gestion d'objets** via `/objet` : ajouter/lister/supprimer des objets
- **Lancer des enchères** via `/enchere lancer`
- **Enchères interactives** : les joueurs cliquent sur les boutons directement sous le message
  - ⚡ Enchère rapide (+ incrément minimum en 1 clic)
  - ✏️ Enchère personnalisée (via modal/formulaire)
  - ℹ️ Voir les infos détaillées
- **Fin automatique** des enchères avec annonce du gagnant
- **DM automatique** au gagnant et à l'enchérisseur dépassé
- **Logs** dans un salon dédié
- **Historique** des enchères passées

---

## 🚀 Installation

### 1. Prérequis
- [Node.js](https://nodejs.org/) v18 ou supérieur
- Un bot Discord créé sur le [Portail Développeur Discord](https://discord.com/developers/applications)

### 2. Créer le bot Discord

1. Va sur https://discord.com/developers/applications
2. **New Application** → donne un nom
3. Onglet **Bot** → **Add Bot** → copie le **Token**
4. Onglet **OAuth2 > URL Generator** :
   - Coche `bot` et `applications.commands`
   - Permissions : `Send Messages`, `Embed Links`, `Read Message History`, `View Channels`
   - Copie l'URL et invite le bot sur ton serveur
5. Active **Server Members Intent** et **Message Content Intent** dans l'onglet Bot

### 3. Configurer le projet

```bash
# Clone ou télécharge le projet
cd discord-auction-bot

# Installe les dépendances
npm install

# Copie le fichier de config
cp .env.example .env
```

### 4. Remplir le `.env`

```env
DISCORD_TOKEN=ton_token_ici
CLIENT_ID=id_application_ici
GUILD_ID=id_serveur_ici
```

Pour obtenir les IDs : active le **mode développeur** dans Discord (Paramètres > Avancé) puis clic droit sur ton serveur → **Copier l'ID**.

### 5. Lancer le bot

```bash
npm start
```

---

## 🎮 Commandes

### ⚙️ Configuration (Admin Discord)

| Commande | Description |
|---|---|
| `/config voir` | Afficher la configuration actuelle |
| `/config salon-encheres #salon` | Définir le salon où les enchères s'affichent |
| `/config salon-logs #salon` | Définir le salon des logs |
| `/config role-admin @role` | Définir le rôle autorisé à gérer les enchères |
| `/config monnaie 🪙 pièces` | Définir le symbole et nom de la monnaie |
| `/config increment-minimum 10` | Incrément minimum entre deux enchères |

### 📦 Objets (Admin ou rôle enchères)

| Commande | Description |
|---|---|
| `/objet ajouter` | Ajouter un objet au stock |
| `/objet liste` | Voir tous les objets en stock |
| `/objet infos <id>` | Voir les détails d'un objet |
| `/objet supprimer <id>` | Supprimer un objet du stock |

### 🔨 Enchères

| Commande | Qui | Description |
|---|---|---|
| `/enchere lancer <id-objet> <durée>` | Admin | Lancer une enchère |
| `/enchere liste` | Tous | Voir les enchères en cours |
| `/enchere terminer <id>` | Admin | Terminer une enchère manuellement |
| `/enchere historique` | Tous | Voir les 10 dernières enchères |

---

## 🔄 Déroulement d'une enchère

```
Admin : /objet ajouter → nom="Épée légendaire" prix-depart=100
Admin : /enchere lancer id-objet=item_xxx duree=60

→ Le bot poste le message d'enchère dans le salon configuré
→ Les joueurs voient 3 boutons : [⚡ +1] [✏️ Montant custom] [ℹ️ Infos]
→ À chaque enchère : message mis à jour, ancien enchérisseur notifié en DM
→ À la fin : annonce du gagnant, DM au gagnant, log enregistré
```

---

## 🌐 Hébergement gratuit

### Option 1 — Fastheberg (recommandé, 🇫🇷)
1. Crée un compte sur [fastheberg.fr](https://fastheberg.fr)
2. Crée un nouveau service Node.js
3. Upload les fichiers (sans `node_modules/` et sans `.env`)
4. Configure les variables d'environnement dans le panel
5. Lance avec `npm start`

### Option 2 — Render + UptimeRobot
1. Crée un compte sur [render.com](https://render.com)
2. New → Web Service → connecte ton repo GitHub
3. Build command : `npm install`
4. Start command : `node index.js`
5. Environment Variables : ajoute `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`
6. Sur [uptimerobot.com](https://uptimerobot.com), crée un moniteur HTTP sur ton URL Render pour éviter la mise en veille

### Option 3 — Railway
1. Crée un compte sur [railway.app](https://railway.app)
2. New Project → Deploy from GitHub
3. Configure les variables d'environnement
4. Deploy !

---

## 📁 Structure du projet

```
discord-auction-bot/
├── index.js                 # Point d'entrée
├── package.json
├── .env.example             # Template des variables d'environnement
├── .gitignore
├── commands/
│   ├── config.js            # /config — panneau admin
│   ├── objet.js             # /objet — gestion du stock
│   └── enchere.js           # /enchere — gestion des enchères
├── events/
│   ├── ready.js             # Événement de démarrage
│   └── interactionCreate.js # Gestion des boutons, modals, commandes
├── utils/
│   ├── database.js          # Base de données JSON (lowdb)
│   ├── auctionManager.js    # Logique des enchères
│   └── embedBuilder.js      # Construction des embeds et composants
└── data/
    └── db.json              # Base de données (créée automatiquement)
```

---

## ❓ FAQ

**Le bot ne répond pas aux commandes slash ?**
Les commandes slash peuvent prendre jusqu'à 1 heure à se propager globalement. Avec `GUILD_ID` défini, elles s'enregistrent instantanément sur ton serveur.

**L'enchère ne se ferme pas automatiquement ?**
La vérification se fait toutes les 10 secondes. Assure-toi que le bot est en ligne.

**Peut-on avoir plusieurs enchères simultanées ?**
Oui ! Chaque objet peut avoir sa propre enchère en même temps.
