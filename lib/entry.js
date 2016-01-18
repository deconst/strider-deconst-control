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
    var nonfatal = function (err) {
      toolbelt.error(err.message);
      callback(null, false);
    };

    parsing.controlRepoList(toolbelt, function (err, list) {
      if (err) {
        toolbelt.error("");

        return callback(null);
      }

      toolbelt.info("Configuring %s builds.", list.length);

      async.map(list, async.apply(build.create, toolbelt), callback);
    });
  };
};
