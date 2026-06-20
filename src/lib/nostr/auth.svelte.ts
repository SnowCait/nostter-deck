import {
	BunkerSigner,
	createNostrConnectURI,
	parseBunkerInput,
	type BunkerPointer
} from 'nostr-tools/nip46';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { bytesToHex, hexToBytes } from 'nostr-tools/utils';
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

type Nip07PublicKeyProvider = Pick<Nostr.Nip07.Nostr, 'getPublicKey'>;
export type Nip07Signer = Pick<Nostr.Nip07.Nostr, 'getPublicKey' | 'signEvent'>;
export type AuthSigner = Nip07Signer;

export type AuthState = {
	status: AuthStatus;
	pubkey: string | null;
};

export const legacyAuthStorageKey = 'nostter:auth-account';

let state = $state<AuthState>({ status: 'loggedOut', pubkey: null });
let accountStore = $state<AccountStore>(readAccounts());
let activeSigner: AuthSigner | null = null;
let activeBunkerSigner: BunkerSigner | null = null;
let authAttempt = 0;

function getNip07PublicKeyProvider(): Nip07PublicKeyProvider | null {
	const candidate = (globalThis as typeof globalThis & { nostr?: unknown }).nostr;
	if (!candidate || typeof candidate !== 'object') return null;

	const provider = candidate as Partial<Nip07PublicKeyProvider>;
	return typeof provider.getPublicKey === 'function' ? (provider as Nip07PublicKeyProvider) : null;
}

export function getNip07Signer(): Nip07Signer | null {
	const candidate = getNip07PublicKeyProvider();
	if (!candidate) return null;

	const signer = candidate as Partial<Nip07Signer>;
	return typeof signer.signEvent === 'function' ? (signer as Nip07Signer) : null;
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
	return getNip07PublicKeyProvider() !== null;
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
	return getNip07PublicKeyProvider() ? 'loggedOut' : 'unavailable';
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

function beginAuthentication() {
	authAttempt += 1;
	disconnectActiveSigner();
	state = { status: 'loggingIn', pubkey: null };
	return authAttempt;
}

function isCurrentAttempt(attempt: number) {
	return authAttempt === attempt;
}

async function getExtensionPubkey(signer: Nip07PublicKeyProvider): Promise<string | null> {
	try {
		return normalizePubkey(await signer.getPublicKey());
	} catch {
		return null;
	}
}

function activateNip07Account(signer: Nip07Signer, pubkey: string) {
	const record: AccountRecord = {
		id: getAccountId('nip07', pubkey),
		method: 'nip07',
		pubkey,
		createdAt: Date.now()
	};
	writeAndSetAccountStore(upsertAccount(record));
	activeSigner = signer;
	state = { status: 'loggedIn', pubkey };
	return true;
}

async function activateNip07() {
	const provider = getNip07PublicKeyProvider();
	const signer = getNip07Signer();
	if (!provider || !signer) {
		setLoggedOutState(provider ? 'error' : 'unavailable');
		return false;
	}

	const attempt = beginAuthentication();
	const pubkey = await getExtensionPubkey(provider);
	if (!isCurrentAttempt(attempt)) return false;
	if (!pubkey) {
		setLoggedOutState('error');
		return false;
	}
	return activateNip07Account(signer, pubkey);
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
	expectedPubkey?: string
) {
	const attempt = beginAuthentication();
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

		writeAndSetAccountStore(upsertAccount(createNip46Account(pubkey, signer.bp, clientSecretKey)));
		activeBunkerSigner = signer;
		activeSigner = signer as AuthSigner;
		state = { status: 'loggedIn', pubkey };
		return true;
	} catch {
		if (signer) void signer.close();
		if (isCurrentAttempt(attempt)) setLoggedOutState('error');
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
	return bunker ? activateNip46(bunker, generateSecretKey()) : false;
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
	const attempt = beginAuthentication();
	let signer: BunkerSigner | null = null;
	try {
		signer = await BunkerSigner.fromURI(clientSecretKey, uri);
		const pubkey = normalizePubkey(await signer.getPublicKey());
		if (!pubkey) throw new Error('Invalid signer');
		if (!isCurrentAttempt(attempt)) {
			void signer.close();
			return false;
		}

		writeAndSetAccountStore(upsertAccount(createNip46Account(pubkey, signer.bp, clientSecretKey)));
		activeBunkerSigner = signer;
		activeSigner = signer as AuthSigner;
		state = { status: 'loggedIn', pubkey };
		return true;
	} catch {
		if (signer) void signer.close();
		if (isCurrentAttempt(attempt)) setLoggedOutState('error');
		return false;
	}
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
	disconnectActiveSigner();
	accountStore = readAccounts();
	state = { status: 'loggedOut', pubkey: null };
}
