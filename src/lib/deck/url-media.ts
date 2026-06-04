import AsyncLock from 'async-lock';
import { SvelteMap } from 'svelte/reactivity';

export type UrlMediaMetadata =
	| {
			status: 'loading';
			url: string;
	  }
	| {
			status: 'image';
			url: string;
			contentType: string;
			width?: number;
			height?: number;
	  }
	| {
			status: 'link';
			url: string;
			contentType?: string;
	  };

const mediaByUrl = new SvelteMap<string, UrlMediaMetadata>();
const failedMetadataOrigins = new Set<string>();
const metadataLock = new AsyncLock();

export function getUrlMediaMetadata(url: string) {
	return mediaByUrl.get(url);
}

export function requestUrlMediaMetadata(urls: string[]) {
	for (const url of urls) {
		const parsedUrl = parseUrl(url);
		if (!parsedUrl) {
			mediaByUrl.set(url, { status: 'link', url });
			continue;
		}

		const normalizedUrl = parsedUrl.href;
		if (mediaByUrl.has(normalizedUrl)) continue;

		if (failedMetadataOrigins.has(parsedUrl.origin)) {
			mediaByUrl.set(normalizedUrl, { status: 'link', url: normalizedUrl });
			continue;
		}

		mediaByUrl.set(normalizedUrl, { status: 'loading', url: normalizedUrl });
		void loadUrlMediaMetadata(parsedUrl);
	}
}

export function setUrlImageDimensions(url: string, width: number, height: number) {
	if (width <= 0 || height <= 0) return;

	const media = mediaByUrl.get(url);
	if (media?.status !== 'image') return;

	mediaByUrl.set(url, {
		...media,
		width,
		height
	});
}

function parseUrl(url: string) {
	try {
		return new URL(url);
	} catch {
		return undefined;
	}
}

async function loadUrlMediaMetadata(url: URL) {
	const normalizedUrl = url.href;
	const origin = url.origin;

	await metadataLock.acquire(origin, async () => {
		if (failedMetadataOrigins.has(origin)) {
			mediaByUrl.set(normalizedUrl, { status: 'link', url: normalizedUrl });
			return;
		}

		try {
			const response = await fetch(normalizedUrl, { method: 'HEAD' });
			const contentType = response.headers.get('content-type') ?? undefined;

			mediaByUrl.set(
				normalizedUrl,
				contentType?.toLowerCase().startsWith('image/')
					? { status: 'image', url: normalizedUrl, contentType }
					: { status: 'link', url: normalizedUrl, contentType }
			);
		} catch {
			failedMetadataOrigins.add(origin);
			mediaByUrl.set(normalizedUrl, { status: 'link', url: normalizedUrl });
		}
	});
}
