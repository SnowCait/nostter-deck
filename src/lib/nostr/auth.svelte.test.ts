import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { getAccountId, accountsStorageKey } from './accounts';
import {
	cancelPendingAuthentication,
	getAccountStore,
	getAuthState,
	initializeAuth,
	legacyAuthStorageKey,
	loginWithNip46ConnectionUri,
	loginWithNip07,
	logout,
	removeAccount,
	resetAuthStateForTesting,
	selectAccount
} from './auth.svelte';

const pubkeyA = 'a'.repeat(64);
const pubkeyB = 'b'.repeat(64);
const clientSecretKey = new Uint8Array(32).fill(1);
const bunkerMocks = vi.hoisted(() => ({
	fromBunker: vi.fn(),
	fromURI: vi.fn(),
	signer: {
		bp: { pubkey: 'b'.repeat(64), relays: ['wss://relay.example'], secret: null },
		connect: vi.fn(),
		getPublicKey: vi.fn(),
		close: vi.fn()
	}
}));

vi.mock('nostr-tools/nip46', async (importOriginal) => {
	const actual = await importOriginal<typeof import('nostr-tools/nip46')>();
	return {
		...actual,
		BunkerSigner: {
			fromBunker: bunkerMocks.fromBunker,
			fromURI: bunkerMocks.fromURI
		}
	};
});

function installLocalStorage() {
	const values = new Map<string, string>();
	vi.stubGlobal('localStorage', {
		getItem: vi.fn((key: string) => values.get(key) ?? null),
		setItem: vi.fn((key: string, value: string) => values.set(key, value)),
		removeItem: vi.fn((key: string) => values.delete(key))
	});
	return values;
}

function installNip07(pubkey: string) {
	vi.stubGlobal('nostr', {
		getPublicKey: vi.fn(async () => pubkey),
		signEvent: vi.fn(async (event: Record<string, unknown>) => event)
	});
}

function createDeferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((promiseResolve, promiseReject) => {
		resolve = promiseResolve;
		reject = promiseReject;
	});
	return { promise, resolve, reject };
}

