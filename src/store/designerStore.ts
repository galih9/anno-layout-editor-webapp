import { create } from "zustand";
import {
	type PersistStorage,
	type StorageValue,
	persist,
} from "zustand/middleware";
import { PRESET_BY_ID } from "../features/designer/presetsData";
import { getSpatialIndex } from "../features/designer/spatialIndex";
import { STARTER_TEMPLATES } from "../features/designer/starterTemplates";
import type {
	ActiveTool,
	CanvasTheme,
	GridPoint,
	GridRect,
	InfluenceDisplayMode,
	PlacedBuilding,
	StarterTemplateItem,
} from "../features/designer/types";

const MAX_HISTORY_ENTRIES = 60;
const DEFAULT_GRID_WIDTH = 100;
const DEFAULT_GRID_HEIGHT = 100;
const PERSIST_DEBOUNCE_MS = 350;

let idSequence = 1;
const generateBuildingId = (): string => {
	idSequence += 1;
	return `bld_${Date.now().toString(36)}_${idSequence.toString(36)}`;
};

const instantiateTemplateItems = (
	items: ReadonlyArray<StarterTemplateItem>
): Array<PlacedBuilding> => {
	return items.map((item) => ({
		...item,
		id: generateBuildingId(),
	}));
};

const initialTemplate = STARTER_TEMPLATES[0];

const pushUndoSnapshot = (
	past: ReadonlyArray<Array<PlacedBuilding>>,
	current: ReadonlyArray<PlacedBuilding>
): Array<Array<PlacedBuilding>> => {
	const snapshot = [...current];
	if (past.length >= MAX_HISTORY_ENTRIES) {
		return [...past.slice(past.length - MAX_HISTORY_ENTRIES + 1), snapshot];
	}
	return [...past, snapshot];
};

type PersistedDesignerState = {
	readonly layoutName: string;
	readonly gridWidth: number;
	readonly gridHeight: number;
	readonly buildings: Array<PlacedBuilding>;
	readonly showGrid: boolean;
	readonly showIcons: boolean;
	readonly showLabels: boolean;
	readonly showDiscreteTiles: boolean;
	readonly influenceMode: InfluenceDisplayMode;
	readonly canvasTheme: CanvasTheme;
};

const arePersistedSlicesEqual = (
	first: PersistedDesignerState | null,
	second: PersistedDesignerState
): boolean => {
	if (!first) {
		return false;
	}
	return (
		first.buildings === second.buildings &&
		first.layoutName === second.layoutName &&
		first.gridWidth === second.gridWidth &&
		first.gridHeight === second.gridHeight &&
		first.showGrid === second.showGrid &&
		first.showIcons === second.showIcons &&
		first.showLabels === second.showLabels &&
		first.showDiscreteTiles === second.showDiscreteTiles &&
		first.influenceMode === second.influenceMode &&
		first.canvasTheme === second.canvasTheme
	);
};

const createDebouncedPersistStorage =
	(): PersistStorage<PersistedDesignerState> => {
		let lastSavedSlice: PersistedDesignerState | null = null;
		let pendingEntry: {
			readonly name: string;
			readonly value: StorageValue<PersistedDesignerState>;
		} | null = null;
		let debounceTimer: ReturnType<typeof setTimeout> | null = null;
		let lifecycleAttached = false;

		const flushPendingWrite = (): void => {
			if (debounceTimer !== null) {
				clearTimeout(debounceTimer);
				debounceTimer = null;
			}
			if (!pendingEntry || typeof window === "undefined") {
				pendingEntry = null;
				return;
			}
			const entryToWrite = pendingEntry;
			pendingEntry = null;
			try {
				window.localStorage.setItem(
					entryToWrite.name,
					JSON.stringify(entryToWrite.value)
				);
			} catch {
				// Ignore storage quota or private-mode restrictions
			}
		};

		const ensureLifecycleListeners = (): void => {
			if (lifecycleAttached || typeof window === "undefined") {
				return;
			}
			lifecycleAttached = true;
			window.addEventListener("pagehide", flushPendingWrite);
			document.addEventListener("visibilitychange", () => {
				if (document.visibilityState === "hidden") {
					flushPendingWrite();
				}
			});
		};

		return {
			getItem: (name: string): StorageValue<PersistedDesignerState> | null => {
				if (typeof window === "undefined") {
					return null;
				}
				try {
					const raw = window.localStorage.getItem(name);
					if (!raw) {
						return null;
					}
					const parsed = JSON.parse(
						raw
					) as StorageValue<PersistedDesignerState>;
					lastSavedSlice = parsed.state;
					return parsed;
				} catch {
					return null;
				}
			},
			setItem: (
				name: string,
				value: StorageValue<PersistedDesignerState>
			): void => {
				if (typeof window === "undefined") {
					return;
				}
				if (arePersistedSlicesEqual(lastSavedSlice, value.state)) {
					return;
				}
				lastSavedSlice = value.state;
				pendingEntry = { name, value };
				ensureLifecycleListeners();

				if (debounceTimer !== null) {
					clearTimeout(debounceTimer);
				}
				debounceTimer = setTimeout(flushPendingWrite, PERSIST_DEBOUNCE_MS);
			},
			removeItem: (name: string): void => {
				if (debounceTimer !== null) {
					clearTimeout(debounceTimer);
					debounceTimer = null;
				}
				pendingEntry = null;
				lastSavedSlice = null;
				if (typeof window !== "undefined") {
					try {
						window.localStorage.removeItem(name);
					} catch {
						// Ignore storage errors
					}
				}
			},
		};
	};

