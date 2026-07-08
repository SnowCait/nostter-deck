<script lang="ts">
	import DeckColumn from '$lib/components/deck/DeckColumn.svelte';
	import ProfileColumn from '$lib/components/deck/ProfileColumn.svelte';
	import ThreadColumn from '$lib/components/deck/ThreadColumn.svelte';
	import type { createColumnDeckController } from '$lib/deck/column-deck-controller.svelte';
	import type { createComposerController } from '$lib/deck/composer-controller.svelte';
	import type { createDeckLayoutController } from '$lib/deck/deck-layout-controller.svelte';
	import type { createDetailColumnController } from '$lib/deck/detail-column-controller.svelte';
	import type { createEmojiReactionController } from '$lib/deck/emoji-reaction-controller.svelte';
	import type { createPostActionController } from '$lib/deck/post-action-controller.svelte';
	import type { createPostShareController } from '$lib/deck/post-share-controller.svelte';
	import type { createTimelineController } from '$lib/deck/timeline-controller.svelte';
	import { emptyTimelineRuntime } from '$lib/deck/timeline-runtime';
	import type { ColumnConfig } from '$lib/deck/types';
	import type { FontSizeTextClasses } from '$lib/font-size';
	import type { LikeReaction } from '$lib/nostr/emoji-reactions';
	import type { ProfilePointer } from '$lib/nostr/nip19';
	import type { Profile } from '$lib/nostr/profiles';
	import type { Locale } from '$lib/paraglide/runtime.js';
	import type { AvatarShape, PostActionVisibility } from '$lib/user-settings';
	import ColumnAddPlaceholder from './ColumnAddPlaceholder.svelte';

	type Props = {
		columnDeckController: ReturnType<typeof createColumnDeckController>;
		deckLayoutController: ReturnType<typeof createDeckLayoutController>;
		timelineController: ReturnType<typeof createTimelineController>;
		detailController: ReturnType<typeof createDetailColumnController>;
		composer: ReturnType<typeof createComposerController>;
		postActionController: ReturnType<typeof createPostActionController>;
		postShareController: ReturnType<typeof createPostShareController>;
		emojiReactionController: ReturnType<typeof createEmojiReactionController>;
		isDesktopSingleColumn: boolean;
		isLoggedIn: boolean;
		textClass: FontSizeTextClasses;
		avatarShape: AvatarShape;
		postActionVisibility: PostActionVisibility;
		likeReaction: LikeReaction;
		appLocale: Locale;
		getProfile: (pubkey: string) => Profile | undefined;
		requestProfiles: (pubkeys: string[], relays: string[]) => void;
		profileRelays: string[];
		isMutedUser: (pubkey: string) => boolean;
		onMuteUser: (pubkey: string) => void;
		onAddColumn: () => void;
	};

	const {
		columnDeckController,
		deckLayoutController,
		timelineController,
		detailController,
		composer,
		postActionController,
		postShareController,
		emojiReactionController,
		isDesktopSingleColumn,
		isLoggedIn,
		textClass,
		avatarShape,
		postActionVisibility,
		likeReaction,
		appLocale,
		getProfile,
		requestProfiles,
		profileRelays,
		isMutedUser,
		onMuteUser,
		onAddColumn
	}: Props = $props();

	const emptyColumnRuntime = emptyTimelineRuntime();
	let deckScrollElement: HTMLDivElement | undefined = $state();
	const visibleSingleColumn = $derived(
		columnDeckController.columns.find(
			(column) => column.id === deckLayoutController.visibleColumnId
		) ?? null
	);

	function getColumnId(columnId: string) {
		return `deck-column-${columnId}`;
	}
</script>

