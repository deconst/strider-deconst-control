var async = require('async');
var path = require('path');
var fs = require('fs');
var stream = require('stream');

var walk = require('walk');

var ignored = [
  '.git',
  '.npm',
  '.tmp',
  'node_modules'
];

var assetPreparerImage = "quay.io/deconst/preparer-asset";

exports.recursivelyPrepare = function (toolbelt, callback) {
  walker = walk.walk(toolbelt.workspacePath(), {
    followLinks: false
  });

  walker.on('directories', function (root, stats, cb) {
    toolbelt.debug("Traversing directories within: %s", root);

    // Don't traverse into dot or common build directories.
    for (var i = stats.length; i--; i >= 0) {
      var name = stats[i].name;
      if (ignored.indexOf(name) !== -1) {
        stats.splice(i, 1);
      }
    }

    cb();
  });

  walker.on('files', function (root, stats, cb) {
    var hasPackageJson = stats.some(function (each) {
      return each.name === 'package.json';
    });

    if (!hasPackageJson) return cb(null);

    var fullPath = path.join(root, 'package.json');

    fs.readFile(fullPath, { encoding: 'utf-8' }, function (err, contents) {
      var pkgInfo;
      try {
        pkg = JSON.parse(contents);
      } catch (e) {
        toolbelt.error("%s contains invalid JSON: %s", fullPath, e.message);
        return cb(null);
      }

      if (! pkg.scripts || ! pkg.scripts['deconst-control-build']) {
        toolbelt.debug("%s does not contain a deconst-control-build entry point.", fullPath);
        return cb(null);
      }

      toolbelt.info("Submitting assets found at %s.", root);
      prepare(toolbelt, root, cb);
    });
  });

  walker.on('errors', function (root, stats, cb) {
    toolbelt.error("Error walking %s.", root, stats.map(function (each) {
      return each.error;
    }));

    cb(null);
  });

  walker.on('end', function () {
    toolbelt.info('All assets from repository uploaded.');

    callback(null);
  });
};

var prepare = function (toolbelt, root, callback) {
  var transientKey = null;
  var status = null;

  var contentService = toolbelt.contentService;
  var docker = toolbelt.docker;

  var issueAPIKey = function (cb) {
    toolbelt.debug('Issuing temporary API key.');

    contentService.issueAPIKey('strider-auto-control', function (err, key) {
      if (err) return cb(err);

      transientKey = key;
      cb(null);
    })
  };

  var runAssetPreparer = function (cb) {
    var env = [
      "CONTENT_STORE_URL=" + toolbelt.config.contentServiceURL,
      "CONTENT_STORE_APIKEY=" + transientKey,
      "TRAVIS_PULL_REQUEST=false"
    ];

    if (toolbelt.config.contentServiceTLSVerify === false) {
      env.push("NODE_TLS_REJECT_UNAUTHORIZED=0");
    }

    var params = {
      Image: assetPreparerImage,
      Env: env,
      workspace: {
        root: root,
        rootEnvVar: 'CONTROL_ROOT',
        containerRoot: '/var/control-repo'
      }
    };

    docker.runContainer(params, function (err, result) {
      if (err) return cb(err);
      status = result.status;
      cb(null);
    });
  };

  var revokeAPIKey = function (cb) {
    contentService.revokeAPIKey(transientKey, cb);
  };

  async.series([
    issueAPIKey,
    runAssetPreparer,
    revokeAPIKey
  ], function (err) {
    if (err) {
      toolbelt.error("Error running the asset preparer.", err);
      return callback(err, false);
    }

    toolbelt.info("Asset preparer completed.", { status: status });

    callback(null, status === 0);
  });
};
