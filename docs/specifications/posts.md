# Post Specifications

This document defines the expected user-facing behavior for post presentation and interactions.

## 1. Timestamp Display

### 1.1 Display Modes

- Support two timestamp display modes: **Absolute** and **Relative**.
- Use **Absolute** by default.
- Apply the selected mode consistently across all post displays, including reposts, reactions, and quoted posts.
- Display the creation time of the repost or reaction event for repost and reaction entries, and the creation time of the quoted event for embedded quoted posts.

### 1.2 Absolute Timestamps

Display the date and time using the following rules.

| Event date                      | Displayed information              | Example            |
| ------------------------------- | ---------------------------------- | ------------------ |
| Today                           | Hour and minute                    | `10:20`            |
| Another day in the current year | Month, day, hour, and minute       | `11/23 18:30`      |
| A different year                | Year, month, day, hour, and minute | `2025/12/31 23:59` |

- Use the local time zone of the application environment for both date comparison and display.
- Format timestamps according to the application's selected language. The examples above are illustrative.
- Do not display seconds.
- Update the displayed format when the local date or year changes without requiring an application reload.

### 1.3 Relative Timestamps

Display elapsed time using the following units.

| Elapsed time         | Unit    | Example |
| -------------------- | ------- | ------- |
| Less than one minute | Seconds | `30s`   |
| Less than one hour   | Minutes | `15m`   |
| Less than 24 hours   | Hours   | `3h`    |
| 24 hours or more     | Days    | `2d`    |

- Round down to the nearest whole unit.
- Display future timestamps as `0s`.

### 1.4 Layout

- Display the author name and timestamp on the same line when sufficient horizontal space is available.
- Move the timestamp to the next line when necessary to avoid excessive truncation of the author name or horizontal overflow.
- Preserve timestamp readability without omitting information required by the selected display mode.
- Maintain usability across column widths, single-column view, text sizes, and embedded quoted posts.

### 1.5 Settings and Persistence

- Allow users to select the timestamp display mode in Appearance settings.
- Apply the setting application-wide, independently of the active account, deck, or column.
- Persist the selected mode and restore it when the application is reopened.
- Use **Absolute** when no valid saved preference exists.
- Apply changes immediately without requiring an application reload.
- Do not provide a separate time zone setting.
