# UI Guidelines

## Language

- Use clear, concise, and consistent terminology.
- Never use `NIP` or NIP identifiers in user-facing text.
- Use technical terms when necessary for users to understand or configure a feature.

## Controls and Settings

- Present only necessary choices and inputs.
- Do not display controls for unimplemented features.
- Make current selections and defaults clear.
- Preserve explicit user choices unless the user changes them.
- Use consistent controls for equivalent actions.
- Confirm destructive actions that cannot be undone.

## Feedback

- Distinguish loading, empty, and error states.
- Indicate success only after an operation succeeds.
- Explain errors and available recovery actions clearly.

## Accessibility

- Support keyboard operation and visible focus.
- Provide accessible labels for interactive controls.
- Do not rely on color alone to convey information.

## Layout and Localization

- Maintain usability across screen sizes, text sizes, and themes.
- Localize user-facing text and accommodate different text lengths.

## Identifier Display

When displaying shortened NIP-19 identifiers, retain approximately the same amount of identifying information regardless of the identifier type.

| Identifier | Prefix length |
| ---------- | ------------: |
| `npub`     |            12 |
| `note`     |            12 |
| `nevent`   |            17 |
| `nprofile` |            19 |

- Include the human-readable prefix and the separator `1` in the character count.
- For `nevent` and `nprofile`, shorten the encoded identifier containing only the event ID or public key, respectively.
- Display only the specified prefix, without an ellipsis or trailing characters.
- Use shortened identifiers for display only. Preserve complete identifiers for copying, linking, and input.
- Do not use shortened identifiers to determine identity or uniqueness.
