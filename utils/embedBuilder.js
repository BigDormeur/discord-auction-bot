const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

function buildAuctionEmbed(auction) {
  const isEnded = auction.status === 'ended';
  const timeLeft = auction.endsAt - Date.now();
  const minutes = Math.max(0, Math.floor(timeLeft / 60000));
  const seconds = Math.max(0, Math.floor((timeLeft % 60000) / 1000));

  let timeStr;
  if (isEnded) {
    timeStr = 'Terminée';
  } else if (minutes > 60) {
    timeStr = `${Math.floor(minutes / 60)}h ${minutes % 60}min`;
  } else if (minutes > 0) {
    timeStr = `${minutes}min ${seconds}s`;
  } else {
    timeStr = `${seconds}s`;
  }

  const color = isEnded
    ? 0x808080
    : timeLeft < 60000
    ? 0xff4444
    : timeLeft < 300000
    ? 0xffa500
    : 0x2ecc71;

  const embed = new EmbedBuilder()
    .setTitle(isEnded ? `🔨 Enchère terminée — ${auction.itemName}` : `🔨 Enchère en cours — ${auction.itemName}`)
    .setColor(color)
    .setDescription(auction.itemDescription || '*Aucune description*')
    .addFields(
      {
        name: isEnded ? '🏆 Prix final' : '💰 Enchère actuelle',
        value: `**${auction.currentPrice} ${auction.currency}**`,
        inline: true,
      },
      {
        name: isEnded ? '🥇 Gagnant' : '👤 Meilleur enchérisseur',
        value: auction.currentBidderTag
          ? `<@${auction.currentBidderId}>`
          : '*Aucun enchérisseur*',
        inline: true,
      },
      {
        name: isEnded ? '⏱️ Statut' : '⏳ Temps restant',
        value: timeStr,
        inline: true,
      },
      {
        name: '📌 Enchère minimum suivante',
        value: isEnded
          ? '—'
          : `**${auction.currentPrice + (auction.minIncrement || 1)} ${auction.currency}**`,
        inline: true,
      },
      {
        name: '🏷️ Prix de départ',
        value: `${auction.startingPrice} ${auction.currency}`,
        inline: true,
      },
      {
        name: '🆔 ID Enchère',
        value: `\`${auction.id}\``,
        inline: true,
      }
    )
    .setFooter({ text: isEnded ? 'Enchère clôturée' : `Fin le ${new Date(auction.endsAt).toLocaleString('fr-FR')}` })
    .setTimestamp();

  if (auction.itemImage) {
    embed.setImage(auction.itemImage);
  }

  if (isEnded && auction.currentBidderId) {
    embed.setThumbnail('https://cdn.discordapp.com/emojis/🏆.png');
  }

  return embed;
}

function buildAuctionComponents(auction) {
  if (auction.status === 'ended') return [];

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`bid_quick_${auction.id}`)
      .setLabel(`Enchérir (+${auction.minIncrement || 1} ${auction.currency})`)
      .setStyle(ButtonStyle.Success)
      .setEmoji('⚡'),
    new ButtonBuilder()
      .setCustomId(`bid_custom_${auction.id}`)
      .setLabel('Enchère personnalisée')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('✏️'),
    new ButtonBuilder()
      .setCustomId(`bid_info_${auction.id}`)
      .setLabel('Infos')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('ℹ️')
  );

  return [row];
}

function buildBidModal(auctionId, minBid, currency) {
  const modal = new ModalBuilder()
    .setCustomId(`bid_modal_${auctionId}`)
    .setTitle('💰 Placer une enchère');

  const amountInput = new TextInputBuilder()
    .setCustomId('bid_amount')
    .setLabel(`Montant (minimum : ${minBid} ${currency})`)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder(`Ex: ${minBid}`)
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(15);

  modal.addComponents(new ActionRowBuilder().addComponents(amountInput));
  return modal;
}

module.exports = { buildAuctionEmbed, buildAuctionComponents, buildBidModal };
