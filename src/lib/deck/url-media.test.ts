import { afterEach, describe, expect, test, vi } from 'vitest';
import { getUrlMediaMetadata, requestUrlMediaMetadata } from './url-media';

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

	test('serializes HEAD requests for the same origin', async () => {
		const firstUrl = 'https://serialized.example/first-image';
		const secondUrl = 'https://serialized.example/second-image';
		const firstResponse = deferredResponse();
		const secondResponse = deferredResponse();
		const fetchMock = vi.fn<typeof fetch>().mockReturnValueOnce(firstResponse.promise);
		vi.stubGlobal('fetch', fetchMock);

		requestUrlMediaMetadata([firstUrl, secondUrl]);
		await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

		fetchMock.mockReturnValueOnce(secondResponse.promise);
		firstResponse.resolve(new Response(undefined, { headers: { 'Content-Type': 'image/png' } }));
		await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

		secondResponse.resolve(new Response(undefined, { headers: { 'Content-Type': 'text/html' } }));
		await vi.waitFor(() => expect(getUrlMediaMetadata(secondUrl)?.status).toBe('link'));

		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(fetchMock).toHaveBeenNthCalledWith(1, firstUrl, { method: 'HEAD' });
		expect(fetchMock).toHaveBeenNthCalledWith(2, secondUrl, { method: 'HEAD' });
		expect(getUrlMediaMetadata(firstUrl)?.status).toBe('image');
		expect(getUrlMediaMetadata(secondUrl)?.status).toBe('link');
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
});
