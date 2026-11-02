import { useCallback, useEffect, useState } from "react";

const loadedImages = new Map<string, HTMLImageElement>();
const pendingUrls = new Set<string>();
const subscribers = new Set<() => void>();
let isNotificationScheduled = false;

const flushNotifications = (): void => {
	isNotificationScheduled = false;
	for (const listener of subscribers) {
		listener();
	}
};

const scheduleSubscriberNotification = (): void => {
	if (isNotificationScheduled || subscribers.size === 0) {
		return;
	}
	isNotificationScheduled = true;
	if (typeof requestAnimationFrame === "function") {
		requestAnimationFrame(flushNotifications);
	} else {
		queueMicrotask(flushNotifications);
	}
};

export const ensureImageLoaded = (
	url: string | null | undefined
): HTMLImageElement | undefined => {
	if (!url || typeof Image === "undefined") {
		return undefined;
	}
	const cached = loadedImages.get(url);
	if (cached) {
		return cached;
	}
	if (!pendingUrls.has(url)) {
		pendingUrls.add(url);
		const htmlImage = new Image();
		htmlImage.decoding = "async";
		htmlImage.addEventListener("load", () => {
			pendingUrls.delete(url);
			loadedImages.set(url, htmlImage);
			scheduleSubscriberNotification();
		});
		htmlImage.addEventListener("error", () => {
			pendingUrls.delete(url);
		});
		htmlImage.src = url;
	}
	return undefined;
};

export const useImageCacheVersion = (
	urls?: ReadonlyArray<string | null | undefined>
): number => {
	const [version, setVersion] = useState<number>(0);

	useEffect((): (() => void) => {
		const handleUpdate = (): void => {
			setVersion((current) => current + 1);
		};
		subscribers.add(handleUpdate);
		return (): void => {
			subscribers.delete(handleUpdate);
		};
	}, []);

	useEffect((): void => {
		if (!urls) {
			return;
		}
		for (const url of urls) {
			ensureImageLoaded(url);
		}
	}, [urls]);

	return version;
};

export const useImageCache = (
	urls: ReadonlyArray<string | null | undefined>
): ((url: string | null | undefined) => HTMLImageElement | undefined) => {
	useImageCacheVersion(urls);

	return useCallback(
		(url: string | null | undefined): HTMLImageElement | undefined =>
			ensureImageLoaded(url),
		[]
	);
};
