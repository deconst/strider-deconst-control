exports.getRepository = function (toolbelt, slug, callback) {
  toolbelt.githubAPI.get('/repos/' + slug, function (err, resp, body) {
    if (err) return callback(err);

    if (resp.statusCode === 404) {
      var e = new Error("Unable to see GitHub repository");
      e.notFound = true;
      return callback(e);
    }

    callback(null, {
      name: body.full_name,
      id: body.id,
      display_url: body.html_url,
      clone_url: body.git_url,
      owner: body.owner.login,
      repo: body.name
    });
  });
};
