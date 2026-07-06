import type { Post } from './types';
import { buildPostShareUrl } from './post-actions';

export type SharePostResult =
	| { ok: true; method: 'web-share' | 'clipboard' }
	| { ok: false; reason: 'no-target' | 'unsupported' | 'cancelled' | 'copy-failed' };

type ShareNavigator = Pick<Navigator, 'share' | 'clipboard'>;

type PostShareControllerOptions = {
	getNavigator?: () => ShareNavigator | undefined;
};

export function createPostShareController({
	getNavigator = () => globalThis.navigator
}: PostShareControllerOptions = {}) {
	function canSharePost(post: Post) {
		return buildPostShareUrl(post) !== null;
	}

	async function sharePost(post: Post): Promise<SharePostResult> {
		const url = buildPostShareUrl(post);
		if (!url) return { ok: false, reason: 'no-target' };

		const navigator = getNavigator();
		if (navigator?.share) {
			try {
				await navigator.share({ url });
				return { ok: true, method: 'web-share' };
			} catch (error) {
				if (isAbortError(error)) return { ok: false, reason: 'cancelled' };
			}
		}

		if (!navigator?.clipboard?.writeText) return { ok: false, reason: 'unsupported' };

		try {
			await navigator.clipboard.writeText(url);
			return { ok: true, method: 'clipboard' };
		} catch {
			return { ok: false, reason: 'copy-failed' };
		}
	}

	return {
		canSharePost,
		sharePost
	};
}

function isAbortError(error: unknown) {
	return error instanceof DOMException && error.name === 'AbortError';
}
