// ─────────────────────────────────────────────────────────────────────────────
// utils/auctionManager.js
//
// Responsable de la fermeture automatique des enchères expirées.
// Cette fonction est appelée toutes les 10 secondes depuis index.js.
//
// Fonctionnement :
//   1. On récupère toutes les enchères 'active' dont ends_at < maintenant
//   2. Pour chacune, on marque 'ended' en BDD
//   3. On édite le message Discord original (boutons désactivés, embed mis à jour)
//   4. On poste l'annonce du gagnant dans le salon
//   5. On envoie un DM au gagnant
//   6. On log dans le salon de logs si configuré
// ─────────────────────────────────────────────────────────────────────────────

const db = require('./database');
const { buildAuctionEmbed, buildAuctionEndedEmbed, buildAuctionButtons } = require('./embedBuilder');

async function checkExpiredAuctions(client) {
  try {
    const now = Math.floor(Date.now() / 1000);
    const activeAuctions = await db.getAllActiveAuctions();

    for (const auction of activeAuctions) {
      // Pas encore expirée
      if (auction.ends_at > now) continue;

      // Marquer comme terminée en BDD
      const ended = await db.endAuction(auction.auction_id);
      if (!ended) continue;

      const config = await db.getGuildConfig(auction.guild_id);

      // ── 1. Éditer le message Discord original ──────────────────────────────
      if (auction.message_id && auction.channel_id) {
        try {
          const channel = await client.channels.fetch(auction.channel_id);
          const message = await channel.messages.fetch(auction.message_id);

          // Embed mis à jour (statut ended)
          const updatedEmbed = buildAuctionEmbed({ ...ended, status: 'ended' }, config);
          // Boutons désactivés
          const disabledButtons = buildAuctionButtons(auction.auction_id, config?.min_increment || 1, true);

          await message.edit({
            embeds: [updatedEmbed],
            components: [disabledButtons],
          });
        } catch (err) {
          // Le message a peut-être été supprimé manuellement — pas critique
          console.warn(`⚠️ Impossible d'éditer le message d'enchère ${auction.auction_id}:`, err.message);
        }
      }

      // ── 2. Poster l'annonce du résultat ────────────────────────────────────
      const targetChannelId = auction.channel_id || config?.auction_channel;
      if (targetChannelId) {
        try {
          const channel = await client.channels.fetch(targetChannelId);
          const endEmbed = buildAuctionEndedEmbed(ended, config);
          await channel.send({ embeds: [endEmbed] });
        } catch (err) {
          console.warn(`⚠️ Impossible de poster l'annonce de fin:`, err.message);
        }
      }

      // ── 3. DM au gagnant ───────────────────────────────────────────────────
      if (ended.winner_id) {
        try {
          const winner = await client.users.fetch(ended.winner_id);
          const symbol = config?.currency_symbol || '🪙';
          await winner.send(
            `🎉 Félicitations ! Tu as remporté l'enchère **${ended.item_name}** ` +
            `pour **${ended.final_price} ${symbol}** sur le serveur **${(await client.guilds.fetch(ended.guild_id)).name}** !`
          );
        } catch {
          // L'utilisateur a peut-être désactivé les DMs — on ignore silencieusement
        }
      }

      // ── 4. Log dans le salon de logs ───────────────────────────────────────
      if (config?.log_channel) {
        try {
          const logChannel = await client.channels.fetch(config.log_channel);
          const symbol = config?.currency_symbol || '🪙';
          const logMsg = ended.winner_id
            ? `📋 \`${ended.auction_id}\` | **${ended.item_name}** → Remporté par <@${ended.winner_id}> pour **${ended.final_price} ${symbol}**`
            : `📋 \`${ended.auction_id}\` | **${ended.item_name}** → Aucune mise, enchère annulée`;
          await logChannel.send(logMsg);
        } catch {
          // Salon supprimé ou bot sans permission — on ignore
        }
      }

      console.log(`✅ Enchère terminée : ${auction.auction_id} (${ended.item_name})`);
    }
  } catch (err) {
    console.error('❌ Erreur dans checkExpiredAuctions:', err);
  }
}

module.exports = { checkExpiredAuctions };
