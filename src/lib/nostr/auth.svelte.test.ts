import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
	authStorageKey,
	getAuthState,
	initializeAuth,
	loginWithNip07,
	logout,
	resetAuthStateForTesting
} from './auth.svelte';

const pubkey = 'a'.repeat(64);

function installLocalStorage() {
	const values = new Map<string, string>();
	vi.stubGlobal('localStorage', {
		getItem: vi.fn((key: string) => values.get(key) ?? null),
		setItem: vi.fn((key: string, value: string) => values.set(key, value)),
		removeItem: vi.fn((key: string) => values.delete(key))
	});
	return values;
}

describe('NIP-07 authentication', () => {
	let storageValues: Map<string, string>;

	beforeEach(() => {
		storageValues = installLocalStorage();
		resetAuthStateForTesting();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		resetAuthStateForTesting();
	});

	test('logs in with a valid NIP-07 public key and persists the account choice', async () => {
		vi.stubGlobal('nostr', { getPublicKey: vi.fn(async () => pubkey.toUpperCase()) });

		await expect(loginWithNip07()).resolves.toBe(true);
		expect(getAuthState()).toEqual({ status: 'loggedIn', pubkey });
		expect(JSON.parse(storageValues.get(authStorageKey) ?? '')).toEqual({
			method: 'nip07',
			pubkey
		});
	});

	test('rejects an invalid NIP-07 public key without persisting a session', async () => {
		vi.stubGlobal('nostr', { getPublicKey: vi.fn(async () => 'invalid') });

		await expect(loginWithNip07()).resolves.toBe(false);
		expect(getAuthState()).toEqual({ status: 'error', pubkey: null });
		expect(storageValues.has(authStorageKey)).toBe(false);
	});

	test('keeps the user logged out when the extension rejects the request', async () => {
		vi.stubGlobal('nostr', {
			getPublicKey: vi.fn(async () => Promise.reject(new Error('denied')))
		});

		await expect(loginWithNip07()).resolves.toBe(false);
		expect(getAuthState()).toEqual({ status: 'error', pubkey: null });
		expect(storageValues.has(authStorageKey)).toBe(false);
	});

	test('restores only the previously selected NIP-07 account', async () => {
		storageValues.set(authStorageKey, JSON.stringify({ method: 'nip07', pubkey }));
		vi.stubGlobal('nostr', { getPublicKey: vi.fn(async () => pubkey) });

		await expect(initializeAuth()).resolves.toBe(true);
		expect(getAuthState()).toEqual({ status: 'loggedIn', pubkey });

		vi.stubGlobal('nostr', { getPublicKey: vi.fn(async () => 'b'.repeat(64)) });
		await expect(initializeAuth()).resolves.toBe(false);
		expect(getAuthState()).toEqual({ status: 'loggedOut', pubkey: null });
		expect(storageValues.has(authStorageKey)).toBe(false);
	});

	test('marks NIP-07 as unavailable when no extension is present', async () => {
		await expect(initializeAuth()).resolves.toBe(false);
		expect(getAuthState()).toEqual({ status: 'unavailable', pubkey: null });
	});

	test('logout clears the saved account and prevents automatic restoration', async () => {
		vi.stubGlobal('nostr', { getPublicKey: vi.fn(async () => pubkey) });
		await loginWithNip07();

		logout();
		expect(storageValues.has(authStorageKey)).toBe(false);
		expect(getAuthState()).toEqual({ status: 'loggedOut', pubkey: null });
		await expect(initializeAuth()).resolves.toBe(false);
		expect(getAuthState()).toEqual({ status: 'loggedOut', pubkey: null });
	});
});
