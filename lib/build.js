var async = require('async')
var keypair = require('ssh-keypair')

var extensions = require('./extensions')
var grantUsersAccess = require('./access').grantUsersAccess

exports.create = function (toolbelt, repository, callback) {
  if (!repository.kind) {
    toolbelt.error('Repository kind must be specified.', repository)

    return callback(null)
  }

  var buildMaker = buildMakers[repository.kind]
  if (!buildMaker) {
    toolbelt.error('Unrecognized build kind: %s', repository.kind)

    return callback(null)
  }

  buildMaker(toolbelt, repository, function (err) {
    if (err) {
      toolbelt.error('Repository not created: %s', err.message, repository)
    }

    callback(null)
  })
}

var createGitHubBuild = function (toolbelt, repository, callback) {
  var Project = toolbelt.models.Project

  var contentService = toolbelt.contentService
  var github = toolbelt.github

  if (!repository.project) {
    toolbelt.error('Repository project must be specified.', repository)

    return callback(null)
  }

  var deploymentBranches = repository.branches || ['master']

  var githubAccount = toolbelt.githubAccount()
  var projectName = repository.project.toLowerCase().replace(/ /g, '-')

  var githubProject = null
  var privateKey = null
  var publicKey = null
  var contentServiceAPIKey = null
  var wasVerbose = false

  var checkForExistingProject = function (callback) {
    toolbelt.debug('Checking for existing project %s.', projectName)

    Project.findOne({ name: projectName }, function (err, p) {
      if (err) {
        toolbelt.error('Unable to check for existing project %s', projectName)

        return callback(err)
      }

      if (p) {
        // This project already exists.
        toolbelt.debug('The project %s already exists.', projectName)

        if (p.branches.length > 0) {
          privateKey = p.branches[0].privkey
          publicKey = p.branches[0].pubkey

          var plugins = p.branches[0].plugins
          for (var i = 0; i < plugins.length; i++) {
            if (plugins[i].id === 'deconst-content') {
              contentServiceAPIKey = plugins[i].config.contentServiceAPIKey
              wasVerbose = plugins[i].config.verbose
            }
          }

          return callback(null, true)
        } else {
          generateKeyPair(function (err) {
            if (err) return callback(err)
            callback(null, true)
          })
          return
        }
      }

      callback(null, false)
    })
  }

  var fetchRepositoryData = function (callback) {
    toolbelt.debug('Fetching repository data from GitHub for %s.', repository.project)

    github.getRepository(repository.project, function (err, p) {
      if (err) {
        if (err.notFound) {
          toolbelt.error(
            'Unable to see GitHub repository %s as user %s.',
            repository.project, githubAccount.config.login)
          toolbelt.error(
            'Have you granted %s access rights to that repository?',
            githubAccount.config.login)
        } else {
          toolbelt.error('Unable to fetch GitHub project %s', repository.project)
        }

        return callback(err)
      }

      githubProject = p
      callback(null)
    })
  }

  var generateKeyPair = function (callback) {
    toolbelt.debug('Generating keypair for %s.', projectName)

    keypair(projectName + '-' + toolbelt.user.email, function (err, priv, pub) {
      if (err) return callback(err)

      privateKey = priv
      publicKey = pub
      callback(null)
    })
  }

  var generateProjectBranches = function () {
    var plugins = []

    var deconstContentPlugin = {
      id: 'deconst-content',
      enabled: true,
      showStatus: true,
      config: {
        contentServiceURL: toolbelt.config.contentServiceURL,
        contentServiceTLSVerify: toolbelt.config.contentServiceTLSVerify,
        contentServiceAPIKey: contentServiceAPIKey,
        stagingPresenterURL: toolbelt.config.stagingPresenterURL,
        stagingContentServiceURL: toolbelt.config.stagingContentServiceURL,
        stagingContentServiceAdminAPIKey: toolbelt.config.stagingContentServiceAdminAPIKey,
        verbose: wasVerbose
      }
    }
    plugins.push(deconstContentPlugin)

    if (extensions.shouldEnableGithubStatusPlugin(toolbelt)) {
      var githubStatusPlugin = {
        id: 'github-status',
        enabled: true,
        showStatus: true
      }
      plugins.push(githubStatusPlugin)
    }

    if (extensions.shouldEnableSlackPlugin(toolbelt)) {
      var slackPlugin = {
        id: 'slack',
        enabled: true,
        showStatus: true,
        config: {
          test_fail_message: ':exclamation: (<%= ref.branch %>) :: <<%= process.env.strider_server_name %>/<%= project.name %>/job/<%= _id %>|Tests are failing><% if (trigger.url) { %> :: <<%= trigger.url %>|<%= trigger.message.trim() %>><% } %>',
          test_pass_message: ':white_check_mark: (<%= ref.branch %>) :: <<%= process.env.strider_server_name %>/<%= project.name %>/job/<%= _id %>|Tests are passing><% if (trigger.url) { %> :: <<%= trigger.url %>|<%= trigger.message.trim() %>><% } %>',
          deploy_fail_message: ':boom: (<%= ref.branch %>) :: <<%= process.env.strider_server_name %>/<%= project.name %>/job/<%= _id %>|Deploy exited with a non-zero status!><% if (trigger.url) { %> :: <<%= trigger.url %>|<%= trigger.message.trim() %>><% } %>',
          deploy_pass_message: ':ship: (<%= ref.branch %>) :: <<%= process.env.strider_server_name %>/<%= project.name %>/job/<%= _id %>|Deploy was successful><% if (trigger.url) { %> :: <<%= trigger.url %>|<%= trigger.message.trim() %>><% } %>',
          icon_url: (process.env.strider_server_name || 'http://localhost:3000') + '/ext/slack/bot_avatar',
          username: 'Deconst Strider',
          channel: toolbelt.config.slackChannel || '#deconst',
          webhookURL: toolbelt.config.slackWebhookURL
        }
      }
      plugins.push(slackPlugin)
    }

    var branches = []

    for (var i = 0; i < deploymentBranches.length; i++) {
      var branchName = deploymentBranches[i]

      branches.push({
        name: branchName,
        active: true,
        deploy_on_green: true,
        mirror_master: false,
        pubkey: publicKey,
        privkey: privateKey,
        plugins: plugins,
        runner: { id: 'simple-runner', config: { pty: false } }
      })
    }

    return branches
  }

  var issueAPIKey = function (callback) {
    if (contentServiceAPIKey) {
      return process.nextTick(function () {
        callback(null)
      })
    }

    toolbelt.debug('Issuing content service API key for %s.', projectName)

    contentService.issueAPIKey(projectName, function (err, key) {
      if (err) return callback(err)

      contentServiceAPIKey = key
      callback(null)
    })
  }

  var createStriderProject = function (callback) {
    toolbelt.debug('Creating Strider project for %s.', projectName)

    var provider = {
      id: 'github',
      account: githubAccount.id,
      repo_id: githubProject.id,
      config: {
        auth: { type: 'https' },
        repo: githubProject.full_name,
        owner: githubProject.owner.login,
        url: githubProject.git_url,
        pull_requests: 'all'
      }
    }

    var projectAttrs = {
      name: projectName,
      display_name: githubProject.full_name,
      display_url: githubProject.html_url,
      public: false,
      prefetch_config: false,
      creator: toolbelt.user._id,
      provider: provider,
      branches: generateProjectBranches()
    }

    toolbelt.debug('Setting up GitHub provider plugin for %s.', projectName)

    extensions.plugin('githubProvider').webapp.setupRepo(githubAccount.config, provider.config, projectAttrs, function (err, config) {
      if (err) {
        toolbelt.error('Unable to initialize project with GitHub provider', err)
        return callback(err)
      }

      projectAttrs.provider.config = config

      toolbelt.debug('Creating Strider project for %s.', projectName)

      Project.create(projectAttrs, function (err, project) {
        if (err) {
          toolbelt.error('Unable to create Strider project %s', projectName, err)
          return callback(err)
        }

        callback(null)
      })
    })
  }

  var updateExistingProject = function (callback) {
    var branches = generateProjectBranches()
    Project.update({ name: projectName }, { branches }, callback)
  }

  var grantAccessOnExistingProject = function (callback) {
    grantUsersAccess(toolbelt, projectName, callback)
  }

  checkForExistingProject(function (err, exists) {
    if (err) return callback(null)

    if (exists) {
      async.parallel([
        issueAPIKey,
        updateExistingProject,
        grantAccessOnExistingProject
      ], function (err) {
        if (err) {
          toolbelt.error('Failed to update build for project %s: %s', projectName, err.message)
        }

        callback(null)
      })
    } else {
      async.series([
        fetchRepositoryData,
        generateKeyPair,
        issueAPIKey,
        createStriderProject,
        async.apply(grantUsersAccess, toolbelt, projectName)
      ], function (err) {
        if (err) {
          toolbelt.error('Failed to create build for project %s: %s', projectName, err.message)
        } else {
          toolbelt.info('Successfully created build for project %s.', projectName)
        }

        callback(null)
      })
    }
  })
}

var buildMakers = {
  github: createGitHubBuild
}
