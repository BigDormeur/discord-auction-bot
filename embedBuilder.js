// ─────────────────────────────────────────────────────────────────────────────
// utils/embedBuilder.js
//
// Centralise la construction de tous les embeds et composants Discord.
// Séparer la "mise en forme" de la "logique" rend le code beaucoup plus facile
// à modifier : si tu veux changer la couleur ou le texte d'un embed,
// tu sais exactement où chercher.
// ─────────────────────────────────────────────────────────────────────────────

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require('discord.js');

// Couleurs utilisées dans les embeds
const COLORS = {
  AUCTION_ACTIVE:  0x5865F2, // Bleu Discord — enchère en cours
  AUCTION_ENDED:   0x57F287, // Vert — enchère terminée avec gagnant
  AUCTION_NO_BIDS: 0xED4245, // Rouge — enchère terminée sans mise
  INFO:            0x5865F2,
  WARNING:         0xFEE75C,
  ERROR:           0xED4245,
  SUCCESS:         0x57F287,
};

// Formate un timestamp UNIX en durée lisible (ex: "45m 30s" ou "2h 10m")
function formatTimeLeft(endsAtUnix) {
  const secondsLeft = endsAtUnix - Math.floor(Date.now() / 1000);
  if (secondsLeft <= 0) return 'Terminée';

  const h = Math.floor(secondsLeft / 3600);
  const m = Math.floor((secondsLeft % 3600) / 60);
  const s = secondsLeft % 60;

  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// Formate un timestamp UNIX en date Discord relative (<t:xxx:R> = "dans 5 minutes")
function discordTimestamp(unixTs, style = 'R') {
  return `<t:${unixTs}:${style}>`;
}

// ─── Embed principal d'une enchère ───────────────────────────────────────────
// C'est le message posté dans le salon d'enchères.
// Il est mis à jour à chaque nouvelle mise via message.edit().

function buildAuctionEmbed(auction, config) {
  const symbol = config?.currency_symbol || '🪙';
  const name   = config?.currency_name   || 'pièces';
  const timeLeft = formatTimeLeft(auction.ends_at);
  const isActive = auction.status === 'active';

  const embed = new EmbedBuilder()
    .setColor(isActive ? COLORS.AUCTION_ACTIVE : COLORS.AUCTION_ENDED)
    .setTitle(`🔨 ${auction.item_name}`)
    .setDescription(auction.item_desc || '*Aucune description.*')
    .addFields(
      {
        name: '💰 Prix de départ',
        value: `**${auction.start_price} ${symbol}**`,
        inline: true,
      },
      {
        name: '📈 Meilleure offre',
        value: auction.current_bidder_id
          ? `**${auction.current_price} ${symbol}**\npar <@${auction.current_bidder_id}>`
          : `*Aucune mise — sois le premier !*`,
        inline: true,
      },
      {
        name: isActive ? '⏳ Fin dans' : '🏁 Terminée',
        value: isActive
          ? `${timeLeft}\n${discordTimestamp(auction.ends_at)}`
          : discordTimestamp(auction.ends_at, 'f'),
        inline: true,
      },
    )
    .setFooter({ text: `ID enchère : ${auction.auction_id}` })
    .setTimestamp();

  if (auction.item_image) {
    embed.setThumbnail(auction.item_image);
  }

  return embed;
}

// ─── Embed de fin d'enchère ───────────────────────────────────────────────────

function buildAuctionEndedEmbed(auction, config) {
  const symbol = config?.currency_symbol || '🪙';

  if (!auction.winner_id) {
    return new EmbedBuilder()
      .setColor(COLORS.AUCTION_NO_BIDS)
      .setTitle(`❌ Enchère terminée sans vainqueur`)
      .setDescription(`**${auction.item_name}** n'a reçu aucune mise.`)
      .setTimestamp();
  }

  return new EmbedBuilder()
    .setColor(COLORS.AUCTION_ENDED)
    .setTitle(`🎉 Enchère remportée !`)
    .setDescription(
      `**${auction.item_name}** a été remporté par <@${auction.winner_id}> ` +
      `pour **${auction.final_price} ${symbol}** !`
    )
    .setTimestamp();
}

// ─── Buttons sous le message d'enchère ───────────────────────────────────────
// Trois boutons : enchère rapide (+incrément), montant libre, infos

function buildAuctionButtons(auctionId, minIncrement = 1, disabled = false) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`bid_quick:${auctionId}`)
      .setLabel(`+${minIncrement} (enchère rapide)`)
      .setEmoji('⚡')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),

    new ButtonBuilder()
      .setCustomId(`bid_custom:${auctionId}`)
      .setLabel('Montant libre')
      .setEmoji('✏️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),

    new ButtonBuilder()
      .setCustomId(`bid_info:${auctionId}`)
      .setLabel('Infos')
      .setEmoji('ℹ️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(false), // Les infos restent disponibles même après la fin
  );

  return row;
}

