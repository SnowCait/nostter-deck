import { appendFileSync, copyFileSync, globSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const report = 'build/THIRD_PARTY_LICENSES.txt';

// license-sentinel collects LICENSE and NOTICE files. Include separately named notices as well.
const document =
	/^third[-_ ]?party[-_ ]?(?:licen[cs]es?|notices?)(?:[-_ ]?text)?(?:\.(?:txt|md))?$/i;
const notices = globSync('node_modules/**/*', { withFileTypes: true })
	.filter((file) => file.isFile() && document.test(file.name))
	.map((file) => relative(process.cwd(), join(file.parentPath, file.name)).replaceAll(sep, '/'))
	.sort();

for (const notice of notices) {
	appendFileSync(report, `\n${notice}\n\n${readFileSync(notice, 'utf8')}\n`);
}

// SvelteKit preview serves the client output rather than the adapter's build directory.
copyFileSync(report, '.svelte-kit/output/client/THIRD_PARTY_LICENSES.txt');
