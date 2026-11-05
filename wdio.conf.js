import { fileURLToPath } from 'node:url';

export const config = {
	runner: 'local',
	specs: ['./tests/desktop.smoke.ts'],
	maxInstances: 1,
	framework: 'mocha',
	reporters: ['spec'],
	waitforTimeout: 30_000,
	mochaOpts: { timeout: 60_000 },
	services: [
		[
			'@wdio/tauri-service',
			{
				driverProvider: 'official',
				autoInstallTauriDriver: true,
				autoDownloadEdgeDriver: true
			}
		]
	],
	capabilities: [
		{
			browserName: 'tauri',
			'tauri:options': {
				application: fileURLToPath(
					new URL('./src-tauri/target/debug/nostter-deck.exe', import.meta.url)
				)
			}
		}
	]
};
