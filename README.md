# domo-proxy-middleware Library

## Adding a module

```
yo library:module moduleName
yo library:module moduleName --complex
```

## Usage

* `$ npm test` to run unit tests
* `$ npm run tdd` to continuously run tests
* `$ npm run lint` to lint code
* `$ npm run build` to build (and minify)
* `$ npm version` (patch|minor|major) to create git release
* `$ npm run publish` to publish to NPM repo
* `$ npm run clean` to do a clean install of dependencies

## Polyfills

This library targets ES5. Anything not supported under this standard will need to be added as a polyfill to ensure this library works in an ES5 compliant environment.

This library uses [core-js](https://github.com/zloirock/core-js) polyfills. 

#### Example

```
import Set from 'core-js/library/fn/set';

const set = new Set(['a', 'b', 'a', 'c']);
set.add('d').add('b').add('e');
console.log(set.size);        // => 5
```
