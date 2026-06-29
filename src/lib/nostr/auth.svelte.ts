import {
	BunkerSigner,
	createNostrConnectURI,
	parseBunkerInput,
	type BunkerPointer
} from 'nostr-tools/nip46';
import type { WindowNostr } from 'nostr-tools/nip07';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import type { Signer } from 'nostr-tools/signer';
import { bytesToHex, hexToBytes } from 'nostr-tools/utils';
import { now, type EventSigner } from 'rx-nostr';
import type * as Nostr from 'nostr-typedef';
import {
	getAccountId,
	readAccounts,
	removeAccount as removeStoredAccount,
	setActiveAccount,
	upsertAccount,
	type AccountRecord,
	type AccountStore,
	type Nip46AccountRecord
} from './accounts';
import { defaultRelays } from './relays';

export type AuthStatus = 'loggedOut' | 'loggingIn' | 'loggedIn' | 'unavailable' | 'error';

export type AuthState = {
	status: AuthStatus;
	pubkey: string | null;
};

export const legacyAuthStorageKey = 'nostter:auth-account';

let state = $state<AuthState>({ status: 'loggedOut', pubkey: null });
let accountStore = $state<AccountStore>(readAccounts());
let activeSigner: EventSigner | null = null;
let activeBunkerSigner: BunkerSigner | null = null;
let authAttempt = 0;
let cancellableAuthAttempt: number | null = null;

function toEventSigner(signer: Signer): EventSigner {
	return {
		getPublicKey: () => signer.getPublicKey(),
		signEvent: async <K extends number>(params: Nostr.EventParameters<K>) =>
			(await signer.signEvent({
				kind: params.kind,
				tags: params.tags ?? [],
				content: params.content ?? '',
				created_at: params.created_at ?? now()
			})) as unknown as Nostr.Event<K>
	};
}

function getNip07Provider(): WindowNostr | null {
	const candidate = (globalThis as typeof globalThis & { nostr?: unknown }).nostr;
	if (!candidate || typeof candidate !== 'object') return null;

	const provider = candidate as Partial<WindowNostr>;
	return typeof provider.getPublicKey === 'function' && typeof provider.signEvent === 'function'
		? (provider as WindowNostr)
		: null;
}

export function getAuthSigner() {
	return activeSigner;
}

export function getAuthState() {
	return state;
}

export function getAccountStore() {
	return accountStore;
}

export function isNip07Available() {
	return getNip07Provider() !== null;
}

function normalizePubkey(value: unknown): string | null {
	if (typeof value !== 'string' || !/^[0-9a-f]{64}$/i.test(value)) return null;
	return value.toLowerCase();
}

function refreshAccountStore() {
	accountStore = readAccounts();
	return accountStore;
}

function writeAndSetAccountStore(store: AccountStore) {
	accountStore = store;
	return store;
}

function loggedOutStatus() {
	return getNip07Provider() ? 'loggedOut' : 'unavailable';
}

function disconnectActiveSigner() {
	activeSigner = null;
	void activeBunkerSigner?.close();
	activeBunkerSigner = null;
}

function setLoggedOutState(status: AuthStatus = loggedOutStatus()) {
	disconnectActiveSigner();
	state = { status, pubkey: null };
}

function replaceActiveSigner(signer: EventSigner, bunkerSigner: BunkerSigner | null = null) {
	const previousBunkerSigner = activeBunkerSigner;
	activeSigner = signer;
	activeBunkerSigner = bunkerSigner;
	if (previousBunkerSigner && previousBunkerSigner !== bunkerSigner) {
		void previousBunkerSigner.close();
	}
}

function beginAuthentication({ preserveActiveSession = false } = {}) {
	authAttempt += 1;
	cancellableAuthAttempt = preserveActiveSession ? authAttempt : null;
	if (!preserveActiveSession) {
		disconnectActiveSigner();
		state = { status: 'loggingIn', pubkey: null };
	}
	return { attempt: authAttempt, preserveActiveSession };
}

function isCurrentAttempt(attempt: number) {
	return authAttempt === attempt;
}

function isLoggedIn() {
	return state.status === 'loggedIn' && activeSigner !== null;
}

function finishAuthenticationAttempt(attempt: number) {
	if (cancellableAuthAttempt === attempt) cancellableAuthAttempt = null;
}

function failAuthenticationAttempt(
	attempt: number,
	preserveActiveSession: boolean,
	status: AuthStatus = 'error'
) {
	if (!isCurrentAttempt(attempt)) return;
	finishAuthenticationAttempt(attempt);
	if (!preserveActiveSession) setLoggedOutState(status);
}

async function getExtensionPubkey(
	signer: Pick<WindowNostr, 'getPublicKey'>
): Promise<string | null> {
	try {
		return normalizePubkey(await signer.getPublicKey());
	} catch {
		return null;
	}
}

function activateNip07Account(signer: WindowNostr, pubkey: string) {
	const record: AccountRecord = {
		id: getAccountId('nip07', pubkey),
		method: 'nip07',
		pubkey,
		createdAt: Date.now()
	};
	writeAndSetAccountStore(upsertAccount(record));
	activeSigner = toEventSigner(signer);
	state = { status: 'loggedIn', pubkey };
	return true;
}

