const { buildBidModal } = require('../utils/embedBuilder');
const { placeBid } = require('../utils/auctionManager');
const { getDb } = require('../utils/database');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {

    // ── Slash commands ──────────────────────────────────────────
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      try {
        await command.execute(interaction);
      } catch (err) {
        console.error('Erreur commande:', err);
        const reply = { content: '❌ Une erreur est survenue.', ephemeral: true };
        if (interaction.deferred) await interaction.editReply(reply);
        else await interaction.reply(reply);
      }
      return;
    }

    // ── Buttons ─────────────────────────────────────────────────
    if (interaction.isButton()) {
      const { customId, guildId } = interaction;
      const db = getDb(guildId);

      // Ban check
      if (customId.startsWith('bid_')) {
        const isBanned = db.get('bannedUsers').find({ id: interaction.user.id }).value();
        if (isBanned) {
          return interaction.reply({ content: `🚫 Tu es **banni des enchères**.\nRaison : *${isBanned.raison}*`, ephemeral: true });
        }
      }

      // Quick bid
      if (customId.startsWith('bid_quick_')) {
        const auctionId = customId.replace('bid_quick_', '');
        const auction = db.get('auctions').find({ id: auctionId, status: 'active' }).value();
        if (!auction) return interaction.reply({ content: '❌ Cette enchère est terminée.', ephemeral: true });

        const bidAmount = auction.currentPrice + (auction.minIncrement || 1);
        const result = await placeBid(client, auctionId, guildId, interaction.user.id, interaction.user.tag, bidAmount);
        if (result.error) return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
        return interaction.reply({ content: `✅ Enchère placée : **${bidAmount} ${auction.currency}** sur **${auction.itemName}** !`, ephemeral: true });
      }

      // Custom bid (modal)
      if (customId.startsWith('bid_custom_')) {
        const auctionId = customId.replace('bid_custom_', '');
        const auction = db.get('auctions').find({ id: auctionId, status: 'active' }).value();
        if (!auction) return interaction.reply({ content: '❌ Cette enchère est terminée.', ephemeral: true });

        const minBid = auction.currentPrice + (auction.minIncrement || 1);
        return interaction.showModal(buildBidModal(auctionId, minBid, auction.currency));
      }

      // Info button
      if (customId.startsWith('bid_info_')) {
        const auctionId = customId.replace('bid_info_', '');
        const auction = db.get('auctions').find({ id: auctionId }).value();
        if (!auction) return interaction.reply({ content: '❌ Enchère introuvable.', ephemeral: true });

        const timeLeft = Math.max(0, auction.endsAt - Date.now());
        const minutes = Math.floor(timeLeft / 60000);
        const seconds = Math.floor((timeLeft % 60000) / 1000);
        return interaction.reply({
          content:
            `📋 **${auction.itemName}**\n` +
            `💰 Enchère actuelle : **${auction.currentPrice} ${auction.currency}**\n` +
            `📈 Prochaine min. : **${auction.currentPrice + (auction.minIncrement || 1)} ${auction.currency}**\n` +
            `👤 Meilleur : ${auction.currentBidderTag ? `<@${auction.currentBidderId}>` : '*Aucun*'}\n` +
            `⏳ Temps restant : **${minutes}min ${seconds}s**`,
          ephemeral: true,
        });
      }
    }

    // ── Modals ───────────────────────────────────────────────────
    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith('bid_modal_')) {
        const { guildId } = interaction;
        const db = getDb(guildId);

        // Ban check
        const isBanned = db.get('bannedUsers').find({ id: interaction.user.id }).value();
        if (isBanned) {
          return interaction.reply({ content: `🚫 Tu es **banni des enchères**.\nRaison : *${isBanned.raison}*`, ephemeral: true });
        }

        const auctionId = interaction.customId.replace('bid_modal_', '');
        const rawAmount = interaction.fields.getTextInputValue('bid_amount').replace(/\s/g, '').replace(',', '.');
        const amount = parseInt(rawAmount, 10);

        if (isNaN(amount) || amount <= 0) {
          return interaction.reply({ content: '❌ Montant invalide.', ephemeral: true });
        }

        const result = await placeBid(client, auctionId, guildId, interaction.user.id, interaction.user.tag, amount);
        if (result.error) return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });

        return interaction.reply({
          content: `✅ Enchère placée : **${amount} ${result.auction.currency}** sur **${result.auction.itemName}** !`,
          ephemeral: true,
        });
      }
    }
  },
};
