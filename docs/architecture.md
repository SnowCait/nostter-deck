# Architecture Guidelines

Target responsibility boundaries for new code and incremental refactoring. Existing placement does not define where new code belongs.

## Structure

Under `src/lib/`:

- `nostr/`: shared Nostr infrastructure, including protocol semantics, relay communication, signing, verification, and common event caching. Split into `protocol/`, `relay/`, `signing/`, or `verification/` when those responsibilities need separate modules.
- `features/<feature>/`: feature-specific rules, use cases, state, and UI. Follow-list retrieval and updates belong here and use the shared Nostr infrastructure.
- `deck/`: deck-wide layout, column configuration, and coordination of deck operations.
- `components/`: reusable UI that is not owned by a specific feature.
- `platform/`: runtime and storage capabilities that are neither Nostr-specific nor feature-specific, such as browser and Tauri integration.

Within a feature, use these layers when needed:

- `domain/`: pure feature rules and data transformations, such as adding or removing follow-list tags.
- `application/`: use cases, application state, and coordination of fetching, signing, publishing, and persistence.
- `presentation/`: feature-specific UI and presentation state.

Create subdirectories only for clear responsibilities. These layers are optional; do not create empty directories or abstractions just to match the structure.

## Dependencies

- Within a feature, dependencies flow inward: `presentation → application → domain`. Application code must not depend on presentation.
- Application code may use shared Nostr infrastructure and platform capabilities.
- Domain code may use pure Nostr protocol types and helpers, but must not depend on Svelte state, communication, signing implementations, storage, or runtime APIs.
- Shared Nostr infrastructure must not depend on features, deck behavior, or UI. Platform code must not depend on Nostr, features, deck behavior, or UI.
- Avoid circular dependencies.

## Root Page

- Keep `src/routes/+page.svelte` limited to composition, controller wiring, and lifecycle wiring.
- Do not put stateful deck behavior, persistence, subscriptions, publishing, keyboard navigation, or large UI regions there.

## Controllers

- Controllers own reactive state and coordinate side effects.
- Place `*-controller.svelte.ts` modules with the feature or deck behavior that owns their state. Feature use-case controllers belong in application; controllers for presentation state belong in presentation. Deck-wide coordination stays in `deck/`.

### Follow-list controller lifecycle

- Create a controller with the authenticated account's public key and concrete signer. Both are fixed; do not pass a signer that delegates to whichever account is currently active.
- Creation starts loading. Calling `reload()` during loading waits for that load; mutations require a ready basis.
- Call `dispose()` before switching authentication or leaving the active view. It immediately blocks mutations, retries, reloads, and automatic follow-up publications. Queued desired changes are not published after disposal.
- Disposal cannot cancel a signing or relay request already started. Its promise waits for controller work to settle. The composition layer must keep that promise and await it before creating another controller for the same public key, and must never run two live controllers for that key.
- A disposed controller cannot be reactivated. Reuse a live controller only while the same authentication session remains active; create a new one after authentication changes. Authentication can close an old NIP-46 signer, so an outstanding attempt may fail.
- Attempt timestamps and successful events whose cache writes failed live only in the controller. Awaiting disposal prevents overlap but does not transfer that basis to a replacement. Before discarding it, the composition layer must account for its `lastCreatedAt`, publication result, and cache errors when establishing a safe replacement basis; reconstruction alone does not preserve uncached state. Cross-controller retention and account selection belong to future composition wiring.

## Actions

- Put pure logic in `*-actions.ts` modules within the owning area. Feature rules belong in domain; deck layout and column rules belong in `deck/`.
- Add focused unit tests for action modules.

## Components

- Place feature-specific components in the feature's presentation layer and shared components in `components/`.
- Components receive application state and callbacks via props. Keep use-case state, persistence, subscriptions, and publishing in controllers or application modules; local presentation state may stay in components.

## Tests

- Match tests to the layer being changed.
- Use unit tests for actions and controller transitions; use e2e tests for cross-component behavior.

## Migration

- Apply this target structure to new code where practical; the existing code does not need to move all at once.
- Migrate existing modules through focused refactoring, keeping unrelated file moves separate from feature work.
- Do not add wrappers or re-exports solely to preserve old paths during migration.
