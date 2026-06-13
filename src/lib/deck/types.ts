import type * as Nostr from 'nostr-typedef';
import type { CustomEmoji } from '$lib/nostr/custom-emoji';

export type MessageKey =
	| 'app_title'
	| 'nav_home'
	| 'nav_search'
	| 'nav_notifications'
	| 'nav_bookmarks'
	| 'nav_settings'
	| 'action_post'
	| 'add_emoji'
	| 'add_media'
	| 'account_role'
	| 'compose_placeholder'
	| 'settings_general'
	| 'settings_appearance'
	| 'settings_muted_users'
	| 'settings_muted_users_count'
	| 'language_switcher'
	| 'theme_switcher'
	| 'theme_system'
	| 'theme_light'
	| 'theme_dark'
	| 'font_size_switcher'
	| 'font_size_small'
	| 'font_size_medium'
	| 'font_size_large'
	| 'avatar_shape_switcher'
	| 'avatar_shape_circle'
	| 'avatar_shape_square'
	| 'post_text'
	| 'schedule_post'
	| 'collapse_sidebar'
	| 'collapse_sidebar_short'
	| 'expand_sidebar'
	| 'timeline_follow'
	| 'timeline_search'
	| 'timeline_channel'
	| 'column_type_website'
	| 'column_type_custom_timeline'
	| 'add_column'
	| 'edit_column'
	| 'column_type'
	| 'column_title'
	| 'column_icon'
	| 'column_icon_default'
	| 'column_icon_users'
	| 'column_icon_search'
	| 'column_icon_radio'
	| 'column_icon_globe'
	| 'column_icon_messages'
	| 'column_width'
	| 'column_width_narrow'
	| 'column_width_standard'
	| 'column_width_wide'
	| 'website_url'
	| 'follow_target'
	| 'search_query'
	| 'channel_target'
	| 'custom_timeline_filters'
	| 'custom_timeline_filters_help'
	| 'custom_timeline_relays'
	| 'custom_timeline_custom_relays'
	| 'custom_timeline_custom_relays_help'
	| 'custom_timeline_not_implemented'
	| 'custom_timeline_filter_count'
	| 'custom_timeline_relay_count'
	| 'custom_timeline_loading'
	| 'custom_timeline_empty'
	| 'custom_timeline_error'
	| 'save'
	| 'cancel'
	| 'close'
	| 'delete_column'
	| 'move_column_left'
	| 'move_column_right'
	| 'column_options'
	| 'post_options'
	| 'view_event_json'
	| 'event_json'
	| 'source_event'
	| 'referenced_event'
	| 'copy_json'
	| 'copy_nevent'
	| 'copy_naddr'
	| 'copied'
	| 'copy_failed'
	| 'mute_user'
	| 'unmute'
	| 'unmute_user'
	| 'muted_users_empty'
	| 'muted_post'
	| 'show_muted_post'
	| 'referenced_post_loading'
	| 'muted_quote'
	| 'show_muted_quote'
	| 'sensitive_content'
	| 'content_warning_reason'
	| 'show_sensitive_content'
	| 'reply'
	| 'open_profile'
	| 'open_thread'
	| 'profile'
	| 'profile_about'
	| 'profile_nip05'
	| 'profile_website'
	| 'profile_metadata_unavailable'
	| 'profile_posts'
	| 'profile_posts_loading'
	| 'profile_posts_empty'
	| 'profile_posts_error'
	| 'thread'
	| 'thread_loading'
	| 'thread_empty'
	| 'thread_error'
	| 'repost'
	| 'replying_to'
	| 'reposted_by'
	| 'reposted_event_unavailable'
	| 'reacted_by_like'
	| 'reacted_by'
	| 'reaction_event_unavailable'
	| 'like'
	| 'share'
	| 'verified';

export type ColumnTitleKey = Extract<
	MessageKey,
	'timeline_follow' | 'timeline_search' | 'timeline_channel'
>;
export type ColumnSourceKey = ColumnTitleKey;
export type ColumnWidth = 'narrow' | 'standard' | 'wide';
export type ColumnIconKey = 'users' | 'search' | 'radio' | 'globe' | 'messages';
export type NostrFilter = Record<string, unknown>;
export type RelaySelection = { type: 'default' } | { type: 'custom'; urls: string[] };

