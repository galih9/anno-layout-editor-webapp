import { useEffect, useState } from "react";

const loadedImages = new Map<string, HTMLImageElement>();
const pendingUrls = new Set<string>();
const subscribers = new Set<() => void>();

const notifySubscribers = (): void => {
	for (const listener of subscribers) {
		listener();
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
			notifySubscribers();
		});
		htmlImage.addEventListener("error", () => {
			pendingUrls.delete(url);
		});
		htmlImage.src = url;
	}
	return undefined;
};

export const useImageCache = (
	urls: ReadonlyArray<string | null | undefined>
): ((url: string | null | undefined) => HTMLImageElement | undefined) => {
	const [, setVersion] = useState<number>(0);

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
		for (const url of urls) {
			ensureImageLoaded(url);
		}
	}, [urls]);

	return (url: string | null | undefined): HTMLImageElement | undefined =>
		ensureImageLoaded(url);
};
