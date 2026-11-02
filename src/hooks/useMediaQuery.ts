import { useEffect, useState } from "react";

export const useMediaQuery = (query: string, defaultValue = true): boolean => {
	const [matches, setMatches] = useState<boolean>(() => {
		if (
			typeof window === "undefined" ||
			typeof window.matchMedia !== "function"
		) {
			return defaultValue;
		}
		return window.matchMedia(query).matches;
	});

	useEffect((): (() => void) => {
		if (
			typeof window === "undefined" ||
			typeof window.matchMedia !== "function"
		) {
			return (): void => {};
		}
		const mediaQueryList = window.matchMedia(query);
		const updateMatch = (): void => {
			setMatches(mediaQueryList.matches);
		};
		updateMatch();
		mediaQueryList.addEventListener("change", updateMatch);
		return (): void => {
			mediaQueryList.removeEventListener("change", updateMatch);
		};
	}, [query]);

	return matches;
};
