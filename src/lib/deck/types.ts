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
	| 'custom_timeline_filters'
	| 'custom_timeline_not_implemented'
	| 'custom_timeline_filter_count'
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

export type PresetTimelineColumnConfig = {
	id: string;
	type: 'timeline';
	timelineKind: 'preset';
	sourceKey: ColumnSourceKey;
	width: ColumnWidth;
};

export type CustomTimelineColumnConfig = {
	id: string;
	type: 'timeline';
	timelineKind: 'custom';
	filters: NostrFilter[];
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
	author: string;
	handle: string;
	time: string;
	body: string;
	accent: string;
	tags: string[];
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
};

export type CustomTimelineColumn = CustomTimelineColumnConfig;
export type TimelineColumn = PresetTimelineColumn | CustomTimelineColumn;
export type WebsiteColumn = WebsiteColumnConfig;
export type Column = TimelineColumn | WebsiteColumn;
