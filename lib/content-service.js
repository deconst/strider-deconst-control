var request = require('request');

exports.issueAPIKey = function (toolbelt, keyName, callback) {
  toolbelt.contentAPI.post({
    url: '/keys',
    qs: { named: keyName }
  }, function (err, resp, body) {
    if (err) return callback(err);

    if (resp.statusCode !== 200) {
      toolbelt.error('Unable to issue a new API key. Status: %s', resp.status, body);
      toolbelt.error('Does the API key for this build have admin rights?');

      return callback(new Error('Unable to issue API key'));
    }

    callback(null, body.apikey);
  });
};

exports.revokeAPIKey = function (toolbelt, key, callback) {
  toolbelt.contentAPI.del({
    url: '/keys/' + encodeURIComponent(key),
  }, function (err, resp, body) {
    if (err) return callback(err);

    if (resp.statusCode !== 204) {
      toolbelt.error('Unable to revoke an API key. Status: %s', resp.status, body);

      return callback(new Error('Unable to revoke API key'));
    }

    callback(null);
  });
};
