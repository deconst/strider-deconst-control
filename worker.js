var Toolbelt = require('strider-deconst-common').Toolbelt;
var entry = require('./lib/entry');

exports.init = function (config, job, jobContext, callback) {
  callback(null, {
    env: {},
    path: [],

    deploy: function (phaseContext, cb) {
      var toolbelt = new Toolbelt(config, job, jobContext, phaseContext);

      if (hadError(toolbelt.connectToDocker()), cb) return;
      if (hadError(toolbelt.connectToGitHub()), cb) return;
      if (hadError(toolbelt.connectToContentService(true), cb)) return;

      entry.prepareControlRepository(toolbelt, function (err) {
        if (hadError(err, cb)) return;
        cb(null, true);
      });
    }
  });
};

var hadError = function (err, callback) {
  if (err) {
    err.type = 'exitCode';
    err.code = 1;

    if (callback) callback(err);
    return true
  }

  return false
}
