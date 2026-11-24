# Persistence Guidelines

## Data Classification

Distinguish stored data by its purpose and ownership.

| Category | Scope | Examples |
| --- | --- | --- |
| User settings | Application | Theme, font size, avatar shape |
| Account settings | Account public key | Like reaction preference |
| Authentication data | Account connection | Authentication method, connection credentials |
| UI state | Application | Sidebar state, layout mode |
| Deck configuration | Deck and column | Column types, settings, ordering |
| Persistent cache | Application | Retrieved metadata, relay information |
| Session cache | Session | Retrieved events, timeline entries |

## Storage Design

- Persist data that must survive application restarts.
- Store data at the scope to which it belongs.
- Preserve user choices independently of the active account or deck unless the setting belongs to that account or deck.
- Avoid storing redundant or derived values unless caching them serves a clear purpose.
- Keep transient runtime state separate from persistent configuration.
- Choose storage mechanisms according to data size, access patterns, and lifetime.

## Data Lifecycle

- Define when stored data is created, updated, restored, and removed.
- Preserve unrelated settings when switching accounts or decks.
- Remove data that is no longer needed according to its ownership and purpose.
- Keep feature-specific persistence behavior in the relevant specifications.

## Caching

- Keep caches separate from user configuration and authentication data.
- Distinguish caches retained across application restarts from session-only caches.
- Define cache retention and invalidation according to the data being cached.
- Do not treat cached data as authoritative user configuration.

## Compatibility and Restoration

- Validate and normalize stored data when reading it.
- Preserve valid data when some stored values are missing or invalid.
- Use appropriate defaults when values cannot be restored.
- Preserve existing user settings when changing storage formats.
- Provide migrations when necessary to maintain compatibility.

## Sensitive Data

- Persist only authentication credentials required for supported authentication flows.
- Keep sensitive data separate from general settings and caches.
- Do not expose credentials in logs or diagnostic output.
- Remove stored credentials when the associated account connection is removed.
