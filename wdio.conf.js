import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { join } from 'node:path';

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
				// Match Tauri's default LocalData directory without a registry override.
				webviewOptions: { userDataFolder: join(homedir(), 'AppData', 'Local', 'app.nostter.deck') },
				application: fileURLToPath(
					new URL('./src-tauri/target/debug/nostter-deck.exe', import.meta.url)
				)
			}
		}
	]
};
