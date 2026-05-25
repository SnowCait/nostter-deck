<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import type { SearchTimelineColumnConfig } from '$lib/deck/types';
	import type { FontSizeTextClasses } from '$lib/font-size';

	type Props = {
		column: SearchTimelineColumnConfig;
		textClass: FontSizeTextClasses;
		onSave: (query: string) => void;
	};

	const { column, textClass, onSave }: Props = $props();

	let queryDraftColumnId = $state('');
	let queryDraftSource = $state('');
	let queryDraft = $state('');

	const canSave = $derived(queryDraft.trim().length > 0);

	$effect(() => {
		if (queryDraftColumnId === column.id && queryDraftSource === column.query) return;

		queryDraftColumnId = column.id;
		queryDraftSource = column.query;
		queryDraft = column.query;
	});

	function save() {
		if (!canSave) return;

		onSave(queryDraft);
	}
</script>

<label
	class={['mb-2 block font-semibold text-slate-700 dark:text-slate-300', textClass.control]}
	for={`column-search-query-${column.id}`}
>
	{m.search_query()}
</label>
<input
	id={`column-search-query-${column.id}`}
	class={[
		'mb-3 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-slate-950 transition outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:focus:border-sky-400 dark:focus:ring-sky-950',
		textClass.control
	]}
	bind:value={queryDraft}
/>
<button
	type="button"
	class={[
		'mb-3 flex h-9 w-full items-center justify-center rounded-md bg-sky-500 px-3 font-semibold text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 dark:bg-sky-400 dark:text-slate-950 dark:hover:bg-sky-300 disabled:dark:bg-slate-800 disabled:dark:text-slate-500',
		textClass.control
	]}
	disabled={!canSave}
	onclick={save}
>
	{m.save()}
</button>
