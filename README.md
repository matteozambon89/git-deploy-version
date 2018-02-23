# trailpack-koa

[![NPM version][npm-image]][npm-url]
[![Dependency Status][daviddm-image]][daviddm-url]
[![Donate][donate-image]][donate-url]

Deploy flow using GIT and SemVer

## Dependencies

- GIT

## How to Use

- Setup a configuration file like `config.json.sample`
- Run CLI

```
./git-deploy-version --root /project/dir --config /project/dir/git-deploy-version-config.json
```

## Logic Flow

* Get GIT Branch
* Branch must be develop, stage or master
* GIT fetch remote and tags
* GIT pull remote branch
* List all the Tags
* Get grater Tag (based on semver)
* Update version old
* Start inquirer
* Update versions
* GIT add all files
* GIT commit
* GIT add tag
* GIT push tags
* GIT push remote branch
* GIT checkout develop
* GIT pull remote develop

## TODO

[] Customizable GIT remote alias (currently is `origin`)
[] Customizable GIT allowed branches (currently just `develop`, `stage` and `master`)
[] Customizable version prefix (currently is `v`)
[] Customizable branch return (currently `develop`)

## Please Contribute!

I'm happy to receive contributions of any kind!

## Did you like my work?
Help me out with a little donation, press on the button below.
[![Donate][donate-image]][donate-url]

[npm-image]: https://img.shields.io/npm/v/trailpack-koa.svg?style=flat-square
[npm-url]: https://npmjs.org/package/trailpack-koailpack-koa
[daviddm-image]: http://img.shields.io/david/matteozambon89/trailpack-koa.svg?style=flat-square
[daviddm-url]: https://david-dm.org/matteozambon89/trailpack-koa
[donate-image]: https://img.shields.io/badge/Donate-PayPal-green.svg
[donate-url]: matteo.zambon.89@gmail.com
