# SCMSquare - FF7 SCM testing app

Forked from https://github.com/maciej-trebacz/ff7-speed-square

This repository contains code for building the SCMSquare app for FF7 speedrun researchers. Using SCMSquare in any capacity when performing a speedrun is disallowed on the FF7 speedrun leaderboards.

Check "Inject Battle RNG seed" and click "Set Seed".

The first box is your System RNG seed, the second is the Joker value to inject, and the third is the Animation Offset value.

SCMSquare will also skip the opening movies at the start.

## If you get OpenSSL errors:

```
$env:NODE_OPTIONS = "--openssl-legacy-provider"
```

## To Use

Right now, you will a version of NodeJS released before 2024-04-10. I have used v18.16.0. See https://github.com/nodejs/help/issues/4373

If you know how to use --security-revert=CVE-2024-27980 to successfully build from source on a newer version of NodeJS, please let me know.

To clone and run this repository you'll need [Git](https://git-scm.com) and [Node.js](https://nodejs.org/en/download/) (which comes with [npm](http://npmjs.com)) installed on your computer.

Make sure you have met the requirements listed here: https://docs.nodegui.org/docs/guides/getting-started#developer-environment

From your command line:

```bash
# Go into the repository
cd ff7-scm-square
# Install dependencies
yarn
# Run the app
yarn start
```

Copy a release's `driver` directory to the root of the source to get the FFNx drivers should you wish to install them.

## Building

To build and package the app simply run the following commands:

```bash
yarn build
yarn package
```

The resulting package will be placed under deploy\win32\build\SpeedSquare

NOTE: During the build the contents of the `driver` directory will be copied to the resulting bundle.