import { base64urlnopad } from '@scure/base';
import { bytesToHex } from 'nostr-tools/utils';
import { now, type EventSigner } from 'rx-nostr';
import type * as Nostr from 'nostr-typedef';

const blossomServer = new URL('https://blossom.band');

export const blossomServerHost = blossomServer.host;
export const blossomMediaEndpointUrl = new URL('/media', blossomServer).href;
export const maxBlossomImageSizeBytes = 20 * 1024 * 1024;
export const maxBlossomImageCount = 10;

export type BlossomBlobDescriptor = {
	url: string;
	sha256: string;
	size: number;
	type: string;
	uploaded: number;
};

export type BlossomUploadResult =
	| { ok: true; descriptor: BlossomBlobDescriptor }
	| {
			ok: false;
			reason: 'unsupported-file' | 'file-too-large' | 'signing-failed' | 'upload-failed';
			message?: string;
	  };

type BlossomUploadOptions = {
	fetcher?: typeof fetch;
	timestamp?: () => number;
};

const blossomAuthKind = 24_242;
const authorizationLifetimeSeconds = 10 * 60;
const sha256Pattern = /^[0-9a-f]{64}$/;

export function isSupportedBlossomImage(file: Pick<File, 'type' | 'size'>) {
	return file.type.toLowerCase().startsWith('image/') && file.size <= maxBlossomImageSizeBytes;
}

export function getBlossomImageValidationError(file: Pick<File, 'type' | 'size'>) {
	if (!file.type.toLowerCase().startsWith('image/')) return 'unsupported-file' as const;
	if (file.size > maxBlossomImageSizeBytes) return 'file-too-large' as const;
	return null;
}

export async function uploadBlossomImage(
	file: File,
	signer: EventSigner,
	{ fetcher = fetch, timestamp = now }: BlossomUploadOptions = {}
): Promise<BlossomUploadResult> {
	const validationError = getBlossomImageValidationError(file);
	if (validationError) return { ok: false, reason: validationError };

	const sha256 = await calculateSha256Hex(file);
	const signedAuthorization = await signBlossomAuthorization(signer, sha256, timestamp);
	if (!signedAuthorization) return { ok: false, reason: 'signing-failed' };

	try {
		const response = await fetcher(blossomMediaEndpointUrl, {
			method: 'PUT',
			headers: {
				Authorization: `Nostr ${encodeAuthorizationToken(signedAuthorization)}`,
				'Content-Type': file.type,
				'X-SHA-256': sha256
			},
			body: file
		});

		if (!response.ok) {
			return {
				ok: false,
				reason: 'upload-failed',
				message: await getUploadErrorMessage(response)
			};
		}

		const descriptor = normalizeBlobDescriptor(await response.json());
		return descriptor
			? { ok: true, descriptor }
			: { ok: false, reason: 'upload-failed', message: 'Invalid Blossom response' };
	} catch {
		return { ok: false, reason: 'upload-failed' };
	}
}

export async function calculateSha256Hex(file: Pick<File, 'arrayBuffer'>) {
	const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
	return bytesToHex(new Uint8Array(digest));
}

export async function signBlossomAuthorization(
	signer: EventSigner,
	sha256: string,
	timestamp: () => number = now
) {
	const createdAt = timestamp();
	try {
		return await signer.signEvent({
			kind: blossomAuthKind,
			tags: [
				['t', 'media'],
				['expiration', String(createdAt + authorizationLifetimeSeconds)],
				['x', sha256],
				['server', blossomServerHost]
			],
			content: `Upload media to ${blossomServerHost}`,
			created_at: createdAt
		});
	} catch {
		return null;
	}
}

export function encodeAuthorizationToken(event: Nostr.Event) {
	return base64urlnopad.encode(new TextEncoder().encode(JSON.stringify(event)));
}

export function normalizeBlobDescriptor(value: unknown): BlossomBlobDescriptor | null {
	if (!value || typeof value !== 'object') return null;

	const candidate = value as Partial<BlossomBlobDescriptor>;
	if (
		typeof candidate.url !== 'string' ||
		typeof candidate.sha256 !== 'string' ||
		typeof candidate.size !== 'number' ||
		typeof candidate.type !== 'string' ||
		typeof candidate.uploaded !== 'number'
	) {
		return null;
	}

	if (!sha256Pattern.test(candidate.sha256.toLowerCase())) return null;
	if (!candidate.type.toLowerCase().startsWith('image/')) return null;
	if (!Number.isFinite(candidate.size) || candidate.size < 0) return null;
	if (!Number.isFinite(candidate.uploaded) || candidate.uploaded < 0) return null;

	try {
		const url = new URL(candidate.url);
		if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
		return {
			url: url.href,
			sha256: candidate.sha256.toLowerCase(),
			size: candidate.size,
			type: candidate.type,
			uploaded: candidate.uploaded
		};
	} catch {
		return null;
	}
}

async function getUploadErrorMessage(response: Response) {
	const reason = response.headers.get('X-Reason')?.trim();
	if (reason) return reason;

	try {
		const text = (await response.text()).trim();
		return text || undefined;
	} catch {
		return undefined;
	}
}
