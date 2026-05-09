const { getDb } = require('./database');
const { buildAuctionEmbed, buildAuctionComponents } = require('./embedBuilder');

async function createAuction(client, item, durationMinutes, guildId) {
  const db = getDb(guildId);
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
  await sendLog(client, guildId, `🏷️ Nouvelle enchère : **${item.name}** — Départ : **${item.startingPrice} ${config.currency}**`);

  return { success: true, auction };
}

async function placeBid(client, auctionId, guildId, userId, userTag, amount) {
  const db = getDb(guildId);
  const auction = db.get('auctions').find({ id: auctionId, status: 'active' }).value();
  if (!auction) return { error: 'Enchère introuvable ou terminée.' };
  if (Date.now() > auction.endsAt) return { error: 'Cette enchère est déjà terminée.' };

  const minBid = auction.currentPrice + (auction.minIncrement || 1);
  if (amount < minBid) return { error: `L'enchère minimum est de **${minBid} ${auction.currency}**.` };
  if (auction.currentBidderId === userId) return { error: 'Tu es déjà le meilleur enchérisseur !' };

  const previousBidderId = auction.currentBidderId;
  const previousPrice = auction.currentPrice;

  db.get('auctions').find({ id: auctionId }).assign({
    currentPrice: amount,
    currentBidderId: userId,
    currentBidderTag: userTag,
  }).write();

  const updatedAuction = db.get('auctions').find({ id: auctionId }).value();

  try {
    const guild = await client.guilds.fetch(guildId);
    const channel = await guild.channels.fetch(auction.channelId);
    const message = await channel.messages.fetch(auction.messageId);
    await message.edit({ embeds: [buildAuctionEmbed(updatedAuction)], components: buildAuctionComponents(updatedAuction) });
  } catch (e) { console.error('Erreur MAJ message:', e); }

  if (previousBidderId && previousBidderId !== userId) {
    try {
      const prevUser = await client.users.fetch(previousBidderId);
      await prevUser.send(`❌ Tu as été surenchéri sur **${auction.itemName}** ! L'enchère est à **${amount} ${auction.currency}**.`).catch(() => {});
    } catch {}
  }

  await sendLog(client, guildId, `💰 **${userTag}** a enchéri **${amount} ${auction.currency}** sur **${auction.itemName}** (était ${previousPrice} ${auction.currency})`);
  return { success: true, auction: updatedAuction };
}

async function checkExpiredAuctions(client) {
  const now = Date.now();
  for (const guild of client.guilds.cache.values()) {
    const db = getDb(guild.id);
    const expired = db.get('auctions').filter(a => a.status === 'active' && a.endsAt <= now).value();
    for (const auction of expired) {
      await closeAuction(client, auction.id, guild.id);
    }
  }
}

async function closeAuction(client, auctionId, guildId) {
  const db = getDb(guildId);
  const auction = db.get('auctions').find({ id: auctionId }).value();
  if (!auction || auction.status !== 'active') return;

  db.get('auctions').find({ id: auctionId }).assign({ status: 'ended' }).write();

  try {
    const guild = await client.guilds.fetch(guildId);
    const channel = await guild.channels.fetch(auction.channelId);
    const message = await channel.messages.fetch(auction.messageId);
    await message.edit({ embeds: [buildAuctionEmbed({ ...auction, status: 'ended' })], components: [] });

    if (auction.currentBidderId) {
      await channel.send(`🏆 Enchère terminée ! Félicitations à <@${auction.currentBidderId}> qui remporte **${auction.itemName}** pour **${auction.currentPrice} ${auction.currency}** !`);
      try {
        const winner = await client.users.fetch(auction.currentBidderId);
        await winner.send(`🎉 Tu as remporté **${auction.itemName}** pour **${auction.currentPrice} ${auction.currency}** ! Contacte un administrateur pour récupérer ton lot.`).catch(() => {});
      } catch {}
    } else {
      await channel.send(`❌ Enchère terminée sans enchérisseur : **${auction.itemName}**.`);
    }

    await sendLog(client, guildId, auction.currentBidderId
      ? `✅ **${auction.itemName}** remportée par **${auction.currentBidderTag}** pour **${auction.currentPrice} ${auction.currency}**`
      : `❌ **${auction.itemName}** terminée sans enchérisseur`
    );
  } catch (e) { console.error('Erreur fermeture enchère:', e); }
}

async function sendLog(client, guildId, message) {
  const db = getDb(guildId);
  const config = db.get('config').value();
  if (!config.logChannelId) return;
  try {
    const guild = await client.guilds.fetch(guildId);
    const channel = await guild.channels.fetch(config.logChannelId);
    await channel.send(`\`[${new Date().toLocaleTimeString('fr-FR')}]\` ${message}`);
  } catch {}
}

module.exports = { createAuction, placeBid, checkExpiredAuctions, closeAuction };
