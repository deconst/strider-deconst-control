var async = require('async');

exports.grantUsersAccess = function (toolbelt, projectName, callback) {
  var User = toolbelt.models.User;

  toolbelt.debug("Granting users access to %s.", projectName);

  User.find({}, function (err, us) {
    if (err) {
      toolbelt.error("Unable to list users: %s", err.message);
      return callback(null);
    }

    var grantUserAccess = function (u, cb) {
      var alreadyHasAccess = u.projects.some(function (p) {
        return p.name === projectName;
      });

      if (alreadyHasAccess) {
        return cb(null);
      }

      User.update({ _id: u._id }, {
        $push: {
          projects: {
            name: projectName,
            display_name: projectName,
            access_level: 1
          }
        }
      }, function (err, count) {
        if (err) {
          toolbelt.error("Unable to grant user %s access to project %s", u.email, projectName);
        } else if (count < 1) {
          toolbelt.error("No users updated when granting user %s access to project %s", u.email, projectName);
        }

        cb(null);
      });
    };

    async.map(us, grantUserAccess, callback);
  });
};
