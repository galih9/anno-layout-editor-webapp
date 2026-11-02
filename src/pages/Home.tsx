import type Konva from "konva";
import { useEffect, useRef, useState } from "react";
import type { FunctionComponent } from "../common/types";
import { BuildingPalette } from "../features/designer/components/BuildingPalette";
import { InspectorPanel } from "../features/designer/components/InspectorPanel";
import { LayoutCanvas } from "../features/designer/components/LayoutCanvas";
import {
	type ModalTab,
	TemplatesModal,
} from "../features/designer/components/TemplatesModal";
import { TopToolbar } from "../features/designer/components/TopToolbar";
import { useDesignerStore } from "../store/designerStore";

export const Home = (): FunctionComponent => {
	const stageRef = useRef<Konva.Stage | null>(null);
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

	return (
		<div className="anno-workbench-shell">
			<TopToolbar
				stageRef={stageRef}
				onOpenModal={(tab): void => {
					setModalState({ isOpen: true, tab });
				}}
			/>
			<BuildingPalette
				onEndPaletteDrag={(): void => {
					setPaletteDraggedPresetId(null);
				}}
				onStartPaletteDrag={(presetId): void => {
					setPaletteDraggedPresetId(presetId);
				}}
			/>
			<LayoutCanvas
				paletteDraggedPresetId={paletteDraggedPresetId}
				stageRef={stageRef}
				onClearPaletteDrag={(): void => {
					setPaletteDraggedPresetId(null);
				}}
			/>
			<InspectorPanel />
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
		</div>
	);
};
