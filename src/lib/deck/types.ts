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
	| 'timeline_home'
	| 'timeline_mentions'
	| 'timeline_search'
	| 'timeline_lists'
	| 'column_type_website'
	| 'column_type_custom_timeline'
	| 'add_column'
	| 'edit_column'
	| 'column_type'
	| 'column_width'
	| 'column_width_narrow'
	| 'column_width_standard'
	| 'column_width_wide'
	| 'website_url'
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
	| 'like'
	| 'share'
	| 'verified';

export type ColumnTitleKey = Extract<
	MessageKey,
	'timeline_home' | 'timeline_mentions' | 'timeline_search' | 'timeline_lists'
>;
export type ColumnSourceKey = ColumnTitleKey;
export type ColumnWidth = 'narrow' | 'standard' | 'wide';
export type NostrFilter = Record<string, unknown>;
export type RelaySelection = { type: 'default' } | { type: 'custom'; urls: string[] };

export type SearchTimelineColumnConfig = {
	id: string;
	type: 'timeline';
	timelineKind: 'preset';
	sourceKey: 'timeline_search';
	query: string;
	width: ColumnWidth;
};

export type StaticPresetTimelineColumnConfig = {
	id: string;
	type: 'timeline';
	timelineKind: 'preset';
	sourceKey: Exclude<ColumnSourceKey, 'timeline_search'>;
	width: ColumnWidth;
};

export type PresetTimelineColumnConfig =
	| SearchTimelineColumnConfig
	| StaticPresetTimelineColumnConfig;

export type CustomTimelineColumnConfig = {
	id: string;
	type: 'timeline';
	timelineKind: 'custom';
	filters: NostrFilter[];
	relays: RelaySelection;
	width: ColumnWidth;
};

export type TimelineColumnConfig = PresetTimelineColumnConfig | CustomTimelineColumnConfig;

export type WebsiteColumnConfig = {
	id: string;
	type: 'website';
	url: string;
	width: ColumnWidth;
};

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
	attachment?: {
		label: string;
		title: string;
		body: string;
	};
};

export type PresetTimelineColumn = PresetTimelineColumnConfig & {
	posts: Post[];
	isLoading?: boolean;
	error?: string | null;
};

export type CustomTimelineColumn = CustomTimelineColumnConfig & {
	posts: Post[];
	isLoading: boolean;
	error: string | null;
};
export type TimelineColumn = PresetTimelineColumn | CustomTimelineColumn;
export type WebsiteColumn = WebsiteColumnConfig;
export type Column = TimelineColumn | WebsiteColumn;
