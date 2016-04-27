var extensions = require('./lib/extensions')

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
    stagingPresenterURL: {
      type: String
    },
    stagingContentServiceURL: {
      type: String
    },
    stagingContentServiceAdminAPIKey: {
      type: String
    },
    slackWebhookURL: {
      type: String
    },
    slackChannel: {
      type: String
    },
    verbose: {
      type: Boolean,
      default: false
    }
  },

  routes: function (app, context) {
    // We don't actually register any routes, but we *do* take the opportunity to yoink references
    // to internal Strider things.
    extensions.remember(context)
  }
}
