var async = require('async');
var path = require('path');
var fs = require('fs');
var stream = require('stream');

var walk = require('walk');
var Docker = require('dockerode');

var ignored = [
  '.git',
  '.npm',
  '.tmp',
  'node_modules'
];

var assetPreparerImage = "quay.io/deconst/preparer-asset";

var docker = null;

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
        toolbelt.info("%s does not contain a deconst-control-build entry point.", fullPath);
        return cb(null);
      }

      toolbelt.info("Submitting assets found at %s");
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

var connect = function (toolbelt) {
  if (docker !== null) {
    return;
  }

  toolbelt.debug('Connecting to Docker', {
    DOCKER_HOST: process.env.DOCKER_HOST,
    DOCKER_TLS_VERIFY: process.env.DOCKER_TLS_VERIFY,
    DOCKER_CERT_PATH: process.env.DOCKER_CERT_PATH
  });
};

var pullPreparerContainer = function (state) {
  return function (callback) {
    state.toolbelt.debug("Pulling latest preparer container.");

    docker.pull(assetPreparerImage, function (err, stream) {
      if (err) return callback(err);

      var onProgress = function (e) { };

      var onFinished = function (err, output) {
        if (err) return callback(err);

        state.toolbelt.debug("Preparer container image updated.");
        callback(null);
      };

      docker.modem.followProgress(stream, onFinished, onProgress);
    });
  };
};

var createPreparerContainer = function (state) {
  return function (callback) {
    var config = state.toolbelt.config;

    var volumeRoot = path.resolve(process.cwd(), state.root);
    var containerPath = "/var/control-repo";

    var bind = volumeRoot + ":" + containerPath;

    var env = [
      "CONTENT_STORE_URL=" + config.contentServiceURL,
      "CONTENT_STORE_APIKEY=" + config.contentServiceAdminAPIKey,
      "TRAVIS_PULL_REQUEST=false"
    ];

    if (config.contentServiceTLSVerify === false) {
      env.push("NODE_TLS_REJECT_UNAUTHORIZED=0");
    }

    var params = {
      Image: assetPreparerImage,
      Env: env,
      Mounts: [
        {
          Source: volumeRoot,
          Destination: containerPath,
          Mode: "rw",
          RW: true
        }
      ],
      HostConfig: {
        Binds: [bind]
      }
    };

    state.toolbelt.debug("Creating preparer container.", params);

    docker.createContainer(params, function (err, container) {
      if (err) return callback(err);

      state.container = container;
      callback(null);
    });
  };
};

var preparerContainerLogs = function (state) {
  return function (callback) {
    state.toolbelt.debug("Reporting logs from the preparer container.", {
      containerId: state.container.id
    });

    var logStream = new stream.PassThrough();

    logStream.on('data', function (chunk) {
      state.toolbelt.info(chunk.toString('utf-8'));
    });

    state.container.logs({
      follow: true,
      stdout: true,
      stderr: true
    }, function (err, stream) {
      if (err) return callback(err);

      state.container.modem.demuxStream(stream, logStream, logStream);

      callback(null);
    });
  };
};

var startPreparerContainer = function (state) {
  return function (callback) {
    state.toolbelt.debug("Starting preparer container.", {
      containerId: state.container.id
    });

    state.container.start(callback);
  };
};

var waitForCompletion = function (state) {
  return function (callback) {
    state.toolbelt.debug("Waiting for preparer container completion.", {
      containerId: state.container.id
    });

    state.container.wait(function (err, result) {
      state.status = result.StatusCode;
      callback(null);
    });
  };
};

var removePreparerContainer = function (state) {
  return function (callback) {
    state.toolbelt.debug("Removing completed preparer container.", {
      containerId: state.container.id
    });

    state.container.remove({}, function (err) {
      callback(err);
    });
  };
};

var prepare = function (toolbelt, root, callback) {
  connect(toolbelt);

  var state = {
    toolbelt: toolbelt,
    root: root,
    container: null
  };

  async.series([
    pullPreparerContainer(state),
    createPreparerContainer(state),
    preparerContainerLogs(state),
    waitForCompletion(state),
    removePreparerContainer(state)
  ], function (err) {
    if (err) {
      toolbelt.error("Error running the asset preparer.", err);
      return callback(err, false);
    }

    toolbelt.info("Asset preparer completed.", {
      status: state.status
    });

    callback(null, state.status === 0);
  });
};
