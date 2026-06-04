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
	| 'expand_sidebar'
	| 'timeline_follow'
	| 'timeline_search'
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
	| 'column_width'
	| 'column_width_narrow'
	| 'column_width_standard'
	| 'column_width_wide'
	| 'website_url'
	| 'follow_target'
	| 'search_query'
	| 'custom_timeline_filters'
	| 'custom_timeline_filters_help'
	| 'custom_timeline_relays'
	| 'custom_timeline_custom_relays'
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
	| 'reply'
	| 'repost'
	| 'reposted_by'
	| 'reposted_event_unavailable'
	| 'like'
	| 'share'
	| 'verified';

export type ColumnTitleKey = Extract<MessageKey, 'timeline_follow' | 'timeline_search'>;
export type ColumnSourceKey = ColumnTitleKey;
export type ColumnWidth = 'narrow' | 'standard' | 'wide';
export type ColumnIconKey = 'users' | 'search' | 'radio' | 'globe';
export type NostrFilter = Record<string, unknown>;
export type RelaySelection = { type: 'default' } | { type: 'custom'; urls: string[] };

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

export type PresetTimelineColumnConfig = FollowTimelineColumnConfig | SearchTimelineColumnConfig;

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
	author: string;
	handle: string;
	avatarUrl?: string;
	time: string;
	body: string;
	accent: string;
	tags: string[];
	verified?: boolean;
	stats: {
		replies: string;
		reposts: string;
		likes: string;
	};
	repostedBy?: {
		author: string;
		handle: string;
		avatarUrl?: string;
		accent: string;
	};
	isRepostUnavailable?: boolean;
	attachment?: {
		label: string;
		title: string;
		body: string;
	};
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
