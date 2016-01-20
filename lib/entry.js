var fs = require('fs');
var async = require('async');

var parsing = require('./parsing');
var build = require('./build');

exports.prepareControlRepository = function (toolbelt, callback) {
  async.parallel([
    gruntFileHandler(toolbelt),
    contentRepositoryListHandler(toolbelt)
  ], callback);
};

var gruntFileHandler = function (toolbelt) {
  return function (callback) {
    // TODO walk.walk and invoke Grunt
    callback(null);
  };
};

var contentRepositoryListHandler = function (toolbelt) {
  return function (callback) {
    parsing.controlRepoList(toolbelt, function (err, list) {
      if (err) {
        if (err.code === 'ENOENT') {
          toolbelt.info("No content-repositories.json file found.");
          toolbelt.info("Skipping control repository build setup.");

          return callback(null);
        }

        return callback(err);
      }

      toolbelt.info("Configuring %s builds.", list.length);

      async.map(list, async.apply(build.create, toolbelt), callback);
    });
  };
};
