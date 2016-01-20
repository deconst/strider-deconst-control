var util = require('util');
var async = require('async');
var keypair = require('ssh-keypair');

var github = require('./github');

exports.create = function (toolbelt, repository, callback) {
  if (!repository.kind) {
    toolbelt.error("Repository kind must be specified.", repository);

    return callback(null);
  }

  var buildMaker = buildMakers[repository.kind];
  if (!buildMaker) {
    toolbelt.error("Unrecognized build kind: %s", repository.kind);

    return callback(null);
  }

  buildMaker(toolbelt, repository, function (err) {
    if (err) {
      toolbelt.error("Repository not created: %s", err.message, repository);
    }

    callback(null);
  });
};

var createGitHubBuild = function (toolbelt, repository, callback) {
  var Project = toolbelt.models.Project;
  var User = toolbelt.models.User;

  if (!repository.project) {
    toolbelt.error("Repository project must be specified.", repository);

    return callback(null);
  }

  var githubAccount = toolbelt.githubAccount();
  var projectName = repository.project.toLowerCase().replace(/ /g, '-');

  var githubProject = null;
  var striderProject = null;
  var privateKey = null;
  var publicKey = null;

  var checkForExistingProject = function (callback) {
    toolbelt.debug("Checking for existing project %s.", projectName);

    Project.findOne({ name: projectName }, function (err, p) {
      if (err) {
        toolbelt.error("Unable to check for existing project %s", projectName);

        return callback(err);
      }

      if (p) {
        // This project already exists.
        toolbelt.debug("The project %s already exists.", projectName);

        return callback(null, true);
      }

      callback(null, false);
    });
  };

  var fetchRepositoryData = function (callback) {
    toolbelt.debug("Fetching repository data from GitHub for %s.", repository.project);

    github.getRepository(toolbelt, repository.project, function (err, p) {
      if (err) {
        if (err.notFound) {
          toolbelt.error(
            "Unable to see GitHub repository %s as user %s.",
            repository.project, githubAccount.config.login);
          toolbelt.error(
            "Have you granted %s access rights to that repository?",
            githubAccount.config.login);
        } else {
          toolbelt.error("Unable to fetch GitHub project %s", repository.project);
        }

        return callback(err);
      }

      githubProject = p;
      callback(null);
    });
  };

  var generateKeyPair = function (callback) {
    toolbelt.debug("Generating keypair for %s.", projectName);

    keypair(projectName + '-' + toolbelt.user.email, function (err, priv, pub) {
      if (err) return callback(err);

      privateKey = priv;
      publicKey = pub;
      callback(null);
    });
  };

  var createStriderProject = function (callback) {
    toolbelt.debug("Creating Strider project for %s.", projectName);

    var provider = {
      id: 'github',
      account: githubAccount.id,
      repo_id: githubProject.id,
      config: {
        auth: { type: 'https' },
        repo: githubProject.repo,
        owner: githubProject.owner.login,
        url: githubProject.clone_url
      }
    };

    var projectAttrs = {
      name: projectName,
      display_name: githubProject.name,
      display_url: githubProject.display_url,
      public: false,
      prefetch_config: false,
      creator: toolbelt.user._id,
      provider: provider,
      branches: [
        {
          name: 'master',
          active: true,
          mirror_master: false,
          deploy_on_green: true,
          pubkey: publicKey,
          privkey: privateKey,
          plugins: [],
          runner: { id: 'simple-runner', config: { pty: false } }
        },
        {
          name: '*',
          mirror_master: true
        }
      ]
    };

    toolbelt.debug("Setting up GitHub provider plugin for %s.", projectName);

    toolbelt.githubProviderPlugin.webapp.setupRepo(githubAccount.config, provider.config, projectAttrs, function (err, config) {
      if (err) {
        toolbelt.error("Unable to initialize project with GitHub provider", err);
        return callback(err);
      }

      projectAttrs.provider.config = config;

      toolbelt.debug("Creating Strider project for %s.", projectName);

      Project.create(projectAttrs, function (err, project) {
        if (err) {
          toolbelt.error("Unable to create Strider project %s", projectName, err);
          return callback(err);
        }

        callback(null);
      });
    });
  };

  var grantUsersAccess = function (callback) {
    toolbelt.debug("Granting users access to %s.", projectName);

    User.update({ _id: toolbelt.user._id }, {
      $push: {
        projects: {
          name: projectName,
          display_name: githubProject.name,
          access_level: 2
        }
      }
    }, function (err, count) {
      if (err) {
        toolbelt.error("Failed to give %s admin access to the project %s.", toolbelt.user.email, projectName, err);
      }

      if (count < 1) {
        toolbelt.error("User %s not found to grant admin access to project %s.", toolbelt.user.email, projectName);
      }

      callback(null);
    });
  };

  checkForExistingProject(function (err, exists) {
    if (err || exists) return callback(null);
    if (exists) return callback(null);

    async.series([
      fetchRepositoryData,
      generateKeyPair,
      createStriderProject,
      grantUsersAccess
    ], function (err) {
      if (err) {
        toolbelt.error("Failed to create build for project %s: %s", projectName, err.message);
      } else {
        toolbelt.info("Successfully created build for project %s.", projectName);
      }

      callback(null);
    });
  });
};

var buildMakers = {
  github: createGitHubBuild
};
