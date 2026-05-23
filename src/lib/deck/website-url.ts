export function normalizeWebsiteUrl(value: string) {
	const trimmedValue = value.trim();
	if (!trimmedValue) return null;

	const valueWithScheme = /^[a-z][a-z\d+.-]*:/i.test(trimmedValue)
		? trimmedValue
		: `https://${trimmedValue}`;

	try {
		const url = new URL(valueWithScheme);
		if (url.protocol !== 'https:' || !url.hostname) return null;

		return url.toString();
	} catch {
		return null;
	}
}

export function getWebsiteHostname(url: string) {
	try {
		return new URL(url).hostname;
	} catch {
		return url;
	}
}
