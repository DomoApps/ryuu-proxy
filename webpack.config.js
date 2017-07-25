const path = require('path');
const webpack = require('webpack');
const { TsConfigPathsPlugin } = require('awesome-typescript-loader');

const pkg = require('./package.json');

const ON_PROD = process.env.NODE_ENV === 'production';
const ON_TEST = process.env.NODE_ENV === 'test';
const ON_DEV = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;

module.exports = () => {
  const prodPlugins = [];
  const devPlugins = [
    new webpack.SourceMapDevToolPlugin({ filename: null, test: /\.tsx?$/ }),
    new webpack.HotModuleReplacementPlugin(),
    new webpack.NamedModulesPlugin()
  ];

  const plugins = []
    .concat(ON_PROD ? prodPlugins : [])
    .concat(ON_DEV ? devPlugins : []);

  return {
    context: path.resolve(process.cwd(), './src'),

    entry: './index.ts',

    target: 'node',

    resolve: {
      modules: ['node_modules'],
      extensions: ['.ts', '.js'],
      plugins: [new TsConfigPathsPlugin()]
    },

    output: {
      path: path.join(process.cwd(), 'dist'),
      publicPath: '/',
      filename: 'bundle.js',
      sourceMapFilename: 'bundle.js.map',
      libraryTarget: 'commonjs'
    },

    devtool: ON_PROD ? 'source-map' : 'cheap-module-eval-source-map',

    plugins: plugins,

    module: {
      rules: [

        // tslint
        {
          enforce: 'pre',
          test: /\.(j|t)s(x?)$/,
          exclude: /node_modules/,
          loader: 'tslint-loader',
          options: {
            typeCheck: true
          }
        },

        // typescript
        {
          test: /\.ts(x?)$/,
          exclude: /node_modules/,
          loader: 'awesome-typescript-loader',
          options: {
            useTranspileModule: true
          }
        },

        // json
        {
          test: /\.json$/,
          loader: 'json-loader'
        }
      ]
    },
  }
};
