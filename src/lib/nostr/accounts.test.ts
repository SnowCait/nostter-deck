import { beforeEach, describe, expect, test } from 'vitest';
import {
	getAccountId,
	normalizeAccountStore,
	removeAccount,
	upsertAccount,
	writeAccounts
} from './accounts';

const pubkeyA = 'a'.repeat(64);
const pubkeyB = 'b'.repeat(64);

describe('account store', () => {
	beforeEach(() => {
		writeAccounts({ activeAccountId: null, accounts: [] });
	});

	test('normalizes NIP-46 connection records and ignores malformed records', () => {
		expect(
			normalizeAccountStore({
				activeAccountId: 'unexpected-id',
				accounts: [
					{
						id: 'unexpected-id',
						method: 'nip46',
						pubkey: pubkeyA.toUpperCase(),
						createdAt: 1,
						bunker: {
							pubkey: pubkeyB.toUpperCase(),
							relays: ['wss://relay.example', 1],
							secret: 'shared-secret'
						},
						clientSecretKey: 'c'.repeat(64).toUpperCase()
					},
					{ method: 'nip07', pubkey: 'invalid', createdAt: 2 }
				]
			})
		).toEqual({
			activeAccountId: getAccountId('nip46', pubkeyA),
			accounts: [
				{
					id: getAccountId('nip46', pubkeyA),
					method: 'nip46',
					pubkey: pubkeyA,
					createdAt: 1,
					bunker: { pubkey: pubkeyB, relays: ['wss://relay.example'], secret: 'shared-secret' },
					clientSecretKey: 'c'.repeat(64)
				}
			]
		});
	});

	test('activates an upserted account and selects the next account after active deletion', () => {
		upsertAccount({
			id: getAccountId('nip07', pubkeyA),
			method: 'nip07',
			pubkey: pubkeyA,
			createdAt: 1
		});
		upsertAccount({
			id: getAccountId('nip07', pubkeyB),
			method: 'nip07',
			pubkey: pubkeyB,
			createdAt: 2
		});

		expect(removeAccount(getAccountId('nip07', pubkeyB))).toMatchObject({
			activeAccountId: getAccountId('nip07', pubkeyA),
			accounts: [expect.objectContaining({ pubkey: pubkeyA })]
		});
	});
});