const rectanglesOverlapInline = (first: GridRect, second: GridRect): boolean =>
	first.x < second.x + second.width &&
	first.x + first.width > second.x &&
	first.y < second.y + second.height &&
	first.y + first.height > second.y;

export type DesignerState = {
	layoutName: string;
	gridWidth: number;
	gridHeight: number;
	buildings: Array<PlacedBuilding>;
	past: Array<Array<PlacedBuilding>>;
	future: Array<Array<PlacedBuilding>>;
	activeTool: ActiveTool;
	activePresetId: string | null;
	roadBrushPresetId: string;
	placementRotated: boolean;
	selectedIds: Array<string>;
	hoveredBuildingId: string | null;
	showGrid: boolean;
	showIcons: boolean;
	showLabels: boolean;
	showDiscreteTiles: boolean;
	influenceMode: InfluenceDisplayMode;
	canvasTheme: CanvasTheme;
	fitViewVersion: number;

	setLayoutName: (name: string) => void;
	setGridDimensions: (width: number, height: number) => void;
	setActiveTool: (tool: ActiveTool) => void;
	selectPreset: (presetId: string, rotated?: boolean) => void;
	cancelActiveAction: () => void;
	rotateActiveOrSelection: () => void;
	recordStrokeSnapshot: () => void;
	placeBuildingAt: (
		x: number,
		y: number,
		options?: {
			readonly presetId?: string;
			readonly rotated?: boolean;
			readonly recordHistory?: boolean;
		}
	) => string | null;
	placeBuildingsAtPoints: (
		points: ReadonlyArray<GridPoint>,
		options?: {
			readonly presetId?: string;
			readonly rotated?: boolean;
			readonly recordHistory?: boolean;
		}
	) => number;
	eraseAtCell: (x: number, y: number, recordHistory?: boolean) => boolean;
	eraseAtCells: (
		points: ReadonlyArray<GridPoint>,
		recordHistory?: boolean
	) => number;
	removeBuildings: (ids: ReadonlyArray<string>) => void;
	moveBuildingsByDelta: (
		ids: ReadonlyArray<string>,
		deltaX: number,
		deltaY: number
	) => boolean;
	setSelectedIds: (ids: ReadonlyArray<string>, additive?: boolean) => void;
	selectByPresetId: (presetId: string) => void;
	setHoveredBuildingId: (id: string | null) => void;
	updateBuildingCustomization: (
		id: string,
		updates: { readonly customColor?: string; readonly customLabel?: string }
	) => void;
	duplicateSelectedBuildings: () => void;
	undo: () => void;
	redo: () => void;
	loadTemplateById: (templateId: string) => void;
	importBuildings: (
		layoutName: string,
		items: ReadonlyArray<StarterTemplateItem>
	) => void;
	clearBoard: () => void;
	toggleShowGrid: () => void;
	toggleShowIcons: () => void;
	toggleShowLabels: () => void;
	toggleShowDiscreteTiles: () => void;
	setInfluenceMode: (mode: InfluenceDisplayMode) => void;
	setCanvasTheme: (theme: CanvasTheme) => void;
	requestFitView: () => void;
};

