const getDefaultConfig = require('@appteam6/webpack-config');
const loaders = require('@appteam6/webpack-config/helpers/loaders');

const path = require('path');
const webpack = require('webpack');
const pkg = require('./package.json');

const ON_PROD = process.env.NODE_ENV === 'production';
const ON_TEST = process.env.NODE_ENV === 'test';
const ON_DEV = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;

const prodPlugins = [];
const devPlugins = [
  new webpack.SourceMapDevToolPlugin({ filename: null, test: /\.tsx?$/ }),
  new webpack.HotModuleReplacementPlugin(),
  new webpack.NamedModulesPlugin()
];

module.exports = (env = {}) => {
  let config = getDefaultConfig(env);

  // overrides of default config
  config.target = 'node';
  config.entry = './index.ts';
  config.output.filename = 'bundle.js';
  config.output.sourceMapFilename = 'bundle.js.map';

  config.module.rules = [
    loaders.tslint,
    loaders.json, {
      test: /\.ts(x?)$/,
      exclude: /node_modules/,
      loader: 'awesome-typescript-loader',
      options: {
        useTranspileModule: true
      }
    }
  ];

  config.plugins = []
    .concat(ON_PROD ? prodPlugins : [])
    .concat(ON_DEV ? devPlugins : []);

  return config;
};
