import { tick } from 'svelte';
import {
	createColumnDeck,
	duplicateColumnDeck,
	hasColumnDeckName,
	readColumnDeckStore,
	writeColumnDeckStore,
	type ColumnDeckStore
} from './column-decks';
import {
	addHashtagColumn,
	moveColumn as moveColumnConfig,
	removeColumn,
	reorderColumn as reorderColumnConfig
} from './column-actions';
import {
	saveChannelSettings as saveChannelSettingsConfig,
	saveCustomTimelineSettings as saveCustomTimelineSettingsConfig,
	saveFollowSettings as saveFollowSettingsConfig,
	saveSearchSettings as saveSearchSettingsConfig,
	updateColumnIcon as updateColumnIconConfig,
	updateColumnTitle as updateColumnTitleConfig,
	updateColumnWidth as updateColumnWidthConfig
} from './column-updates';
import type { ColumnConfig, ColumnIconKey, ColumnWidth } from './types';
import type { ChannelPointer, ProfilePointer } from '$lib/nostr/nip19';

type ColumnDeckControllerOptions = {
	beforeActivateDeck?: () => Promise<void> | void;
	resetFocusMemory?: () => void;
	resetSelectedColumn: (columnId: string) => void;
	focusColumn: (columnId: string) => void;
	onColumnDeleted?: (columnId: string) => void;
	afterStateChange?: () => Promise<void>;
	createId?: () => string;
};

