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

exports.shouldEnableGithubStatusPlugin = function (toolbelt) {
  return !! githubStatusPlugin;
};

exports.shouldEnableSlackPlugin = function (toolbelt) {
  return slackPlugin && toolbelt.config.slackWebhookURL;
};
