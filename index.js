/**
 * @Author: Matteo Zambon <Matteo>
 * @Date:   2018-02-22 04:24:26
 * @Last modified by:   Matteo
 * @Last modified time: 2018-04-09 08:26:15
 */

'use strict'

const ora = require('ora')
const semver = require('semver')
const format = require('string-template')
const jpp = require('json-path-processor')
const simpleGit = require('simple-git/promise')
const fs = require('fs')
const args = require('args')
const inquirer = require('inquirer')

module.exports = function() {
  // Read arguments

  args
    .options([
      {
        'name': 'root',
        'description': 'The project root path',
        'init': function(content) {
          return content.replace(/\/$/, '')
        },
        'defaultValue': process.cwd()
      },
      {
        'name': 'config',
        'description': 'Config file path without root and starting with /',
        'init': function(content) {
          return content
        },
        'defaultValue': '/versioning.json'
      }
    ])

  const flags = args.parse(process.argv)

  if (!flags.root) {
    throw new Error('Missing --root')
  }
  else if (!flags.config) {
    throw new Error('Missing --config')
  }

  // END - Read arguments

  // Setup important vars

  const rootDir = flags.root
  const projectVersions = require(flags.root + flags.config)

  const pkgDir = rootDir + '/package.json'

  const git = simpleGit(rootDir)
  const pkg = require(pkgDir)
  let versionOld = pkg.version
  let versionNew = pkg.version

  let branch = 'develop'

  const questionsBefore = [
    {
      'message': 'Which bump type would you like apply?',
      'type': 'list',
      'name': 'bumpType',
      'choices': [
        'patch',
        'minor',
        'major'
      ],
      'when': function() {
        return branch === 'develop' && !versionOld.match(/-(alpha|beta)\./)
      },
      'filter': function(input) {
        return 'pre' + input
      },
      'default': 'patch'
    },
    {
      'message': function(answers) {
        let bluemixEnv

        if (branch === 'master') {
          bluemixEnv = 'production'
          versionNew = semver.inc(versionOld, 'patch')
        }
        else if (branch === 'stage') {
          bluemixEnv = 'stage'
          versionNew = semver.inc(versionOld, 'prerelease', 'beta')
        }
        else if (branch === 'develop') {
          bluemixEnv = 'development'
          versionNew = semver.inc(versionOld, answers.bumpType || 'prerelease', 'alpha')
        }

        return 'Version will go from ' +
          versionOld +
          ' to ' +
          versionNew +
          ' . Deploy ' +
          branch +
          ' to ' +
          bluemixEnv +
          ' env?'
      },
      'type': 'list',
      'name': 'continue',
      'choices': [
        'yes',
        'no',
      ],
      'filter': function(input) {
        return input === 'yes'
      },
    },
  ]

  // END - Setup important vars

  // Create spinner
  const spinner = ora('')

  spinner.stopAndPersist({
    'text': 'Welcome to deploy!',
    'symbol': '🤖 '
  })

  function updateVersions() {
    spinner.start('[SEMVER] Update versions...')
    for (const k in projectVersions) {
      const projectVersion = projectVersions[k]
      const dir = rootDir + projectVersion.dir
      const file = require(dir)
      const prefix = projectVersion.prefix ? 'v' : ''
      const applyVersion = prefix + versionNew
      const versionKeys = projectVersion.versionKeys

      spinner.start('[SEMVER] Update ' + dir + ' versions...')

      for (const v in versionKeys) {
        const versionKey = format(versionKeys[v], {
          'branch': branch,
        })

        jpp(file).set(versionKey, applyVersion)

        spinner.succeed('[SEMVER] Updated ' + dir + ' version on ' + versionKey)
      }

      fs.writeFileSync(dir, JSON.stringify(file, null, 2))

      spinner.succeed('[SEMVER] Saved ' + dir)
    }

    return Promise.resolve()
  }

  spinner.start('[GIT] Find current branch name...')

  // 1. Get GIT Branch
  // 2. Branch must be develop, stage or master
  // 3. GIT fetch origin and tags
  // 4. GIT pull origin branch
  // 5. List all the Tags
  // 6. Get grater Tag (based on semver)
  // 7. Update version old
  // 8. Start inquirer
  // 9. Update versions
  // 10. GIT add all files
  // 11. GIT commit
  // 12. GIT add tag
  // 13. GIT push tags
  // 14. GIT push origin branch
  // 15. GIT checkout develop
  // 16. GIT pull origin develop

  git.branchLocal()
    .then(function(branches) {
      branch = branches.current

      if (!branch.match(/^(develop|stage|master)$/)) {
        spinner.fail('Branch ' + branch + ' is not allowed!')
        return Promise.reject()
      }

      spinner.succeed('[GIT] Current branch name is: ')
      spinner.stopAndPersist({
        'text': branch,
        'symbol': '👉 '
      })
      return Promise.resolve()
    })
    .then(function() {
      spinner.start('[GIT] Fetch origin and tags...')

      return git.fetch({
        'origin': true,
        '--tags': true,
      })
    })
    .then(function() {
      spinner.succeed()

      spinner.start('[GIT] Pull latest updates on ' + branch + ' branch...')

      return git.pull('origin', branch)
    })
    .then(function() {
      spinner.succeed()

      spinner.start('[GIT] Find greater tag...')

      return git.tags()
    })
    .then(function(tags) {
      spinner.succeed()

      if (tags && tags.all && tags.all.length > 0) {
        const sortedVersion = tags.all
          .filter(function(el) {
            if (!semver.valid(el)) {
              return false
            }
            else if (branch === 'develop' && el.match(/-beta\./)) {
              return false
            }

            return true
          })
          .sort(function(a, b) {
            return semver.lt(a, b) ? 1 : -1
          })
        const last5Versions = sortedVersion.splice(0, 5)

        for (const k in last5Versions) {
          spinner.stopAndPersist({
            'text': last5Versions[k],
            'symbol': k == 0 ? '👉 ' : '⚬ '
          })
        }

        versionOld = last5Versions[0]
      }
      else {
        spinner.warn('Greater tag not found, keep package version: ' + versionOld)
      }

      return inquirer.prompt(questionsBefore)
    })
    .then(function(answers) {
      if (!answers.continue) {
        spinner.fail('Bye bye 😢')

        return Promise.reject()
      }

      spinner.start('Start deploy...')

      return updateVersions()
    })
    .then(function() {
      spinner.start('[GIT] Add all changes...')
      return git.add('./*')
    })
    .then(function() {
      spinner.succeed()

      spinner.start('[GIT] Add commit...')
      return git.commit('Released v' + versionNew + ' #deploy')
    })
    .then(function() {
      spinner.succeed()

      spinner.start('[GIT] Add tag v' + versionNew + ' ...')
      return git.addTag('v' + versionNew)
    })
    .then(function() {
      spinner.succeed()

      spinner.start('[GIT] Push tags to origin...')
      return git.pushTags('origin')
    })
    .then(function() {
      spinner.succeed()

      spinner.start('[GIT] Push branch to origin/' + branch + ' ...')
      return git.push('origin', branch)
    })
    .then(function() {
      if (branch === 'develop') {
        return Promise.resolve()
      }

      spinner.succeed()

      spinner.start('[GIT] Move to develop from ' + branch + ' ...')
      return git
        .checkout('develop')
    })
    .then(function() {
      if (branch === 'develop') {
        return Promise.resolve()
      }

      spinner.succeed()

      spinner.start('[GIT] Pull latest updates on develop branch...')
      return git
        .pull('origin', 'develop')
    })
    .then(function() {
      spinner.succeed()

      spinner.stopAndPersist({
        'text': 'Completed',
        'symbol': '🎉 '
      })
      return Promise.resolve()
    })
    .catch(function(err) {
      if (err instanceof Error) {
        spinner.fail()
        console.log(err)
      }
    })
}
