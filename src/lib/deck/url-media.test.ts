import { afterEach, describe, expect, test, vi } from 'vitest';
import { clearUrlPreviewImage, getUrlMediaMetadata, requestUrlMediaMetadata } from './url-media';

function deferredResponse() {
	let resolve!: (response: Response) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<Response>((promiseResolve, promiseReject) => {
		resolve = promiseResolve;
		reject = promiseReject;
	});

	return { promise, resolve, reject };
}

describe('url media metadata', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	test('does not request metadata for http urls', () => {
		const httpUrl = 'http://insecure.example/image';
		const fetchMock = vi.fn<typeof fetch>();
		vi.stubGlobal('fetch', fetchMock);

		requestUrlMediaMetadata([httpUrl]);

		expect(fetchMock).not.toHaveBeenCalled();
		expect(getUrlMediaMetadata(httpUrl)).toEqual({ status: 'link', url: httpUrl });
	});

	test('does not request metadata for SimpleX SMP hosts', () => {
		const simplexSmpUrl = 'https://smp18.simplex.im:443/server';
		const normalizedSimplexSmpUrl = 'https://smp18.simplex.im/server';
		const fetchMock = vi.fn<typeof fetch>();
		vi.stubGlobal('fetch', fetchMock);

		requestUrlMediaMetadata([simplexSmpUrl]);

		expect(fetchMock).not.toHaveBeenCalled();
		expect(getUrlMediaMetadata(normalizedSimplexSmpUrl)).toEqual({
			status: 'link',
			url: normalizedSimplexSmpUrl
		});
	});

	test('serializes metadata requests for the same origin', async () => {
		const firstUrl = 'https://serialized.example/first-image';
		const secondUrl = 'https://serialized.example/second-page';
		const firstResponse = deferredResponse();
		const secondResponse = deferredResponse();
		const fetchMock = vi.fn<typeof fetch>().mockReturnValueOnce(firstResponse.promise);
		vi.stubGlobal('fetch', fetchMock);

		requestUrlMediaMetadata([firstUrl, secondUrl]);
		await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

		fetchMock.mockReturnValueOnce(secondResponse.promise);
		firstResponse.resolve(new Response(undefined, { headers: { 'Content-Type': 'image/png' } }));
		await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

		const secondOpenGraphResponse = deferredResponse();
		fetchMock.mockReturnValueOnce(secondOpenGraphResponse.promise);
		secondResponse.resolve(new Response(undefined, { headers: { 'Content-Type': 'text/html' } }));
		await vi.waitFor(() => expect(getUrlMediaMetadata(secondUrl)?.status).toBe('link'));

		expect(fetchMock).toHaveBeenCalledTimes(3);
		expect(fetchMock).toHaveBeenNthCalledWith(1, firstUrl, { method: 'HEAD' });
		expect(fetchMock).toHaveBeenNthCalledWith(2, secondUrl, { method: 'HEAD' });
		expect(fetchMock).toHaveBeenNthCalledWith(3, secondUrl);
		expect(getUrlMediaMetadata(firstUrl)?.status).toBe('image');
		expect(getUrlMediaMetadata(secondUrl)).toMatchObject({
			status: 'link'
		});

		secondOpenGraphResponse.resolve(new Response('<!doctype html><title>Second page</title>'));
		await vi.waitFor(() =>
			expect(getUrlMediaMetadata(secondUrl)).toMatchObject({ title: 'Second page' })
		);
	});

	test('skips queued HEAD requests after an origin fails metadata loading', async () => {
		const failedUrl = 'https://cors-blocked.example/image';
		const queuedUrl = 'https://cors-blocked.example/queued-image';
		const otherOriginUrl = 'https://metadata-ok.example/image';
		const failedResponse = deferredResponse();
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockReturnValueOnce(failedResponse.promise)
			.mockResolvedValueOnce(new Response(undefined, { headers: { 'Content-Type': 'image/png' } }));
		vi.stubGlobal('fetch', fetchMock);

		requestUrlMediaMetadata([failedUrl, queuedUrl, otherOriginUrl]);
		await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

		failedResponse.reject(new TypeError('Failed to fetch'));
		await vi.waitFor(() => expect(getUrlMediaMetadata(queuedUrl)?.status).toBe('link'));
		await vi.waitFor(() => expect(getUrlMediaMetadata(otherOriginUrl)?.status).toBe('image'));

		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(fetchMock).toHaveBeenNthCalledWith(1, failedUrl, { method: 'HEAD' });
		expect(fetchMock).toHaveBeenNthCalledWith(2, otherOriginUrl, { method: 'HEAD' });
		expect(getUrlMediaMetadata(failedUrl)).toEqual({ status: 'link', url: failedUrl });
		expect(getUrlMediaMetadata(queuedUrl)).toEqual({ status: 'link', url: queuedUrl });
	});

	test('loads Open Graph metadata for HTML links', async () => {
		const pageUrl = 'https://ogp.example/article';
		const openGraphResponse = deferredResponse();
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(new Response(undefined, { headers: { 'Content-Type': 'text/html' } }))
			.mockReturnValueOnce(openGraphResponse.promise);
		vi.stubGlobal('fetch', fetchMock);

		requestUrlMediaMetadata([pageUrl]);

		await vi.waitFor(() =>
			expect(getUrlMediaMetadata(pageUrl)).toEqual({
				status: 'link',
				url: pageUrl,
				contentType: 'text/html'
			})
		);

		openGraphResponse.resolve(
			new Response(`
				<!doctype html>
				<meta property="og:title" content="OGP title">
				<meta property="og:description" content="OGP description">
				<meta property="og:image" content="/preview.png">
				<title>Fallback title</title>
			`)
		);
		await vi.waitFor(() =>
			expect(getUrlMediaMetadata(pageUrl)).toMatchObject({
				status: 'link',
				contentType: 'text/html',
				title: 'OGP title',
				description: 'OGP description',
				imageUrl: 'https://ogp.example/preview.png'
			})
		);
		expect(fetchMock).toHaveBeenNthCalledWith(1, pageUrl, { method: 'HEAD' });
		expect(fetchMock).toHaveBeenNthCalledWith(2, pageUrl);
	});

	test('falls back to title and description metadata when Open Graph tags are absent', async () => {
		const pageUrl = 'https://html-metadata.example/article';
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(new Response(undefined, { headers: { 'Content-Type': 'text/html' } }))
			.mockResolvedValueOnce(
				new Response(`
					<!doctype html>
					<title>Document title</title>
					<meta name="description" content="Document description">
				`)
			);
		vi.stubGlobal('fetch', fetchMock);

		requestUrlMediaMetadata([pageUrl]);

		await vi.waitFor(() =>
			expect(getUrlMediaMetadata(pageUrl)).toMatchObject({
				status: 'link',
				title: 'Document title',
				description: 'Document description'
			})
		);
	});

	test('falls back to a link card when HTML metadata loading fails', async () => {
		const pageUrl = 'https://ogp-cors-blocked.example/article';
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(new Response(undefined, { headers: { 'Content-Type': 'text/html' } }))
			.mockRejectedValueOnce(new TypeError('Failed to fetch'));
		vi.stubGlobal('fetch', fetchMock);

		requestUrlMediaMetadata([pageUrl]);

		await vi.waitFor(() =>
			expect(getUrlMediaMetadata(pageUrl)).toEqual({
				status: 'link',
				url: pageUrl,
				contentType: 'text/html'
			})
		);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	test('skips future Open Graph requests after HTML metadata loading fails for an origin', async () => {
		const failedUrl = 'https://ogp-origin-blocked.example/article';
		const nextUrl = 'https://ogp-origin-blocked.example/next-article';
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(new Response(undefined, { headers: { 'Content-Type': 'text/html' } }))
			.mockRejectedValueOnce(new TypeError('Failed to fetch'))
			.mockResolvedValueOnce(new Response(undefined, { headers: { 'Content-Type': 'text/html' } }));
		vi.stubGlobal('fetch', fetchMock);

		requestUrlMediaMetadata([failedUrl]);
		await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

		requestUrlMediaMetadata([nextUrl]);
		await vi.waitFor(() => expect(getUrlMediaMetadata(nextUrl)?.status).toBe('link'));

		expect(fetchMock).toHaveBeenCalledTimes(3);
		expect(fetchMock).toHaveBeenNthCalledWith(1, failedUrl, { method: 'HEAD' });
		expect(fetchMock).toHaveBeenNthCalledWith(2, failedUrl);
		expect(fetchMock).toHaveBeenNthCalledWith(3, nextUrl, { method: 'HEAD' });
		expect(getUrlMediaMetadata(nextUrl)).toEqual({
			status: 'link',
			url: nextUrl,
			contentType: 'text/html'
		});
	});

	test('serializes Open Graph requests for the same origin', async () => {
		const firstUrl = 'https://ogp-serialized.example/first';
		const secondUrl = 'https://ogp-serialized.example/second';
		const firstOpenGraphResponse = deferredResponse();
		const secondOpenGraphResponse = deferredResponse();
		const fetchMock = vi.fn<typeof fetch>((input, init) => {
			const url = input.toString();
			if (init?.method === 'HEAD') {
				return Promise.resolve(
					new Response(undefined, { headers: { 'Content-Type': 'text/html' } })
				);
			}

			if (url === firstUrl) return firstOpenGraphResponse.promise;
			if (url === secondUrl) return secondOpenGraphResponse.promise;
			throw new Error(`Unexpected URL: ${url}`);
		});
		vi.stubGlobal('fetch', fetchMock);

		requestUrlMediaMetadata([firstUrl, secondUrl]);
		await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith(firstUrl));

		expect(
			fetchMock.mock.calls.filter(
				([input, init]) => init?.method !== 'HEAD' && input.toString() === secondUrl
			)
		).toHaveLength(0);
		firstOpenGraphResponse.resolve(new Response('<!doctype html><title>First</title>'));
		await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith(secondUrl));

		secondOpenGraphResponse.resolve(new Response('<!doctype html><title>Second</title>'));
		await vi.waitFor(() =>
			expect(getUrlMediaMetadata(secondUrl)).toMatchObject({ title: 'Second' })
		);
	});

	test('does not load Open Graph metadata for image urls', async () => {
		const imageUrl = 'https://image-only.example/image';
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(new Response(undefined, { headers: { 'Content-Type': 'image/png' } }));
		vi.stubGlobal('fetch', fetchMock);

		requestUrlMediaMetadata([imageUrl]);

		await vi.waitFor(() => expect(getUrlMediaMetadata(imageUrl)?.status).toBe('image'));
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock).toHaveBeenNthCalledWith(1, imageUrl, { method: 'HEAD' });
	});

	test('clears failed Open Graph preview images from link metadata', async () => {
		const pageUrl = 'https://ogp-image-failed.example/article';
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(new Response(undefined, { headers: { 'Content-Type': 'text/html' } }))
			.mockResolvedValueOnce(
				new Response(`
					<!doctype html>
					<meta property="og:title" content="OGP title">
					<meta property="og:image" content="/preview.png">
				`)
			);
		vi.stubGlobal('fetch', fetchMock);

		requestUrlMediaMetadata([pageUrl]);
		await vi.waitFor(() =>
			expect(getUrlMediaMetadata(pageUrl)).toMatchObject({
				status: 'link',
				title: 'OGP title',
				imageUrl: 'https://ogp-image-failed.example/preview.png'
			})
		);

		clearUrlPreviewImage(pageUrl);

		expect(getUrlMediaMetadata(pageUrl)).toEqual({
			status: 'link',
			url: pageUrl,
			contentType: 'text/html',
			title: 'OGP title',
			description: undefined
		});
	});

	test('does not clear direct image metadata when preview image clearing is requested', async () => {
		const imageUrl = 'https://direct-image-clear.example/image';
		const fetchMock = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(new Response(undefined, { headers: { 'Content-Type': 'image/png' } }));
		vi.stubGlobal('fetch', fetchMock);

		requestUrlMediaMetadata([imageUrl]);
		await vi.waitFor(() => expect(getUrlMediaMetadata(imageUrl)?.status).toBe('image'));

		clearUrlPreviewImage(imageUrl);

		expect(getUrlMediaMetadata(imageUrl)).toEqual({
			status: 'image',
			url: imageUrl,
			contentType: 'image/png'
		});
	});
});
