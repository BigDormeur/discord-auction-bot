const db = require('./database');
const { buildAuctionEmbed, buildAuctionComponents } = require('./embedBuilder');

/**
 * Create a new auction and post it in the configured channel
 */
async function createAuction(client, item, durationMinutes, guildId) {
  const config = db.get('config').value();
  if (!config.auctionChannelId) return { error: 'Aucun salon d\'enchères configuré.' };

  const guild = await client.guilds.fetch(guildId);
  const channel = await guild.channels.fetch(config.auctionChannelId);
  if (!channel) return { error: 'Salon d\'enchères introuvable.' };

  const endsAt = Date.now() + durationMinutes * 60 * 1000;

  const auction = {
    id: `auction_${Date.now()}`,
    itemId: item.id,
    itemName: item.name,
    itemDescription: item.description,
    itemImage: item.image || null,
    startingPrice: item.startingPrice,
    currentPrice: item.startingPrice,
    currentBidderId: null,
    currentBidderTag: null,
    endsAt,
    messageId: null,
    channelId: config.auctionChannelId,
    guildId,
    status: 'active',
    minIncrement: config.minBidIncrement || 1,
    currency: config.currency || '🪙',
  };

  const embed = buildAuctionEmbed(auction);
  const components = buildAuctionComponents(auction);

  const message = await channel.send({ embeds: [embed], components });
  auction.messageId = message.id;

  db.get('auctions').push(auction).write();

  // Log
  await sendLog(client, guildId, `🏷️ Nouvelle enchère créée : **${item.name}** — Prix de départ : **${item.startingPrice} ${config.currency}**`);

  return { success: true, auction };
}

/**
 * Place a bid on an auction
 */
async function placeBid(client, auctionId, userId, userTag, amount) {
  const auction = db.get('auctions').find({ id: auctionId, status: 'active' }).value();
  if (!auction) return { error: 'Enchère introuvable ou terminée.' };

  if (Date.now() > auction.endsAt) return { error: 'Cette enchère est déjà terminée.' };

  const minBid = auction.currentPrice + (auction.minIncrement || 1);
  if (amount < minBid) {
    return { error: `L'enchère minimum est de **${minBid} ${auction.currency}**.` };
  }

  if (auction.currentBidderId === userId) {
    return { error: 'Tu es déjà le meilleur enchérisseur !' };
  }

  const previousBidderId = auction.currentBidderId;
  const previousPrice = auction.currentPrice;

  // Update auction
  db.get('auctions').find({ id: auctionId }).assign({
    currentPrice: amount,
    currentBidderId: userId,
    currentBidderTag: userTag,
  }).write();

  const updatedAuction = db.get('auctions').find({ id: auctionId }).value();

  // Update the message
  try {
    const guild = await client.guilds.fetch(auction.guildId);
    const channel = await guild.channels.fetch(auction.channelId);
    const message = await channel.messages.fetch(auction.messageId);
    const embed = buildAuctionEmbed(updatedAuction);
    const components = buildAuctionComponents(updatedAuction);
    await message.edit({ embeds: [embed], components });
  } catch (e) {
    console.error('Erreur mise à jour message enchère:', e);
  }

  // Notify previous bidder
  if (previousBidderId && previousBidderId !== userId) {
    try {
      const prevUser = await client.users.fetch(previousBidderId);
      await prevUser.send(`❌ Tu as été surenchéri sur **${auction.itemName}** ! L'enchère est maintenant à **${amount} ${auction.currency}**.`).catch(() => {});
    } catch {}
  }

  // Log
  await sendLog(client, auction.guildId, `💰 **${userTag}** a enchéri **${amount} ${auction.currency}** sur **${auction.itemName}** (était ${previousPrice} ${auction.currency})`);

  return { success: true, auction: updatedAuction };
}

/**
 * Check for expired auctions and close them
 */
async function checkExpiredAuctions(client) {
  const now = Date.now();
  const expiredAuctions = db.get('auctions')
    .filter(a => a.status === 'active' && a.endsAt <= now)
    .value();

  for (const auction of expiredAuctions) {
    await closeAuction(client, auction.id);
  }
}

/**
 * Close an auction (end it)
 */
async function closeAuction(client, auctionId) {
  const auction = db.get('auctions').find({ id: auctionId }).value();
  if (!auction || auction.status !== 'active') return;

  db.get('auctions').find({ id: auctionId }).assign({ status: 'ended' }).write();

  try {
    const guild = await client.guilds.fetch(auction.guildId);
    const channel = await guild.channels.fetch(auction.channelId);
    const message = await channel.messages.fetch(auction.messageId);

    const embed = buildAuctionEmbed({ ...auction, status: 'ended' });
    await message.edit({ embeds: [embed], components: [] });

    // Announce winner
    if (auction.currentBidderId) {
      await channel.send(
        `🏆 L'enchère pour **${auction.itemName}** est terminée ! Félicitations à <@${auction.currentBidderId}> qui a remporté l'objet pour **${auction.currentPrice} ${auction.currency}** !`
      );
      // DM winner
      try {
        const winner = await client.users.fetch(auction.currentBidderId);
        await winner.send(`🎉 Tu as remporté l'enchère pour **${auction.itemName}** pour **${auction.currentPrice} ${auction.currency}** ! Contacte un administrateur pour récupérer ton lot.`).catch(() => {});
      } catch {}
    } else {
      await channel.send(`❌ L'enchère pour **${auction.itemName}** est terminée sans enchérisseur.`);
    }

    await sendLog(client, auction.guildId, auction.currentBidderId
      ? `✅ Enchère terminée : **${auction.itemName}** remportée par **${auction.currentBidderTag}** pour **${auction.currentPrice} ${auction.currency}**`
      : `❌ Enchère terminée sans enchérisseur : **${auction.itemName}**`
    );
  } catch (e) {
    console.error('Erreur fermeture enchère:', e);
  }
}

/**
 * Send a log message
 */
async function sendLog(client, guildId, message) {
  const config = db.get('config').value();
  if (!config.logChannelId) return;
  try {
    const guild = await client.guilds.fetch(guildId);
    const channel = await guild.channels.fetch(config.logChannelId);
    await channel.send(`\`[${new Date().toLocaleTimeString('fr-FR')}]\` ${message}`);
  } catch {}
}

module.exports = { createAuction, placeBid, checkExpiredAuctions, closeAuction };
