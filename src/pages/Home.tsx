import type Konva from "konva";
import { useEffect, useId, useRef, useState } from "react";
import type { FunctionComponent } from "../common/types";
import { BuildingPalette } from "../features/designer/components/BuildingPalette";
import { InspectorPanel } from "../features/designer/components/InspectorPanel";
import { LayoutCanvas } from "../features/designer/components/LayoutCanvas";
import {
	MobileBottomBar,
	type MobileDrawerKind,
} from "../features/designer/components/MobileBottomBar";
import { MobileDrawer } from "../features/designer/components/MobileDrawer";
import {
	type ModalTab,
	TemplatesModal,
} from "../features/designer/components/TemplatesModal";
import { TopToolbar } from "../features/designer/components/TopToolbar";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { useDesignerStore } from "../store/designerStore";

export const Home = (): FunctionComponent => {
	const stageRef = useRef<Konva.Stage | null>(null);
	const paletteDrawerId = useId();
	const inspectorDrawerId = useId();

	const isDesktop = useMediaQuery("(min-width: 1024px)");
	const [openDrawer, setOpenDrawer] = useState<MobileDrawerKind | null>(null);
	const activeMobileDrawer: MobileDrawerKind | null = isDesktop
		? null
		: openDrawer;

	const [paletteDraggedPresetId, setPaletteDraggedPresetId] = useState<
		string | null
	>(null);
	const [modalState, setModalState] = useState<{
		readonly isOpen: boolean;
		readonly tab: ModalTab;
	}>({
		isOpen: false,
		tab: "templates",
	});

	// Global keyboard shortcuts
	useEffect((): (() => void) => {
		const handleKeyDown = (event: KeyboardEvent): void => {
			const target = event.target as HTMLElement | null;
			if (
				target &&
				(target.tagName === "INPUT" ||
					target.tagName === "TEXTAREA" ||
					target.tagName === "SELECT" ||
					target.isContentEditable)
			) {
				return;
			}

			const state = useDesignerStore.getState();
			const isModifier = event.metaKey || event.ctrlKey;
			const lowerKey = event.key.toLowerCase();

			if (isModifier && lowerKey === "z") {
				event.preventDefault();
				if (event.shiftKey) {
					state.redo();
				} else {
					state.undo();
				}
				return;
			}

			if (isModifier && lowerKey === "y") {
				event.preventDefault();
				state.redo();
				return;
			}

			if (isModifier && lowerKey === "d") {
				event.preventDefault();
				state.duplicateSelectedBuildings();
				return;
			}

			if (isModifier) {
				return;
			}

			switch (lowerKey) {
				case "escape": {
					state.cancelActiveAction();
					break;
				}
				case "v": {
					state.setActiveTool("select");
					break;
				}
				case "b": {
					state.setActiveTool("place");
					break;
				}
				case "d": {
					state.setActiveTool("road");
					break;
				}
				case "e": {
					state.setActiveTool("erase");
					break;
				}
				case "i": {
					state.setActiveTool("eyedropper");
					break;
				}
				case "h": {
					state.setActiveTool("pan");
					break;
				}
				case "r": {
					event.preventDefault();
					state.rotateActiveOrSelection();
					break;
				}
				case "g": {
					state.toggleShowGrid();
					break;
				}
				case "l": {
					state.toggleShowLabels();
					break;
				}
				case "delete":
				case "backspace": {
					if (state.selectedIds.length > 0) {
						event.preventDefault();
						state.removeBuildings(state.selectedIds);
					}
					break;
				}
				case "arrowup": {
					if (state.selectedIds.length > 0) {
						event.preventDefault();
						state.moveBuildingsByDelta(state.selectedIds, 0, -1);
					}
					break;
				}
				case "arrowdown": {
					if (state.selectedIds.length > 0) {
						event.preventDefault();
						state.moveBuildingsByDelta(state.selectedIds, 0, 1);
					}
					break;
				}
				case "arrowleft": {
					if (state.selectedIds.length > 0) {
						event.preventDefault();
						state.moveBuildingsByDelta(state.selectedIds, -1, 0);
					}
					break;
				}
				case "arrowright": {
					if (state.selectedIds.length > 0) {
						event.preventDefault();
						state.moveBuildingsByDelta(state.selectedIds, 1, 0);
					}
					break;
				}
				default: {
					break;
				}
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return (): void => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, []);

	const isBackgroundInert = activeMobileDrawer !== null;

	return (
		<>
			<div className="anno-workbench-shell" inert={isBackgroundInert}>
				<TopToolbar
					isCompact={!isDesktop}
					stageRef={stageRef}
					onOpenModal={(tab): void => {
						setOpenDrawer(null);
						setModalState({ isOpen: true, tab });
					}}
				/>

				{isDesktop && (
					<BuildingPalette
						onEndPaletteDrag={(): void => {
							setPaletteDraggedPresetId(null);
						}}
						onStartPaletteDrag={(presetId): void => {
							setPaletteDraggedPresetId(presetId);
						}}
					/>
				)}

				<LayoutCanvas
					paletteDraggedPresetId={paletteDraggedPresetId}
					stageRef={stageRef}
					onClearPaletteDrag={(): void => {
						setPaletteDraggedPresetId(null);
					}}
				/>

				{isDesktop ? (
					<InspectorPanel />
				) : (
					<MobileBottomBar
						inspectorDrawerId={inspectorDrawerId}
						openDrawer={activeMobileDrawer}
						paletteDrawerId={paletteDrawerId}
						onCloseDrawers={(): void => {
							setOpenDrawer(null);
						}}
						onToggleDrawer={(drawer): void => {
							setOpenDrawer((previous) =>
								previous === drawer ? null : drawer
							);
						}}
					/>
				)}
			</div>

			{!isDesktop && (
				<>
					<MobileDrawer
						ariaLabel="Anno 1404 Building Presets"
						id={paletteDrawerId}
						isOpen={activeMobileDrawer === "palette"}
						side="left"
						onClose={(): void => {
							setOpenDrawer(null);
						}}
					>
						<BuildingPalette
							isMobileDrawer
							onCloseDrawer={(): void => {
								setOpenDrawer(null);
							}}
							onEndPaletteDrag={(): void => {
								setPaletteDraggedPresetId(null);
							}}
							onPresetPicked={(): void => {
								setOpenDrawer(null);
							}}
							onStartPaletteDrag={(presetId): void => {
								setPaletteDraggedPresetId(presetId);
							}}
						/>
					</MobileDrawer>

					<MobileDrawer
						ariaLabel="Coverage Inspector and Layout Statistics"
						id={inspectorDrawerId}
						isOpen={activeMobileDrawer === "inspector"}
						side="right"
						onClose={(): void => {
							setOpenDrawer(null);
						}}
					>
						<InspectorPanel
							isMobileDrawer
							onCloseDrawer={(): void => {
								setOpenDrawer(null);
							}}
						/>
					</MobileDrawer>
				</>
			)}

			<TemplatesModal
				activeTab={modalState.tab}
				isOpen={modalState.isOpen}
				onClose={(): void => {
					setModalState((previous) => ({ ...previous, isOpen: false }));
				}}
				onTabChange={(tab): void => {
					setModalState((previous) => ({ ...previous, tab }));
				}}
			/>
		</>
	);
};
