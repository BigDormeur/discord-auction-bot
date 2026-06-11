# 🔨 Bot Discord — Enchères v2

Bot Discord multi-serveurs pour organiser des enchères. Stockage cloud avec Turso (SQLite), hébergement recommandé sur Koyeb (gratuit, sans limite de serveurs, sans sleep).

---

## Ce qui a changé par rapport à la v1

| Ancien | Nouveau | Pourquoi |
|--------|---------|----------|
| `lowdb` (fichier JSON local) | **Turso** (SQLite cloud) | Données persistantes sur n'importe quel hébergeur, isolation par serveur |
| `GatewayIntentBits.MessageContent` | **Supprimé** | Économie de 50–150 Mo de RAM |
| Railway | **Koyeb** | Gratuit 24/7, 512 Mo RAM, sans carte bancaire |
| Commandes sur 1 serveur (`GUILD_ID`) | **Commandes globales** | Fonctionne sur tous les serveurs |

---

## Fonctionnalités

- **Panneau admin** via `/config` : salon, logs, rôle, monnaie, incrément
- **Gestion d'objets** via `/objet` : ajouter / lister / infos / supprimer
- **Enchères interactives** : boutons ⚡ rapide, ✏️ montant libre, ℹ️ infos
- **Fin automatique** toutes les 10 secondes
- **DM automatique** au gagnant + à l'enchérisseur dépassé
- **Logs** dans un salon dédié
- **Historique** des enchères passées
- **Multi-serveurs** : chaque serveur a sa propre configuration en BDD

---

## Installation

### 1. Créer le bot Discord

1. Va sur https://discord.com/developers/applications
2. **New Application** → donne un nom
3. Onglet **Bot** → copie le **Token**
4. Onglet **OAuth2 > URL Generator** :
   - Coche `bot` et `applications.commands`
   - Permissions : `Send Messages`, `Embed Links`, `Read Message History`, `View Channels`
   - Copie l'URL et invite le bot sur ton serveur
5. **NE PAS activer** Message Content Intent (plus nécessaire)

### 2. Créer la base de données Turso (gratuit)

1. Va sur https://app.turso.tech et crée un compte
2. **Create Database** → choisis un nom et une région (ex: `eu-west` pour la France)
3. Clique sur ta base → onglet **Connect** → copie l'URL `libsql://...`
4. Onglet **Tokens** → **Create Token** → copie le token

### 3. Configurer le projet

```bash
# Clone le repo ou déplace-toi dans le dossier
cd discord-auction-bot

# Installer les dépendances
npm install

# Copier le fichier de config
cp .env.example .env
```

Remplis le `.env` :

```env
DISCORD_TOKEN=ton_token_discord
CLIENT_ID=id_application_discord
TURSO_URL=libsql://ta-db.turso.io
TURSO_TOKEN=ton_token_turso
```

### 4. Lancer en local (dev)

```bash
# Pour tester sur un seul serveur (commandes instantanées)
# Ajoute GUILD_ID=id_de_ton_serveur dans .env

npm run dev
```

---

## Déploiement sur Koyeb (recommandé)

Koyeb est gratuit, sans sleep, sans carte bancaire, et prend en charge Node.js directement depuis GitHub.

1. Crée un compte sur https://koyeb.com
2. **Create Service** → **Web Service** → connecte ton repo GitHub
3. Paramètres :
   - **Run command** : `npm start`
   - **Instance** : Free (512 Mo RAM)
4. **Environment Variables** : ajoute `DISCORD_TOKEN`, `CLIENT_ID`, `TURSO_URL`, `TURSO_TOKEN`
5. **Deploy** → c'est tout

Les tables Turso se créent automatiquement au premier démarrage.

---

## Commandes

### ⚙️ Configuration (Admins Discord)

| Commande | Description |
|---|---|
| `/config voir` | Configuration actuelle |
| `/config salon-encheres #salon` | Salon où les enchères s'affichent |
| `/config salon-logs #salon` | Salon des logs |
| `/config role-admin @role` | Rôle autorisé (en plus des admins Discord) |
| `/config monnaie 🪙 pièces` | Symbole et nom de la monnaie |
| `/config increment 10` | Incrément minimum de l'enchère rapide |

### 📦 Objets

| Commande | Description |
|---|---|
| `/objet ajouter` | Ajouter un objet au stock |
| `/objet liste` | Voir tous les objets |
| `/objet infos <id>` | Détails d'un objet |
| `/objet supprimer <id>` | Supprimer un objet |

### 🔨 Enchères

| Commande | Qui | Description |
|---|---|---|
| `/enchere lancer <id> <durée>` | Admin | Lancer une enchère |
| `/enchere liste` | Tous | Enchères actives |
| `/enchere terminer <id>` | Admin | Terminer manuellement |
| `/enchere historique` | Tous | 10 dernières enchères |

---

## Structure du projet

```
discord-auction-bot/
├── index.js                  # Point d'entrée
├── package.json
├── .env.example
├── .gitignore
├── commands/
│   ├── config.js             # /config
│   ├── objet.js              # /objet
│   └── enchere.js            # /enchere
├── events/
│   └── interactionCreate.js  # Boutons, modals, commandes slash
└── utils/
    ├── database.js           # Toutes les requêtes Turso
    ├── auctionManager.js     # Vérification des enchères expirées
    ├── embedBuilder.js       # Construction des embeds Discord
    ├── permissions.js        # Vérification des permissions admin
    └── initDb.js             # Script d'init manuelle des tables
```

---

## FAQ

**Les commandes n'apparaissent pas ?**
En production (sans `GUILD_ID`), la propagation globale prend jusqu'à 1h. En dev, ajoute `GUILD_ID=ton_serveur` dans `.env` pour un enregistrement instantané.

**L'enchère ne se ferme pas automatiquement ?**
La vérification se fait toutes les 10 secondes. Le bot doit être en ligne.

**Plusieurs enchères simultanées ?**
Oui, chaque objet peut avoir sa propre enchère active en même temps.

**Les données sont perdues au redéploiement ?**
Non — tout est dans Turso, pas sur le serveur d'hébergement. Redéploie autant que tu veux.
