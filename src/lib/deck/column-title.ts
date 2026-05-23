import { m } from '$lib/paraglide/messages.js';
import type { Column } from './types';
import { getWebsiteHostname } from './website-url';

export function getColumnTitle(column: Column) {
	return column.type === 'timeline' ? m[column.sourceKey]() : getWebsiteHostname(column.url);
}
