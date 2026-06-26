import type { ColumnConfig } from './types';

type KeyboardNavigationOptions = {
	getColumns: () => ColumnConfig[];
	getActiveColumnId: () => string;
	setActiveColumnId: (columnId: string) => void;
	isLoggedIn: () => boolean;
	isComposeOpen: () => boolean;
	closeCompose: () => void;
	openCompose: () => Promise<void>;
	hasDetailColumn: () => boolean;
	closeDetail: () => Promise<void>;
	openKeyboardShortcuts: () => void;
};

export function createKeyboardNavigation({
	getColumns,
	getActiveColumnId,
	setActiveColumnId,
	isLoggedIn,
	isComposeOpen,
	closeCompose,
	openCompose,
	hasDetailColumn,
	closeDetail,
	openKeyboardShortcuts
}: KeyboardNavigationOptions) {
	const lastFocusedPostKeyByColumnId: Record<string, string> = {};

	function getColumnId(columnId: string) {
		return `deck-column-${columnId}`;
	}

	function getColumnElement(columnId: string) {
		return document.getElementById(getColumnId(columnId));
	}

	function getPostElements(columnElement: HTMLElement) {
		return [...columnElement.querySelectorAll<HTMLElement>('[data-deck-post]')];
	}

	function focusPost(columnId: string, postElement: HTMLElement) {
		const postKey = postElement.dataset.postKey;
		if (postKey) lastFocusedPostKeyByColumnId[columnId] = postKey;
		setActiveColumnId(columnId);
		postElement.scrollIntoView({ block: 'nearest', inline: 'nearest' });
		postElement.focus({ preventScroll: true });
	}

	function getRememberedPost(columnId: string, columnElement: HTMLElement) {
		const postElements = getPostElements(columnElement);
		const rememberedPostKey = lastFocusedPostKeyByColumnId[columnId];
		return (
			postElements.find((postElement) => postElement.dataset.postKey === rememberedPostKey) ??
			postElements[0]
		);
	}

	function focusColumn(columnId: string, preferPost = false) {
		setActiveColumnId(columnId);
		const columnElement = getColumnElement(columnId);
		columnElement?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
		if (preferPost && columnElement) {
			const postElement = getRememberedPost(columnId, columnElement);
			if (postElement) {
				focusPost(columnId, postElement);
				return;
			}
		}
		columnElement?.focus({ preventScroll: true });
	}

	function getDisplayedColumnElements() {
		return [...document.querySelectorAll<HTMLElement>('[data-deck-column]')];
	}

	function getFocusedColumnElement() {
		const activeElement = document.activeElement;
		const focusedColumn =
			activeElement instanceof Element
				? activeElement.closest<HTMLElement>('[data-deck-column]')
				: null;
		return (
			focusedColumn ?? getColumnElement(getActiveColumnId()) ?? getDisplayedColumnElements()[0]
		);
	}

	function isKeyboardOverlayOpen() {
		return Boolean(
			document.querySelector(
				'[data-slot="dialog-content"][data-state="open"], [data-slot="popover-content"][data-state="open"]'
			)
		);
	}

	function isEditableKeyboardTarget(target: EventTarget | null) {
		if (!(target instanceof Element)) return false;
		return Boolean(
			target.closest(
				'input, textarea, select, iframe, [contenteditable="true"], [role="option"], [role="menuitem"]'
			)
		);
	}

	function isComposePanelKeyboardTarget(target: EventTarget | null) {
		return target instanceof Element && Boolean(target.closest('[data-compose-panel]'));
	}

	function isKeyboardNavigationBlocked(target: EventTarget | null, key: string) {
		if (!(target instanceof Element)) return false;
		if (isEditableKeyboardTarget(target)) return true;
		if (target.closest('button, a, [role="button"], [role="link"]')) {
			return !['h', 'j', 'k', 'l'].includes(key);
		}
		return false;
	}

	function moveColumnFocus(direction: -1 | 1) {
		const columnElements = getDisplayedColumnElements();
		const currentColumn = getFocusedColumnElement();
		const currentIndex = currentColumn ? columnElements.indexOf(currentColumn) : -1;
		if (currentIndex < 0) return;
		const nextColumnId = columnElements[currentIndex + direction]?.dataset.columnId;
		if (nextColumnId) focusColumn(nextColumnId, true);
	}

	function movePostFocus(direction: -1 | 1) {
		const columnElement = getFocusedColumnElement();
		const columnId = columnElement?.dataset.columnId;
		if (!columnElement || !columnId) return;
		const postElements = getPostElements(columnElement);
		if (postElements.length === 0) return;
		const activeElement = document.activeElement;
		const currentPost =
			activeElement instanceof Element
				? activeElement.closest<HTMLElement>('[data-deck-post]')
				: null;
		const currentIndex = currentPost ? postElements.indexOf(currentPost) : -1;
		const nextIndex =
			currentIndex < 0
				? 0
				: Math.max(0, Math.min(currentIndex + direction, postElements.length - 1));
		focusPost(columnId, postElements[nextIndex]);
	}

	function activateFocusedPostAction(selector: string) {
		const activeElement = document.activeElement;
		const postElement =
			activeElement instanceof Element
				? activeElement.closest<HTMLElement>('[data-deck-post]')
				: null;
		if (!postElement || activeElement !== postElement) return;
		postElement.querySelector<HTMLElement>(selector)?.click();
	}

	function scrollActiveTimelineToTop() {
		const activeColumn = getColumns().find((column) => column.id === getActiveColumnId());
		if (activeColumn?.type !== 'timeline') return;
		getColumnElement(getActiveColumnId())
			?.querySelector<HTMLDivElement>('[data-testid="timeline-scroll"]')
			?.scrollTo({ top: 0, behavior: 'smooth' });
	}

	function focusChannelComposerInCurrentColumn() {
		const columnElement = getFocusedColumnElement();
		const columnId = columnElement?.dataset.columnId;
		if (!columnElement || !columnId) return false;

		const column = getColumns().find((candidate) => candidate.id === columnId);
		if (
			column?.type !== 'timeline' ||
			column.timelineKind !== 'preset' ||
			column.sourceKey !== 'timeline_channel'
		) {
			return false;
		}

		const channelInput = columnElement.querySelector<HTMLTextAreaElement>(
			'[data-channel-compose-input]'
		);
		if (channelInput && !channelInput.disabled) {
			setActiveColumnId(columnId);
			channelInput.focus({ preventScroll: true });
		}
		return true;
	}

	async function handleKeyboardNavigation(event: KeyboardEvent) {
		if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
		if (isKeyboardOverlayOpen()) return;
		if (event.key === 'Escape') {
			if (isComposeOpen() && (isComposePanelKeyboardTarget(event.target) || !hasDetailColumn())) {
				event.preventDefault();
				closeCompose();
				return;
			}
			if (hasDetailColumn()) {
				event.preventDefault();
				await closeDetail();
				return;
			}
		}

		const key = event.key.toLowerCase();
		if (key === 'n') {
			if (isEditableKeyboardTarget(event.target) || !isLoggedIn()) return;
			event.preventDefault();
			if (focusChannelComposerInCurrentColumn()) return;
			await openCompose();
			return;
		}
		if (event.key === '?' || (event.code === 'Slash' && event.shiftKey)) {
			if (isEditableKeyboardTarget(event.target)) return;
			event.preventDefault();
			openKeyboardShortcuts();
			return;
		}
		if (event.key === 'Home') {
			if (isEditableKeyboardTarget(event.target)) return;
			event.preventDefault();
			scrollActiveTimelineToTop();
			return;
		}
		if (isKeyboardNavigationBlocked(event.target, key)) return;
		if (key === 'h' || event.key === 'ArrowLeft') {
			event.preventDefault();
			moveColumnFocus(-1);
		} else if (key === 'l' || event.key === 'ArrowRight') {
			event.preventDefault();
			moveColumnFocus(1);
		} else if (key === 'j' || event.key === 'ArrowDown') {
			event.preventDefault();
			movePostFocus(1);
		} else if (key === 'k' || event.key === 'ArrowUp') {
			event.preventDefault();
			movePostFocus(-1);
		} else if (event.key === 'Enter') {
			event.preventDefault();
			activateFocusedPostAction('[data-keyboard-open-thread]');
		} else if (key === 'p') {
			event.preventDefault();
			activateFocusedPostAction('[data-keyboard-open-profile]');
		}
	}

	function handleFocusIn(event: FocusEvent) {
		const target = event.target;
		if (!(target instanceof Element)) return;
		const columnElement = target.closest<HTMLElement>('[data-deck-column]');
		const columnId = columnElement?.dataset.columnId;
		if (!columnId) return;
		setActiveColumnId(columnId);
		const postKey = target.closest<HTMLElement>('[data-deck-post]')?.dataset.postKey;
		if (postKey) lastFocusedPostKeyByColumnId[columnId] = postKey;
	}

	function resetFocusMemory() {
		for (const columnId of Object.keys(lastFocusedPostKeyByColumnId)) {
			delete lastFocusedPostKeyByColumnId[columnId];
		}
	}

	return { focusColumn, handleFocusIn, handleKeyboardNavigation, resetFocusMemory };
}