{#snippet renderDeckColumn(column: ColumnConfig, isSingleColumn: boolean)}
	{@const columnIndex = columnDeckController.getColumnIndex(column.id)}
	<DeckColumn
		{column}
		runtime={timelineController.runtimes[column.id] ?? emptyColumnRuntime}
		id={getColumnId(column.id)}
		{isSingleColumn}
		activityRoot={deckScrollElement}
		{isLoggedIn}
		isSettingsOpen={columnDeckController.openSettingsColumnId === column.id}
		canMoveLeft={columnIndex > 0}
		canMoveRight={columnIndex >= 0 && columnIndex < columnDeckController.columns.length - 1}
		{textClass}
		{avatarShape}
		{postActionVisibility}
		{likeReaction}
		{appLocale}
		emojiReactionCandidates={emojiReactionController.candidates}
		{getProfile}
		{requestProfiles}
		{profileRelays}
		{isMutedUser}
		{onMuteUser}
		canReplyPost={composer.canReply}
		onReplyPost={(post) => void composer.openReply(post)}
		canLikePost={postActionController.canLike}
		isLikePostLiked={postActionController.isLiked}
		isLikePostPublishing={postActionController.isLiking}
		onLikePost={(post) => void postActionController.likePost(post)}
		canRepostPost={postActionController.canRepost}
		isRepostPostReposted={postActionController.isReposted}
		isRepostPostPublishing={postActionController.isReposting}
		onRepostPost={(post) => void postActionController.repostPost(post)}
		canQuotePost={composer.canQuote}
		onQuotePost={(post) => void composer.openQuote(post)}
		canReactWithEmojiPost={postActionController.canReactWithEmoji}
		isEmojiReactionPostPublishing={postActionController.isReactingWithEmoji}
		onReactWithEmojiPost={(post, reaction) =>
			void postActionController.reactWithEmoji(post, reaction)}
		canSharePost={postShareController.canSharePost}
		onSharePost={(post) => postShareController.sharePost(post)}
		onOpenProfile={(profile) => void detailController.openProfile(column.id, profile)}
		onOpenThread={(post) => void detailController.openThread(column.id, post)}
		onOpenHashtag={(hashtag) => void columnDeckController.openHashtagColumn(column.id, hashtag)}
		onToggleSettings={() => columnDeckController.toggleColumnSettings(column.id)}
		onDelete={() => void columnDeckController.deleteColumn(column.id)}
		onMoveLeft={() => void columnDeckController.moveColumn(column.id, -1)}
		onMoveRight={() => void columnDeckController.moveColumn(column.id, 1)}
		onTitleChange={(title) => columnDeckController.updateColumnTitle(column.id, title)}
		onIconChange={(icon) => columnDeckController.updateColumnIcon(column.id, icon)}
		onWidthChange={(width) => columnDeckController.updateColumnWidth(column.id, width)}
		onFollowSave={(profile) => columnDeckController.saveFollowSettings(column.id, profile)}
		onSearchSave={(query) => columnDeckController.saveSearchSettings(column.id, query)}
		onChannelSave={(channel) => columnDeckController.saveChannelSettings(column.id, channel)}
		onPublishChannelMessage={composer.publishChannel}
		onCustomTimelineSave={(filters, relays) =>
			columnDeckController.saveCustomTimelineSettings(column.id, filters, relays)}
		onLoadOlderTimeline={() => void timelineController.loadOlder(column.id)}
		onLoadNewerTimeline={() => void timelineController.loadNewer(column.id)}
	/>
{/snippet}

{#snippet renderDetailColumn(sourceColumnId: string, isSingleColumn: boolean)}
	{#if detailController.detailColumn?.type === 'thread'}
		<ThreadColumn
			id={getColumnId('thread')}
			posts={detailController.threadPosts}
			isLoading={detailController.isThreadLoading}
			error={detailController.threadError}
			{isSingleColumn}
			{isLoggedIn}
			{textClass}
			{avatarShape}
			{postActionVisibility}
			{likeReaction}
			{appLocale}
			emojiReactionCandidates={emojiReactionController.candidates}
			{getProfile}
			{requestProfiles}
			{profileRelays}
			{isMutedUser}
			{onMuteUser}
			canReplyPost={composer.canReply}
			onReplyPost={(post) => void composer.openReply(post)}
			canLikePost={postActionController.canLike}
			isLikePostLiked={postActionController.isLiked}
			isLikePostPublishing={postActionController.isLiking}
			onLikePost={(post) => void postActionController.likePost(post)}
			canRepostPost={postActionController.canRepost}
			isRepostPostReposted={postActionController.isReposted}
			isRepostPostPublishing={postActionController.isReposting}
			onRepostPost={(post) => void postActionController.repostPost(post)}
			canQuotePost={composer.canQuote}
			onQuotePost={(post) => void composer.openQuote(post)}
			canReactWithEmojiPost={postActionController.canReactWithEmoji}
			isEmojiReactionPostPublishing={postActionController.isReactingWithEmoji}
			onReactWithEmojiPost={(post, reaction) =>
				void postActionController.reactWithEmoji(post, reaction)}
			canSharePost={postShareController.canSharePost}
			onSharePost={(post) => postShareController.sharePost(post)}
			onClose={() => void detailController.close()}
			onOpenProfile={(profile: ProfilePointer) =>
				void detailController.openProfile(sourceColumnId, profile)}
			onOpenThread={(post) => void detailController.openThread(sourceColumnId, post)}
			onOpenHashtag={(hashtag) =>
				void columnDeckController.openHashtagColumn(sourceColumnId, hashtag)}
		/>
	{:else if detailController.detailColumn?.type === 'profile'}
		<ProfileColumn
			id={getColumnId('profile')}
			pubkey={detailController.detailColumn.pubkey}
			posts={detailController.profilePosts}
			isLoading={detailController.profileRuntime.isLoading}
			error={detailController.profileRuntime.error}
			{isSingleColumn}
			{isLoggedIn}
			{textClass}
			{avatarShape}
			{postActionVisibility}
			{likeReaction}
			{appLocale}
			emojiReactionCandidates={emojiReactionController.candidates}
			{getProfile}
			{requestProfiles}
			{profileRelays}
			{isMutedUser}
			{onMuteUser}
			canReplyPost={composer.canReply}
			onReplyPost={(post) => void composer.openReply(post)}
			canLikePost={postActionController.canLike}
			isLikePostLiked={postActionController.isLiked}
			isLikePostPublishing={postActionController.isLiking}
			onLikePost={(post) => void postActionController.likePost(post)}
			canRepostPost={postActionController.canRepost}
			isRepostPostReposted={postActionController.isReposted}
			isRepostPostPublishing={postActionController.isReposting}
			onRepostPost={(post) => void postActionController.repostPost(post)}
			canQuotePost={composer.canQuote}
			onQuotePost={(post) => void composer.openQuote(post)}
			canReactWithEmojiPost={postActionController.canReactWithEmoji}
			isEmojiReactionPostPublishing={postActionController.isReactingWithEmoji}
			onReactWithEmojiPost={(post, reaction) =>
				void postActionController.reactWithEmoji(post, reaction)}
			canSharePost={postShareController.canSharePost}
			onSharePost={(post) => postShareController.sharePost(post)}
			onClose={() => void detailController.close()}
			onOpenProfile={(profile: ProfilePointer) =>
				void detailController.openProfile(sourceColumnId, profile)}
			onOpenThread={(post) => void detailController.openThread(sourceColumnId, post)}
			onOpenHashtag={(hashtag) =>
				void columnDeckController.openHashtagColumn(sourceColumnId, hashtag)}
		/>
	{/if}
{/snippet}

<section class={['flex min-w-0 flex-col', isDesktopSingleColumn ? 'flex-[0_1_640px]' : 'flex-1']}>
	<div
		bind:this={deckScrollElement}
		class={[
			'min-h-0 flex-1',
			deckLayoutController.isSingleColumn ? 'overflow-hidden' : 'overflow-x-auto overflow-y-hidden'
		]}
	>
		{#if deckLayoutController.isSingleColumn}
			<div class="flex h-full w-full min-w-0 flex-col items-center overflow-hidden">
				<div class="min-h-0 w-full max-w-[640px] flex-1">
					{#if detailController.detailColumn}
						{@render renderDetailColumn(detailController.detailColumn.sourceColumnId, true)}
					{:else if visibleSingleColumn}
						{@render renderDeckColumn(visibleSingleColumn, true)}
					{:else}
						<ColumnAddPlaceholder isSingleColumn {textClass} {onAddColumn} />
					{/if}
				</div>
			</div>
		{:else}
			<div class="flex h-full min-w-max">
				{#each columnDeckController.columns as column (column.id)}
					{@render renderDeckColumn(column, false)}
					{#if detailController.detailColumn?.sourceColumnId === column.id}
						{@render renderDetailColumn(column.id, false)}
					{/if}
				{/each}
				{#if columnDeckController.columns.length === 0}
					<ColumnAddPlaceholder {textClass} {onAddColumn} />
				{/if}
			</div>
		{/if}
	</div>
</section>
