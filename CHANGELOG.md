# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.5.0] - 2026-04-05

### Added

- CHANGELOG.md to track project changes
- Custom extensions support via `extensions` input (npm packages, git repos, local files)

### Changed
- Tool execution refactored to reduce duplication
- Dependencies updated

### Documentation
- Updated README architecture section

## [2.4.0] - 2026-04-03

### Added
- Support for custom Pi extensions to add additional tools and modify agent behavior
- `extensions` input accepting npm packages, git repositories, and local file paths

### Changed
- Updated tools to use new `defineTool()` from Pi SDK
- Dependencies bumped

### Fixed
- Development dependency (eslint) bumped

## [2.3.3] - 2026-04-03

### Changed
- Upgraded Pi to version 0.65.0 and related dependencies

### Documentation
- Added caution note about securing workflows in README

## [2.3.2] - 2026-04-03

### Changed
- Updated tag-version script to create bundle during release

## [2.3.1] - 2026-04-01

### Added
- Test coverage improvements
- E2E test flow and coverage extensions

### Changed
- Improved module-level state management in `src/github/index.ts`
- Merged Pi flows into single pi.yml workflow
- Unified type configuration across tests

### Fixed
- Missing action version in footer and logs
- Missing SDK version in logs and footer
- Silent errors being swallowed
- Unsafe type assertion for tree entry sha field
- Logging issues

### Refactored
- Removed core import to simplify testing
- Extracted duplicate `getContextType()` to shared utility

## [2.3.0] - 2026-03-31

### Fixed
- README link corrections
- Codecov action updated, removed double build
