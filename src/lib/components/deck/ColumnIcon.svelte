<script lang="ts">
	import { getColumnIconKey } from '$lib/deck/column-icons';
	import type { Column } from '$lib/deck/types';
	import ColumnIconGlyph from './ColumnIconGlyph.svelte';

	type Props = {
		column: Column;
		iconClass: string;
	};

	const { column, iconClass }: Props = $props();
	const iconKey = $derived(getColumnIconKey(column));
</script>

<ColumnIconGlyph {iconKey} {iconClass} />