async function activateNip07() {
	const provider = getNip07Provider();
	if (!provider) {
		setLoggedOutState(loggedOutStatus());
		return false;
	}

	const { attempt } = beginAuthentication();
	const pubkey = await getExtensionPubkey(provider);
	if (!isCurrentAttempt(attempt)) return false;
	if (!pubkey) {
		setLoggedOutState('error');
		return false;
	}
	return activateNip07Account(provider, pubkey);
}

function createNip46Account(
	pubkey: string,
	bunker: BunkerPointer,
	clientSecretKey: Uint8Array
): Nip46AccountRecord {
	return {
		id: getAccountId('nip46', pubkey),
		method: 'nip46',
		pubkey,
		createdAt: Date.now(),
		bunker,
		clientSecretKey: bytesToHex(clientSecretKey)
	};
}

async function activateNip46(
	bunker: BunkerPointer,
	clientSecretKey: Uint8Array,
	expectedPubkey?: string,
	{ preserveActiveSession = false } = {}
) {
	const { attempt } = beginAuthentication({ preserveActiveSession });
	let signer: BunkerSigner | null = null;
	try {
		signer = BunkerSigner.fromBunker(clientSecretKey, bunker);
		await signer.connect();
		const pubkey = normalizePubkey(await signer.getPublicKey());
		if (!pubkey || (expectedPubkey && pubkey !== expectedPubkey)) throw new Error('Invalid signer');
		if (!isCurrentAttempt(attempt)) {
			void signer.close();
			return false;
		}

		finishAuthenticationAttempt(attempt);
		writeAndSetAccountStore(upsertAccount(createNip46Account(pubkey, signer.bp, clientSecretKey)));
		replaceActiveSigner(toEventSigner(signer), signer);
		state = { status: 'loggedIn', pubkey };
		return true;
	} catch {
		if (signer) void signer.close();
		failAuthenticationAttempt(attempt, preserveActiveSession);
		return false;
	}
}

export async function loginWithNip07() {
	return activateNip07();
}

export async function initializeAuth() {
	if (typeof localStorage !== 'undefined') localStorage.removeItem(legacyAuthStorageKey);
	const store = refreshAccountStore();
	if (!store.activeAccountId) {
		setLoggedOutState();
		return false;
	}
	return selectAccount(store.activeAccountId);
}

export async function selectAccount(accountId: string) {
	const account = refreshAccountStore().accounts.find(({ id }) => id === accountId);
	if (!account) return false;

	writeAndSetAccountStore(setActiveAccount(accountId));
	if (account.method === 'nip07') return activateNip07();
	return activateNip46(account.bunker, hexToBytes(account.clientSecretKey), account.pubkey);
}

export async function loginWithNip46Bunker(input: string) {
	const bunker = await parseBunkerInput(input.trim());
	return bunker
		? activateNip46(bunker, generateSecretKey(), undefined, {
				preserveActiveSession: isLoggedIn()
			})
		: false;
}

export function createNip46ConnectionUri() {
	const clientSecretKey = generateSecretKey();
	return {
		clientSecretKey,
		connectionUri: createNostrConnectURI({
			clientPubkey: getPublicKey(clientSecretKey),
			relays: [...defaultRelays],
			secret: bytesToHex(generateSecretKey()),
			name: 'nostter deck'
		})
	};
}

export async function loginWithNip46ConnectionUri(uri: string, clientSecretKey: Uint8Array) {
	const preserveActiveSession = isLoggedIn();
	const { attempt } = beginAuthentication({ preserveActiveSession });
	let signer: BunkerSigner | null = null;
	try {
		signer = await BunkerSigner.fromURI(clientSecretKey, uri);
		const pubkey = normalizePubkey(await signer.getPublicKey());
		if (!pubkey) throw new Error('Invalid signer');
		if (!isCurrentAttempt(attempt)) {
			void signer.close();
			return false;
		}

		finishAuthenticationAttempt(attempt);
		writeAndSetAccountStore(upsertAccount(createNip46Account(pubkey, signer.bp, clientSecretKey)));
		replaceActiveSigner(toEventSigner(signer), signer);
		state = { status: 'loggedIn', pubkey };
		return true;
	} catch {
		if (signer) void signer.close();
		failAuthenticationAttempt(attempt, preserveActiveSession);
		return false;
	}
}

export function cancelPendingAuthentication() {
	if (cancellableAuthAttempt === null || !isCurrentAttempt(cancellableAuthAttempt)) return false;

	cancellableAuthAttempt = null;
	authAttempt += 1;
	return true;
}

export async function removeAccount(accountId: string) {
	const wasActive = accountStore.activeAccountId === accountId;
	const nextStore = writeAndSetAccountStore(removeStoredAccount(accountId));
	if (!wasActive) return true;

	if (!nextStore.activeAccountId) {
		authAttempt += 1;
		setLoggedOutState();
		return true;
	}
	return selectAccount(nextStore.activeAccountId);
}

export async function logout() {
	const activeAccountId = accountStore.activeAccountId;
	if (!activeAccountId) {
		authAttempt += 1;
		setLoggedOutState();
		return true;
	}
	return removeAccount(activeAccountId);
}

export function resetAuthStateForTesting() {
	authAttempt += 1;
	cancellableAuthAttempt = null;
	disconnectActiveSigner();
	accountStore = readAccounts();
	state = { status: 'loggedOut', pubkey: null };
}
