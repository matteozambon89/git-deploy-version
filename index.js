/**
 * @Author: Matteo Zambon <Matteo>
 * @Date:   2018-02-22 04:24:26
 * @Last modified by:   Matteo
 * @Last modified time: 2018-02-23 09:20:01
 */

'use strict'

const ora = require('ora')
const semver = require('semver')
const format = require('string-template')
const jp = require('jsonpath')
const gitSemverTags = require('git-semver-tags', {
  'tagPrefix': 'v',
})
const simpleGit = require('simple-git/promise')
const promisify = require('util').promisify
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
        }
      },
      {
        'name': 'config',
        'description': 'Config file path',
        'init': function(content) {
          return require(content)
        }
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
  const projectVersions = flags.config

  const pkgDir = rootDir + '/package.json'

  const git = simpleGit(rootDir)
  const pkg = require(pkgDir)
  let versionOld = pkg.version
  let versionNew = pkg.version

  let branch = 'develop'

  const questionsBefore = [
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
          versionNew = semver.inc(versionOld, 'prerelease', 'alpha')
        }

        return 'Version will go from ' +
          versionOld +
          ' to ' +
          versionNew +
          '. Deploy ' +
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
    'symbol': '🤖'
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

        jp.apply(file, versionKey, function() {
          return applyVersion
        })

        spinner.succeed('[SEMVER] Updated ' + dir + ' version on ' + versionKey)
      }

      fs.writeFileSync(dir, JSON.stringify(file))

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

      if (branch.match(/^(develop|stage|master)$/)) {
        spinner.fail('Branch ' + branch + ' is not allowed!')
        return Promise.reject()
      }

      spinner.succeed('[GIT] Current branch name is: ' + branch)
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

      spinner.start('[GIT] Find grater tag...')

      return promisify(gitSemverTags)()
    })
    .then(function(results) {
      const versions = results[2]

      if (versions && versions.length > 0) {
        versionOld = versions[0]
      }

      spinner.succeed('[GIT] Greater version is: ' + versionOld)

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
      return git.commit('Released v' + versionNew)
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
        .pull('origin', 'develop')
    })
    .then(function() {
      spinner.succeed()

      spinner.stopAndPersist({
        'text': 'Completed',
        'symbol': '🎉'
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
