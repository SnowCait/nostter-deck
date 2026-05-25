<script lang="ts">
	import { ArrowLeft, ArrowRight, SlidersHorizontal, Trash2 } from '@lucide/svelte';
	import { m } from '$lib/paraglide/messages.js';
	import { getColumnTitle } from '$lib/deck/column-title';
	import { columnWidths } from '$lib/deck/column-configs';
	import type { Column, ColumnWidth, NostrFilter, RelaySelection } from '$lib/deck/types';
	import type { FontSizeTextClasses } from '$lib/font-size';
	import type { ProfilePointer } from '$lib/nostr/nip19';
	import type { AvatarShape } from '$lib/user-settings';
	import ColumnIcon from './ColumnIcon.svelte';
	import CustomTimelineSettings from './CustomTimelineSettings.svelte';
	import FollowColumnSettings from './FollowColumnSettings.svelte';
	import SearchColumnSettings from './SearchColumnSettings.svelte';
	import TimelineColumnBody from './TimelineColumnBody.svelte';

	type Props = {
		column: Column;
		id: string;
		isLoggedIn: boolean;
		isFocused: boolean;
		isSettingsOpen: boolean;
		canMoveLeft: boolean;
		canMoveRight: boolean;
		textClass: FontSizeTextClasses;
		avatarShape: AvatarShape;
		onToggleSettings: () => void;
		onDelete: () => void;
		onMoveLeft: () => void;
		onMoveRight: () => void;
		onWidthChange: (width: ColumnWidth) => void;
		onFollowSave: (profile: ProfilePointer) => void;
		onSearchSave: (query: string) => void;
		onCustomTimelineSave: (filters: NostrFilter[], relays: RelaySelection) => void;
	};

	const {
		column,
		id,
		isLoggedIn,
		isFocused,
		isSettingsOpen,
		canMoveLeft,
		canMoveRight,
		textClass,
		avatarShape,
		onToggleSettings,
		onDelete,
		onMoveLeft,
		onMoveRight,
		onWidthChange,
		onFollowSave,
		onSearchSave,
		onCustomTimelineSave
	}: Props = $props();

	const columnWidthClassByWidth = {
		narrow: 'w-[280px]',
		standard: 'w-[342px]',
		wide: 'w-[480px]'
	} satisfies Record<ColumnWidth, string>;

	const columnWidthLabels = {
		narrow: () => m.column_width_narrow(),
		standard: () => m.column_width_standard(),
		wide: () => m.column_width_wide()
	} satisfies Record<ColumnWidth, () => string>;

	const columnIconClass = 'size-4 shrink-0 text-slate-500 dark:text-slate-400';
	const columnActionClass =
		'flex size-8 shrink-0 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100';
	const settingsActionClass =
		'flex h-9 min-w-0 items-center justify-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 disabled:dark:hover:bg-transparent';

	function selectColumnWidth(event: Event) {
		onWidthChange((event.currentTarget as HTMLSelectElement).value as ColumnWidth);
	}
</script>

<section
	{id}
	tabindex="-1"
	class={[
		'flex h-full flex-col overflow-hidden border-r border-slate-200 bg-white transition-[width,box-shadow] outline-none dark:border-slate-800 dark:bg-slate-950',
		columnWidthClassByWidth[column.width],
		isFocused ? 'relative z-10 shadow-[inset_0_0_0_2px_rgba(14,165,233,0.45)]' : ''
	]}
>
	<header
		class="shrink-0 border-b border-slate-200 bg-white px-3 py-2.5 dark:border-slate-800 dark:bg-slate-950"
	>
		<div class="flex items-center justify-between gap-3">
			<div class="flex min-w-0 items-center gap-2">
				<ColumnIcon {column} iconClass={columnIconClass} />
				<h2 class={['min-w-0 truncate font-bold', textClass.title]}>
					{getColumnTitle(column)}
				</h2>
			</div>
			<div class="flex shrink-0 items-center gap-1">
				<button
					type="button"
					class={columnActionClass}
					title={m.column_options()}
					aria-label={m.column_options()}
					aria-expanded={isSettingsOpen}
					onclick={onToggleSettings}
				>
					<SlidersHorizontal class="size-4" aria-hidden="true" />
				</button>
			</div>
		</div>
	</header>

	{#if isSettingsOpen}
		<div
			class="shrink-0 border-b border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-800 dark:bg-slate-900/70"
		>
			{#if column.type === 'timeline' && column.timelineKind === 'preset' && column.sourceKey === 'timeline_follow'}
				<FollowColumnSettings {column} {textClass} onSave={onFollowSave} />
			{:else if column.type === 'timeline' && column.timelineKind === 'preset' && column.sourceKey === 'timeline_search'}
				<SearchColumnSettings {column} {textClass} onSave={onSearchSave} />
			{:else if column.type === 'timeline' && column.timelineKind === 'custom'}
				<CustomTimelineSettings {column} {textClass} onSave={onCustomTimelineSave} />
			{/if}

			<label
				class={['mb-2 block font-semibold text-slate-700 dark:text-slate-300', textClass.control]}
				for={`column-width-${column.id}`}
			>
				{m.column_width()}
			</label>
			<select
				id={`column-width-${column.id}`}
				class={[
					'mb-3 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-slate-950 transition outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:focus:border-sky-400 dark:focus:ring-sky-950',
					textClass.control
				]}
				value={column.width}
				onchange={selectColumnWidth}
			>
				{#each columnWidths as width (width)}
					<option value={width}>{columnWidthLabels[width]()}</option>
				{/each}
			</select>

			<div class="grid grid-cols-2 gap-2">
				<button
					type="button"
					class={[settingsActionClass, textClass.control]}
					title={m.move_column_left()}
					aria-label={m.move_column_left()}
					disabled={!canMoveLeft}
					onclick={onMoveLeft}
				>
					<ArrowLeft class="size-4 shrink-0" aria-hidden="true" />
					<span class="truncate">{m.move_column_left()}</span>
				</button>
				<button
					type="button"
					class={[settingsActionClass, textClass.control]}
					title={m.move_column_right()}
					aria-label={m.move_column_right()}
					disabled={!canMoveRight}
					onclick={onMoveRight}
				>
					<ArrowRight class="size-4 shrink-0" aria-hidden="true" />
					<span class="truncate">{m.move_column_right()}</span>
				</button>
			</div>
			<button
				type="button"
				class={[
					'mt-2 flex h-9 w-full items-center justify-center gap-2 rounded-md px-3 font-semibold text-rose-600 transition hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40',
					textClass.control
				]}
				onclick={onDelete}
			>
				<Trash2 class="size-4 shrink-0" aria-hidden="true" />
				<span>{m.delete_column()}</span>
			</button>
		</div>
	{/if}

	<div class="min-h-0 flex-1 overflow-y-auto">
		{#if column.type === 'website'}
			<iframe
				class="h-full w-full border-0 bg-white dark:bg-slate-950"
				src={column.url}
				title={getColumnTitle(column)}
				sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
			></iframe>
		{:else}
			<TimelineColumnBody {column} {isLoggedIn} {textClass} {avatarShape} />
		{/if}
	</div>
</section>
