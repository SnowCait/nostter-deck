import { describe, expect, test } from 'vitest';
import {
	createPublishDiagnostic,
	formatPublishDiagnostic,
	sanitizeRelayHostnames
} from './publish-diagnostics';

describe('publish diagnostics', () => {
	test('keeps only unique relay hostnames', () => {
		expect(
			sanitizeRelayHostnames([
				'wss://relay.example/private?secret=value#fragment',
				'wss://relay.example/another',
				'wss://second.example:7447/path?token=hidden',
				'not a URL'
			])
		).toEqual(['relay.example', 'second.example']);
	});

	test('formats copyable diagnostics without post or bunker secrets', () => {
		const diagnostic = createPublishDiagnostic({
			operationType: 'post',
			eventKind: 1,
			accountMethod: 'nip46',
			failingStage: 'signing',
			failureReason: 'signing-timeout',
			elapsedMs: 30_001,
			targetRelayCount: 2,
			nip46RelayUrls: ['wss://relay.example/path?secret=bunker-secret'],
			authChallengeObserved: true
		});
		const formatted = formatPublishDiagnostic(diagnostic);

		expect(diagnostic).toMatchObject({
			operationType: 'post',
			eventKind: 1,
			accountMethod: 'nip46',
			failingStage: 'signing',
			failureReason: 'signing-timeout',
			elapsedMs: 30_001,
			targetRelayCount: 2,
			nip46RelayHostnames: ['relay.example'],
			authChallengeObserved: true
		});
		expect(formatted).not.toContain('bunker-secret');
		expect(formatted).not.toContain('/path');
		expect(formatted).not.toContain('secret=');
		expect(formatted).not.toContain('content');
	});
});
