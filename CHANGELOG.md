# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.7.0] - 2026-04-15

### Added

- add opt-out option for built-in GitHub extensions (#88)

## [2.6.1] - 2026-04-13

### Changed

- update README, fix release flow

### Fixed

- new changelog updating flow to ensure correctness

## [2.6.0] - 2026-04-06

### Added

- Semantic-release for automated versioning and release management
- Automated CHANGELOG.md generation
- Automated package.json version updates

### Changed

- Release workflow now uses semantic-release to handle versioning, changelog generation, and GitHub releases

### Fixed

- CHANGELOG.md and package.json were not being updated during releases (now handled by semantic-release)

## [2.5.0] - 2026-04-05

### Added

- CHANGELOG.md to track project changes
- Custom extensions support via `extensions` input (npm packages, git repos, local files)

### Changed
- Tool execution refactored to reduce duplication
- Dependencies updated
- Updated README architecture section

## [2.4.0] - 2026-04-03

### Added
- Support for custom Pi extensions to add additional tools and modify agent behavior
- `extensions` input accepting npm packages, git repositories, and local file paths

### Changed
- Updated tools to use new `defineTool()` from Pi SDK
- Dependencies bumped
- Development dependency (eslint) bumped

## [2.3.3] - 2026-04-03

### Changed
- Upgraded Pi to version 0.65.0 and related dependencies
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
- Removed core import to simplify testing
- Extracted duplicate `getContextType()` to shared utility

### Fixed
- Missing action version in footer and logs
- Missing SDK version in logs and footer
- Silent errors being swallowed
- Unsafe type assertion for tree entry sha field
- Logging issues

## [2.3.0] - 2026-03-31

### Fixed
- README link corrections
- Codecov action updated, removed double build

[unreleased]: https://github.com/shaftoe/pi-coding-agent-action/compare/v2.7.0...HEAD
[2.7.0]: https://github.com/shaftoe/pi-coding-agent-action/compare/v2.6.1...v2.7.0
[2.6.1]: https://github.com/shaftoe/pi-coding-agent-action/compare/v2.6.0...v2.6.1
[2.6.0]: https://github.com/shaftoe/pi-coding-agent-action/compare/v2.5.0...v2.6.0
[2.5.0]: https://github.com/shaftoe/pi-coding-agent-action/compare/v2.4.0...v2.5.0
[2.4.0]: https://github.com/shaftoe/pi-coding-agent-action/compare/v2.3.3...v2.4.0
[2.3.3]: https://github.com/shaftoe/pi-coding-agent-action/compare/v2.3.2...v2.3.3
[2.3.2]: https://github.com/shaftoe/pi-coding-agent-action/compare/v2.3.1...v2.3.2
[2.3.1]: https://github.com/shaftoe/pi-coding-agent-action/compare/v2.3.0...v2.3.1
[2.3.0]: https://github.com/shaftoe/pi-coding-agent-action/releases/tag/v2.3.0
