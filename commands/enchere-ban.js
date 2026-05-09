const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getDb } = require('../utils/database');

function isAdmin(member, config) {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (config.adminRoleId && member.roles.cache.has(config.adminRoleId)) return true;
  return false;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('enchere-ban')
    .setDescription('🚫 Gérer les bans des enchères')
    .addSubcommand(sub =>
      sub.setName('ajouter').setDescription('Bannir un utilisateur des enchères')
        .addUserOption(opt => opt.setName('utilisateur').setDescription('Utilisateur à bannir').setRequired(true))
        .addStringOption(opt => opt.setName('raison').setDescription('Raison').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('retirer').setDescription('Débannir un utilisateur')
        .addUserOption(opt => opt.setName('utilisateur').setDescription('Utilisateur à débannir').setRequired(true))
    )
    .addSubcommand(sub => sub.setName('liste').setDescription('Voir les utilisateurs bannis')),

  async execute(interaction) {
    const db = getDb(interaction.guildId);
    const config = db.get('config').value();

    if (!isAdmin(interaction.member, config)) {
      return interaction.reply({ content: '❌ Permission refusée.', ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'ajouter') {
      const user = interaction.options.getUser('utilisateur');
      const raison = interaction.options.getString('raison') || 'Aucune raison fournie';

      if (db.get('bannedUsers').find({ id: user.id }).value()) {
        return interaction.reply({ content: `⚠️ **${user.tag}** est déjà banni.`, ephemeral: true });
      }

      db.get('bannedUsers').push({ id: user.id, tag: user.tag, raison, bannedAt: Date.now(), bannedBy: interaction.user.tag }).write();
      user.send(`🚫 Tu as été **banni des enchères** sur **${interaction.guild.name}**.\nRaison : *${raison}*`).catch(() => {});
      return interaction.reply({ content: `✅ **${user.tag}** banni. Raison : *${raison}*`, ephemeral: true });
    }

    if (sub === 'retirer') {
      const user = interaction.options.getUser('utilisateur');
      if (!db.get('bannedUsers').find({ id: user.id }).value()) {
        return interaction.reply({ content: `⚠️ **${user.tag}** n'est pas banni.`, ephemeral: true });
      }
      db.get('bannedUsers').remove({ id: user.id }).write();
      user.send(`✅ Ton ban des enchères sur **${interaction.guild.name}** a été levé.`).catch(() => {});
      return interaction.reply({ content: `✅ **${user.tag}** débanni.`, ephemeral: true });
    }

    if (sub === 'liste') {
      const banned = db.get('bannedUsers').value();
      if (banned.length === 0) return interaction.reply({ content: '✅ Aucun utilisateur banni.', ephemeral: true });
      const list = banned.map((u, i) => `**${i + 1}. ${u.tag}**\n> ${u.raison} — par ${u.bannedBy}`).join('\n\n');
      return interaction.reply({ content: `🚫 **Bannis des enchères :**\n\n${list}`, ephemeral: true });
    }
  },
};
