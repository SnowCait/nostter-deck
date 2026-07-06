import type { EventSigner } from 'rx-nostr';
import { describe, expect, test, vi } from 'vitest';
import {
	blossomMediaEndpointUrl,
	blossomServerHost,
	calculateSha256Hex,
	encodeAuthorizationToken,
	getBlossomImageValidationError,
	maxBlossomImageSizeBytes,
	normalizeBlobDescriptor,
	signBlossomAuthorization,
	uploadBlossomImage
} from './blossom';

const pubkey = 'a'.repeat(64);
const signature = '0'.repeat(128);

function createFile(content = 'image-bytes', options: { type?: string; name?: string } = {}): File {
	return new File([content], options.name ?? 'image.png', {
		type: options.type ?? 'image/png'
	});
}

function createSigner(): EventSigner {
	return {
		getPublicKey: vi.fn(async () => pubkey),
		signEvent: vi.fn(async (event) => ({
			...event,
			id: 'f'.repeat(64),
			pubkey,
			sig: signature
		}))
	};
}

function decodeAuthorizationToken(token: string) {
	const payload = token
		.replace(/^Nostr\s+/u, '')
		.replace(/-/g, '+')
		.replace(/_/g, '/');
	const paddedPayload = payload.padEnd(Math.ceil(payload.length / 4) * 4, '=');
	return JSON.parse(atob(paddedPayload)) as {
		kind: number;
		tags: string[][];
		content: string;
		created_at: number;
	};
}

describe('Blossom media upload', () => {
	test('derives endpoint URLs and auth host from the fixed Blossom server', () => {
		expect(blossomServerHost).toBe('blossom.band');
		expect(blossomMediaEndpointUrl).toBe('https://blossom.band/media');
	});

	test('validates image type and free upload size limit', () => {
		expect(getBlossomImageValidationError(createFile())).toBeNull();
		expect(getBlossomImageValidationError(createFile('text', { type: 'text/plain' }))).toBe(
			'unsupported-file'
		);
		expect(
			getBlossomImageValidationError({
				type: 'image/png',
				size: maxBlossomImageSizeBytes + 1
			})
		).toBe('file-too-large');
	});

	test('calculates lowercase SHA-256 for the original request body', async () => {
		await expect(calculateSha256Hex(createFile('hello'))).resolves.toBe(
			'2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
		);
	});

	test('builds a scoped BUD-11 media authorization token', async () => {
		const signer = createSigner();
		const signed = await signBlossomAuthorization(signer, 'b'.repeat(64), () => 100);

		expect(signed).toMatchObject({ kind: 24_242, pubkey });
		expect(signer.signEvent).toHaveBeenCalledWith({
			kind: 24_242,
			tags: [
				['t', 'media'],
				['expiration', '700'],
				['x', 'b'.repeat(64)],
				['server', 'blossom.band']
			],
			content: 'Upload media to blossom.band',
			created_at: 100
		});
		expect(encodeAuthorizationToken(signed!)).not.toMatch(/[+/=]/u);
	});

	test('uploads media to /media with authorization and accepts an optimized image descriptor', async () => {
		const signer = createSigner();
		const descriptor = {
			url: `https://blossom.band/${'c'.repeat(64)}.webp`,
			sha256: 'c'.repeat(64),
			size: 1024,
			type: 'image/webp',
			uploaded: 123
		};
		const fetcher = vi.fn<typeof fetch>(async () => {
			return new Response(JSON.stringify(descriptor), { status: 201 });
		});

		const result = await uploadBlossomImage(createFile('hello'), signer, {
			fetcher: fetcher as typeof fetch,
			timestamp: () => 100
		});

		expect(result).toEqual({ ok: true, descriptor });
		expect(fetcher).toHaveBeenCalledWith(
			blossomMediaEndpointUrl,
			expect.objectContaining({
				method: 'PUT',
				body: expect.any(File),
				headers: expect.objectContaining({
					'Content-Type': 'image/png',
					'X-SHA-256': '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
				})
			})
		);

		const headers = fetcher.mock.calls[0][1]?.headers as Record<string, string>;
		expect(decodeAuthorizationToken(headers.Authorization)).toMatchObject({
			kind: 24_242,
			tags: [
				['t', 'media'],
				['expiration', '700'],
				['x', '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'],
				['server', 'blossom.band']
			]
		});
	});

	test('rejects invalid blob descriptors', () => {
		expect(
			normalizeBlobDescriptor({
				url: 'https://blossom.band/blob.txt',
				sha256: 'c'.repeat(64),
				size: 10,
				type: 'text/plain',
				uploaded: 123
			})
		).toBeNull();
		expect(normalizeBlobDescriptor({ url: 'https://blossom.band/blob.png' })).toBeNull();
	});

	test('returns a human-readable upload failure reason from X-Reason', async () => {
		const fetcher = vi.fn<typeof fetch>(async () => {
			return new Response('', { status: 413, headers: { 'X-Reason': 'Too large' } });
		});

		await expect(
			uploadBlossomImage(createFile(), createSigner(), { fetcher: fetcher as typeof fetch })
		).resolves.toEqual({
			ok: false,
			reason: 'upload-failed',
			message: 'Too large'
		});
	});
});
