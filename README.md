# SpeedSquare - FF7 speedrunner app

This repository contains code for building the SpeedSquare app for FF7 speedrunners.

## If you get OpenSSL errors:

```
$env:NODE_OPTIONS = "--openssl-legacy-provider"
```

## To Use

To clone and run this repository you'll need [Git](https://git-scm.com) and [Node.js](https://nodejs.org/en/download/) (which comes with [npm](http://npmjs.com)) installed on your computer.

Make sure you have met the requirements listed here: https://docs.nodegui.org/docs/guides/getting-started#developer-environment

From your command line:

```bash
# Go into the repository
cd ff7-speed-square
# Install dependencies
yarn
# Run the app
yarn start
```

## Building

To build and package the app simply run the following commands:

```bash
yarn build
yarn package
```

The resulting package will be placed under deploy\win32\build\SpeedSquare

NOTE: During the build the contents of the `driver` directory will be copied to the resulting bundle.