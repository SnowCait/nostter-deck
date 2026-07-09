const pubkeyPattern = /^[0-9a-f]{64}$/i;

export function isPubkey(value: unknown): value is string {
	return typeof value === 'string' && pubkeyPattern.test(value);
}

export function normalizePubkey(value: unknown): string | null {
	return isPubkey(value) ? value.toLowerCase() : null;
}
