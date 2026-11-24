import { createContext } from 'svelte';
import type { PostTimestampMode } from '$lib/user-settings';
import {
	createAbsoluteTimestampFormatter,
	formatRelativeTimestamp,
	millisecondsUntilMidnight
} from './post-timestamp';

const [getPostTimestampFormatter, setPostTimestampFormatter] =
	createContext<(createdAt: Date) => string>();

export { getPostTimestampFormatter };

export function providePostTimestampFormatter(
	getMode: () => PostTimestampMode,
	getLocale: () => string
) {
	let now = $state(Date.now());
	const formatAbsolute = $derived(createAbsoluteTimestampFormatter(getLocale()));

	$effect(() => {
		const mode = getMode();
		let timer: ReturnType<typeof setTimeout>;
		function update() {
			clearTimeout(timer);
			const current = Date.now();
			now = current;
			const delay =
				mode === 'relative' ? 1000 - (current % 1000) : millisecondsUntilMidnight(current);
			timer = setTimeout(update, delay);
		}

		update();
		document.addEventListener('visibilitychange', update);
		return () => {
			clearTimeout(timer);
			document.removeEventListener('visibilitychange', update);
		};
	});

	setPostTimestampFormatter((createdAt) =>
		getMode() === 'relative'
			? formatRelativeTimestamp(createdAt, now)
			: formatAbsolute(createdAt, now)
	);
}
