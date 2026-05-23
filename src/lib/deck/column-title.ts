import { m } from '$lib/paraglide/messages.js';
import type { Column } from './types';
import { getWebsiteHostname } from './website-url';

export function getColumnTitle(column: Column) {
	if (column.type === 'website') return getWebsiteHostname(column.url);
	if (column.timelineKind === 'custom') return m.column_type_custom_timeline();

	return m[column.sourceKey]();
}