describe('multi-account authentication', () => {
	let storageValues: Map<string, string>;

	beforeEach(() => {
		storageValues = installLocalStorage();
		resetAuthStateForTesting();
		bunkerMocks.fromBunker.mockReset();
		bunkerMocks.fromURI.mockReset();
		bunkerMocks.signer.connect.mockReset();
		bunkerMocks.signer.getPublicKey.mockReset();
		bunkerMocks.signer.close.mockReset();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		resetAuthStateForTesting();
	});

	test('adds a NIP-07 account and persists it as the active account', async () => {
		installNip07(pubkeyA.toUpperCase());

		await expect(loginWithNip07()).resolves.toBe(true);
		expect(getAuthState()).toEqual({ status: 'loggedIn', pubkey: pubkeyA });
		expect(getAccountStore()).toEqual({
			activeAccountId: getAccountId('nip07', pubkeyA),
			accounts: [
				expect.objectContaining({
					id: getAccountId('nip07', pubkeyA),
					method: 'nip07',
					pubkey: pubkeyA
				})
			]
		});
		expect(JSON.parse(storageValues.get(accountsStorageKey) ?? '')).toEqual(getAccountStore());
	});

	test('adds and activates the extension current key when a stored NIP-07 key no longer matches', async () => {
		installNip07(pubkeyA);
		await loginWithNip07();

		installNip07(pubkeyB);
		await expect(selectAccount(getAccountId('nip07', pubkeyA))).resolves.toBe(true);

		expect(getAuthState()).toEqual({ status: 'loggedIn', pubkey: pubkeyB });
		expect(getAccountStore().activeAccountId).toBe(getAccountId('nip07', pubkeyB));
		expect(getAccountStore().accounts.map(({ id }) => id)).toEqual([
			getAccountId('nip07', pubkeyA),
			getAccountId('nip07', pubkeyB)
		]);
	});

	test('restores the selected NIP-07 account only when the extension exposes that key', async () => {
		storageValues.set(
			accountsStorageKey,
			JSON.stringify({
				activeAccountId: getAccountId('nip07', pubkeyA),
				accounts: [
					{
						id: getAccountId('nip07', pubkeyA),
						method: 'nip07',
						pubkey: pubkeyA,
						createdAt: 1
					}
				]
			})
		);
		installNip07(pubkeyA);

		await expect(initializeAuth()).resolves.toBe(true);
		expect(getAuthState()).toEqual({ status: 'loggedIn', pubkey: pubkeyA });
	});

	test('restores the selected NIP-46 account from its saved connection data', async () => {
		const clientSecretKey = 'c'.repeat(64);
		storageValues.set(
			accountsStorageKey,
			JSON.stringify({
				activeAccountId: getAccountId('nip46', pubkeyB),
				accounts: [
					{
						id: getAccountId('nip46', pubkeyB),
						method: 'nip46',
						pubkey: pubkeyB,
						createdAt: 1,
						bunker: bunkerMocks.signer.bp,
						clientSecretKey
					}
				]
			})
		);
		bunkerMocks.fromBunker.mockReturnValue(bunkerMocks.signer);
		bunkerMocks.signer.connect.mockResolvedValue(undefined);
		bunkerMocks.signer.getPublicKey.mockResolvedValue(pubkeyB);

		await expect(initializeAuth()).resolves.toBe(true);
		expect(bunkerMocks.fromBunker).toHaveBeenCalledTimes(1);
		expect(getAuthState()).toEqual({ status: 'loggedIn', pubkey: pubkeyB });
	});

	test('keeps the active account while a Nostr Connect login is pending', async () => {
		installNip07(pubkeyA);
		await loginWithNip07();
		const pendingSigner = createDeferred<typeof bunkerMocks.signer>();
		bunkerMocks.fromURI.mockReturnValueOnce(pendingSigner.promise);
		bunkerMocks.signer.getPublicKey.mockResolvedValueOnce(pubkeyB);

		const loginPromise = loginWithNip46ConnectionUri('nostrconnect://pending', clientSecretKey);

		expect(getAuthState()).toEqual({ status: 'loggedIn', pubkey: pubkeyA });
		expect(getAccountStore().activeAccountId).toBe(getAccountId('nip07', pubkeyA));

		pendingSigner.resolve(bunkerMocks.signer);
		await expect(loginPromise).resolves.toBe(true);
		expect(getAuthState()).toEqual({ status: 'loggedIn', pubkey: pubkeyB });
		expect(getAccountStore().activeAccountId).toBe(getAccountId('nip46', pubkeyB));
	});

	test('does not switch accounts when a pending Nostr Connect login is canceled', async () => {
		installNip07(pubkeyA);
		await loginWithNip07();
		const pendingSigner = createDeferred<typeof bunkerMocks.signer>();
		bunkerMocks.fromURI.mockReturnValueOnce(pendingSigner.promise);
		bunkerMocks.signer.getPublicKey.mockResolvedValueOnce(pubkeyB);

		const loginPromise = loginWithNip46ConnectionUri('nostrconnect://pending', clientSecretKey);
		expect(cancelPendingAuthentication()).toBe(true);
		pendingSigner.resolve(bunkerMocks.signer);

		await expect(loginPromise).resolves.toBe(false);
		expect(bunkerMocks.signer.close).toHaveBeenCalledOnce();
		expect(getAuthState()).toEqual({ status: 'loggedIn', pubkey: pubkeyA });
		expect(getAccountStore().activeAccountId).toBe(getAccountId('nip07', pubkeyA));
		expect(getAccountStore().accounts.map(({ id }) => id)).toEqual([
			getAccountId('nip07', pubkeyA)
		]);
	});

	test('keeps the active account when an added Nostr Connect login fails', async () => {
		installNip07(pubkeyA);
		await loginWithNip07();
		bunkerMocks.fromURI.mockRejectedValueOnce(new Error('connection failed'));

		await expect(
			loginWithNip46ConnectionUri('nostrconnect://failed', clientSecretKey)
		).resolves.toBe(false);

		expect(getAuthState()).toEqual({ status: 'loggedIn', pubkey: pubkeyA });
		expect(getAccountStore().activeAccountId).toBe(getAccountId('nip07', pubkeyA));
	});

	test('marks an initial Nostr Connect login as failed when no account is active', async () => {
		bunkerMocks.fromURI.mockRejectedValueOnce(new Error('connection failed'));

		await expect(
			loginWithNip46ConnectionUri('nostrconnect://failed', clientSecretKey)
		).resolves.toBe(false);

		expect(getAuthState()).toEqual({ status: 'error', pubkey: null });
		expect(getAccountStore()).toEqual({ activeAccountId: null, accounts: [] });
	});

	test('ignores the legacy single-account session and requires a fresh login', async () => {
		storageValues.set(legacyAuthStorageKey, JSON.stringify({ method: 'nip07', pubkey: pubkeyA }));
		installNip07(pubkeyA);

		await expect(initializeAuth()).resolves.toBe(false);
		expect(storageValues.has(legacyAuthStorageKey)).toBe(false);
		expect(getAuthState()).toEqual({ status: 'loggedOut', pubkey: null });
	});

	test('deleting the active account restores the next saved account', async () => {
		installNip07(pubkeyA);
		await loginWithNip07();
		installNip07(pubkeyB);
		await loginWithNip07();

		installNip07(pubkeyA);
		await expect(removeAccount(getAccountId('nip07', pubkeyB))).resolves.toBe(true);

		expect(getAuthState()).toEqual({ status: 'loggedIn', pubkey: pubkeyA });
		expect(getAccountStore()).toMatchObject({
			activeAccountId: getAccountId('nip07', pubkeyA),
			accounts: [expect.objectContaining({ pubkey: pubkeyA })]
		});
	});

	test('logout deletes the active saved account', async () => {
		installNip07(pubkeyA);
		await loginWithNip07();

		await expect(logout()).resolves.toBe(true);
		expect(getAccountStore()).toEqual({ activeAccountId: null, accounts: [] });
		expect(getAuthState()).toEqual({ status: 'loggedOut', pubkey: null });
	});

	test('marks the session unavailable when no NIP-07 extension or saved account exists', async () => {
		await expect(initializeAuth()).resolves.toBe(false);
		expect(getAuthState()).toEqual({ status: 'unavailable', pubkey: null });
	});
});
