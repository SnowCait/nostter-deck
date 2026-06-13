<script lang="ts">
	import { getColumnIconKey } from '$lib/deck/column-icons';
	import type { ColumnConfig } from '$lib/deck/types';
	import ColumnIconGlyph from './ColumnIconGlyph.svelte';

	type Props = {
		column: ColumnConfig;
		iconClass: string;
	};

	const { column, iconClass }: Props = $props();
	const iconKey = $derived(getColumnIconKey(column));
</script>

<ColumnIconGlyph {iconKey} {iconClass} />
