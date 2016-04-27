var fs = require('fs')

exports.controlRepoList = function (toolbelt, callback) {
  var listPath = toolbelt.workspacePath('content-repositories.json')

  fs.readFile(listPath, { encoding: 'utf-8' }, function (err, contents) {
    if (err) return callback(err)

    var docs = null
    try {
      docs = JSON.parse(contents)
    } catch (e) {
      return callback(e)
    }

    return callback(null, docs)
  })
}
