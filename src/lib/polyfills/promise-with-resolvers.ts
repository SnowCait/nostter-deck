export function installPromiseWithResolvers(promiseConstructor: PromiseConstructor = Promise) {
	if (typeof promiseConstructor.withResolvers === 'function') {
		return;
	}

	Object.defineProperty(promiseConstructor, 'withResolvers', {
		configurable: true,
		writable: true,
		value: function <T>(this: PromiseConstructor): PromiseWithResolvers<T> {
			let resolve!: PromiseWithResolvers<T>['resolve'];
			let reject!: PromiseWithResolvers<T>['reject'];
			const promise = new this<T>((promiseResolve, promiseReject) => {
				resolve = promiseResolve;
				reject = promiseReject;
			});
			return { promise, resolve, reject };
		}
	});
}

installPromiseWithResolvers();
