<script lang="ts">
	import { toDataURL } from 'qrcode';
	import { m } from '$lib/paraglide/messages.js';
	import {
		createNip46ConnectionUri,
		loginWithNip46Bunker,
		loginWithNip46ConnectionUri
	} from '$lib/nostr/auth.svelte';
	import * as Dialog from '$lib/components/ui/dialog';

	type Props = {
		isOpen: boolean;
		onLoginNip07: () => Promise<boolean>;
	};

	let { isOpen = $bindable(), onLoginNip07 }: Props = $props();
	let bunkerInput = $state('');
	let nostrConnectUri = $state<string | null>(null);
	let nostrConnectQr = $state<string | null>(null);

	async function connectBunker() {
		if (await loginWithNip46Bunker(bunkerInput)) isOpen = false;
	}

	async function connectNip07() {
		if (await onLoginNip07()) isOpen = false;
	}

	async function startNostrConnect() {
		const connection = createNip46ConnectionUri();
		nostrConnectUri = connection.connectionUri;
		nostrConnectQr = await toDataURL(connection.connectionUri, { margin: 1, width: 240 });
		void loginWithNip46ConnectionUri(connection.connectionUri, connection.clientSecretKey).then(
			(success) => success && (isOpen = false)
		);
	}
</script>

<Dialog.Root bind:open={isOpen}>
	<Dialog.Content
		closeLabel={m.close()}
		class="max-w-md bg-white text-slate-950 dark:bg-slate-950 dark:text-slate-50"
	>
		<Dialog.Title class="font-bold">{m.login_method()}</Dialog.Title>
		<div class="mt-4 grid gap-3">
			<button
				type="button"
				class="rounded-md bg-sky-500 px-3 py-2 font-semibold text-white"
				onclick={connectNip07}
			>
				{m.login_nip07()}
			</button>
			<label class="grid gap-1 text-sm font-semibold">
				{m.login_nip46()}
				<input
					bind:value={bunkerInput}
					placeholder={m.bunker_input()}
					class="h-10 rounded border border-slate-300 bg-transparent px-3"
				/>
			</label>
			<button
				type="button"
				class="rounded-md border border-slate-300 px-3 py-2 font-semibold"
				onclick={connectBunker}>{m.connect()}</button
			>
			<button
				type="button"
				class="rounded-md border border-slate-300 px-3 py-2 font-semibold"
				onclick={startNostrConnect}>{m.nostr_connect()}</button
			>
			{#if nostrConnectQr && nostrConnectUri}
				<img src={nostrConnectQr} alt={m.nostr_connect()} class="mx-auto size-60" />
				<textarea
					readonly
					value={nostrConnectUri}
					class="h-20 w-full rounded border border-slate-300 p-2 text-xs"
				></textarea>
				<button
					type="button"
					class="rounded-md border border-slate-300 px-3 py-2"
					onclick={() => void navigator.clipboard.writeText(nostrConnectUri ?? '')}
					>{m.copy()}</button
				>
			{/if}
		</div>
	</Dialog.Content>
</Dialog.Root>
