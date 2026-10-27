export function createPastedImageFileReader() {
	let pastedImageCount = 0;

	return function getPastedImageFiles(event: ClipboardEvent) {
		const clipboardData = event.clipboardData;
		if (!clipboardData) {
			return [];
		}

		const itemFiles = Array.from(clipboardData.items)
			.filter((item) => item.kind === 'file' && item.type.toLowerCase().startsWith('image/'))
			.map((item) => item.getAsFile())
			.filter((file): file is File => Boolean(file));

		const files =
			itemFiles.length > 0
				? itemFiles
				: Array.from(clipboardData.files).filter((file) =>
						file.type.toLowerCase().startsWith('image/')
					);

		return files.map((file) => withPastedImageName(file));
	};

	function withPastedImageName(file: File) {
		if (file.name.trim()) {
			return file;
		}

		pastedImageCount += 1;
		return new File([file], `pasted-image-${pastedImageCount}.${getImageExtension(file.type)}`, {
			type: file.type || 'image/png',
			lastModified: file.lastModified
		});
	}
}

function getImageExtension(type: string) {
	if (type === 'image/jpeg') {
		return 'jpg';
	}
	const subtype = type.toLowerCase().match(/^image\/([a-z0-9.+-]+)$/u)?.[1];
	if (!subtype || subtype === 'svg+xml') {
		return 'png';
	}
	return subtype.replace(/[^a-z0-9]+/gu, '-');
}
