import type { AccountMethod } from './accounts';
import type { PublishFailureReason, PublishStage } from './publish';

export type PublishOperation = 'post' | 'reply' | 'quote' | 'channel-message';

export type PublishDiagnostic = {
	diagnosticId: string;
	timestamp: string;
	operationType: PublishOperation;
	eventKind: number;
	accountMethod: AccountMethod;
	failingStage: PublishStage;
	failureReason: PublishFailureReason;
	elapsedMs: number;
	applicationVersion: string;
	navigatorOnline: boolean | null;
	documentVisibilityState: DocumentVisibilityState | null;
	targetRelayCount: number;
	nip46RelayHostnames: string[];
	authChallengeObserved: boolean | null;
};

type PublishDiagnosticInput = {
	operationType: PublishOperation;
	eventKind: number;
	accountMethod: AccountMethod;
	failingStage: PublishStage;
	failureReason: PublishFailureReason;
	elapsedMs: number;
	targetRelayCount: number;
	nip46RelayUrls?: string[];
	authChallengeObserved?: boolean | null;
};

export function createPublishDiagnostic(input: PublishDiagnosticInput): PublishDiagnostic {
	return {
		diagnosticId: createDiagnosticId(),
		timestamp: new Date().toISOString(),
		operationType: input.operationType,
		eventKind: input.eventKind,
		accountMethod: input.accountMethod,
		failingStage: input.failingStage,
		failureReason: input.failureReason,
		elapsedMs: Math.max(0, Math.round(input.elapsedMs)),
		applicationVersion: __APP_VERSION__,
		navigatorOnline:
			typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean'
				? null
				: navigator.onLine,
		documentVisibilityState: typeof document === 'undefined' ? null : document.visibilityState,
		targetRelayCount: Math.max(0, input.targetRelayCount),
		nip46RelayHostnames: sanitizeRelayHostnames(input.nip46RelayUrls ?? []),
		authChallengeObserved: input.authChallengeObserved ?? null
	};
}

export function formatPublishDiagnostic(diagnostic: PublishDiagnostic) {
	return JSON.stringify(diagnostic, null, 2);
}

export function sanitizeRelayHostnames(relays: string[]) {
	return [
		...new Set(
			relays.flatMap((relay) => {
				try {
					return [new URL(relay).hostname];
				} catch {
					return [];
				}
			})
		)
	];
}

function createDiagnosticId() {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}
	return `publish-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
