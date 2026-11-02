import { useEffect, useRef, useState } from "react";
import type { FunctionComponent } from "../../../common/types";

export type MobileDrawerProps = {
	readonly ariaLabel: string;
	readonly children: React.ReactNode;
	readonly id: string;
	readonly isOpen: boolean;
	readonly onClose: () => void;
	readonly side: "left" | "right";
};

const clampRatio = (value: number): number =>
	Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

export const MobileDrawer = ({
	ariaLabel,
	children,
	id,
	isOpen,
	onClose,
	side,
}: MobileDrawerProps): FunctionComponent => {
	const drawerRef = useRef<HTMLDivElement | null>(null);
	const scrollerRef = useRef<HTMLDivElement | null>(null);
	const sheetRef = useRef<HTMLDivElement | null>(null);
	const hasEnteredViewportRef = useRef<boolean>(false);
	const onCloseRef = useRef<() => void>(onClose);

	const [previousIsOpen, setPreviousIsOpen] = useState<boolean>(isOpen);
	const [isAnimatingClose, setIsAnimatingClose] = useState<boolean>(false);

	if (isOpen !== previousIsOpen) {
		setPreviousIsOpen(isOpen);
		setIsAnimatingClose(!isOpen);
	}

	const isRenderedOpen = isOpen || isAnimatingClose;

	useEffect((): void => {
		onCloseRef.current = onClose;
	}, [onClose]);

	// IntersectionObserver tracks open/closed state across swipes and programmatic scrolls
	useEffect((): (() => void) => {
		if (!isRenderedOpen || typeof IntersectionObserver === "undefined") {
			return (): void => {};
		}
		const drawer = drawerRef.current;
		const sheet = sheetRef.current;
		if (!drawer || !sheet) {
			return (): void => {};
		}

		const viewportWidth = Math.max(window.innerWidth, 1);
		const visibleThreshold = Math.min(0.05, Math.max(0.002, 2 / viewportWidth));

		const observer = new IntersectionObserver(
			(entries): void => {
				const latestEntry = entries[entries.length - 1];
				if (!latestEntry) {
					return;
				}
				if (latestEntry.intersectionRatio >= 0.6) {
					if (!hasEnteredViewportRef.current) {
						hasEnteredViewportRef.current = true;
						sheet.focus({ preventScroll: true });
					}
					return;
				}
				if (
					hasEnteredViewportRef.current &&
					latestEntry.intersectionRatio < visibleThreshold
				) {
					hasEnteredViewportRef.current = false;
					setIsAnimatingClose(false);
					onCloseRef.current();
				}
			},
			{
				root: drawer,
				threshold: [visibleThreshold, 0.6, 0.98],
			}
		);

		observer.observe(sheet);
		return (): void => {
			observer.disconnect();
		};
	}, [isRenderedOpen]);

	// Scroll-driven animation JS fallback when animation-timeline: scroll() is unsupported
	useEffect((): (() => void) => {
		if (!isRenderedOpen) {
			return (): void => {};
		}
		const drawer = drawerRef.current;
		const scroller = scrollerRef.current;
		const sheet = sheetRef.current;
		if (!drawer || !scroller || !sheet) {
			return (): void => {};
		}

		const supportsScrollTimeline =
			typeof CSS !== "undefined" &&
			typeof CSS.supports === "function" &&
			CSS.supports("animation-timeline: scroll()");

		if (supportsScrollTimeline) {
			return (): void => {};
		}

		const syncBackdropFromScroll = (): void => {
			const sheetWidth = Math.max(sheet.offsetWidth, 1);
			const rawRatio =
				side === "left"
					? 1 - scroller.scrollLeft / sheetWidth
					: scroller.scrollLeft / sheetWidth;
			drawer.style.setProperty(
				"--anno-drawer-backdrop",
				String(clampRatio(rawRatio))
			);
		};

		syncBackdropFromScroll();
		scroller.addEventListener("scroll", syncBackdropFromScroll, {
			passive: true,
		});
		return (): void => {
			scroller.removeEventListener("scroll", syncBackdropFromScroll);
		};
	}, [isRenderedOpen, side]);

	// Drive scroll-snap open & close transitions
	useEffect((): (() => void) => {
		if (!isRenderedOpen) {
			return (): void => {};
		}
		const drawer = drawerRef.current;
		const scroller = scrollerRef.current;
		const sheet = sheetRef.current;
		if (!drawer || !scroller || !sheet) {
			return (): void => {};
		}

		let cancelled = false;
		let closeFallbackTimer: number | undefined;

		const getClosedScrollLeft = (): number =>
			side === "left" ? sheet.offsetWidth : 0;
		const getOpenScrollLeft = (): number =>
			side === "left" ? 0 : sheet.offsetWidth;

		if (isOpen) {
			hasEnteredViewportRef.current = false;
			const openSequence = async (): Promise<void> => {
				const closedLeft = getClosedScrollLeft();
				scroller.scrollTo({ left: closedLeft, behavior: "instant" });

				const supportsScrollInitialTarget =
					typeof CSS !== "undefined" &&
					typeof CSS.supports === "function" &&
					CSS.supports("scroll-initial-target", "nearest");

				if (!supportsScrollInitialTarget) {
					await new Promise<void>((resolve) => {
						requestAnimationFrame(() => {
							requestAnimationFrame(() => {
								resolve();
							});
						});
					});
				}
				if (cancelled) {
					return;
				}
				scroller.scrollTo({ left: getOpenScrollLeft(), behavior: "auto" });
			};
			void openSequence();
		} else {
			scroller.scrollTo({ left: getClosedScrollLeft(), behavior: "auto" });
			closeFallbackTimer = window.setTimeout((): void => {
				if (!cancelled) {
					hasEnteredViewportRef.current = false;
					drawer.style.setProperty("--anno-drawer-backdrop", "0");
					setIsAnimatingClose(false);
				}
			}, 380);
		}

		return (): void => {
			cancelled = true;
			if (closeFallbackTimer !== undefined) {
				window.clearTimeout(closeFallbackTimer);
			}
		};
	}, [isOpen, isRenderedOpen, side]);

	// Escape key dismisses active drawer
	useEffect((): (() => void) => {
		if (!isOpen) {
			return (): void => {};
		}
		const handleEscape = (event: KeyboardEvent): void => {
			if (event.key === "Escape") {
				event.stopPropagation();
				onCloseRef.current();
			}
		};
		document.addEventListener("keydown", handleEscape, true);
		return (): void => {
			document.removeEventListener("keydown", handleEscape, true);
		};
	}, [isOpen]);

	return (
		<div
			ref={drawerRef}
			aria-label={ariaLabel}
			className="anno-drawer"
			data-open={isRenderedOpen ? "true" : "false"}
			data-side={side}
			id={id}
			role="dialog"
			onClick={(event): void => {
				const sheet = sheetRef.current;
				if (
					sheet &&
					event.target instanceof Node &&
					!sheet.contains(event.target)
				) {
					onClose();
				}
			}}
		>
			<div aria-hidden="true" className="anno-drawer-backdrop" />
			<div ref={scrollerRef} className="anno-drawer-scroller">
				<div
					ref={sheetRef}
					className="anno-drawer-sheet bg-stone-950 shadow-2xl"
					tabIndex={-1}
				>
					{children}
				</div>
			</div>
		</div>
	);
};
