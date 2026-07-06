# Architecture Guidelines

Responsibility boundaries.

## Root Page

- Keep `src/routes/+page.svelte` limited to composition, controller wiring, and lifecycle wiring.
- Do not put stateful deck behavior, persistence, subscriptions, publishing, keyboard navigation, or large UI regions there.

## Controllers

- Put stateful deck behavior in `src/lib/deck/*-controller.svelte.ts`.
- Controllers own reactive state and coordinate side effects.

## Actions

- Put pure logic in `src/lib/deck/*-actions.ts`.
- Add focused unit tests for action modules.

## Components

- Put deck UI in `src/lib/components/deck/*.svelte`.
- Components receive state and callbacks via props; they should not own deck-wide state, persistence, or subscriptions.

## Tests

- Match tests to the layer being changed.
- Use unit tests for actions and controller transitions; use e2e tests for cross-component behavior.
