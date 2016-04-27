var remembered = {}

exports.remember = function (context) {
  var extensions = context.loader.extensions

  remembered.githubProvider = extensions.provider.github
  remembered.deconstContent = extensions.job['deconst-content']
  remembered.githubStatus = extensions.job['github-status']
  remembered.slack = extensions.job.slack
}

exports.plugin = function (name) {
  return remembered[name]
}

exports.shouldEnableGithubStatusPlugin = function (toolbelt) {
  return !!remembered.githubStatus
}

exports.shouldEnableSlackPlugin = function (toolbelt) {
  return remembered.slack && toolbelt.config.slackWebhookURL
}
