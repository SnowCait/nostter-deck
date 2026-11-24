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
	let absoluteNow = $state(Date.now());
	const formatAbsolute = $derived(createAbsoluteTimestampFormatter(getLocale()));

	$effect(() => {
		if (getMode() !== 'absolute') {
			return;
		}
		let timer: ReturnType<typeof setTimeout>;
		function update() {
			clearTimeout(timer);
			const current = Date.now();
			absoluteNow = current;
			timer = setTimeout(update, millisecondsUntilMidnight(current));
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
			? formatRelativeTimestamp(createdAt, Date.now())
			: formatAbsolute(createdAt, absoluteNow)
	);
}
