import type { BunkerPointer } from 'nostr-tools/nip46';
import { readJsonStorage, writeJsonStorage } from '$lib/local-storage';

export type AccountMethod = 'nip07' | 'nip46';

type BaseAccountRecord = {
	id: string;
	pubkey: string;
	createdAt: number;
};

export type Nip07AccountRecord = BaseAccountRecord & {
	method: 'nip07';
};

export type Nip46AccountRecord = BaseAccountRecord & {
	method: 'nip46';
	bunker: BunkerPointer;
	clientSecretKey: string;
};

export type AccountRecord = Nip07AccountRecord | Nip46AccountRecord;

export type AccountStore = {
	activeAccountId: string | null;
	accounts: AccountRecord[];
};

export const accountsStorageKey = 'nostter:accounts';

const emptyStore: AccountStore = { activeAccountId: null, accounts: [] };

function normalizePubkey(value: unknown): string | null {
	if (typeof value !== 'string' || !/^[0-9a-f]{64}$/i.test(value)) return null;
	return value.toLowerCase();
}

function normalizeBunker(value: unknown): BunkerPointer | null {
	if (!value || typeof value !== 'object') return null;

	const candidate = value as Partial<BunkerPointer>;
	const pubkey = normalizePubkey(candidate.pubkey);
	if (!pubkey || !Array.isArray(candidate.relays)) return null;

	return {
		pubkey,
		relays: candidate.relays.filter((relay): relay is string => typeof relay === 'string'),
		secret: typeof candidate.secret === 'string' ? candidate.secret : null
	};
}

function normalizeAccount(value: unknown): AccountRecord | null {
	if (!value || typeof value !== 'object') return null;

	const candidate = value as Partial<AccountRecord> & {
		bunker?: unknown;
		clientSecretKey?: unknown;
	};
	const pubkey = normalizePubkey(candidate.pubkey);
	if (
		!pubkey ||
		(candidate.method !== 'nip07' && candidate.method !== 'nip46') ||
		typeof candidate.createdAt !== 'number' ||
		!Number.isFinite(candidate.createdAt)
	) {
		return null;
	}

	const id = getAccountId(candidate.method, pubkey);
	if (candidate.method === 'nip07')
		return { id, method: 'nip07', pubkey, createdAt: candidate.createdAt };

	const bunker = normalizeBunker(candidate.bunker);
	if (
		!bunker ||
		typeof candidate.clientSecretKey !== 'string' ||
		!/^[0-9a-f]{64}$/i.test(candidate.clientSecretKey)
	) {
		return null;
	}
	return {
		id,
		method: 'nip46',
		pubkey,
		createdAt: candidate.createdAt,
		bunker,
		clientSecretKey: candidate.clientSecretKey.toLowerCase()
	};
}

function normalizeStore(value: unknown): AccountStore {
	if (!value || typeof value !== 'object') return { ...emptyStore };

	const candidate = value as Partial<AccountStore>;
	const accounts = Array.isArray(candidate.accounts)
		? candidate.accounts.flatMap((account) => {
				const normalizedAccount = normalizeAccount(account);
				return normalizedAccount ? [normalizedAccount] : [];
			})
		: [];
	const uniqueAccounts = accounts.filter(
		(account, index) => accounts.findIndex(({ id }) => id === account.id) === index
	);
	const activeAccountId =
		typeof candidate.activeAccountId === 'string' &&
		uniqueAccounts.some((account) => account.id === candidate.activeAccountId)
			? candidate.activeAccountId
			: (uniqueAccounts[0]?.id ?? null);
	return { activeAccountId, accounts: uniqueAccounts };
}

export function getAccountId(method: AccountMethod, pubkey: string) {
	return `${method}:${pubkey.toLowerCase()}`;
}

export function readAccounts() {
	return readJsonStorage(accountsStorageKey, { ...emptyStore }, normalizeStore);
}

export function writeAccounts(store: AccountStore) {
	writeJsonStorage(accountsStorageKey, store, normalizeStore);
}

export function upsertAccount(account: AccountRecord) {
	const store = readAccounts();
	const accounts = [...store.accounts.filter(({ id }) => id !== account.id), account];
	const nextStore = { accounts, activeAccountId: account.id };
	writeAccounts(nextStore);
	return nextStore;
}

export function setActiveAccount(accountId: string | null) {
	const store = readAccounts();
	const activeAccountId =
		accountId && store.accounts.some((account) => account.id === accountId) ? accountId : null;
	const nextStore = { ...store, activeAccountId };
	writeAccounts(nextStore);
	return nextStore;
}

export function removeAccount(accountId: string) {
	const store = readAccounts();
	const removedIndex = store.accounts.findIndex((account) => account.id === accountId);
	if (removedIndex < 0) return store;

	const accounts = store.accounts.filter(({ id }) => id !== accountId);
	const activeAccountId =
		store.activeAccountId === accountId
			? (accounts[removedIndex]?.id ?? accounts.at(-1)?.id ?? null)
			: store.activeAccountId;
	const nextStore = { accounts, activeAccountId };
	writeAccounts(nextStore);
	return nextStore;
}
