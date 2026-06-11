// ─────────────────────────────────────────────────────────────────────────────
// events/interactionCreate.js
//
// Point d'entrée de TOUTES les interactions Discord :
//   - Commandes slash (/config, /objet, /enchere)
//   - Boutons (⚡ enchère rapide, ✏️ montant libre, ℹ️ infos)
//   - Modals (formulaire de saisie du montant libre)
//
// Comprendre les custom IDs des boutons :
//   bid_quick:<auctionId>   → enchère rapide (+incrément)
//   bid_custom:<auctionId>  → ouvre le modal de saisie
//   bid_info:<auctionId>    → affiche les infos détaillées (éphémère)
//
// Custom ID du modal :
//   modal_bid:<auctionId>   → soumission du montant personnalisé
// ─────────────────────────────────────────────────────────────────────────────

const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require('discord.js');

const db = require('../utils/database');
const {
  buildAuctionEmbed,
  buildAuctionButtons,
  buildAuctionInfoEmbed,
  successEmbed,
  errorEmbed,
} = require('../utils/embedBuilder');

module.exports = {
  name: 'interactionCreate',

  async execute(interaction, client) {
    // ════════════════════════════════════════════════════════════════════════
    //  COMMANDES SLASH
    // ════════════════════════════════════════════════════════════════════════
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;

      try {
        await command.execute(interaction);
      } catch (err) {
        console.error(`❌ Erreur dans la commande /${interaction.commandName}:`, err);
        const reply = { embeds: [errorEmbed('Une erreur interne est survenue.')], ephemeral: true };
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply(reply).catch(() => {});
        } else {
          await interaction.reply(reply).catch(() => {});
        }
      }
      return;
    }

    // ════════════════════════════════════════════════════════════════════════
    //  BOUTONS
    // ════════════════════════════════════════════════════════════════════════
    if (interaction.isButton()) {
      const [action, auctionId] = interaction.customId.split(':');

      // ── Bouton ℹ️ Infos ─────────────────────────────────────────────────
      if (action === 'bid_info') {
        const auction = await db.getAuction(auctionId);
        if (!auction) {
          return interaction.reply({ embeds: [errorEmbed('Enchère introuvable.')], ephemeral: true });
        }

        const config = await db.getGuildConfig(interaction.guildId);
        const bids   = await db.getAuctionBids(auctionId, 5);
        const embed  = buildAuctionInfoEmbed(auction, bids, config);

        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      // ── Bouton ✏️ Montant libre — ouvre un modal ─────────────────────────
      if (action === 'bid_custom') {
        const auction = await db.getAuction(auctionId);
        if (!auction || auction.status !== 'active') {
          return interaction.reply({ embeds: [errorEmbed('Cette enchère n\'est plus active.')], ephemeral: true });
        }

        const config = await db.getGuildConfig(interaction.guildId);
        const min    = auction.current_price + (config?.min_increment || 1);
        const symbol = config?.currency_symbol || '🪙';

        const modal = new ModalBuilder()
          .setCustomId(`modal_bid:${auctionId}`)
          .setTitle(`Enchérir sur ${auction.item_name}`);

        const input = new TextInputBuilder()
          .setCustomId('bid_amount')
          .setLabel(`Montant (minimum : ${min} ${symbol})`)
          .setStyle(TextInputStyle.Short)
          .setPlaceholder(`Ex: ${min}`)
          .setMinLength(1)
          .setMaxLength(10)
          .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
      }

      // ── Bouton ⚡ Enchère rapide ──────────────────────────────────────────
      if (action === 'bid_quick') {
        await interaction.deferReply({ ephemeral: true });

        const auction = await db.getAuction(auctionId);
        if (!auction || auction.status !== 'active') {
          return interaction.editReply({ embeds: [errorEmbed('Cette enchère n\'est plus active.')] });
        }

        // Vérifier que l'enchère n'est pas expirée
        const now = Math.floor(Date.now() / 1000);
        if (auction.ends_at <= now) {
          return interaction.editReply({ embeds: [errorEmbed('Cette enchère est terminée.')] });
        }

        const config    = await db.getGuildConfig(interaction.guildId);
        const increment = config?.min_increment || 1;
        const newAmount = auction.current_price + increment;

        // Empêcher l'auto-enchère
        if (auction.current_bidder_id === interaction.user.id) {
          return interaction.editReply({
            embeds: [errorEmbed('Tu es déjà le meilleur enchérisseur !')],
          });
        }

        await _processBid(interaction, auction, config, newAmount);
      }

      return;
    }

    // ════════════════════════════════════════════════════════════════════════
    //  MODALS (soumission du montant personnalisé)
    // ════════════════════════════════════════════════════════════════════════
    if (interaction.isModalSubmit()) {
      const [action, auctionId] = interaction.customId.split(':');
      if (action !== 'modal_bid') return;

      await interaction.deferReply({ ephemeral: true });

      const auction = await db.getAuction(auctionId);
      if (!auction || auction.status !== 'active') {
        return interaction.editReply({ embeds: [errorEmbed('Cette enchère n\'est plus active.')] });
      }

      // Vérifier expiration
      const now = Math.floor(Date.now() / 1000);
      if (auction.ends_at <= now) {
        return interaction.editReply({ embeds: [errorEmbed('Cette enchère est terminée.')] });
      }

      // Parser et valider le montant saisi
      const rawValue = interaction.fields.getTextInputValue('bid_amount').trim();
      const amount   = parseInt(rawValue, 10);
      const config   = await db.getGuildConfig(interaction.guildId);
      const minBid   = auction.current_price + (config?.min_increment || 1);
      const symbol   = config?.currency_symbol || '🪙';

      if (isNaN(amount) || amount < minBid) {
        return interaction.editReply({
          embeds: [errorEmbed(`Montant invalide. Le minimum est **${minBid} ${symbol}**.`)],
        });
      }

      // Empêcher l'auto-enchère
      if (auction.current_bidder_id === interaction.user.id) {
        return interaction.editReply({
          embeds: [errorEmbed('Tu es déjà le meilleur enchérisseur !')],
        });
      }

      await _processBid(interaction, auction, config, amount);
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Fonction interne : traiter une mise (utilisée par les deux types de boutons)
// ─────────────────────────────────────────────────────────────────────────────
async function _processBid(interaction, auction, config, amount) {
  const previousBidderId = auction.current_bidder_id;
  const symbol = config?.currency_symbol || '🪙';

  // Sauvegarder la mise en BDD
  await db.placeBid(
    auction.auction_id,
    interaction.guildId,
    interaction.user.id,
    interaction.user.username,
    amount,
  );

  // Récupérer l'enchère mise à jour
  const updatedAuction = await db.getAuction(auction.auction_id);

  // Mettre à jour l'embed dans le salon d'enchères
  if (auction.message_id && auction.channel_id) {
    try {
      const channel = await interaction.guild.channels.fetch(auction.channel_id);
      const message = await channel.messages.fetch(auction.message_id);
      const embed   = buildAuctionEmbed(updatedAuction, config);
      const buttons = buildAuctionButtons(auction.auction_id, config?.min_increment || 1);
      await message.edit({ embeds: [embed], components: [buttons] });
    } catch (err) {
      console.warn('⚠️ Impossible de mettre à jour le message d\'enchère:', err.message);
    }
  }

  // Notifier l'enchérisseur précédent en DM (s'il a été dépassé)
  if (previousBidderId && previousBidderId !== interaction.user.id) {
    try {
      const prevUser = await interaction.client.users.fetch(previousBidderId);
      await prevUser.send(
        `😮 Tu as été dépassé sur **${auction.item_name}** !\n` +
        `Nouvelle mise : **${amount} ${symbol}** par **${interaction.user.username}**.\n` +
        `Reviens vite enchérir !`
      );
    } catch {
      // L'utilisateur a les DMs fermés — on ignore
    }
  }

  // Confirmer à l'enchérisseur (éphémère)
  return interaction.editReply({
    embeds: [successEmbed(`Ta mise de **${amount} ${symbol}** sur **${auction.item_name}** a été enregistrée !`)],
  });
}