export type PostMessage =
	| { key: 'replying_to' }
	| { key: 'reposted_by'; params: { name: string }; nameEmojis: CustomEmoji[] }
	| { key: 'reposted_event_unavailable' }
	| { key: 'reacted_by_like'; params: { name: string }; nameEmojis: CustomEmoji[] }
	| {
			key: 'reacted_by';
			params: { name: string; content: string };
			nameEmojis: CustomEmoji[];
			contentEmojis: CustomEmoji[];
	  }
	| { key: 'reaction_event_unavailable' };

export type PostContext = {
	icon: 'reply' | 'repost' | 'heart';
	message: PostMessage;
};

export type ColumnDisplayConfig = {
	title?: string;
	icon?: ColumnIconKey;
};

export type SearchTimelineColumnConfig = {
	id: string;
	type: 'timeline';
	timelineKind: 'preset';
	sourceKey: 'timeline_search';
	query: string;
	width: ColumnWidth;
} & ColumnDisplayConfig;

export type FollowTimelineColumnConfig = {
	id: string;
	type: 'timeline';
	timelineKind: 'preset';
	sourceKey: 'timeline_follow';
	pubkey: string;
	relays: string[];
	width: ColumnWidth;
} & ColumnDisplayConfig;

export type ChannelTimelineColumnConfig = {
	id: string;
	type: 'timeline';
	timelineKind: 'preset';
	sourceKey: 'timeline_channel';
	channelId: string;
	relays: string[];
	width: ColumnWidth;
} & ColumnDisplayConfig;

export type PresetTimelineColumnConfig =
	| FollowTimelineColumnConfig
	| SearchTimelineColumnConfig
	| ChannelTimelineColumnConfig;

export type CustomTimelineColumnConfig = {
	id: string;
	type: 'timeline';
	timelineKind: 'custom';
	filters: NostrFilter[];
	relays: RelaySelection;
	width: ColumnWidth;
} & ColumnDisplayConfig;

export type TimelineColumnConfig = PresetTimelineColumnConfig | CustomTimelineColumnConfig;

export type WebsiteColumnConfig = {
	id: string;
	type: 'website';
	url: string;
	width: ColumnWidth;
} & ColumnDisplayConfig;

export type ColumnConfig = TimelineColumnConfig | WebsiteColumnConfig;

export type Post = {
	id?: string;
	events: {
		source: Nostr.Event;
		referenced?: Nostr.Event;
	};
	pubkey: string;
	author: string;
	handle: string;
	avatarUrl?: string;
	time: string;
	body: string;
	bodyEmojis: CustomEmoji[];
	authorEmojis: CustomEmoji[];
	accent: string;
	mutePubkeys: string[];
	contentWarning?: {
		reason?: string;
	};
	referenceType?: 'repost' | 'reaction';
	referenceStatus?: 'loading' | 'loaded' | 'unavailable';
	verified?: boolean;
	stats: {
		replies: string;
		reposts: string;
		likes: string;
	};
	contexts?: PostContext[];
	unavailableMessage?: PostMessage;
	thread?: {
		event: Nostr.Event;
		rootId: string;
		parentId?: string;
		relayHints: string[];
	};
	attachment?: {
		label: string;
		title: string;
		body: string;
	};
};

export type ThreadPost = {
	post: Post;
	depth: number;
	isMuted: boolean;
};

export type PresetTimelineColumn = PresetTimelineColumnConfig & {
	posts: Post[];
	hasOlderStored?: boolean;
	hasNewerStored?: boolean;
	isLoadingOlder?: boolean;
	isLoadingNewer?: boolean;
	isLoading?: boolean;
	error?: string | null;
};

export type CustomTimelineColumn = CustomTimelineColumnConfig & {
	posts: Post[];
	hasOlderStored: boolean;
	hasNewerStored: boolean;
	isLoadingOlder: boolean;
	isLoadingNewer: boolean;
	isLoading: boolean;
	error: string | null;
};
export type TimelineColumn = PresetTimelineColumn | CustomTimelineColumn;
export type WebsiteColumn = WebsiteColumnConfig;
export type Column = TimelineColumn | WebsiteColumn;
