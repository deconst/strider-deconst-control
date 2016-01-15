module.exports = {
  config: {
    contentServiceURL: {
      type: String
    },
    contentServiceAdminAPIKey: {
      type: String
    },
    contentServiceTLSVerify: {
      type: Boolean,
      default: true
    },
    verbose: {
      type: Boolean,
      default: false
    }
  }
};
