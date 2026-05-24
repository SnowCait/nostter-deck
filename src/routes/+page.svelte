<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import { CalendarClock, Image, Plus, Send, Smile, UserRound } from '@lucide/svelte';
	import DeckColumn from '$lib/components/deck/DeckColumn.svelte';
	import ProfileAvatar from '$lib/components/deck/ProfileAvatar.svelte';
	import Sidebar from '$lib/components/deck/Sidebar.svelte';
	import { readColumnConfigs, writeColumnConfigs } from '$lib/deck/column-configs';
	import { columnSourceKeys, sourcePosts } from '$lib/deck/data';
	import type {
		Column,
		ColumnConfig,
		ColumnSourceKey,
		ColumnWidth,
		NostrFilter,
		RelaySelection
	} from '$lib/deck/types';
	import { normalizeWebsiteUrl } from '$lib/deck/website-url';
	import { textClassByFontSize } from '$lib/font-size';
	import { parseNostrFilters } from '$lib/nostr/filters';
	import { eventToPost } from '$lib/nostr/posts';
	import { getProfile } from '$lib/nostr/profiles';
	import { defaultRelays, resolveRelayDraft } from '$lib/nostr/relays';
	import { startCustomTimelineSubscription } from '$lib/nostr/timeline';
	import { m } from '$lib/paraglide/messages.js';
	import { readUserSettings, type AvatarShape, type FontSize } from '$lib/user-settings';
	import type * as Nostr from 'nostr-typedef';

	type CustomTimelineRuntime = {
		eventsById: Record<string, Nostr.Event>;
		isLoading: boolean;
		error: string | null;
	};

	type CustomTimelineSubscription = {
		signature: string;
		stop: () => void;
	};

	const savedColumnConfigs = readColumnConfigs();

	let columnConfigs = $state<ColumnConfig[]>(savedColumnConfigs.map((column) => ({ ...column })));
	let activeColumnId = $state(savedColumnConfigs[0]?.id ?? '');
	let isColumnDialogOpen = $state(false);
	let openSettingsColumnId = $state<string | null>(null);
	let isComposePanelOpen = $state(false);
	let composeText = $state('');
	const initialUserSettings = readUserSettings();
	let fontSize = $state<FontSize>(initialUserSettings.fontSize);
	let avatarShape = $state<AvatarShape>(initialUserSettings.avatarShape);
	let selectedColumnType = $state<ColumnSourceKey | 'custom_timeline' | 'website'>('timeline_home');
	let websiteUrl = $state('');
	let customTimelineFilters = $state('[{"kinds":[1],"limit":20}]');
	let selectedDefaultRelays = $state<string[]>([...defaultRelays]);
	let customTimelineRelays = $state('');
	let customTimelineRuntimes = $state<Record<string, CustomTimelineRuntime>>({});
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const customTimelineSubscriptions = new Map<string, CustomTimelineSubscription>();

	const composeMaxLength = 280;
	const composeLength = $derived(composeText.length);
	const canSubmitPost = $derived(composeLength > 0 && composeLength <= composeMaxLength);
	const textClass = $derived(textClassByFontSize[fontSize]);
	const normalizedWebsiteUrl = $derived(normalizeWebsiteUrl(websiteUrl));
	const parsedCustomTimelineFilters = $derived(parseNostrFilters(customTimelineFilters));
	const selectedDefaultRelaySet = $derived(new Set(selectedDefaultRelays));
	const parsedCustomTimelineRelays = $derived(
		resolveRelayDraft(selectedDefaultRelays, customTimelineRelays)
	);
	const canSaveColumn = $derived(
		(selectedColumnType !== 'website' || normalizedWebsiteUrl !== null) &&
			(selectedColumnType !== 'custom_timeline' ||
				(parsedCustomTimelineFilters !== null && parsedCustomTimelineRelays !== null))
	);
	const columns = $derived<Column[]>(
		columnConfigs.map((column) => {
			if (column.type === 'timeline' && column.timelineKind === 'preset') {
				return {
					...column,
					posts: sourcePosts[column.sourceKey]
				};
			}

			if (column.type === 'timeline' && column.timelineKind === 'custom') {
				const runtime = customTimelineRuntimes[column.id] ?? emptyCustomTimelineRuntime();
				const posts = getCustomTimelinePosts(runtime);

				return {
					...column,
					posts,
					isLoading: runtime.isLoading,
					error: runtime.error
				};
			}

			return { ...column };
		})
	);

	$effect(() => {
		const activeCustomColumns = columnConfigs.filter(
			(column) => column.type === 'timeline' && column.timelineKind === 'custom'
		);
		const activeCustomColumnIds = new Set(activeCustomColumns.map((column) => column.id));

		for (const [columnId, subscription] of customTimelineSubscriptions) {
			if (activeCustomColumnIds.has(columnId)) continue;

			subscription.stop();
			customTimelineSubscriptions.delete(columnId);
			removeCustomTimelineRuntime(columnId);
		}

		for (const column of activeCustomColumns) {
			const filters = $state.snapshot(column.filters);
			const relays = $state.snapshot(column.relays);
			const signature = getCustomTimelineSignature(filters, relays);
			if (customTimelineSubscriptions.get(column.id)?.signature === signature) continue;

			customTimelineSubscriptions.get(column.id)?.stop();
			setCustomTimelineRuntime(column.id, emptyCustomTimelineRuntime());

			const subscription = startCustomTimelineSubscription({
				filters,
				relays,
				onEvent: (event) => addCustomTimelineEvent(column.id, event),
				onLoadingChange: (isLoading) => updateCustomTimelineRuntime(column.id, { isLoading }),
				onError: (error) => updateCustomTimelineRuntime(column.id, { error })
			});

			customTimelineSubscriptions.set(column.id, {
				signature,
				stop: subscription.stop
			});
		}
	});

	onDestroy(() => {
		for (const subscription of customTimelineSubscriptions.values()) {
			subscription.stop();
		}
		customTimelineSubscriptions.clear();
	});

	function getColumnId(columnId: string) {
		return `deck-column-${columnId}`;
	}

	function focusColumn(columnId: string) {
		activeColumnId = columnId;

		const columnElement = document.getElementById(getColumnId(columnId));
		columnElement?.scrollIntoView({
			behavior: 'smooth',
			block: 'nearest',
			inline: 'start'
		});
		columnElement?.focus({ preventScroll: true });
	}

	function createColumnId(columns: ColumnConfig[]) {
		const columnIds = new Set(columns.map((column) => column.id));

		while (true) {
			const id = crypto.randomUUID();
			if (!columnIds.has(id)) return id;
		}
	}

	function setColumnConfigs(nextColumnConfigs: ColumnConfig[]) {
		columnConfigs = nextColumnConfigs;
		writeColumnConfigs(nextColumnConfigs);
	}

	function emptyCustomTimelineRuntime(): CustomTimelineRuntime {
		return {
			eventsById: {},
			isLoading: false,
			error: null
		};
	}

	function setCustomTimelineRuntime(columnId: string, runtime: CustomTimelineRuntime) {
		customTimelineRuntimes = {
			...customTimelineRuntimes,
			[columnId]: runtime
		};
	}

	function updateCustomTimelineRuntime(columnId: string, patch: Partial<CustomTimelineRuntime>) {
		customTimelineRuntimes = {
			...customTimelineRuntimes,
			[columnId]: {
				...(customTimelineRuntimes[columnId] ?? emptyCustomTimelineRuntime()),
				...patch
			}
		};
	}

	function removeCustomTimelineRuntime(columnId: string) {
		const nextRuntimes = { ...customTimelineRuntimes };
		delete nextRuntimes[columnId];
		customTimelineRuntimes = nextRuntimes;
	}

	function addCustomTimelineEvent(columnId: string, event: Nostr.Event) {
		const runtime = customTimelineRuntimes[columnId] ?? emptyCustomTimelineRuntime();

		customTimelineRuntimes = {
			...customTimelineRuntimes,
			[columnId]: {
				...runtime,
				eventsById: {
					...runtime.eventsById,
					[event.id]: event
				}
			}
		};
	}

	function getCustomTimelinePosts(runtime: CustomTimelineRuntime) {
		return Object.values(runtime.eventsById)
			.sort((left, right) => right.created_at - left.created_at)
			.map((event) => eventToPost(event, getProfile(event.pubkey)));
	}

	function getCustomTimelineSignature(filters: NostrFilter[], relays: RelaySelection) {
		return JSON.stringify({ filters, relays });
	}

	function openAddColumnDialog() {
		selectedColumnType = 'timeline_home';
		websiteUrl = '';
		customTimelineFilters = '[{"kinds":[1],"limit":20}]';
		selectedDefaultRelays = [...defaultRelays];
		customTimelineRelays = '';
		isColumnDialogOpen = true;
	}

	function closeColumnDialog() {
		isColumnDialogOpen = false;
	}

	function toggleComposePanel() {
		isComposePanelOpen = !isComposePanelOpen;
	}

	function closeComposePanel() {
		isComposePanelOpen = false;
	}

	async function saveColumnDialog() {
		if (!canSaveColumn) return;

		const id = createColumnId(columnConfigs);
		const nextColumn =
			selectedColumnType === 'website'
				? {
						id,
						type: 'website' as const,
						url: normalizedWebsiteUrl ?? '',
						width: 'standard' as const
					}
				: selectedColumnType === 'custom_timeline'
					? {
							id,
							type: 'timeline' as const,
							timelineKind: 'custom' as const,
							filters: parsedCustomTimelineFilters ?? [],
							relays: parsedCustomTimelineRelays ?? { type: 'default' as const },
							width: 'standard' as const
						}
					: {
							id,
							type: 'timeline' as const,
							timelineKind: 'preset' as const,
							sourceKey: selectedColumnType,
							width: 'standard' as const
						};

		setColumnConfigs([...columnConfigs, nextColumn]);
		closeColumnDialog();
		await tick();
		focusColumn(id);
	}

	async function deleteColumn(columnId: string) {
		const deletedIndex = columnConfigs.findIndex((column) => column.id === columnId);
		if (deletedIndex < 0) return;

		const nextColumns = columnConfigs.filter((column) => column.id !== columnId);
		setColumnConfigs(nextColumns);
		openSettingsColumnId = null;

		if (activeColumnId !== columnId) return;

		const nextActiveColumn = nextColumns[Math.min(deletedIndex, nextColumns.length - 1)];
		activeColumnId = nextActiveColumn?.id ?? '';

		if (nextActiveColumn) {
			await tick();
			focusColumn(nextActiveColumn.id);
		}
	}

	async function moveColumn(columnId: string, direction: -1 | 1) {
		const currentIndex = columnConfigs.findIndex((column) => column.id === columnId);
		const nextIndex = currentIndex + direction;

		if (currentIndex < 0 || nextIndex < 0 || nextIndex >= columnConfigs.length) return;

		const nextColumns = [...columnConfigs];
		const [column] = nextColumns.splice(currentIndex, 1);
		nextColumns.splice(nextIndex, 0, column);
		setColumnConfigs(nextColumns);

		await tick();
		focusColumn(columnId);
	}

	function updateColumnWidth(columnId: string, width: ColumnWidth) {
		setColumnConfigs(
			columnConfigs.map((column) => (column.id === columnId ? { ...column, width } : column))
		);
	}

	function saveCustomTimelineSettings(
		columnId: string,
		filters: NostrFilter[],
		relays: RelaySelection
	) {
		setColumnConfigs(
			columnConfigs.map((column) =>
				column.id === columnId && column.type === 'timeline' && column.timelineKind === 'custom'
					? { ...column, filters, relays }
					: column
			)
		);
		openSettingsColumnId = null;
	}

	function getColumnIndex(columnId: string) {
		return columnConfigs.findIndex((column) => column.id === columnId);
	}

	function toggleColumnSettings(columnId: string) {
		openSettingsColumnId = openSettingsColumnId === columnId ? null : columnId;
	}

	function updateFontSize(nextFontSize: FontSize) {
		fontSize = nextFontSize;
	}

	function updateAvatarShape(nextAvatarShape: AvatarShape) {
		avatarShape = nextAvatarShape;
	}

	function toggleDefaultRelay(relay: string, isSelected: boolean) {
		selectedDefaultRelays = isSelected
			? [...selectedDefaultRelaySet, relay]
			: selectedDefaultRelays.filter((selectedRelay) => selectedRelay !== relay);
	}
