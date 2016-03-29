var path = require('path');
var util = require('util');
var request = require('request');

var githubProviderPlugin = null;
var deconstContentPlugin = null;
var githubStatusPlugin = null;
var slackPlugin = null;

exports.rememberExtensions = function (context) {
  var extensions = context.loader.extensions;

  githubProviderPlugin = extensions.provider.github;
  deconstContentPlugin = extensions.job['deconst-content'];
  githubStatusPlugin = extensions.job['github-status'];
  slackPlugin = extensions.job.slack;
};

var Toolbelt = function (config, job, jobContext, phaseContext) {
  this.config = config;
  this.job = job;
  this.jobContext = jobContext;
  this.phaseContext = phaseContext;

  this.user = this.job.project.creator;
  this.project = this.job.project;

  this.models = {
    Project: this.job.project.constructor,
    User: this.user.constructor
  };

  this.githubProviderPlugin = githubProviderPlugin;
  this.deconstContentPlugin = deconstContentPlugin;
};

Toolbelt.prototype.githubAccount = function () {
  for (var i = 0; i < this.user.accounts.length; i++) {
    var account = this.user.accounts[i];

    if (account.provider === 'github') {
      return account;
    }
  }
};

Toolbelt.prototype.workspacePath = function (subpath) {
  return path.join(this.jobContext.dataDir, subpath || '');
};

Toolbelt.prototype.connectToGitHub = function () {
  if (this.githubAPI) return null;

  if (!this.githubProviderPlugin) {
    return new Error("The GitHub provider plugin is not installed.");
  }

  var githubAccount = this.githubAccount();

  if (githubAccount && githubAccount.config.accessToken) {
    this.githubAPI = request.defaults({
      baseUrl: 'https://api.github.com',
      json: true,
      headers: {
        Authorization: 'token ' + githubAccount.config.accessToken,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'request strider-deconst-control'
      }
    });

    return null;
  } else {
    return new Error("The account owning this job's project must be connected to GitHub.");
  }
};

Toolbelt.prototype.connectToContentService = function () {
  if (this.contentAPI) return null;

  var contentServiceURL = this.config.contentServiceURL;
  var adminAPIKey = this.config.contentServiceAdminAPIKey;

  if (contentServiceURL && adminAPIKey) {
    this.contentAPI = request.defaults({
      baseUrl: contentServiceURL,
      json: true,
      headers: {
        Authorization: util.format('deconst apikey="%s"', adminAPIKey),
        'User-Agent': 'request strider-deconst-control'
      },
      agentOptions: {
        rejectUnauthorized: this.config.contentServiceTLSVerify
      }
    });

    return null;
  } else {
    return new Error("Admin API key and content service URL are required to configure new builds.");
  }
};

Toolbelt.prototype.shouldEnableGithubStatusPlugin = function () {
  return !! githubStatusPlugin;
};

Toolbelt.prototype.shouldEnableSlackPlugin = function () {
  return slackPlugin && this.config.slackWebhookURL;
};

// Logging messages

var makeWriter = function (prefix, onlyIf) {
  return function () {
    if (onlyIf && !onlyIf.apply(this)) return;

    var text = util.format.apply(null, arguments);

    if (text.substr(-1) !== '\n') {
      text += '\n';
    }

    this.phaseContext.out(prefix + text);
  };
};

Toolbelt.prototype.info = makeWriter("");
Toolbelt.prototype.error = makeWriter("!! ");
Toolbelt.prototype.debug = makeWriter(">> ", function () {
  return this.config.verbose;
});

exports.Toolbelt = Toolbelt;