export function createColumnDeckController({
	beforeActivateDeck = () => {},
	resetFocusMemory = () => {},
	resetSelectedColumn,
	focusColumn,
	onColumnDeleted = () => {},
	afterStateChange = tick,
	createId = () => crypto.randomUUID()
}: ColumnDeckControllerOptions) {
	const savedStore = readColumnDeckStore();
	const savedActiveDeck =
		savedStore.decks.find((deck) => deck.id === savedStore.activeDeckId) ?? savedStore.decks[0];
	let store = $state<ColumnDeckStore>(savedStore);
	let columns = $state<ColumnConfig[]>((savedActiveDeck?.columns ?? []).map(cloneColumn));
	let activeColumnId = $state(savedActiveDeck?.columns[0]?.id ?? '');
	let openSettingsColumnId = $state<string | null>(null);

	function cloneColumn(column: ColumnConfig): ColumnConfig {
		return { ...column };
	}

	function writeStore(nextStore: ColumnDeckStore) {
		store = nextStore;
		writeColumnDeckStore(nextStore);
	}

	function getDeck(deckId: string) {
		return store.decks.find((deck) => deck.id === deckId) ?? null;
	}

	function setColumns(nextColumns: ColumnConfig[]) {
		const activeDeckId = store.activeDeckId;
		const nextStore = {
			...store,
			decks: store.decks.map((deck) =>
				deck.id === activeDeckId ? { ...deck, columns: nextColumns } : deck
			)
		};
		columns = nextColumns;
		writeStore(nextStore);
	}

	function createDeckId() {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- short-lived duplicate ID registry
		const deckIds = new Set(store.decks.map((deck) => deck.id));
		while (true) {
			const id = createId();
			if (!deckIds.has(id)) {
				return id;
			}
		}
	}

	function createDeckColumnIdGenerator() {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- short-lived duplicate ID registry
		const columnIds = new Set(
			store.decks.flatMap((deck) => deck.columns.map((column) => column.id))
		);
		return () => {
			while (true) {
				const id = createId();
				if (columnIds.has(id)) {
					continue;
				}
				columnIds.add(id);
				return id;
			}
		};
	}

	async function activateDeck(nextStore: ColumnDeckStore, deckId: string) {
		const nextDeck = nextStore.decks.find((deck) => deck.id === deckId);
		if (!nextDeck) {
			return;
		}

		await beforeActivateDeck();
		openSettingsColumnId = null;
		resetFocusMemory();

		columns = nextDeck.columns.map(cloneColumn);
		activeColumnId = nextDeck.columns[0]?.id ?? '';
		resetSelectedColumn(activeColumnId);
		writeStore({ ...nextStore, activeDeckId: deckId });
		await afterStateChange();
		if (activeColumnId) {
			focusColumn(activeColumnId);
		}
	}

	async function selectDeck(deckId: string) {
		if (deckId === store.activeDeckId) {
			return;
		}
		await activateDeck(store, deckId);
	}

	async function createDeck(name: string) {
		if (hasColumnDeckName(store.decks, name)) {
			return;
		}
		const deck = createColumnDeck(createDeckId(), name);
		if (!deck) {
			return;
		}
		await activateDeck({ ...store, decks: [...store.decks, deck] }, deck.id);
	}

	function renameDeck(deckId: string, name: string) {
		if (hasColumnDeckName(store.decks, name, deckId)) {
			return;
		}
		writeStore({
			...store,
			decks: store.decks.map((deck) => (deck.id === deckId ? { ...deck, name: name.trim() } : deck))
		});
	}

	async function duplicateDeck(deckId: string, name: string) {
		if (hasColumnDeckName(store.decks, name)) {
			return;
		}
		const sourceDeck = getDeck(deckId);
		if (!sourceDeck) {
			return;
		}
		const deck = duplicateColumnDeck(
			sourceDeck,
			createDeckId(),
			name,
			createDeckColumnIdGenerator()
		);
		if (!deck) {
			return;
		}
		await activateDeck({ ...store, decks: [...store.decks, deck] }, deck.id);
	}

	async function deleteDeck(deckId: string) {
		if (store.decks.length <= 1) {
			return;
		}
		const deckIndex = store.decks.findIndex((deck) => deck.id === deckId);
		if (deckIndex < 0) {
			return;
		}
		const nextDecks = store.decks.filter((deck) => deck.id !== deckId);
		const nextStore = { ...store, decks: nextDecks };
		if (deckId !== store.activeDeckId) {
			writeStore(nextStore);
			return;
		}

		const nextDeck = nextDecks[Math.min(deckIndex, nextDecks.length - 1)];
		await activateDeck(nextStore, nextDeck.id);
	}

	async function saveColumn(column: ColumnConfig) {
		setColumns([...columns, column]);
		await afterStateChange();
		focusColumn(column.id);
	}

	async function openHashtagColumn(sourceColumnId: string, hashtag: string) {
		const result = addHashtagColumn(columns, sourceColumnId, hashtag);
		if (!result) {
			return;
		}

		if (result.type === 'existing') {
			focusColumn(result.column.id);
			return;
		}

		setColumns(result.columns);
		await afterStateChange();
		focusColumn(result.column.id);
	}

	async function deleteColumn(columnId: string) {
		const result = removeColumn(columns, columnId);
		if (!result) {
			return;
		}

		setColumns(result.columns);
		onColumnDeleted(columnId);
		openSettingsColumnId = null;

		if (activeColumnId !== columnId) {
			return;
		}

		const nextActiveColumn = result.columns[Math.min(result.index, result.columns.length - 1)];
		activeColumnId = nextActiveColumn?.id ?? '';

		if (nextActiveColumn) {
			await afterStateChange();
			focusColumn(nextActiveColumn.id);
		}
	}

	async function moveColumn(columnId: string, direction: -1 | 1) {
		const nextColumns = moveColumnConfig(columns, columnId, direction);
		if (!nextColumns) {
			return;
		}
		setColumns(nextColumns);

		await afterStateChange();
		focusColumn(columnId);
	}

	function reorderColumn(columnId: string, targetIndex: number) {
		const nextColumns = reorderColumnConfig(columns, columnId, targetIndex);
		if (!nextColumns) {
			return;
		}
		setColumns(nextColumns);
	}

	function updateColumnWidth(columnId: string, width: ColumnWidth) {
		setColumns(updateColumnWidthConfig(columns, columnId, width));
	}

	function updateColumnTitle(columnId: string, title: string) {
		setColumns(updateColumnTitleConfig(columns, columnId, title));
	}

	function updateColumnIcon(columnId: string, icon: ColumnIconKey | null) {
		setColumns(updateColumnIconConfig(columns, columnId, icon));
	}

	function saveCustomTimelineSettings(
		columnId: string,
		filters: Parameters<typeof saveCustomTimelineSettingsConfig>[2],
		relays: Parameters<typeof saveCustomTimelineSettingsConfig>[3]
	) {
		setColumns(saveCustomTimelineSettingsConfig(columns, columnId, filters, relays));
		openSettingsColumnId = null;
	}

	function saveFollowSettings(columnId: string, profile: ProfilePointer) {
		setColumns(saveFollowSettingsConfig(columns, columnId, profile));
		openSettingsColumnId = null;
	}

	function saveFollowRelaySettings(
		columnId: string,
		profile: ProfilePointer,
		relays: Parameters<typeof saveFollowSettingsConfig>[3]
	) {
		setColumns(saveFollowSettingsConfig(columns, columnId, profile, relays));
		openSettingsColumnId = null;
	}

	function saveSearchSettings(columnId: string, query: string) {
		setColumns(saveSearchSettingsConfig(columns, columnId, query));
		openSettingsColumnId = null;
	}

	function saveChannelSettings(columnId: string, channel: ChannelPointer) {
		setColumns(saveChannelSettingsConfig(columns, columnId, channel));
		openSettingsColumnId = null;
	}

	function saveChannelRelaySettings(
		columnId: string,
		channel: ChannelPointer,
		relays: Parameters<typeof saveChannelSettingsConfig>[3]
	) {
		setColumns(saveChannelSettingsConfig(columns, columnId, channel, relays));
		openSettingsColumnId = null;
	}

	function getColumnIndex(columnId: string) {
		return columns.findIndex((column) => column.id === columnId);
	}

	function toggleColumnSettings(columnId: string) {
		openSettingsColumnId = openSettingsColumnId === columnId ? null : columnId;
	}

	return {
		get store() {
			return store;
		},
		get columns() {
			return columns;
		},
		get activeColumnId() {
			return activeColumnId;
		},
		set activeColumnId(columnId: string) {
			activeColumnId = columnId;
		},
		get openSettingsColumnId() {
			return openSettingsColumnId;
		},
		set openSettingsColumnId(columnId: string | null) {
			openSettingsColumnId = columnId;
		},
		setColumns,
		getColumnIndex,
		selectDeck,
		createDeck,
		renameDeck,
		duplicateDeck,
		deleteDeck,
		saveColumn,
		openHashtagColumn,
		deleteColumn,
		moveColumn,
		reorderColumn,
		updateColumnWidth,
		updateColumnTitle,
		updateColumnIcon,
		saveCustomTimelineSettings,
		saveFollowSettings,
		saveFollowRelaySettings,
		saveSearchSettings,
		saveChannelSettings,
		saveChannelRelaySettings,
		toggleColumnSettings
	};
}
