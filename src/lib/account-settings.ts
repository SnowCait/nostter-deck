import { persistedState } from 'svelte-persisted-state';
import type { LikeReaction } from '$lib/nostr/emoji-reactions';
import { normalizePubkey } from '$lib/nostr/pubkeys';

export type AccountSettings = {
	likeReaction: LikeReaction;
};

export type AccountSettingsStore = Record<string, AccountSettings>;

const accountSettingsStorageKey = 'nostter:account-settings';
const defaultLikeReaction: LikeReaction = { type: 'plus' };
const defaultAccountSettings: AccountSettings = {
	likeReaction: defaultLikeReaction
};

const accountSettingsState = persistedState<AccountSettingsStore>(
	accountSettingsStorageKey,
	{},
	{
		beforeRead: normalizeAccountSettingsStore
	}
);

function isValidShortcode(value: string) {
	return /^[A-Za-z0-9_+-]+$/.test(value);
}

function normalizeHttpsUrl(value: string) {
	try {
		const url = new URL(value);
		return url.protocol === 'https:' ? url.href : null;
	} catch {
		return null;
	}
}

function normalizeLikeReaction(value: unknown): LikeReaction {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return defaultLikeReaction;
	}

	const candidate = value as Partial<LikeReaction>;
	if (candidate.type === 'plus') {
		return defaultLikeReaction;
	}
	if (candidate.type === 'unicode') {
		return typeof candidate.emoji === 'string' && candidate.emoji.trim().length > 0
			? { type: 'unicode', emoji: candidate.emoji }
			: defaultLikeReaction;
	}
	if (candidate.type === 'custom') {
		const url = typeof candidate.url === 'string' ? normalizeHttpsUrl(candidate.url) : null;
		if (typeof candidate.shortcode !== 'string' || !isValidShortcode(candidate.shortcode) || !url) {
			return defaultLikeReaction;
		}

		return {
			type: 'custom',
			shortcode: candidate.shortcode,
			url,
			...(typeof candidate.address === 'string' && candidate.address.length > 0
				? { address: candidate.address }
				: {})
		};
	}

	return defaultLikeReaction;
}

function normalizeAccountSettings(value: unknown): AccountSettings {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return { ...defaultAccountSettings };
	}

	const candidate = value as Partial<AccountSettings>;
	return {
		likeReaction: normalizeLikeReaction(candidate.likeReaction)
	};
}

export function normalizeAccountSettingsStore(value: unknown): AccountSettingsStore {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return {};
	}

	const store: AccountSettingsStore = {};
	for (const [pubkey, settings] of Object.entries(value)) {
		const normalizedPubkey = normalizePubkey(pubkey);
		if (!normalizedPubkey) {
			continue;
		}
		store[normalizedPubkey] = normalizeAccountSettings(settings);
	}
	return store;
}

export function getDefaultLikeReaction(): LikeReaction {
	return { ...defaultLikeReaction };
}

export function getDefaultAccountSettings(): AccountSettings {
	return {
		likeReaction: getDefaultLikeReaction()
	};
}

export function readAccountSettings(pubkey: string | null | undefined): AccountSettings {
	if (!pubkey) {
		return getDefaultAccountSettings();
	}

	const normalizedPubkey = normalizePubkey(pubkey);
	return normalizedPubkey
		? (accountSettingsState.current[normalizedPubkey] ?? getDefaultAccountSettings())
		: getDefaultAccountSettings();
}

export function updateAccountSettings(
	pubkey: string,
	updater: (currentSettings: AccountSettings) => AccountSettings
) {
	const normalizedPubkey = normalizePubkey(pubkey);
	if (!normalizedPubkey) {
		return;
	}
	const store = accountSettingsState.current;
	accountSettingsState.current = normalizeAccountSettingsStore({
		...store,
		[normalizedPubkey]: updater(store[normalizedPubkey] ?? getDefaultAccountSettings())
	});
}

export function readLikeReaction(pubkey: string | null | undefined): LikeReaction {
	return readAccountSettings(pubkey).likeReaction;
}

export function writeLikeReaction(pubkey: string, likeReaction: LikeReaction) {
	updateAccountSettings(pubkey, (settings) => ({
		...settings,
		likeReaction
	}));
}

export function resetLikeReaction(pubkey: string) {
	writeLikeReaction(pubkey, getDefaultLikeReaction());
}

export { accountSettingsStorageKey };
