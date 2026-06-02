declare global {
	interface URLConstructor {
		canParse(url: string | URL, base?: string | URL): boolean;
	}
}

export type PostContentToken =
	| {
			type: 'text';
			text: string;
	  }
	| {
			type: 'link';
			text: string;
			href: string;
	  };

const urlCandidatePattern = /https?:\/\/[^\s<>"']+/gi;
const trailingUrlPunctuationPattern = /[),.;:!?，、。！？）］】]+$/;

ensureUrlCanParse();

export function linkifyPostContent(content: string): PostContentToken[] {
	const tokens: PostContentToken[] = [];
	let currentIndex = 0;

	for (const match of content.matchAll(urlCandidatePattern)) {
		const candidate = match[0];
		const matchIndex = match.index ?? 0;
		const linkText = trimTrailingUrlPunctuation(candidate);

		if (linkText.length === 0 || !URL.canParse(linkText)) {
			continue;
		}

		const url = new URL(linkText);
		if (url.protocol !== 'http:' && url.protocol !== 'https:') {
			continue;
		}

		if (matchIndex > currentIndex) {
			tokens.push({
				type: 'text',
				text: content.slice(currentIndex, matchIndex)
			});
		}

		tokens.push({
			type: 'link',
			text: linkText,
			href: url.href
		});
		currentIndex = matchIndex + linkText.length;
	}

	if (currentIndex < content.length) {
		tokens.push({
			type: 'text',
			text: content.slice(currentIndex)
		});
	}

	return tokens.length > 0 ? tokens : [{ type: 'text', text: content }];
}

function trimTrailingUrlPunctuation(value: string) {
	return value.replace(trailingUrlPunctuationPattern, '');
}

function ensureUrlCanParse() {
	if (typeof URL.canParse === 'function') return;

	Object.defineProperty(URL, 'canParse', {
		configurable: true,
		writable: true,
		value(url: string | URL, base?: string | URL) {
			try {
				new URL(url, base);
				return true;
			} catch {
				return false;
			}
		}
	});
}
