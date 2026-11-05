import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const config = {
	runner: 'local',
	logLevel: 'debug',
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
				webviewOptions: { userDataFolder: join(tmpdir(), 'nostter-deck-webdriver') },
				application: fileURLToPath(
					new URL('./src-tauri/target/debug/nostter-deck.exe', import.meta.url)
				)
			}
		}
	]
};
