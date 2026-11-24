# Documentation

## Document Responsibilities

| Document                                   | Purpose                                                        |
| ------------------------------------------ | -------------------------------------------------------------- |
| [Architecture Guidelines](architecture.md) | Code organization, responsibility boundaries, and dependencies |
| [UI Guidelines](ui-guidelines.md)          | Common user interface design principles                        |
| [Persistence Guidelines](persistence.md)   | Data classification, storage, lifecycle, and compatibility     |
| [Release Guidelines](releasing.md)         | Versioning, release scheduling, distribution, and recovery     |
| [Specifications](specifications/)          | Expected behavior of individual features                       |
| [Contributing](../CONTRIBUTING.md)         | Contribution and project management rules                      |

Keep general principles in guidelines and feature-specific behavior in specifications.

## Specifications

Specifications define the expected behavior of the application independently of its current implementation.

Document the following where relevant:

- Supported functionality and expected behavior.
- Input requirements, constraints, and validation rules.
- Default values and configuration options.
- Error handling, fallback behavior, and boundary conditions.
- Feature-specific protocol requirements.
- Settings scope, persistence, and restoration.

Do not include:

- Unresolved requirements or unapproved design decisions.
- Implementation details that do not define required behavior.
- Temporary workarounds or task-specific instructions.
- Development history or information specific to individual issues or pull requests.

Describe what the application should do rather than how the current implementation achieves it.

## Writing and Organization

- Write documentation in English.
- Organize documents by responsibility and subject.
- Keep documentation concise and avoid unnecessary detail.
- Define each requirement or rule in one authoritative location.
- Reference related documents instead of duplicating their contents.
- Create new documents only when they have a distinct purpose that cannot be adequately covered by existing documents.

## Maintenance

- Read relevant documentation before making or reviewing changes.
- Define substantial or non-obvious behavioral requirements before implementation.
- Keep specifications consistent with approved application behavior.
- Update relevant specifications when intended behavior changes.
- Do not change documented requirements merely to accommodate an implementation.
- Do not update specifications for implementation-only changes that preserve expected behavior.

## Issues and Pull Requests

Use issues to track problems and requested changes. Use pull requests to describe individual changes and their rationale.

Use documentation to maintain requirements and guidelines that remain relevant beyond individual development tasks.

- Reference existing specifications instead of repeating them in issues or pull requests.
- Keep task-specific implementation plans and discussions out of permanent documentation.
- Do not treat unresolved proposals in issues or pull requests as established specifications.
