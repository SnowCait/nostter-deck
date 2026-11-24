# Release Guidelines

## Versioning

Use `MAJOR.MINOR.PATCH` version numbers based on the impact of changes on users.

- **MAJOR**: Backward-incompatible changes to user-facing functionality, supported platforms, or persisted user data.
- **MINOR**: Backward-compatible additions and enhancements to user-facing functionality.
- **PATCH**: Bug fixes, UI and UX improvements to existing functionality, wording and display format improvements, performance improvements, security fixes, and dependency updates affecting the distributed application.

Distinguish MINOR and PATCH by whether a change adds or enhances functionality or operations available to users, or only improves the quality of existing functionality. Adding a new column type or setting is MINOR. Improving an existing input label, placeholder, or identifier display format is PATCH.

Classify changes by their impact on users, not by their size, implementation difficulty, or issue type.

Git tags use the `vMAJOR.MINOR.PATCH` format and are the source of truth for release versions.

## Pull Requests

Assign exactly one release label to each pull request before merging.

| Label           | Release impact          |
| --------------- | ----------------------- |
| `release:major` | MAJOR version increment |
| `release:minor` | MINOR version increment |
| `release:patch` | PATCH version increment |
| `release:none`  | No release required     |

Determine release impact independently of issue types and implementation details.

Documentation, development tooling, CI changes, and internal refactoring that do not affect users generally do not require a release.

Validate release labels before merging.

## Release Frequency

Run automated releases once a day to reduce update frequency for users.

Allow manual releases when changes need to be distributed sooner.

Include all changes merged into `main` since the previous release, up to the selected release commit.

Determine the next version automatically using the highest release impact among the included pull requests. Increment the version once, regardless of the number of pull requests.

Skip the release if no changes require one.

## Distribution

Release the web and native applications from the same source commit with the same version number.

Apply the release version during the build without creating version update commits.

Deploy the web application to GitHub Pages and distribute native application packages through GitHub Releases.

Generate release notes automatically from the included pull requests.

## Release Validation and Recovery

Require successful CI checks for the release commit and successful builds for all distribution targets before publishing.

Do not run releases concurrently or publish an older release after a newer one.

If publishing fails partially, complete the same release before starting another release.

Do not modify published release tags or replace published application packages with different builds. Release subsequent fixes under a new version.
