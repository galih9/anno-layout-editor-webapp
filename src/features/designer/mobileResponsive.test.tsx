import { act, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { useDesignerStore } from "../../store/designerStore";
import { MobileBottomBar } from "./components/MobileBottomBar";
import { TopToolbar } from "./components/TopToolbar";

describe("Mobile & responsive UI components", (): void => {
	beforeEach((): void => {
		useDesignerStore.getState().clearBoard();
		useDesignerStore.getState().setActiveTool("select");
	});

	it("tracks viewport media query changes reactively", (): void => {
		let currentMatches = false;
		const listeners = new Set<() => void>();

		const originalMatchMedia = window.matchMedia;
		window.matchMedia = vi.fn().mockImplementation((query: string) => ({
			get matches(): boolean {
				return currentMatches;
			},
			media: query,
			onchange: null,
			addEventListener: (_event: string, callback: () => void): void => {
				listeners.add(callback);
			},
			removeEventListener: (_event: string, callback: () => void): void => {
				listeners.delete(callback);
			},
			addListener: vi.fn(),
			removeListener: vi.fn(),
			dispatchEvent: vi.fn(),
		}));

		const Probe = (): React.ReactElement => {
			const isDesktop = useMediaQuery("(min-width: 1024px)");
			return <div>{isDesktop ? "desktop" : "mobile"}</div>;
		};

		try {
			render(<Probe />);
			expect(screen.queryByText("mobile")).not.toBeNull();

			act((): void => {
				currentMatches = true;
				for (const listener of listeners) {
					listener();
				}
			});
			expect(screen.queryByText("desktop")).not.toBeNull();
		} finally {
			window.matchMedia = originalMatchMedia;
		}
	});

	it("renders MobileBottomBar armed brush controls and selection quick actions", (): void => {
		const onToggleDrawer = vi.fn();
		const onCloseDrawers = vi.fn();

		const { rerender } = render(
			<MobileBottomBar
				inspectorDrawerId="inspector-drawer"
				openDrawer={null}
				paletteDrawerId="palette-drawer"
				onCloseDrawers={onCloseDrawers}
				onToggleDrawer={onToggleDrawer}
			/>
		);

		// Arm a rotatable building preset (Chapel 5x3)
		act((): void => {
			useDesignerStore.getState().selectPreset("Chapel");
		});
		rerender(
			<MobileBottomBar
				inspectorDrawerId="inspector-drawer"
				openDrawer={null}
				paletteDrawerId="palette-drawer"
				onCloseDrawers={onCloseDrawers}
				onToggleDrawer={onToggleDrawer}
			/>
		);

		expect(screen.queryByText("Chapel")).not.toBeNull();
		fireEvent.click(screen.getByLabelText("Rotate building footprint"));
		expect(useDesignerStore.getState().placementRotated).toBe(true);

		// Finish brush and verify return to select tool
		fireEvent.click(screen.getByRole("button", { name: "Done" }));
		expect(useDesignerStore.getState().activeTool).toBe("select");

		// Place and select a Chapel on the board to verify mobile quick-action strip
		let chapelId: string | null = null;
		act((): void => {
			chapelId = useDesignerStore.getState().placeBuildingAt(10, 10, {
				presetId: "Chapel",
				rotated: false,
			});
			if (chapelId) {
				useDesignerStore.getState().setSelectedIds([chapelId]);
			}
		});
		rerender(
			<MobileBottomBar
				inspectorDrawerId="inspector-drawer"
				openDrawer={null}
				paletteDrawerId="palette-drawer"
				onCloseDrawers={onCloseDrawers}
				onToggleDrawer={onToggleDrawer}
			/>
		);

		fireEvent.click(screen.getByLabelText("Duplicate selected"));
		expect(useDesignerStore.getState().buildings).toHaveLength(2);

		fireEvent.click(screen.getByLabelText("Delete selected"));
		expect(useDesignerStore.getState().buildings).toHaveLength(1);
	});

	it("renders compact TopToolbar with accessible View overlays menu", (): void => {
		const onOpenModal = vi.fn();
		const stageRef = createRef<null>();

		render(
			<TopToolbar isCompact stageRef={stageRef} onOpenModal={onOpenModal} />
		);

		const viewButton = screen.getByLabelText("View overlays and board actions");
		expect(viewButton.getAttribute("aria-expanded")).toBe("false");

		fireEvent.click(viewButton);
		expect(viewButton.getAttribute("aria-expanded")).toBe("true");

		const initialTiles = useDesignerStore.getState().showDiscreteTiles;
		fireEvent.click(screen.getByRole("button", { name: "Tile Area" }));
		expect(useDesignerStore.getState().showDiscreteTiles).toBe(!initialTiles);

		fireEvent.click(screen.getByRole("button", { name: /Help & Controls/i }));
		expect(onOpenModal).toHaveBeenCalledWith("shortcuts");
	});
});
