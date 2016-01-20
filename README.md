# Control Repository Builder for Strider CD

Job plugin for [Strider CD](https://github.com/Strider-CD/strider) that:

1. Invokes [Grunt](http://gruntjs.com/) in the root directory of the control repository. The Grunt build should assemble and submit global site assets and inform the content service that a new version of the control repository is available to pull.
2. Reads a `content-repository.json` file from the root directory.
3. Provision a Strider job using the [Deconst content plugin](https://github.com/deconst/strider-deconst-content) for each content repository described there that doesn't already exist.

## `content-repositories.json` format

The `content-repositories.json` file must contain the following JSON:

```json
[
  { "kind": "github", "project": "deconst/deconst-docs" }
]
```
