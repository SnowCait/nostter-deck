import { describe, expect, test, vi } from 'vitest';
import { installPromiseWithResolvers } from './promise-with-resolvers';

describe('Promise.withResolvers polyfill', () => {
	test('does not replace an existing implementation', () => {
		const TestPromise = class<T> extends Promise<T> {};
		const existing = vi.fn();
		Object.defineProperty(TestPromise, 'withResolvers', {
			configurable: true,
			writable: true,
			value: existing
		});

		installPromiseWithResolvers(TestPromise as PromiseConstructor);

		expect(TestPromise.withResolvers).toBe(existing);
	});

	test('installs resolve and reject functions while preserving the Promise subclass', async () => {
		const TestPromise = class<T> extends Promise<T> {};
		Object.defineProperty(TestPromise, 'withResolvers', {
			configurable: true,
			writable: true,
			value: undefined
		});
		installPromiseWithResolvers(TestPromise as PromiseConstructor);

		const resolved = TestPromise.withResolvers<number>();
		expect(resolved.promise).toBeInstanceOf(TestPromise);
		resolved.resolve(42);
		await expect(resolved.promise).resolves.toBe(42);

		const rejected = TestPromise.withResolvers<never>();
		const error = new Error('rejected');
		rejected.reject(error);
		await expect(rejected.promise).rejects.toBe(error);
	});
});