// ─── Embed d'informations détaillées (réponse éphémère au bouton ℹ️) ─────────

function buildAuctionInfoEmbed(auction, bids, config) {
  const symbol = config?.currency_symbol || '🪙';

  const bidHistory = bids.length > 0
    ? bids.map((b, i) =>
        `${i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'} **${b.amount} ${symbol}** — <@${b.user_id}> ${discordTimestamp(b.placed_at, 'R')}`
      ).join('\n')
    : '*Aucune mise pour l\'instant.*';

  return new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle(`ℹ️ Infos — ${auction.item_name}`)
    .addFields(
      { name: 'Prix de départ', value: `${auction.start_price} ${symbol}`, inline: true },
      { name: 'Meilleure offre', value: `${auction.current_price} ${symbol}`, inline: true },
      { name: 'Fin de l\'enchère', value: discordTimestamp(auction.ends_at), inline: true },
      { name: 'Dernières mises', value: bidHistory },
    )
    .setFooter({ text: `ID : ${auction.auction_id}` });
}

// ─── Embed de configuration du serveur ───────────────────────────────────────

function buildConfigEmbed(config, guild) {
  const hasChannel = config?.auction_channel ? `<#${config.auction_channel}>` : '❌ Non configuré';
  const hasLogs    = config?.log_channel     ? `<#${config.log_channel}>`     : '❌ Non configuré';
  const hasRole    = config?.admin_role      ? `<@&${config.admin_role}>`     : '*Admins Discord uniquement*';

  return new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle(`⚙️ Configuration — ${guild.name}`)
    .addFields(
      { name: '📣 Salon enchères',     value: hasChannel, inline: true },
      { name: '📋 Salon logs',         value: hasLogs,    inline: true },
      { name: '🔑 Rôle admin enchères', value: hasRole,   inline: false },
      {
        name: '💰 Monnaie',
        value: `${config?.currency_symbol || '🪙'} ${config?.currency_name || 'pièces'}`,
        inline: true,
      },
      {
        name: '📏 Incrément minimum',
        value: `${config?.min_increment || 1} ${config?.currency_symbol || '🪙'}`,
        inline: true,
      },
    )
    .setThumbnail(guild.iconURL())
    .setTimestamp();
}

// ─── Embeds utilitaires ───────────────────────────────────────────────────────

function successEmbed(description) {
  return new EmbedBuilder().setColor(COLORS.SUCCESS).setDescription(`✅ ${description}`);
}

function errorEmbed(description) {
  return new EmbedBuilder().setColor(COLORS.ERROR).setDescription(`❌ ${description}`);
}

function warningEmbed(description) {
  return new EmbedBuilder().setColor(COLORS.WARNING).setDescription(`⚠️ ${description}`);
}

module.exports = {
  buildAuctionEmbed,
  buildAuctionEndedEmbed,
  buildAuctionButtons,
  buildAuctionInfoEmbed,
  buildConfigEmbed,
  successEmbed,
  errorEmbed,
  warningEmbed,
  formatTimeLeft,
  discordTimestamp,
};
