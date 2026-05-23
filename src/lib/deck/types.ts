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
	| 'add_column'
	| 'edit_column'
	| 'column_type'
	| 'column_width'
	| 'column_width_narrow'
	| 'column_width_standard'
	| 'column_width_wide'
	| 'website_url'
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

export type TimelineColumnConfig = {
	id: string;
	type: 'timeline';
	sourceKey: ColumnSourceKey;
	width: ColumnWidth;
};

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

export type TimelineColumn = TimelineColumnConfig & {
	posts: Post[];
};

export type WebsiteColumn = WebsiteColumnConfig;
export type Column = TimelineColumn | WebsiteColumn;
