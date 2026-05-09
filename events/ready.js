module.exports = {
  name: 'ready',
  once: true,
  execute(client) {
    console.log(`🤖 ${client.user.tag} est prêt !`);
    client.user.setActivity('les enchères 🔨', { type: 3 }); // WATCHING
  },
};
