var Toolbelt = require('./lib/toolbelt').Toolbelt;
var entry = require('./lib/entry');

exports.init = function (config, job, context, callback) {
  var toolbelt = new Toolbelt(config, job, context);

  var err = toolbelt.connectToGitHub();
  if (err) return callback(err);

  entry.prepareControlRepository(toolbelt, callback);
};
