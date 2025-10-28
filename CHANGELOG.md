# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [5.0.0] - 2025-10-27

### Major Changes - Breaking

- **BREAKING**: Upgraded to axios 1.13.0 (from 0.27.2) - Fixes "Package subpath './lib/defaults' is not defined by exports" errors with modern Node.js and build tools
- **BREAKING**: Updated to TypeScript 5.9.3 with strict mode enabled
- **BREAKING**: Target ES2020 instead of ES5 for better modern JavaScript support
- **BREAKING**: Upgraded tough-cookie from 4.x to 5.x
- **BREAKING**: Upgraded axios-cookiejar-support from 1.x to 6.x
- **BREAKING**: Upgraded configstore from 5.x to 7.x
- **BREAKING**: Upgraded glob from 8.x to 10.x
- **BREAKING**: Upgraded fs-extra from 10.x to 11.x
- **BREAKING**: Upgraded https-proxy-agent from 5.x to 7.x
- **BREAKING**: Added express as a peer dependency (^4.17.0 || ^5.0.0)

### Added

- Migrated from npm/yarn to pnpm for better dependency management
- Added comprehensive ESLint configuration (replaced deprecated tslint)
- Added TypeScript strict mode for improved type safety
- Added .npmrc for pnpm configuration
- Added tsconfig.test.json for test-specific TypeScript configuration
- Improved error handling with better type safety

### Changed

- Modernized all import statements to use ES6 module syntax where possible
- Updated axios imports to use named exports from axios 1.x
- Changed glob.sync to globSync for glob 10.x compatibility
- Updated axios-cookiejar-support usage to use wrapper function
- Improved TypeScript types throughout codebase - removed most @ts-ignore comments
- Enhanced error handling with optional chaining and nullish coalescing
- Refactored HTTP proxy agent initialization for better readability
- Improved cookie handling logic to avoid parameter reassignment
- Better null/undefined handling throughout the codebase

### Fixed

- Fixed all TypeScript strict mode violations
- Fixed ESLint violations and code style issues
- Fixed axios package.json exports compatibility issues with modern build tools
- Fixed parameter reassignment linting violations
- Fixed promise executor return value issues
- Fixed implicit any types throughout the codebase

### Development

- Updated all devDependencies to latest versions
- Added @types/fs-extra for proper TypeScript support
- Improved build script to ensure clean builds
- Added prepublishOnly script for safety
- Enhanced linting workflow with auto-fix capability

### Migration Guide

If you're upgrading from 4.x to 5.0.0:

1. **Update your Node.js version**: This package now targets ES2020, ensure your Node.js version is 14.x or higher
2. **Update TypeScript**: If you're importing types, you may need TypeScript 4.5+ for best compatibility
3. **Review axios usage**: If you're directly using axios types from this package, note the upgrade to axios 1.x
4. **Check peer dependencies**: Ensure you have a compatible version of express (^4.17.0 || ^5.0.0) and ryuu (^4.2.5)
5. **Reinstall dependencies**: Run pnpm install (or npm install) to get the latest dependency tree

### Notes

This release represents a complete modernization of the package to work with current Node.js tooling and build systems. The primary driver was fixing compatibility issues with modern bundlers and Node.js versions that couldn't resolve axios's internal module structure from the older 0.27.2 version.

All changes maintain backward compatibility in terms of the public API - your code using this package should continue to work without changes, though you may need to update your environment to support ES2020.

---

## Previous Releases

### [4.3.4](https://github.com/DomoApps/ryuu-proxy/compare/v4.3.4-beta.0...v4.3.4) (2023-06-26)

### [4.3.4-beta.0](https://github.com/DomoApps/ryuu-proxy/compare/v3.1.0...v4.3.4-beta.0) (2023-06-08)
