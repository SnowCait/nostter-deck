export function createAbsoluteTimestampFormatter(locale: string) {
	const time = { hour: 'numeric', minute: '2-digit' } as const;
	const date = { month: 'numeric', day: 'numeric', ...time } as const;
	const today = new Intl.DateTimeFormat(locale, time);
	const thisYear = new Intl.DateTimeFormat(locale, date);
	const otherYear = new Intl.DateTimeFormat(locale, { ...date, year: 'numeric' });

	return (createdAt: Date, currentTime: number) => {
		const now = new Date(currentTime);
		if (createdAt.getFullYear() !== now.getFullYear()) {
			return otherYear.format(createdAt);
		}
		if (createdAt.getMonth() === now.getMonth() && createdAt.getDate() === now.getDate()) {
			return today.format(createdAt);
		}
		return thisYear.format(createdAt);
	};
}

export function formatRelativeTimestamp(createdAt: Date, now: number) {
	const seconds = Math.max(0, Math.floor((now - createdAt.getTime()) / 1000));
	if (seconds < 60) {
		return `${seconds}s`;
	}
	if (seconds < 3600) {
		return `${Math.floor(seconds / 60)}m`;
	}
	if (seconds < 86400) {
		return `${Math.floor(seconds / 3600)}h`;
	}
	return `${Math.floor(seconds / 86400)}d`;
}

export function millisecondsUntilMidnight(now: number) {
	const midnight = new Date(now);
	midnight.setHours(24, 0, 0, 0);
	return midnight.getTime() - now;
}
