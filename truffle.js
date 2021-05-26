module.exports = {
  networks: {
    test: {
      host: "localhost",
      port: 8545,
      network_id: "*" // Match any network id
    }
  },
  compilers: {
  	solc: { version: "0.8.4" },
  },
};
