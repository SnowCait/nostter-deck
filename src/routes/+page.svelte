<script lang="ts">
	import DeckColumn from '$lib/components/deck/DeckColumn.svelte';
	import Sidebar from '$lib/components/deck/Sidebar.svelte';
	import { columns } from '$lib/deck/data';
	import { m } from '$lib/paraglide/messages.js';
	import { locales, setLocale } from '$lib/paraglide/runtime.js';

	type AppLocale = (typeof locales)[number];

	let isSidebarCollapsed = $state(false);

	function selectLocale(locale: AppLocale) {
		setLocale(locale);
	}

	function toggleSidebar() {
		isSidebarCollapsed = !isSidebarCollapsed;
	}
</script>

<svelte:head>
	<title>{m.app_title()}</title>
</svelte:head>

<main class="flex h-screen min-h-0 bg-[#eef3f7] text-slate-950">
	<Sidebar
		isCollapsed={isSidebarCollapsed}
		onSelectLocale={selectLocale}
		onToggle={toggleSidebar}
	/>

	<section class="flex min-w-0 flex-1 flex-col">
		<div class="min-h-0 flex-1 overflow-x-auto overflow-y-hidden">
			<div class="flex h-full min-w-max">
				{#each columns as column (column.titleKey)}
					<DeckColumn {column} />
				{/each}
			</div>
		</div>
	</section>
</main>
