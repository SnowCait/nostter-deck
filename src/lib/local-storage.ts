function canUseLocalStorage() {
	return typeof localStorage !== 'undefined';
}

export function readJsonStorage<T>(key: string, fallback: T, normalize: (value: unknown) => T): T {
	if (!canUseLocalStorage()) return fallback;

	try {
		const storedValue = localStorage.getItem(key);
		if (!storedValue) return fallback;

		return normalize(JSON.parse(storedValue));
	} catch {
		return fallback;
	}
}

export function writeJsonStorage<T>(key: string, value: T, normalize: (value: unknown) => T) {
	if (!canUseLocalStorage()) return;

	localStorage.setItem(key, JSON.stringify(normalize(value)));
}
