import { readJsonStorage, writeJsonStorage } from '$lib/local-storage';
import {
	BunkerSigner,
	createNostrConnectURI,
	parseBunkerInput,
	type BunkerPointer
} from 'nostr-tools/nip46';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { bytesToHex, hexToBytes } from 'nostr-tools/utils';
import type * as Nostr from 'nostr-typedef';
import { defaultRelays } from './relays';

export type AuthStatus = 'loggedOut' | 'loggingIn' | 'loggedIn' | 'unavailable' | 'error';

type Nip07PublicKeyProvider = Pick<Nostr.Nip07.Nostr, 'getPublicKey'>;
export type Nip07Signer = Pick<Nostr.Nip07.Nostr, 'getPublicKey' | 'signEvent'>;
export type AuthSigner = Nip07Signer;

export type AuthState = {
	status: AuthStatus;
	pubkey: string | null;
};

type StoredAccount =
	| { method: 'nip07'; pubkey: string }
	| { method: 'nip46'; pubkey: string; bunker: BunkerPointer; clientSecretKey: string };

export const authStorageKey = 'nostter:auth-account';

let state = $state<AuthState>({ status: 'loggedOut', pubkey: null });
let activeSigner: AuthSigner | null = null;
let activeBunkerSigner: BunkerSigner | null = null;

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

function normalizePubkey(value: unknown): string | null {
	if (typeof value !== 'string' || !/^[0-9a-f]{64}$/i.test(value)) return null;
	return value.toLowerCase();
}

function normalizeStoredAccount(value: unknown): StoredAccount | null {
	if (!value || typeof value !== 'object') return null;

	const candidate = value as Partial<StoredAccount>;
	const pubkey = normalizePubkey(candidate.pubkey);
	if (candidate.method === 'nip07' && pubkey) return { method: 'nip07', pubkey };
	if (candidate.method !== 'nip46' || !pubkey || !candidate.bunker) return null;
	const bunker = candidate.bunker as Partial<BunkerPointer>;
	if (
		typeof bunker.pubkey !== 'string' ||
		!Array.isArray(bunker.relays) ||
		typeof candidate.clientSecretKey !== 'string' ||
		!/^[0-9a-f]{64}$/i.test(candidate.clientSecretKey)
	)
		return null;
	return {
		method: 'nip46',
		pubkey,
		bunker: {
			pubkey: bunker.pubkey,
			relays: bunker.relays.filter((relay): relay is string => typeof relay === 'string'),
			secret: typeof bunker.secret === 'string' ? bunker.secret : null
		},
		clientSecretKey: candidate.clientSecretKey.toLowerCase()
	};
}

function readStoredAccount() {
	return readJsonStorage<StoredAccount | null>(authStorageKey, null, normalizeStoredAccount);
}

function writeStoredAccount(account: StoredAccount | null) {
	if (!account) {
		if (typeof localStorage !== 'undefined') localStorage.removeItem(authStorageKey);
		return;
	}

	writeJsonStorage(authStorageKey, account, normalizeStoredAccount);
}

function setLoggedOutState() {
	activeSigner = null;
	void activeBunkerSigner?.close();
	activeBunkerSigner = null;
	state = { status: getNip07PublicKeyProvider() ? 'loggedOut' : 'unavailable', pubkey: null };
}

async function getExtensionPubkey(signer: Nip07PublicKeyProvider): Promise<string | null> {
	try {
		return normalizePubkey(await signer.getPublicKey());
	} catch {
		return null;
	}
}

export function getAuthState() {
	return state;
}

export function isNip07Available() {
	return getNip07PublicKeyProvider() !== null;
}

export async function loginWithNip07() {
	const signer = getNip07PublicKeyProvider();
	if (!signer) {
		setLoggedOutState();
		return false;
	}

	state = { status: 'loggingIn', pubkey: null };
	const pubkey = await getExtensionPubkey(signer);
	if (!pubkey) {
		state = { status: 'error', pubkey: null };
		return false;
	}

	writeStoredAccount({ method: 'nip07', pubkey });
	activeSigner = getNip07Signer();
	if (!activeSigner) {
		state = { status: 'error', pubkey: null };
		return false;
	}
	state = { status: 'loggedIn', pubkey };
	return true;
}

export async function initializeAuth() {
	const storedAccount = readStoredAccount();
	if (!storedAccount) {
		setLoggedOutState();
		return false;
	}

	if (storedAccount.method === 'nip46') {
		return connectNip46(
			storedAccount.bunker,
			hexToBytes(storedAccount.clientSecretKey),
			storedAccount.pubkey,
			true
		);
	}

	const signer = getNip07Signer();
	if (!signer) return false;
	state = { status: 'loggingIn', pubkey: null };
	const pubkey = await getExtensionPubkey(signer);
	if (!pubkey || pubkey !== storedAccount.pubkey) {
		writeStoredAccount(null);
		setLoggedOutState();
		return false;
	}
	activeSigner = signer;
	state = { status: 'loggedIn', pubkey };
	return true;
}

async function connectNip46(
	bunker: BunkerPointer,
	clientSecretKey: Uint8Array,
	expectedPubkey?: string,
	restoring = false
) {
	state = { status: 'loggingIn', pubkey: null };
	try {
		const signer = BunkerSigner.fromBunker(clientSecretKey, bunker);
		await signer.connect();
		const pubkey = normalizePubkey(await signer.getPublicKey());
		if (!pubkey || (expectedPubkey && pubkey !== expectedPubkey)) throw new Error('Invalid signer');
		activeBunkerSigner = signer;
		activeSigner = signer as AuthSigner;
		if (!restoring) {
			writeStoredAccount({
				method: 'nip46',
				pubkey,
				bunker: signer.bp,
				clientSecretKey: bytesToHex(clientSecretKey)
			});
		}
		state = { status: 'loggedIn', pubkey };
		return true;
	} catch {
		setLoggedOutState();
		return false;
	}
}

export async function loginWithNip46Bunker(input: string) {
	const bunker = await parseBunkerInput(input.trim());
	return bunker ? connectNip46(bunker, generateSecretKey()) : false;
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
	state = { status: 'loggingIn', pubkey: null };
	try {
		const signer = await BunkerSigner.fromURI(clientSecretKey, uri);
		const pubkey = normalizePubkey(await signer.getPublicKey());
		if (!pubkey) throw new Error('Invalid signer');
		activeBunkerSigner = signer;
		activeSigner = signer as AuthSigner;
		writeStoredAccount({
			method: 'nip46',
			pubkey,
			bunker: signer.bp,
			clientSecretKey: bytesToHex(clientSecretKey)
		});
		state = { status: 'loggedIn', pubkey };
		return true;
	} catch {
		setLoggedOutState();
		return false;
	}
}

export function logout() {
	writeStoredAccount(null);
	setLoggedOutState();
}

export function resetAuthStateForTesting() {
	state = { status: 'loggedOut', pubkey: null };
}