export const useDesignerStore = create<DesignerState>()(
	persist(
		(set, get) => ({
			layoutName: initialTemplate?.name ?? "Anno 1404 Settlement",
			gridWidth: DEFAULT_GRID_WIDTH,
			gridHeight: DEFAULT_GRID_HEIGHT,
			buildings: initialTemplate
				? instantiateTemplateItems(initialTemplate.buildings)
				: [],
			past: [],
			future: [],
			activeTool: "select",
			activePresetId: "PatricianHouse",
			roadBrushPresetId: "CobblestoneRoad_1x1",
			placementRotated: false,
			selectedIds: [],
			hoveredBuildingId: null,
			showGrid: true,
			showIcons: true,
			showLabels: true,
			showDiscreteTiles: false,
			influenceMode: "active",
			canvasTheme: "dark",
			fitViewVersion: 1,

			setLayoutName: (name: string): void => {
				set({ layoutName: name });
			},

			setGridDimensions: (width: number, height: number): void => {
				const clampedWidth = Math.max(30, Math.min(250, Math.round(width)));
				const clampedHeight = Math.max(30, Math.min(250, Math.round(height)));
				set({ gridWidth: clampedWidth, gridHeight: clampedHeight });
			},

			setActiveTool: (tool: ActiveTool): void => {
				set((state) => {
					if (tool === "road") {
						return {
							activeTool: "road",
							activePresetId: state.roadBrushPresetId,
							placementRotated: false,
							selectedIds: [],
						};
					}
					if (tool === "place") {
						return {
							activeTool: "place",
							activePresetId: state.activePresetId ?? "PatricianHouse",
							selectedIds: [],
						};
					}
					return { activeTool: tool };
				});
			},

			selectPreset: (presetId: string, rotated?: boolean): void => {
				const preset = PRESET_BY_ID.get(presetId);
				if (!preset) {
					return;
				}
				const isSingleRoadTile =
					preset.isRoad && preset.width === 1 && preset.height === 1;
				set((state) => ({
					activePresetId: presetId,
					roadBrushPresetId: isSingleRoadTile
						? presetId
						: state.roadBrushPresetId,
					activeTool: isSingleRoadTile ? "road" : "place",
					placementRotated: rotated ?? false,
					selectedIds: [],
				}));
			},

			cancelActiveAction: (): void => {
				set((state) => {
					if (state.activeTool !== "select") {
						return { activeTool: "select" };
					}
					if (state.selectedIds.length > 0) {
						return { selectedIds: [] };
					}
					return {};
				});
			},

			rotateActiveOrSelection: (): void => {
				const state = get();
				if (state.activeTool === "place" || state.activeTool === "road") {
					set({ placementRotated: !state.placementRotated });
					return;
				}

				if (state.selectedIds.length === 0) {
					set({ placementRotated: !state.placementRotated });
					return;
				}

				const selectedSet = new Set(state.selectedIds);
				const updatedBuildings = state.buildings.map((building) => {
					if (!selectedSet.has(building.id)) {
						return building;
					}
					if (building.width === building.height) {
						return { ...building, rotated: !building.rotated };
					}
					return {
						...building,
						width: building.height,
						height: building.width,
						rotated: !building.rotated,
					};
				});

				const updatedSpatialIndex = getSpatialIndex(
					updatedBuildings,
					state.gridWidth,
					state.gridHeight
				);

				// Validate every rotated building fits without overlapping
				for (const candidate of updatedBuildings) {
					if (!selectedSet.has(candidate.id)) {
						continue;
					}
					const singleIgnore = new Set<string>([candidate.id]);
					if (
						!updatedSpatialIndex.canPlace(
							candidate,
							state.gridWidth,
							state.gridHeight,
							singleIgnore
						)
					) {
						return;
					}
				}

				set({
					past: pushUndoSnapshot(state.past, state.buildings),
					future: [],
					buildings: updatedBuildings,
				});
			},

			recordStrokeSnapshot: (): void => {
				const state = get();
				set({
					past: pushUndoSnapshot(state.past, state.buildings),
					future: [],
				});
			},

			placeBuildingAt: (x, y, options): string | null => {
				const state = get();
				const presetId = options?.presetId ?? state.activePresetId;
				if (!presetId) {
					return null;
				}
				const preset = PRESET_BY_ID.get(presetId);
				if (!preset) {
					return null;
				}

				const rotated = options?.rotated ?? state.placementRotated;
				const width = rotated ? preset.height : preset.width;
				const height = rotated ? preset.width : preset.height;
				const candidateRect: GridRect = { x, y, width, height };
				const spatialIndex = getSpatialIndex(
					state.buildings,
					state.gridWidth,
					state.gridHeight
				);

				// If painting a 1x1 road/terrain tile over a different 1x1 road/terrain tile, allow replacing it seamlessly
				if (width === 1 && height === 1 && preset.isBorderless) {
					const existingAtSpot = spatialIndex.findBuildingAtTile(x, y);
					if (existingAtSpot) {
						if (existingAtSpot.presetId === presetId) {
							return null;
						}
						const existingPreset = PRESET_BY_ID.get(existingAtSpot.presetId);
						if (
							existingPreset?.isBorderless &&
							existingAtSpot.width === 1 &&
							existingAtSpot.height === 1 &&
							x >= 0 &&
							y >= 0 &&
							x + 1 <= state.gridWidth &&
							y + 1 <= state.gridHeight
						) {
							const replacementId = generateBuildingId();
							const nextBuildings = state.buildings.map((item) =>
								item.id === existingAtSpot.id
									? {
											id: replacementId,
											presetId,
											x,
											y,
											width: 1,
											height: 1,
											rotated: false,
										}
									: item
							);
							const shouldRecord = options?.recordHistory ?? true;
							set({
								...(shouldRecord
									? {
											past: pushUndoSnapshot(state.past, state.buildings),
											future: [],
										}
									: {}),
								buildings: nextBuildings,
							});
							return replacementId;
						}
						return null;
					}
				}

				if (
					!spatialIndex.canPlace(
						candidateRect,
						state.gridWidth,
						state.gridHeight
					)
				) {
					return null;
				}

				const newBuilding: PlacedBuilding = {
					id: generateBuildingId(),
					presetId,
					x,
					y,
					width,
					height,
					rotated,
				};

				const shouldRecord = options?.recordHistory ?? true;
				set({
					...(shouldRecord
						? {
								past: pushUndoSnapshot(state.past, state.buildings),
								future: [],
							}
						: {}),
					buildings: [...state.buildings, newBuilding],
				});

				return newBuilding.id;
			},

			placeBuildingsAtPoints: (points, options): number => {
				if (points.length === 0) {
					return 0;
				}
				if (points.length === 1 && points[0]) {
					return get().placeBuildingAt(points[0].x, points[0].y, options)
						? 1
						: 0;
				}

				const state = get();
				const presetId = options?.presetId ?? state.activePresetId;
				if (!presetId) {
					return 0;
				}
				const preset = PRESET_BY_ID.get(presetId);
				if (!preset) {
					return 0;
				}

				const rotated = options?.rotated ?? state.placementRotated;
				const width = rotated ? preset.height : preset.width;
				const height = rotated ? preset.width : preset.height;
				const isSingleBorderless =
					width === 1 && height === 1 && preset.isBorderless;
				const spatialIndex = getSpatialIndex(
					state.buildings,
					state.gridWidth,
					state.gridHeight
				);

				const replacements = new Map<string, PlacedBuilding>();
				const appended: Array<PlacedBuilding> = [];

				for (const point of points) {
					if (
						point.x < 0 ||
						point.y < 0 ||
						point.x + width > state.gridWidth ||
						point.y + height > state.gridHeight
					) {
						continue;
					}

					const candidateRect: GridRect = {
						x: point.x,
						y: point.y,
						width,
						height,
					};

					const overlapsBatchItem = appended.some((placed) =>
						rectanglesOverlapInline(candidateRect, placed)
					);
					if (overlapsBatchItem) {
						continue;
					}

					if (isSingleBorderless) {
						const existingAtSpot = spatialIndex.findBuildingAtTile(
							point.x,
							point.y
						);
						if (existingAtSpot) {
							if (
								existingAtSpot.presetId === presetId ||
								replacements.has(existingAtSpot.id)
							) {
								continue;
							}
							const existingPreset = PRESET_BY_ID.get(existingAtSpot.presetId);
							if (
								existingPreset?.isBorderless &&
								existingAtSpot.width === 1 &&
								existingAtSpot.height === 1
							) {
								replacements.set(existingAtSpot.id, {
									id: generateBuildingId(),
									presetId,
									x: point.x,
									y: point.y,
									width: 1,
									height: 1,
									rotated: false,
								});
							}
							continue;
						}
					} else if (
						!spatialIndex.canPlace(
							candidateRect,
							state.gridWidth,
							state.gridHeight
						)
					) {
						continue;
					}

					appended.push({
						id: generateBuildingId(),
						presetId,
						x: point.x,
						y: point.y,
						width,
						height,
						rotated,
					});
				}

				const mutationCount = replacements.size + appended.length;
				if (mutationCount === 0) {
					return 0;
				}

				const baseBuildings =
					replacements.size > 0
						? state.buildings.map((item) => replacements.get(item.id) ?? item)
						: state.buildings;
				const nextBuildings =
					appended.length > 0 ? [...baseBuildings, ...appended] : baseBuildings;

				const shouldRecord = options?.recordHistory ?? true;
				set({
					...(shouldRecord
						? {
								past: pushUndoSnapshot(state.past, state.buildings),
								future: [],
							}
						: {}),
					buildings: nextBuildings,
				});

				return mutationCount;
			},

			eraseAtCell: (x: number, y: number, recordHistory = true): boolean => {
				const state = get();
				const spatialIndex = getSpatialIndex(
					state.buildings,
					state.gridWidth,
					state.gridHeight
				);
				const hitBuilding = spatialIndex.findBuildingAtTile(x, y);
				if (!hitBuilding) {
					return false;
				}

				set({
					...(recordHistory
						? {
								past: pushUndoSnapshot(state.past, state.buildings),
								future: [],
							}
						: {}),
					buildings: state.buildings.filter(
						(item) => item.id !== hitBuilding.id
					),
					selectedIds:
						state.selectedIds.length > 0
							? state.selectedIds.filter((id) => id !== hitBuilding.id)
							: state.selectedIds,
					hoveredBuildingId:
						state.hoveredBuildingId === hitBuilding.id
							? null
							: state.hoveredBuildingId,
				});
				return true;
			},

			eraseAtCells: (
				points: ReadonlyArray<GridPoint>,
				recordHistory = true
			): number => {
				if (points.length === 0) {
					return 0;
				}
				const state = get();
				const spatialIndex = getSpatialIndex(
					state.buildings,
					state.gridWidth,
					state.gridHeight
				);
				const removeSet = new Set<string>();
				for (const point of points) {
					const hit = spatialIndex.findBuildingAtTile(point.x, point.y);
					if (hit) {
						removeSet.add(hit.id);
					}
				}
				if (removeSet.size === 0) {
					return 0;
				}

				set({
					...(recordHistory
						? {
								past: pushUndoSnapshot(state.past, state.buildings),
								future: [],
							}
						: {}),
					buildings: state.buildings.filter((item) => !removeSet.has(item.id)),
					selectedIds:
						state.selectedIds.length > 0
							? state.selectedIds.filter((id) => !removeSet.has(id))
							: state.selectedIds,
					hoveredBuildingId:
						state.hoveredBuildingId && removeSet.has(state.hoveredBuildingId)
							? null
							: state.hoveredBuildingId,
				});
				return removeSet.size;
			},

			removeBuildings: (ids: ReadonlyArray<string>): void => {
				if (ids.length === 0) {
					return;
				}
				const state = get();
				const removeSet = new Set(ids);
				const remaining = state.buildings.filter(
					(building) => !removeSet.has(building.id)
				);
				if (remaining.length === state.buildings.length) {
					return;
				}
				set({
					past: pushUndoSnapshot(state.past, state.buildings),
					future: [],
					buildings: remaining,
					selectedIds: state.selectedIds.filter((id) => !removeSet.has(id)),
					hoveredBuildingId:
						state.hoveredBuildingId && removeSet.has(state.hoveredBuildingId)
							? null
							: state.hoveredBuildingId,
				});
			},

			moveBuildingsByDelta: (ids, deltaX, deltaY): boolean => {
				if (ids.length === 0 || (deltaX === 0 && deltaY === 0)) {
					return false;
				}
				const state = get();
				const spatialIndex = getSpatialIndex(
					state.buildings,
					state.gridWidth,
					state.gridHeight
				);
				const movingSet = new Set(ids);
				const movingItems = state.buildings.filter((item) =>
					movingSet.has(item.id)
				);
				if (movingItems.length === 0) {
					return false;
				}

				for (const item of movingItems) {
					const candidate: GridRect = {
						x: item.x + deltaX,
						y: item.y + deltaY,
						width: item.width,
						height: item.height,
					};
					if (
						!spatialIndex.canPlace(
							candidate,
							state.gridWidth,
							state.gridHeight,
							movingSet
						)
					) {
						return false;
					}
				}

				set({
					past: pushUndoSnapshot(state.past, state.buildings),
					future: [],
					buildings: state.buildings.map((item) =>
						movingSet.has(item.id)
							? {
									...item,
									x: item.x + deltaX,
									y: item.y + deltaY,
								}
							: item
					),
				});
				return true;
			},

			setSelectedIds: (ids: ReadonlyArray<string>, additive = false): void => {
				set((state) => {
					if (!additive) {
						if (state.selectedIds.length === 0 && ids.length === 0) {
							return state;
						}
						return { selectedIds: [...ids] };
					}
					const combined = new Set(state.selectedIds);
					for (const id of ids) {
						if (combined.has(id)) {
							combined.delete(id);
						} else {
							combined.add(id);
						}
					}
					return { selectedIds: [...combined] };
				});
			},

			selectByPresetId: (presetId: string): void => {
				const state = get();
				const matchingIds = state.buildings
					.filter((item) => item.presetId === presetId)
					.map((item) => item.id);
				set({
					activeTool: "select",
					selectedIds: matchingIds,
				});
			},

			setHoveredBuildingId: (id: string | null): void => {
				if (get().hoveredBuildingId === id) {
					return;
				}
				set({ hoveredBuildingId: id });
			},

			updateBuildingCustomization: (id, updates): void => {
				const state = get();
				set({
					past: pushUndoSnapshot(state.past, state.buildings),
					future: [],
					buildings: state.buildings.map((building) => {
						if (building.id !== id) {
							return building;
						}
						const nextColor =
							updates.customColor === ""
								? undefined
								: (updates.customColor ?? building.customColor);
						const nextLabel =
							updates.customLabel === ""
								? undefined
								: (updates.customLabel ?? building.customLabel);
						return {
							id: building.id,
							presetId: building.presetId,
							x: building.x,
							y: building.y,
							width: building.width,
							height: building.height,
							rotated: building.rotated,
							...(nextColor ? { customColor: nextColor } : {}),
							...(nextLabel ? { customLabel: nextLabel } : {}),
						};
					}),
				});
			},

			duplicateSelectedBuildings: (): void => {
				const state = get();
				if (state.selectedIds.length === 0) {
					return;
				}
				const spatialIndex = getSpatialIndex(
					state.buildings,
					state.gridWidth,
					state.gridHeight
				);
				const selectedSet = new Set(state.selectedIds);
				const selectedItems = state.buildings.filter((item) =>
					selectedSet.has(item.id)
				);
				if (selectedItems.length === 0) {
					return;
				}

				let minimumX = Number.POSITIVE_INFINITY;
				let maximumX = Number.NEGATIVE_INFINITY;
				let minimumY = Number.POSITIVE_INFINITY;
				let maximumY = Number.NEGATIVE_INFINITY;
				for (const item of selectedItems) {
					minimumX = Math.min(minimumX, item.x);
					maximumX = Math.max(maximumX, item.x + item.width);
					minimumY = Math.min(minimumY, item.y);
					maximumY = Math.max(maximumY, item.y + item.height);
				}

				const spanWidth = maximumX - minimumX;
				const spanHeight = maximumY - minimumY;

				const candidateOffsets: Array<[number, number]> = [
					[spanWidth + 1, 0],
					[spanWidth, 0],
					[0, spanHeight + 1],
					[0, spanHeight],
					[-(spanWidth + 1), 0],
					[0, -(spanHeight + 1)],
				];

				for (let step = 1; step <= 15; step += 1) {
					candidateOffsets.push([step * 3, step * 3]);
				}

				for (const [offsetX, offsetY] of candidateOffsets) {
					const fitsAll = selectedItems.every((item) =>
						spatialIndex.canPlace(
							{
								x: item.x + offsetX,
								y: item.y + offsetY,
								width: item.width,
								height: item.height,
							},
							state.gridWidth,
							state.gridHeight
						)
					);
					if (fitsAll) {
						const clones = selectedItems.map((item) => ({
							...item,
							id: generateBuildingId(),
							x: item.x + offsetX,
							y: item.y + offsetY,
						}));
						set({
							past: pushUndoSnapshot(state.past, state.buildings),
							future: [],
							buildings: [...state.buildings, ...clones],
							selectedIds: clones.map((clone) => clone.id),
							activeTool: "select",
						});
						return;
					}
				}
			},

			undo: (): void => {
				const state = get();
				const previousSnapshot = state.past[state.past.length - 1];
				if (!previousSnapshot) {
					return;
				}
				set({
					buildings: previousSnapshot,
					past: state.past.slice(0, -1),
					future: [[...state.buildings], ...state.future].slice(
						0,
						MAX_HISTORY_ENTRIES
					),
					selectedIds: [],
				});
			},

			redo: (): void => {
				const state = get();
				const nextSnapshot = state.future[0];
				if (!nextSnapshot) {
					return;
				}
				set({
					buildings: nextSnapshot,
					past: pushUndoSnapshot(state.past, state.buildings),
					future: state.future.slice(1),
					selectedIds: [],
				});
			},

			loadTemplateById: (templateId: string): void => {
				const template = STARTER_TEMPLATES.find(
					(entry) => entry.id === templateId
				);
				if (!template) {
					return;
				}
				const state = get();
				set({
					past: pushUndoSnapshot(state.past, state.buildings),
					future: [],
					layoutName: template.name,
					buildings: instantiateTemplateItems(template.buildings),
					selectedIds: [],
					activeTool: "select",
					fitViewVersion: state.fitViewVersion + 1,
				});
			},

			importBuildings: (layoutName, items): void => {
				const state = get();
				let maxRight = state.gridWidth;
				let maxBottom = state.gridHeight;
				for (const item of items) {
					maxRight = Math.max(maxRight, item.x + item.width + 8);
					maxBottom = Math.max(maxBottom, item.y + item.height + 8);
				}

				set({
					past: pushUndoSnapshot(state.past, state.buildings),
					future: [],
					layoutName,
					gridWidth: Math.min(250, maxRight),
					gridHeight: Math.min(250, maxBottom),
					buildings: instantiateTemplateItems(items),
					selectedIds: [],
					activeTool: "select",
					fitViewVersion: state.fitViewVersion + 1,
				});
			},

			clearBoard: (): void => {
				const state = get();
				if (state.buildings.length === 0) {
					return;
				}
				set({
					past: pushUndoSnapshot(state.past, state.buildings),
					future: [],
					buildings: [],
					selectedIds: [],
					hoveredBuildingId: null,
				});
			},

			toggleShowGrid: (): void => {
				set((state) => ({ showGrid: !state.showGrid }));
			},

			toggleShowIcons: (): void => {
				set((state) => ({ showIcons: !state.showIcons }));
			},

			toggleShowLabels: (): void => {
				set((state) => ({ showLabels: !state.showLabels }));
			},

			toggleShowDiscreteTiles: (): void => {
				set((state) => ({ showDiscreteTiles: !state.showDiscreteTiles }));
			},

			setInfluenceMode: (mode: InfluenceDisplayMode): void => {
				set({ influenceMode: mode });
			},

			setCanvasTheme: (theme: CanvasTheme): void => {
				set({ canvasTheme: theme });
			},

			requestFitView: (): void => {
				set((state) => ({ fitViewVersion: state.fitViewVersion + 1 }));
			},
		}),
		{
			name: "anno-1404-layout-playground-v1",
			storage: createDebouncedPersistStorage(),
			partialize: (state): PersistedDesignerState => ({
				layoutName: state.layoutName,
				gridWidth: state.gridWidth,
				gridHeight: state.gridHeight,
				buildings: state.buildings,
				showGrid: state.showGrid,
				showIcons: state.showIcons,
				showLabels: state.showLabels,
				showDiscreteTiles: state.showDiscreteTiles,
				influenceMode: state.influenceMode,
				canvasTheme: state.canvasTheme,
			}),
		}
	)
);
