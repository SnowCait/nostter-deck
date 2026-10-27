import Dexie from 'dexie';

// Share one connection so event and timeline writes participate in the same transaction.
export const sessionCacheDb = new Dexie('nostter-deck-session');

sessionCacheDb.version(1).stores({
	events: '&eventId, kind, pubkey, createdAt, [kind+pubkey]',
	timelineEvents:
		'&timelineEventKey, columnId, [columnId+timelineKey+sortCreatedAt+eventId], [columnId+timelineKey+eventId]'
});
