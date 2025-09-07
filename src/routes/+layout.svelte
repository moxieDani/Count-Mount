<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';

	let { children } = $props();
	let installPrompt: any = null;
	let showInstallPrompt = $state(false);
	let isStandalone = $state(false);

	onMount(async () => {
		if (!browser) return;

		// Check if running as PWA
		isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
		              (window.navigator as any).standalone === true;

		// Register Service Worker
		if ('serviceWorker' in navigator) {
			try {
				const registration = await navigator.serviceWorker.register('/sw.js');
				console.log('Service Worker registered:', registration);

				// Handle updates
				registration.addEventListener('updatefound', () => {
					const newWorker = registration.installing;
					if (newWorker) {
						newWorker.addEventListener('statechange', () => {
							if (newWorker.state === 'installed') {
								if (navigator.serviceWorker.controller) {
									console.log('New version available');
									// You could show an update notification here
								}
							}
						});
					}
				});

				// Restore session data from service worker
				const channel = new MessageChannel();
				navigator.serviceWorker.controller?.postMessage(
					{ type: 'GET_SESSION' },
					[channel.port2]
				);

				channel.port1.onmessage = (event) => {
					if (event.data.type === 'SESSION_DATA' && event.data.sessionData) {
						// Restore session to localStorage or sessionStorage
						try {
							const sessionData = event.data.sessionData;
							Object.keys(sessionData).forEach(key => {
								if (sessionData[key] !== null) {
									localStorage.setItem(key, sessionData[key]);
								}
							});
							console.log('Session restored from PWA storage');
						} catch (error) {
							console.error('Failed to restore session:', error);
						}
					}
				};

			} catch (error) {
				console.error('Service Worker registration failed:', error);
			}
		}

		// Handle PWA install prompt
		window.addEventListener('beforeinstallprompt', (e) => {
			e.preventDefault();
			installPrompt = e;
			showInstallPrompt = !isStandalone;
		});

		// Handle PWA install completion
		window.addEventListener('appinstalled', () => {
			console.log('PWA installed successfully');
			showInstallPrompt = false;
			installPrompt = null;
		});

		// Save session data periodically for PWA
		const saveSession = () => {
			if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
				const sessionData: Record<string, string | null> = {};
				
				// Collect important session data
				for (let i = 0; i < localStorage.length; i++) {
					const key = localStorage.key(i);
					if (key) {
						sessionData[key] = localStorage.getItem(key);
					}
				}

				navigator.serviceWorker.controller.postMessage({
					type: 'STORE_SESSION',
					sessionData: sessionData
				});
			}
		};

		// Save session data on page visibility change (when app goes to background)
		document.addEventListener('visibilitychange', () => {
			if (document.visibilityState === 'hidden') {
				saveSession();
			}
		});

		// Save session before page unload
		window.addEventListener('beforeunload', saveSession);

		// Save session periodically (every 5 minutes)
		setInterval(saveSession, 5 * 60 * 1000);
	});

	async function installPWA() {
		if (installPrompt) {
			installPrompt.prompt();
			const result = await installPrompt.userChoice;
			if (result.outcome === 'accepted') {
				console.log('User accepted PWA install');
			}
			installPrompt = null;
			showInstallPrompt = false;
		}
	}

	function dismissInstallPrompt() {
		showInstallPrompt = false;
		installPrompt = null;
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Count Mount - 가계부</title>
</svelte:head>

<!-- PWA Install Prompt -->
{#if showInstallPrompt && !isStandalone}
	<div class="install-prompt">
		<div class="install-content">
			<h3>📱 홈화면에 추가</h3>
			<p>Count Mount를 홈화면에 추가하여 앱처럼 사용하세요!</p>
			<div class="install-buttons">
				<button onclick={installPWA} class="install-btn">설치</button>
				<button onclick={dismissInstallPrompt} class="dismiss-btn">나중에</button>
			</div>
		</div>
	</div>
{/if}

{@render children?.()}

<style>
	.install-prompt {
		position: fixed;
		bottom: 20px;
		left: 20px;
		right: 20px;
		max-width: 400px;
		margin: 0 auto;
		background: white;
		border-radius: 12px;
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
		z-index: 1000;
		animation: slideUp 0.3s ease-out;
	}

	@keyframes slideUp {
		from {
			transform: translateY(100%);
			opacity: 0;
		}
		to {
			transform: translateY(0);
			opacity: 1;
		}
	}

	.install-content {
		padding: 20px;
		text-align: center;
	}

	.install-content h3 {
		margin: 0 0 8px 0;
		color: #333;
		font-size: 1.1rem;
	}

	.install-content p {
		margin: 0 0 16px 0;
		color: #666;
		font-size: 0.9rem;
		line-height: 1.4;
	}

	.install-buttons {
		display: flex;
		gap: 12px;
		justify-content: center;
	}

	.install-btn {
		background: #4CAF50;
		color: white;
		border: none;
		padding: 10px 20px;
		border-radius: 8px;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.2s;
	}

	.install-btn:hover {
		background: #45a049;
	}

	.dismiss-btn {
		background: transparent;
		color: #666;
		border: 1px solid #ddd;
		padding: 10px 20px;
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.2s;
	}

	.dismiss-btn:hover {
		background: #f5f5f5;
	}

	@media (max-width: 480px) {
		.install-prompt {
			left: 16px;
			right: 16px;
			bottom: 16px;
		}
		
		.install-buttons {
			flex-direction: column;
		}
	}
</style>
