var Toolbelt = require('./lib/toolbelt').Toolbelt;
var entry = require('./lib/entry');

exports.init = function (config, job, jobContext, callback) {
  callback(null, {
    env: {},
    path: [],

    deploy: function (phaseContext, cb) {
      var toolbelt = new Toolbelt(config, job, jobContext, phaseContext);

      var err = toolbelt.connectToGitHub();
      if (err) return callback(err);

      entry.prepareControlRepository(toolbelt, callback);
    }
  });
};
