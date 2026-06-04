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

export function getUrlMediaMetadata(url: string) {
	return mediaByUrl.get(url);
}

export function requestUrlMediaMetadata(urls: string[]) {
	for (const url of urls) {
		if (mediaByUrl.has(url)) continue;

		mediaByUrl.set(url, { status: 'loading', url });
		void loadUrlMediaMetadata(url);
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

async function loadUrlMediaMetadata(url: string) {
	try {
		const response = await fetch(url, { method: 'HEAD' });
		const contentType = response.headers.get('content-type') ?? undefined;

		mediaByUrl.set(
			url,
			contentType?.toLowerCase().startsWith('image/')
				? { status: 'image', url, contentType }
				: { status: 'link', url, contentType }
		);
	} catch {
		mediaByUrl.set(url, { status: 'link', url });
	}
}
