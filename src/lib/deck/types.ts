export type MessageKey =
	| 'app_title'
	| 'nav_home'
	| 'nav_search'
	| 'nav_notifications'
	| 'nav_bookmarks'
	| 'nav_settings'
	| 'action_post'
	| 'account_role'
	| 'language_switcher'
	| 'collapse_sidebar'
	| 'expand_sidebar'
	| 'timeline_home'
	| 'timeline_mentions'
	| 'timeline_search'
	| 'timeline_lists'
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

export type Column = {
	titleKey: ColumnTitleKey;
	posts: Post[];
};
