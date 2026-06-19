import { readJsonStorage, writeJsonStorage } from '$lib/local-storage';
import type * as Nostr from 'nostr-typedef';

export type AuthStatus = 'loggedOut' | 'loggingIn' | 'loggedIn' | 'unavailable' | 'error';

export type Nip07Signer = Pick<Nostr.Nip07.Nostr, 'getPublicKey'>;

export type AuthState = {
	status: AuthStatus;
	pubkey: string | null;
};

type StoredAccount = {
	method: 'nip07';
	pubkey: string;
};

export const authStorageKey = 'nostter:auth-account';

let state = $state<AuthState>({ status: 'loggedOut', pubkey: null });

function getNip07Signer(): Nip07Signer | null {
	const candidate = (globalThis as typeof globalThis & { nostr?: unknown }).nostr;
	if (!candidate || typeof candidate !== 'object') return null;

	const signer = candidate as Partial<Nip07Signer>;
	return typeof signer.getPublicKey === 'function' ? (signer as Nip07Signer) : null;
}

function normalizePubkey(value: unknown): string | null {
	if (typeof value !== 'string' || !/^[0-9a-f]{64}$/i.test(value)) return null;
	return value.toLowerCase();
}

function normalizeStoredAccount(value: unknown): StoredAccount | null {
	if (!value || typeof value !== 'object') return null;

	const candidate = value as Partial<StoredAccount>;
	const pubkey = normalizePubkey(candidate.pubkey);
	return candidate.method === 'nip07' && pubkey ? { method: 'nip07', pubkey } : null;
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
	state = { status: getNip07Signer() ? 'loggedOut' : 'unavailable', pubkey: null };
}

async function getExtensionPubkey(signer: Nip07Signer): Promise<string | null> {
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
	return getNip07Signer() !== null;
}

export async function loginWithNip07() {
	const signer = getNip07Signer();
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
	state = { status: 'loggedIn', pubkey };
	return true;
}

export async function initializeAuth() {
	const storedAccount = readStoredAccount();
	if (!storedAccount) {
		setLoggedOutState();
		return false;
	}

	const signer = getNip07Signer();
	if (!signer) {
		setLoggedOutState();
		return false;
	}

	state = { status: 'loggingIn', pubkey: null };
	const pubkey = await getExtensionPubkey(signer);
	if (!pubkey || pubkey !== storedAccount.pubkey) {
		writeStoredAccount(null);
		setLoggedOutState();
		return false;
	}

	state = { status: 'loggedIn', pubkey };
	return true;
}

export function logout() {
	writeStoredAccount(null);
	setLoggedOutState();
}

export function resetAuthStateForTesting() {
	state = { status: 'loggedOut', pubkey: null };
}
