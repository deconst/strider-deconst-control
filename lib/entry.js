var async = require('async')

var parsing = require('./parsing')
var build = require('./build')
var prepare = require('./prepare')
var access = require('./access')

exports.prepareControlRepository = function (toolbelt, callback) {
  async.parallel([
    assetHandler(toolbelt),
    grantControlRepoAccess(toolbelt),
    contentRepositoryListHandler(toolbelt)
  ], callback)
}

var assetHandler = function (toolbelt) {
  return function (callback) {
    prepare.recursivelyPrepare(toolbelt, callback)
  }
}

var grantControlRepoAccess = function (toolbelt) {
  return function (callback) {
    access.grantUsersAccess(toolbelt, toolbelt.project.name, callback)
  }
}

var contentRepositoryListHandler = function (toolbelt) {
  return function (callback) {
    parsing.controlRepoList(toolbelt, function (err, list) {
      if (err) {
        if (err.code === 'ENOENT') {
          toolbelt.info('No content-repositories.json file found.')
          toolbelt.info('Skipping control repository build setup.')

          return callback(null)
        }

        return callback(err)
      }

      toolbelt.info('Configuring %s builds.', list.length)

      async.map(list, async.apply(build.create, toolbelt), callback)
    })
  }
}
