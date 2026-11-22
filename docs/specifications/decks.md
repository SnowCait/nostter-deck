# Deck Specifications

This document defines the expected user-facing behavior for deck organization, management, display, and persistence. Column types and operations are defined in [Column Specifications](columns.md).

## 1. Basic Concepts

- A **deck** is a named, ordered collection of columns.
- Users can create multiple decks, but at least one deck must always exist.
- Exactly one deck is selected at a time, and its columns are displayed on screen.
- A deck may contain no columns.
- Each deck has its own column configuration and ordering.

## 2. Initial State

- If no saved deck configuration exists, display one empty deck named **Default**.
- Do not add columns automatically. Users add columns explicitly.
- When a deck contains no columns, display an action for adding a column.

## 3. Deck Management

### 3.1 Creating a Deck

- Users can create an empty deck by specifying a name.
- Remove leading and trailing whitespace from the name. A name containing only whitespace is not allowed.
- Names that differ from an existing deck name only in letter case are not allowed.
- Select the newly created deck and display its empty column configuration.

### 3.2 Selecting and Switching Decks

- Users can select a deck to display from the deck list.
- When switching decks, display the selected deck's columns in their saved order.
- Switching decks must not change the column configuration of either deck.
- If the destination deck contains columns, initially select its first column.
- Close any open temporary column and column settings panel when switching decks.

### 3.3 Renaming a Deck

- Users can rename a deck.
- Apply the same name restrictions as for deck creation.
- Renaming a deck must not affect its column configuration.

### 3.4 Duplicating a Deck

- Users can duplicate an existing deck under a different name.
- The duplicate contains columns with the same types, settings, and order as the source deck.
- The source and duplicate can be edited independently; changes to one must not affect the other.
- Apply the same name restrictions as for deck creation.
- Select the duplicated deck after duplication.

### 3.5 Deleting a Deck

- Users can delete a deck after confirming the operation.
- The last remaining deck cannot be deleted. A deck named **Default** can be deleted if another deck exists.
- Deleting a deck also deletes its column configuration and must not affect other decks.
- Deleting a deck that is not selected must not change the current selection.
- When the selected deck is deleted, select and display one of the remaining decks.

## 4. Display

- **Deck view** displays the selected deck's columns from left to right in their configured order. Users can scroll horizontally when the columns do not fit on screen.
- **Single-column view** displays one selected column at a time and allows users to switch between columns.
- **Automatic view** switches between deck view and single-column view based on the available screen width.
- Users can select the display mode.
- The sidebar can be expanded or collapsed.
- Column widths and temporary-column presentation follow [Column Specifications](columns.md).

## 5. Persistence and Restoration

- Save the deck names, deck list, selected deck, and each deck's column configuration in the current application environment.
- Restore the saved configuration when the application is opened again.
- If some saved data is invalid, retain the decks and columns that can be restored and exclude invalid entries.
- If the saved deck selection cannot be restored, select one of the restored decks.
- If no deck can be restored, apply the [initial state](#2-initial-state).
- Save the display mode and sidebar expansion state independently of deck selection.
- Temporary columns and the display state of retrieved posts are not part of the saved deck configuration.
