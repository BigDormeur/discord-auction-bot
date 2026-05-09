const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ChannelType,
} = require('discord.js');
const db = require('../utils/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('⚙️ Panneau de configuration du bot (Admin)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub.setName('voir').setDescription('Afficher la configuration actuelle')
    )
    .addSubcommand(sub =>
      sub
        .setName('salon-encheres')
        .setDescription('Définir le salon où les enchères seront postées')
        .addChannelOption(opt =>
          opt.setName('salon').setDescription('Le salon').setRequired(true)
            .addChannelTypes(ChannelType.GuildText)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('salon-logs')
        .setDescription('Définir le salon des logs')
        .addChannelOption(opt =>
          opt.setName('salon').setDescription('Le salon').setRequired(true)
            .addChannelTypes(ChannelType.GuildText)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('role-admin')
        .setDescription('Définir le rôle autorisé à gérer les enchères')
        .addRoleOption(opt =>
          opt.setName('role').setDescription('Le rôle').setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('monnaie')
        .setDescription('Définir le symbole et le nom de la monnaie')
        .addStringOption(opt =>
          opt.setName('symbole').setDescription('Symbole (ex: 🪙, $, €)').setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('nom').setDescription('Nom (ex: pièces, gold, coins)').setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('increment-minimum')
        .setDescription('Définir l\'incrément minimum entre deux enchères')
        .addIntegerOption(opt =>
          opt.setName('montant').setDescription('Montant minimum d\'incrément').setRequired(true).setMinValue(1)
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const config = db.get('config').value();

    if (sub === 'voir') {
      const embed = new EmbedBuilder()
        .setTitle('⚙️ Configuration du Bot Enchères')
        .setColor(0x5865f2)
        .addFields(
          {
            name: '📢 Salon des enchères',
            value: config.auctionChannelId ? `<#${config.auctionChannelId}>` : '❌ Non configuré',
            inline: true,
          },
          {
            name: '📋 Salon des logs',
            value: config.logChannelId ? `<#${config.logChannelId}>` : '❌ Non configuré',
            inline: true,
          },
          {
            name: '🛡️ Rôle admin enchères',
            value: config.adminRoleId ? `<@&${config.adminRoleId}>` : '❌ Non configuré',
            inline: true,
          },
          {
            name: '💰 Monnaie',
            value: `${config.currency} (${config.currencyName})`,
            inline: true,
          },
          {
            name: '📈 Incrément minimum',
            value: `${config.minBidIncrement} ${config.currency}`,
            inline: true,
          },
          {
            name: '📦 Objets en stock',
            value: `${db.get('items').value().length} objet(s)`,
            inline: true,
          },
          {
            name: '🔨 Enchères actives',
            value: `${db.get('auctions').filter({ status: 'active' }).value().length} enchère(s)`,
            inline: true,
          }
        )
        .setFooter({ text: 'Utilisez /config <sous-commande> pour modifier les paramètres' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'salon-encheres') {
      const channel = interaction.options.getChannel('salon');
      db.set('config.auctionChannelId', channel.id).write();
      return interaction.reply({ content: `✅ Salon des enchères défini sur ${channel}`, ephemeral: true });
    }

    if (sub === 'salon-logs') {
      const channel = interaction.options.getChannel('salon');
      db.set('config.logChannelId', channel.id).write();
      return interaction.reply({ content: `✅ Salon des logs défini sur ${channel}`, ephemeral: true });
    }

    if (sub === 'role-admin') {
      const role = interaction.options.getRole('role');
      db.set('config.adminRoleId', role.id).write();
      return interaction.reply({ content: `✅ Rôle admin défini sur ${role}`, ephemeral: true });
    }

    if (sub === 'monnaie') {
      const symbole = interaction.options.getString('symbole');
      const nom = interaction.options.getString('nom');
      db.set('config.currency', symbole).write();
      db.set('config.currencyName', nom).write();
      return interaction.reply({ content: `✅ Monnaie définie : **${symbole}** (${nom})`, ephemeral: true });
    }

    if (sub === 'increment-minimum') {
      const montant = interaction.options.getInteger('montant');
      db.set('config.minBidIncrement', montant).write();
      return interaction.reply({ content: `✅ Incrément minimum défini à **${montant}**`, ephemeral: true });
    }
  },
};
