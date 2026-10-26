import type * as Nostr from 'nostr-typedef';
import type { EventSigner } from 'rx-nostr';
import { defaultIfEmpty, filter, firstValueFrom, map, take, TimeoutError } from 'rxjs';
import { getNostrClient } from '../client';
import { normalizeRelay } from '../relays';
import type { PublishDiagnostic } from '../publish-diagnostics';
import type { PublishFailureReason, PublishStage } from './publish-types';

export type PublishPostResult =
	| { ok: true; event: Nostr.Event }
	| {
			ok: false;
			reason: PublishFailureReason;
			stage: PublishStage;
			internalError?: unknown;
			targetRelayCount: number;
			diagnostic?: PublishDiagnostic;
	  };

export type PublishEventTemplate = Pick<Nostr.Event, 'kind' | 'tags' | 'content' | 'created_at'>;

export type PublishEventOptions = {
	signingTimeoutMs?: number;
};

export const defaultSigningTimeoutMs = 30_000;

class SigningTimeoutError extends Error {
	constructor() {
		super('Signing request timed out');
		this.name = 'SigningTimeoutError';
	}
}

export async function publishEvent(
	eventTemplate: PublishEventTemplate,
	pubkey: string,
	signer: EventSigner,
	relays?: string[],
	{ signingTimeoutMs = defaultSigningTimeoutMs }: PublishEventOptions = {}
): Promise<PublishPostResult> {
	const client = getNostrClient();
	const defaultPublishRelays = Object.values(
		client.getDefaultRelays({ filter: 'write-all' })
	).flatMap(({ url }) => {
		const normalized = normalizeRelay(url);
		return normalized ? [normalized] : [];
	});
	const publishRelays = relays
		? [
				...new Set(
					[...defaultPublishRelays, ...relays].flatMap((relay) => {
						const normalized = normalizeRelay(relay);
						return normalized ? [normalized] : [];
					})
				)
			]
		: undefined;
	const targetRelayCount = publishRelays?.length ?? new Set(defaultPublishRelays).size;

	let signedEvent: Nostr.Event;
	try {
		signedEvent = await withTimeout(signer.signEvent(eventTemplate), signingTimeoutMs);
	} catch (error) {
		return publishFailure(
			error instanceof SigningTimeoutError ? 'signing-timeout' : 'signing-failed',
			'signing',
			targetRelayCount,
			error
		);
	}

	if (!isSignedEvent(signedEvent)) {
		return publishFailure(
			'signing-failed',
			'signing',
			targetRelayCount,
			new Error('Signer returned a malformed event')
		);
	}

	if (signedEvent.pubkey.toLowerCase() !== pubkey.toLowerCase()) {
		return publishFailure('account-mismatch', 'signing', targetRelayCount);
	}

	const signedEventSigner: EventSigner = {
		getPublicKey: () => signer.getPublicKey(),
		signEvent: async <K extends number>() => signedEvent as Nostr.Event<K>
	};

	try {
		if (targetRelayCount === 0) {
			return publishFailure(
				'relay-failed',
				'publishing',
				0,
				new Error('No writable relays configured')
			);
		}
		const accepted = await firstValueFrom(
			client
				.send(signedEvent, {
					signer: signedEventSigner,
					completeOn: 'all-ok',
					errorOnTimeout: true,
					...(publishRelays ? { on: { relays: publishRelays } } : {})
				})
				.pipe(
					filter((packet) => packet.ok),
					take(1),
					map(() => true),
					defaultIfEmpty(false)
				)
		);
		if (!accepted) {
			return publishFailure('relay-rejected', 'publishing', targetRelayCount);
		}
		return { ok: true, event: signedEvent };
	} catch (error) {
		return publishFailure(
			error instanceof TimeoutError ? 'relay-timeout' : 'relay-failed',
			'publishing',
			targetRelayCount,
			error
		);
	}
}

function publishFailure(
	reason: PublishFailureReason,
	stage: PublishStage,
	targetRelayCount: number,
	internalError?: unknown
): Extract<PublishPostResult, { ok: false }> {
	return {
		ok: false,
		reason,
		stage,
		targetRelayCount,
		...(internalError ? { internalError } : {})
	};
}

function withTimeout<T>(source: Promise<T>, timeoutMs: number) {
	const { promise: timeout, reject } = Promise.withResolvers<never>();
	const timer = setTimeout(() => reject(new SigningTimeoutError()), Math.max(0, timeoutMs));
	return Promise.race([source, timeout]).finally(() => clearTimeout(timer));
}

function isSignedEvent(value: unknown): value is Nostr.Event {
	if (!value || typeof value !== 'object') {
		return false;
	}
	const event = value as Partial<Nostr.Event>;
	return (
		typeof event.kind === 'number' &&
		Number.isFinite(event.kind) &&
		typeof event.created_at === 'number' &&
		Number.isFinite(event.created_at) &&
		typeof event.content === 'string' &&
		Array.isArray(event.tags) &&
		event.tags.every(
			(tag) => Array.isArray(tag) && tag.every((entry) => typeof entry === 'string')
		) &&
		typeof event.id === 'string' &&
		/^[0-9a-f]{64}$/i.test(event.id) &&
		typeof event.pubkey === 'string' &&
		/^[0-9a-f]{64}$/i.test(event.pubkey) &&
		typeof event.sig === 'string' &&
		/^[0-9a-f]{128}$/i.test(event.sig)
	);
}
