import { appendFileSync, globSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

// license-sentinel collects LICENSE and NOTICE files. Include separately named notices as well.
const document =
	/^third[-_ ]?party[-_ ]?(?:licen[cs]es?|notices?)(?:[-_ ]?text)?(?:\.(?:txt|md))?$/i;
const notices = globSync('node_modules/**/*', { withFileTypes: true })
	.filter((file) => file.isFile() && document.test(file.name))
	.map((file) => relative(process.cwd(), join(file.parentPath, file.name)).replaceAll(sep, '/'))
	.sort();

for (const notice of notices) {
	appendFileSync(
		'build/THIRD_PARTY_LICENSES.txt',
		`\n${notice}\n\n${readFileSync(notice, 'utf8')}\n`
	);
}
