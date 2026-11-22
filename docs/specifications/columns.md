# Column Specifications

This document defines the expected user-facing behavior for column types, addition, editing, deletion, display, and persistence. Operations involving decks that contain multiple columns are defined in [Deck Specifications](decks.md).

## 1. Basic Concepts

- A **regular column** belongs to a deck and is a display area whose type, settings, and order are saved.
- A **preset column** is a regular column whose purpose and displayed content are predefined by the application. Users provide the settings required for the selected type.
- A **custom timeline** is a regular column for which users specify the Nostr retrieval criteria themselves.
- A **temporary column** is a display area for content such as a post thread or a profile. It is not saved as a regular deck column.
- The term **preset** identifies a column category; it does not mean automatic placement on first launch or a deck template.

## 2. Common Operations for Regular Columns

### 2.1 Adding a Column

- Users can select a column type, provide the required settings, and add the column.
- A column cannot be added if required settings are missing or invalid.
- The standard add-column operation permits multiple columns with the same type and settings.
- Append the new column to the selected deck and select it for display.

### 2.2 Display Settings

Regular columns provide the following display settings in addition to type-specific settings.

| Setting | Behavior                                                                                              |
| ------- | ----------------------------------------------------------------------------------------------------- |
| Title   | Can be customized. When unset, display the dynamically generated default title described below.       |
| Icon    | Can be selected from the available icons. When unset, display an icon appropriate to the column type. |
| Width   | Can be set to one of three sizes: **Narrow**, **Standard**, or **Wide**.                              |

- The initial column width is **Standard**.
- Remove leading and trailing whitespace from a custom title.
- Apply the configured column width in deck view. In single-column view, fit the column to the display area.
- Editing a column's settings must not change it to a different column type.

#### Default Titles

When no custom title is set, a preset column displays its title in the format `<localized column type>: <target>`.

| Preset column | Target |
|---|---|
| Follow Timeline | Target user's display name |
| Search Timeline | Search query |
| Channel Timeline | Channel name |
| User Posts | Target user's display name |
| Notifications | Target user's display name |

The column type label follows the application's current display language.

For user-targeted columns, resolve the display name in the following order:

1. Profile `display_name`.
2. Profile `name`.
3. Shortened `npub`.

Use the same name resolution and fallback behavior as the existing `getProfileDisplayName()` function.

For search columns, use the configured search query with leading and trailing whitespace removed.

For channel columns, resolve the channel name in the following order:

1. The name from the latest valid kind 41 metadata event authored by the creator of the kind 40 channel creation event.
2. The name from the kind 40 channel creation event.
3. The shortened channel ID.

Ignore kind 41 metadata events authored by anyone other than the channel creator.

Default titles are generated dynamically from the column configuration and available metadata and are not persisted.

- Update the default title when the target user, search query, or channel changes.
- Update the default title when relevant profile or channel metadata changes.
- Display a fallback immediately when metadata is unavailable, without waiting for retrieval to complete.
- Metadata retrieval failures must not prevent the column from being displayed.
- A configured custom title always takes precedence over the generated default.
- Custom titles are persisted and must not change automatically when column targets or metadata change.
- Clearing a custom title restores the dynamically generated default.
- Long titles are truncated only in the UI; the underlying title string is preserved.

The existing default title behavior for Custom Timeline and Website columns remains unchanged.

### 2.3 Reordering and Deleting Columns

- Users can move columns left or right, or reorder them by dragging and dropping items in the sidebar.
- Save the resulting column order in the deck to which the columns belong.
- Users can delete any regular column, including the last remaining column in a deck.
- Deleting a column must affect only the deck to which it belongs.

## 3. Regular Column Types

### 3.1 Follow Timeline (Preset)

- Display posts from accounts followed by a specified user.
- Identify the target user by public key. Each column can have its own target user.
- Retrieve Nostr short text notes (kind 1) for this timeline.
- Allow users to select the relays used to retrieve posts. By default, use the relay-selection option based on the target user's relay information.
- Switching the signed-in account must not automatically change the column's target user.
- Users can change the target user and relay settings after creating the column.

### 3.2 Search Timeline (Preset)

- Display Nostr short text notes (kind 1) matching the entered search query.
- A search query is required. Remove leading and trailing whitespace from it.
- Use search relays.
- Users can change the search query after creating the column.

