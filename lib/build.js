var util = require('util');
var async = require('async');
var keypair = require('ssh-keypair');

var github = require('./github');

exports.create = function (toolbelt, repository, callback) {
  if (!repository.kind) {
    return callback(new Error("Repository kind must be specified. " + util.inspect(repository)));
  }

  var buildMaker = buildMakers[repository.kind];
  if (!buildMaker) {
    return callback(new Error("Unrecognized build kind: " + respository.kind));
  }

  buildMaker(toolbelt, repository, function (err) {
    if (err) {
      toolbelt.error("Repository not created: ", err.message, repository);
    }

    callback(null);
  });
};

var createGitHubBuild = function (toolbelt, repository, callback) {
  var Project = toolbelt.models.Project;
  var User = toolbelt.models.User;

  if (!repository.project) {
    return callback(new Error("Repository project must be specified. " + util.inspect(repository)));
  }

  var githubAccount = toolbelt.githubAccount();
  var projectName = repository.project.toLowerCase().replace(/ /g, '-');

  var githubProject = null;
  var striderProject = null;
  var privateKey = null;
  var publicKey = null;

  var checkForExistingProject = function (callback) {
    Project.findOne({ name: projectName }, function (err, p) {
      if (err) {
        toolbelt.error("Unable to check for existing project %s", projectName);
        return callback(err);
      }

      if (project) {
        // This project already exists.
        toolbelt.debug("The project %s already exists.", projectName);

        return callback(null, true);
      }

      callback(null, false);
    });
  };

  var fetchRepositoryData = function (callback) {
    github.getRepository(toolbelt, repository.project, function (err, p) {
      if (err) {
        if (err.notFound) {
          toolbelt.error(
            "Unable to see GitHub repository %s as user %s.",
            repository.project, githubAccount.login);
          toolbelt.error(
            "Have you granted %s access rights to that repository?",
            githubAccount.login);
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
    keypair(repository.name + '-' + toolbelt.user.email, function (err, priv, pub) {
      if (err) return callback(err);

      privateKey = priv;
      publicKey = pub;
      callback(null);
    });
  };

  var createStriderProject = function (callback) {
    var providerConfig = {
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
      provider: providerConfig,
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

    toolbelt.githubProviderPlugin.setupRepo(githubAccount.config, providerConfig, projectAttrs, function (err, config) {
      if (err) {
        toolbelt.error("Unable to initialize project with GitHub provider", err);
        return callback(err);
      }

      projectAttrs.provider.config = config;

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
    if (err) return callback(err);
    if (exists) return callback(null);

    async.series([
      fetchRepositoryData,
      generateKeyPair,
      createStriderProject,
      grantUsersAccess
    ], callback);
  });
};

var buildMakers = {
  github: createGitHubBuild
};
