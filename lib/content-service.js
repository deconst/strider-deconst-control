var request = require('request');

exports.issueAPIKey = function (toolbelt, keyName, callback) {
  toolbelt.contentAPI.post({
    url: '/keys',
    qs: { named: keyName }
  }, function (err, resp, body) {
    if (err) return callback(err);

    if (resp.status !== 200) {
      toolbelt.error('Unable to issue a new API key.');
      toolbelt.error('Does the API key for this build have admin rights?');

      return callback(new Error('Unable to issue API key'));
    }

    callback(null, body.apikey);
  });
};