### 3.3 Channel Timeline (Preset)

- Display Nostr channel messages (kind 42) belonging to a specified channel.
- Allow users to select the target channel and the relays used to retrieve messages.
- If the channel reference includes relay information, use it when determining the initial relay selection.
- Users can change the target channel and relay settings after creating the column.

### 3.4 User Posts (Preset)

- Display posts authored by a specified user.
- Identify the target user by public key. Each column can have its own target user.
- Include kind 1 text notes, including quote posts.
- Provide the following independently configurable options, both enabled by default:
  - **Include replies:** Include kind 1 replies.
  - **Include reposts:** Include kind 6 reposts.
- Treat quote posts as regular kind 1 posts without a separate visibility option. A `q` tag alone does not make a post a reply.
- Exclude kind 16 generic reposts and kind 7 reactions.
- By default, retrieve posts from the target user's NIP-65 write relays. If no write relays are available, use the application's default relays.
- Allow users to select different relays.
- Users can change the target user, relay selection, and visibility options after creating the column.
- Save these settings independently for each column.
- Switching the signed-in account must not automatically change the target user.

### 3.5 Notifications (Preset)

- Display notifications related to a specified user.
- Identify the target user by a public key entered as an `npub`. Each column can have its own target user.
- Only consider events containing a `p` tag referencing the target user. References in the event content or to related posts do not qualify an event without this tag.
- Display the following five types of notifications:
  - **Replies:** Kind 1 replies containing the target user's `p` tag, including replies to other participants in a thread. A direct reply to a post authored by the target user is not required. Inherited `p` tags also qualify.
  - **Mentions:** Kind 1 posts containing an explicit NIP-27 `nostr:npub` or `nostr:nprofile` reference in their content that identifies the target user. A `p` tag alone does not qualify as a mention. Legacy NIP-08 `#[index]` mentions are not supported.
  - **Quotes:** Kind 1 posts quoting posts authored by the target user.
  - **Reactions:** Kind 7 reactions to posts authored by the target user.
  - **Reposts:** Kind 6 reposts of posts authored by the target user.
- Do not display events that match none of these notification types, even if they contain the target user's `p` tag.
- Display each event only once, even when it matches multiple notification types, and indicate the applicable types.
- Allow users to configure **Include own events** independently for each column:
  - Off by default.
  - When off, exclude events authored by the target user.
  - When on, include events authored by the target user if they satisfy the same notification eligibility and classification rules.
- Display notification types and related content, and allow users to open the related post or thread.
- By default, retrieve notifications from the target user's NIP-65 read relays. If no read relays are available, use the application's default relays.
- Allow users to select different relays.
- Users can change the target user, relay selection, and **Include own events** setting after creating the column.
- Save these settings independently for each column and restore them when the application is reopened.
- Switching the signed-in account must not automatically change the column's target user.

### 3.6 Custom Timeline

- Allow users to specify Nostr retrieval criteria (filters) and relays, and display events retrieved using those criteria.
- Filters and relay selection are required.
- Users can change the filters and relay selection after creating the column.

### 3.7 Website

- Display a user-specified website within a column.
- Only HTTPS URLs are accepted. If the input omits a URL scheme, prepend HTTPS.
- When no custom title is set, display the URL's hostname.

## 4. Column Actions from Posts

- Selecting a hashtag in a post can open a search column using that hashtag as the search query.
- If the selected deck already contains a search column with the same query, select that column.
- Otherwise, create a search column immediately after the column where the action originated.

## 5. Temporary Columns

- Opening a post thread displays the related posts in a thread.
- Opening a profile displays information and posts for the selected user.
- Associate each temporary column with the regular column from which it was opened.
- In deck view, display the temporary column adjacent to its source column. In single-column view, switch the display to the temporary column.
- Display only one temporary column at a time. Opening another detail view replaces the current temporary view.
- When the temporary column is closed, return to its source regular column if that column still exists.
- Close temporary columns when switching decks.
- Do not include temporary columns in the saved deck configuration.

## 6. Loading and Persistence

- Timelines distinguish between loading, no results, and retrieval failure states.
- Save each regular column's type, order, display settings, and type-specific settings with its deck.
- Restore saved settings when the application is opened again.
- Retrieved events, temporary columns, and loading state are not part of a regular column's saved settings.
