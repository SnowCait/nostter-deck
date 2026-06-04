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
			title?: string;
			description?: string;
			imageUrl?: string;
	  };

const mediaByUrl = new SvelteMap<string, UrlMediaMetadata>();
const failedMetadataOrigins = new Set<string>();
const failedOpenGraphOrigins = new Set<string>();
const metadataLock = new AsyncLock();
const openGraphLock = new AsyncLock();
const simplexSmpHostnamePattern = /^smp\d+\.simplex\.im$/i;

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

		if (!canRequestUrlMetadata(parsedUrl) || failedMetadataOrigins.has(parsedUrl.origin)) {
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

export function clearUrlPreviewImage(url: string) {
	const media = mediaByUrl.get(url);
	if (media?.status !== 'link' || !media.imageUrl) return;

	mediaByUrl.set(url, {
		status: 'link',
		url: media.url,
		contentType: media.contentType,
		title: media.title,
		description: media.description
	});
}

function parseUrl(url: string) {
	try {
		return new URL(url);
	} catch {
		return undefined;
	}
}

function canRequestUrlMetadata(url: URL) {
	return url.protocol === 'https:' && !simplexSmpHostnamePattern.test(url.hostname);
}

async function loadUrlMediaMetadata(url: URL) {
	const normalizedUrl = url.href;
	const origin = url.origin;

	if (!canRequestUrlMetadata(url)) {
		mediaByUrl.set(normalizedUrl, { status: 'link', url: normalizedUrl });
		return;
	}

	await metadataLock.acquire(origin, async () => {
		if (failedMetadataOrigins.has(origin)) {
			mediaByUrl.set(normalizedUrl, { status: 'link', url: normalizedUrl });
			return;
		}

		try {
			const response = await fetch(normalizedUrl, { method: 'HEAD' });
			const contentType = response.headers.get('content-type') ?? undefined;
			const normalizedContentType = contentType?.toLowerCase() ?? '';

			if (normalizedContentType.startsWith('image/')) {
				mediaByUrl.set(normalizedUrl, {
					status: 'image',
					url: normalizedUrl,
					contentType: contentType ?? normalizedContentType
				});
				return;
			}

			if (isHtmlContentType(normalizedContentType)) {
				mediaByUrl.set(normalizedUrl, {
					status: 'link',
					url: normalizedUrl,
					contentType
				});
				void loadAndApplyOpenGraphMetadata(url);
				return;
			}

			mediaByUrl.set(normalizedUrl, { status: 'link', url: normalizedUrl, contentType });
		} catch {
			failedMetadataOrigins.add(origin);
			mediaByUrl.set(normalizedUrl, { status: 'link', url: normalizedUrl });
		}
	});
}

function isHtmlContentType(contentType: string) {
	return contentType.startsWith('text/html') || contentType.startsWith('application/xhtml+xml');
}

async function loadAndApplyOpenGraphMetadata(url: URL) {
	const normalizedUrl = url.href;
	const origin = url.origin;

	await openGraphLock.acquire(origin, async () => {
		if (failedOpenGraphOrigins.has(origin)) return;

		try {
			const response = await fetch(normalizedUrl);
			const openGraphMetadata = parseOpenGraphMetadata(await response.text(), url);
			const media = mediaByUrl.get(normalizedUrl);
			if (media?.status !== 'link') return;

			mediaByUrl.set(normalizedUrl, {
				...media,
				...openGraphMetadata
			});
		} catch {
			failedOpenGraphOrigins.add(origin);
		}
	});
}

function parseOpenGraphMetadata(html: string, baseUrl: URL) {
	const document =
		typeof DOMParser === 'undefined'
			? undefined
			: new DOMParser().parseFromString(html, 'text/html');

	if (!document) return parseOpenGraphMetadataFallback(html, baseUrl);

	return {
		title: firstText([
			getMetaContent(document, 'property', 'og:title'),
			document.querySelector('title')?.textContent
		]),
		description: firstText([
			getMetaContent(document, 'property', 'og:description'),
			getMetaContent(document, 'name', 'description')
		]),
		imageUrl: resolveMetadataUrl(
			firstText([
				getMetaContent(document, 'property', 'og:image'),
				getMetaContent(document, 'name', 'twitter:image')
			]),
			baseUrl
		)
	};
}

function parseOpenGraphMetadataFallback(html: string, baseUrl: URL) {
	return {
		title: firstText([
			getMetaContentFallback(html, 'property', 'og:title'),
			getTitleFallback(html)
		]),
		description: firstText([
			getMetaContentFallback(html, 'property', 'og:description'),
			getMetaContentFallback(html, 'name', 'description')
		]),
		imageUrl: resolveMetadataUrl(
			firstText([
				getMetaContentFallback(html, 'property', 'og:image'),
				getMetaContentFallback(html, 'name', 'twitter:image')
			]),
			baseUrl
		)
	};
}

function getMetaContent(document: Document, attribute: 'name' | 'property', value: string) {
	return document.querySelector(`meta[${attribute}="${value}"]`)?.getAttribute('content');
}

function getMetaContentFallback(html: string, attribute: 'name' | 'property', value: string) {
	const metaMatch = html.match(
		new RegExp(
			`<meta\\b(?=[^>]*\\b${attribute}=["']${escapeRegExp(value)}["'])(?=[^>]*\\bcontent=["']([^"']*)["'])[^>]*>`,
			'i'
		)
	);
	return metaMatch?.[1];
}

function getTitleFallback(html: string) {
	return html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
}

function firstText(values: Array<string | null | undefined>) {
	return values.map((value) => value?.trim()).find((value) => value) ?? undefined;
}

function resolveMetadataUrl(url: string | undefined, baseUrl: URL) {
	if (!url) return undefined;

	try {
		return new URL(url, baseUrl).href;
	} catch {
		return undefined;
	}
}

function escapeRegExp(value: string) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