</script>

<svelte:head>
	<title>{m.app_title()}</title>
</svelte:head>

<main
	class="flex h-screen min-h-0 bg-[#eef3f7] text-slate-950 dark:bg-slate-950 dark:text-slate-50"
>
	<Sidebar
		{columns}
		{activeColumnId}
		onAddColumn={openAddColumnDialog}
		onCompose={toggleComposePanel}
		{fontSize}
		{avatarShape}
		{textClass}
		onFontSizeChange={updateFontSize}
		onAvatarShapeChange={updateAvatarShape}
		onSelectColumn={focusColumn}
	/>

	{#if isComposePanelOpen}
		<section
			class="flex h-full w-[360px] shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"
			aria-labelledby="compose-panel-title"
		>
			<header
				class="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800"
			>
				<div class="flex min-w-0 items-center gap-2">
					<Send class="size-4 shrink-0 text-sky-500" aria-hidden="true" />
					<h2 id="compose-panel-title" class={['min-w-0 truncate font-bold', textClass.heading]}>
						{m.action_post()}
					</h2>
				</div>
				<button
					type="button"
					class={[
						'h-9 rounded-md px-3 font-semibold text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900',
						textClass.control
					]}
					onclick={closeComposePanel}
				>
					{m.close()}
				</button>
			</header>

			<div class="flex min-h-0 flex-1 flex-col p-4">
				<div
					class="mb-4 flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900"
				>
					<ProfileAvatar
						shape={avatarShape}
						sizeClass="size-10"
						fallbackClass="bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950"
						testId="account-avatar"
					>
						<UserRound class="size-4" aria-hidden="true" />
					</ProfileAvatar>
					<div class="min-w-0">
						<p class={['truncate font-bold', textClass.control]}>Mika</p>
						<p class={['truncate text-slate-500 dark:text-slate-400', textClass.meta]}>
							@mika · {m.account_role()}
						</p>
					</div>
				</div>

				<label class="sr-only" for="compose-text">{m.post_text()}</label>
				<textarea
					id="compose-text"
					class={[
						'min-h-[220px] flex-1 resize-none rounded-md border border-slate-200 bg-white p-3 text-slate-950 transition outline-none placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:border-sky-400 dark:focus:ring-sky-950',
						textClass.textarea
					]}
					placeholder={m.compose_placeholder()}
					bind:value={composeText}
				></textarea>

				<div class="mt-3 flex items-center justify-between gap-3">
					<div class="flex items-center gap-1">
						<button
							type="button"
							class="flex size-9 items-center justify-center rounded-md text-slate-500 transition hover:bg-sky-50 hover:text-sky-600 dark:text-slate-400 dark:hover:bg-sky-950/40 dark:hover:text-sky-300"
							title={m.add_media()}
							aria-label={m.add_media()}
						>
							<Image class="size-4" aria-hidden="true" />
						</button>
						<button
							type="button"
							class="flex size-9 items-center justify-center rounded-md text-slate-500 transition hover:bg-sky-50 hover:text-sky-600 dark:text-slate-400 dark:hover:bg-sky-950/40 dark:hover:text-sky-300"
							title={m.add_emoji()}
							aria-label={m.add_emoji()}
						>
							<Smile class="size-4" aria-hidden="true" />
						</button>
						<button
							type="button"
							class="flex size-9 items-center justify-center rounded-md text-slate-500 transition hover:bg-sky-50 hover:text-sky-600 dark:text-slate-400 dark:hover:bg-sky-950/40 dark:hover:text-sky-300"
							title={m.schedule_post()}
							aria-label={m.schedule_post()}
						>
							<CalendarClock class="size-4" aria-hidden="true" />
						</button>
					</div>

					<p
						class={[
							'font-semibold tabular-nums',
							textClass.control,
							composeLength > composeMaxLength
								? 'text-rose-600 dark:text-rose-400'
								: 'text-slate-500 dark:text-slate-400'
						]}
						aria-live="polite"
					>
						{composeLength} / {composeMaxLength}
					</p>
				</div>

				<div class="mt-4 flex justify-end">
					<button
						type="button"
						class={[
							'h-10 rounded-md bg-sky-500 px-4 font-bold text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 dark:bg-sky-400 dark:text-slate-950 dark:hover:bg-sky-300 disabled:dark:bg-slate-800 disabled:dark:text-slate-500',
							textClass.control
						]}
						disabled={!canSubmitPost}
					>
						{m.action_post()}
					</button>
				</div>
			</div>
		</section>
	{/if}

	<section class="flex min-w-0 flex-1 flex-col">
		<div class="min-h-0 flex-1 overflow-x-auto overflow-y-hidden">
			<div class="flex h-full min-w-max">
				{#each columns as column (column.id)}
					{@const columnIndex = getColumnIndex(column.id)}
					<DeckColumn
						{column}
						id={getColumnId(column.id)}
						isFocused={activeColumnId === column.id}
						isSettingsOpen={openSettingsColumnId === column.id}
						canMoveLeft={columnIndex > 0}
						canMoveRight={columnIndex >= 0 && columnIndex < columnConfigs.length - 1}
						{textClass}
						{avatarShape}
						onToggleSettings={() => toggleColumnSettings(column.id)}
						onDelete={() => deleteColumn(column.id)}
						onMoveLeft={() => moveColumn(column.id, -1)}
						onMoveRight={() => moveColumn(column.id, 1)}
						onWidthChange={(width) => updateColumnWidth(column.id, width)}
						onCustomTimelineSave={(filters, relays) =>
							saveCustomTimelineSettings(column.id, filters, relays)}
					/>
				{/each}
				<button
					type="button"
					class="flex h-full w-[342px] shrink-0 flex-col items-center justify-center gap-3 border-r border-dashed border-slate-300 bg-white/60 px-4 text-slate-500 transition hover:bg-white hover:text-slate-950 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-50"
					onclick={openAddColumnDialog}
				>
					<span
						class="flex size-11 items-center justify-center rounded-md border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900"
					>
						<Plus class="size-5" aria-hidden="true" />
					</span>
					<span class={['font-semibold', textClass.control]}>{m.add_column()}</span>
				</button>
			</div>
		</div>
	</section>
</main>

{#if isColumnDialogOpen}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4 dark:bg-slate-950/65"
	>
		<div
			class="w-full max-w-sm rounded-md border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-800 dark:bg-slate-950"
			role="dialog"
			aria-modal="true"
			aria-labelledby="column-dialog-title"
		>
			<div class="mb-4 flex items-center justify-between gap-3">
				<h2 id="column-dialog-title" class={['font-bold', textClass.heading]}>
					{m.add_column()}
				</h2>
			</div>

			<label
				class={['mb-2 block font-semibold text-slate-700 dark:text-slate-300', textClass.control]}
				for="column-type"
			>
				{m.column_type()}
			</label>
			<select
				id="column-type"
				class={[
					'h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-slate-950 transition outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:focus:border-sky-400 dark:focus:ring-sky-950',
					textClass.control
				]}
				bind:value={selectedColumnType}
			>
				{#each columnSourceKeys as sourceKey (sourceKey)}
					<option value={sourceKey}>{m[sourceKey]()}</option>
				{/each}
				<option value="custom_timeline">{m.column_type_custom_timeline()}</option>
				<option value="website">{m.column_type_website()}</option>
			</select>

			{#if selectedColumnType === 'custom_timeline'}
				<label
					class={[
						'mt-4 mb-2 block font-semibold text-slate-700 dark:text-slate-300',
						textClass.control
					]}
					for="custom-timeline-filters"
				>
					{m.custom_timeline_filters()}
				</label>
				<textarea
					id="custom-timeline-filters"
					class={[
						'min-h-32 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-slate-950 transition outline-none placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:border-sky-400 dark:focus:ring-sky-950',
						textClass.control
					]}
					bind:value={customTimelineFilters}
				></textarea>

				<p
					class={['mt-4 mb-2 font-semibold text-slate-700 dark:text-slate-300', textClass.control]}
				>
					{m.custom_timeline_relays()}
				</p>
				<div class="grid gap-2">
					{#each defaultRelays as relay (relay)}
						<label
							class={[
								'flex min-w-0 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
								textClass.control
							]}
						>
							<input
								class="size-4 shrink-0 accent-sky-500"
								type="checkbox"
								checked={selectedDefaultRelaySet.has(relay)}
								onchange={(event) =>
									toggleDefaultRelay(relay, (event.currentTarget as HTMLInputElement).checked)}
							/>
							<span class="min-w-0 truncate">{relay}</span>
						</label>
					{/each}
				</div>

				<label
					class={[
						'mt-4 mb-2 block font-semibold text-slate-700 dark:text-slate-300',
						textClass.control
					]}
					for="custom-timeline-relays"
				>
					{m.custom_timeline_custom_relays()}
				</label>
				<textarea
					id="custom-timeline-relays"
					class={[
						'min-h-24 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-slate-950 transition outline-none placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:border-sky-400 dark:focus:ring-sky-950',
						textClass.control
					]}
					bind:value={customTimelineRelays}
				></textarea>
			{:else if selectedColumnType === 'website'}
				<label
					class={[
						'mt-4 mb-2 block font-semibold text-slate-700 dark:text-slate-300',
						textClass.control
					]}
					for="website-url"
				>
					{m.website_url()}
				</label>
				<input
					id="website-url"
					class={[
						'h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-slate-950 transition outline-none placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus:border-sky-400 dark:focus:ring-sky-950',
						textClass.control
					]}
					type="url"
					placeholder="https://example.com"
					bind:value={websiteUrl}
				/>
			{/if}

			<div class="mt-5 flex justify-end gap-3">
				<div class="flex gap-2">
					<button
						type="button"
						class={[
							'h-9 rounded-md px-3 font-semibold text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900',
							textClass.control
						]}
						onclick={closeColumnDialog}
					>
						{m.cancel()}
					</button>
					<button
						type="button"
						class={[
							'h-9 rounded-md bg-sky-500 px-3 font-semibold text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 dark:bg-sky-400 dark:text-slate-950 dark:hover:bg-sky-300 disabled:dark:bg-slate-800 disabled:dark:text-slate-500',
							textClass.control
						]}
						disabled={!canSaveColumn}
						onclick={saveColumnDialog}
					>
						{m.save()}
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}
