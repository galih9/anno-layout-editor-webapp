import { create } from "zustand";
import {
	type PersistStorage,
	type StorageValue,
	persist,
} from "zustand/middleware";
import {
	computeAutoAscendUpgradesAsync,
	yieldToMainThread,
} from "../features/designer/autoAscend";
import {
	computeSpawnFieldCandidates,
	computeTreePopulatePlan,
	FARM_FIELD_RULES,
	reconcileParentChildLinks,
	TREE_FARM_RULES,
	TREE_TILE_PRESET_ID,
} from "../features/designer/farmRules";
import { isRectCoveredBySource } from "../features/designer/gridMath";
import { PRESET_BY_ID } from "../features/designer/presetsData";
import { getSpatialIndex } from "../features/designer/spatialIndex";
import { STARTER_TEMPLATES } from "../features/designer/starterTemplates";
import type {
	ActiveTool,
	CanvasTheme,
	GridPoint,
	GridRect,
	ImportedBuildingItem,
	InfluenceDisplayMode,
	PlacedBuilding,
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
	items: ReadonlyArray<ImportedBuildingItem>
): Array<PlacedBuilding> => {
	const idMap = new Map<string, string>();
	const generatedIds = items.map((item) => {
		const nextId = generateBuildingId();
		if (item.id) {
			idMap.set(item.id, nextId);
		}
		return nextId;
	});

	const instantiated: Array<PlacedBuilding> = items.map((item, index) => {
		const mappedParentId = item.parentId
			? idMap.get(item.parentId)
			: undefined;
		const mappedChildIds = item.childIds
			? item.childIds
					.map((childId) => idMap.get(childId))
					.filter((childId): childId is string => childId !== undefined)
			: undefined;

		return {
			id: generatedIds[index] ?? generateBuildingId(),
			presetId: item.presetId,
			x: item.x,
			y: item.y,
			width: item.width,
			height: item.height,
			rotated: item.rotated,
			...(item.customColor ? { customColor: item.customColor } : {}),
			...(item.customLabel ? { customLabel: item.customLabel } : {}),
			...(mappedParentId ? { parentId: mappedParentId } : {}),
			...(mappedChildIds && mappedChildIds.length > 0
				? { childIds: mappedChildIds }
				: {}),
		};
	});

	return reconcileParentChildLinks(instantiated);
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
	autoAscend: boolean;
	isAutoAscending: boolean;
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
		items: ReadonlyArray<ImportedBuildingItem>
	) => void;
	clearBoard: () => void;
	toggleShowGrid: () => void;
	toggleShowIcons: () => void;
	toggleShowLabels: () => void;
	setShowLabels: (visible: boolean) => void;
	toggleShowDiscreteTiles: () => void;
	populateTreesForBuilding: (buildingId: string) => number;
	spawnFieldsForFarm: (farmId: string, maxToSpawn?: number) => number;
	assignFieldToFarm: (fieldId: string, farmId: string) => boolean;
	assignTreeToBuilding: (treeId: string, parentId: string) => boolean;
	unassignChildFromParent: (childId: string) => boolean;
	clearChildrenOfBuilding: (parentId: string) => number;
	setAutoAscend: (enabled: boolean) => Promise<number>;
	toggleAutoAscend: () => Promise<number>;
	setInfluenceMode: (mode: InfluenceDisplayMode) => void;
	setCanvasTheme: (theme: CanvasTheme) => void;
	requestFitView: () => void;
};

export const useDesignerStore = create<DesignerState>()(
	persist(
		(set, get) => {
			let autoAscendRunSequence = 0;

			const triggerAutoAscend = (options: {
				readonly recordHistory: boolean;
			}): Promise<number> => {
				const initialState = get();
				if (!initialState.autoAscend || initialState.buildings.length === 0) {
					if (initialState.isAutoAscending) {
						set({ isAutoAscending: false });
					}
					return Promise.resolve(0);
				}

				autoAscendRunSequence += 1;
				const runId = autoAscendRunSequence;

				if (!initialState.isAutoAscending) {
					set({ isAutoAscending: true });
				}

				const executePass = async (
					accumulatedUpgrades: number,
					shouldRecordHistory: boolean
				): Promise<number> => {
					await yieldToMainThread();
					if (runId !== autoAscendRunSequence || !get().autoAscend) {
						return accumulatedUpgrades;
					}

					const snapshotState = get();
					const buildingsSnapshot = snapshotState.buildings;
					if (buildingsSnapshot.length === 0) {
						set({ isAutoAscending: false });
						return accumulatedUpgrades;
					}

					const upgrades = await computeAutoAscendUpgradesAsync(
						buildingsSnapshot,
						snapshotState.gridWidth,
						snapshotState.gridHeight,
						{
							shouldAbort: (): boolean =>
								runId !== autoAscendRunSequence || !get().autoAscend,
						}
					);

					if (
						upgrades === null ||
						runId !== autoAscendRunSequence ||
						!get().autoAscend
					) {
						return accumulatedUpgrades;
					}

					const latestState = get();
					if (latestState.buildings !== buildingsSnapshot) {
						return executePass(accumulatedUpgrades, shouldRecordHistory);
					}

					if (upgrades.size === 0) {
						set({ isAutoAscending: false });
						return accumulatedUpgrades;
					}

					const nextBuildings = latestState.buildings.map((building) => {
						const nextPresetId = upgrades.get(building.id);
						return nextPresetId
							? { ...building, presetId: nextPresetId }
							: building;
					});

					set({
						...(shouldRecordHistory
							? {
									past: pushUndoSnapshot(
										latestState.past,
										latestState.buildings
									),
									future: [],
								}
							: {}),
						buildings: nextBuildings,
						isAutoAscending: false,
					});

					return accumulatedUpgrades + upgrades.size;
				};

				const runWithRecovery = async (): Promise<number> => {
					try {
						return await executePass(0, options.recordHistory);
					} catch {
						if (runId === autoAscendRunSequence) {
							set({ isAutoAscending: false });
						}
						return 0;
					}
				};

				return runWithRecovery();
			};

			return {
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
				autoAscend: false,
				isAutoAscending: false,
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
						buildings: reconcileParentChildLinks(updatedBuildings),
					});
					if (get().autoAscend) {
						void triggerAutoAscend({ recordHistory: false });
					}
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
									buildings: reconcileParentChildLinks(nextBuildings),
								});
								if (get().autoAscend) {
									void triggerAutoAscend({ recordHistory: false });
								}
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
					if (get().autoAscend) {
						void triggerAutoAscend({ recordHistory: false });
					}

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
								const existingPreset = PRESET_BY_ID.get(
									existingAtSpot.presetId
								);
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
							? reconcileParentChildLinks(
									state.buildings.map((item) => replacements.get(item.id) ?? item)
								)
							: state.buildings;
					const nextBuildings =
						appended.length > 0
							? [...baseBuildings, ...appended]
							: baseBuildings;

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
					if (get().autoAscend) {
						void triggerAutoAscend({ recordHistory: false });
					}

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
						buildings: reconcileParentChildLinks(
							state.buildings.filter((item) => item.id !== hitBuilding.id)
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
						buildings: reconcileParentChildLinks(
							state.buildings.filter((item) => !removeSet.has(item.id))
						),
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
						buildings: reconcileParentChildLinks(remaining),
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
						buildings: reconcileParentChildLinks(
							state.buildings.map((item) =>
								movingSet.has(item.id)
									? {
											...item,
											x: item.x + deltaX,
											y: item.y + deltaY,
										}
									: item
							)
						),
					});
					if (get().autoAscend) {
						void triggerAutoAscend({ recordHistory: false });
					}
					return true;
				},

				setSelectedIds: (
					ids: ReadonlyArray<string>,
					additive = false
				): void => {
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
								...(building.parentId ? { parentId: building.parentId } : {}),
								...(building.childIds && building.childIds.length > 0
									? { childIds: building.childIds }
									: {}),
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
							const cloneIdByOriginalId = new Map<string, string>();
							for (const item of selectedItems) {
								cloneIdByOriginalId.set(item.id, generateBuildingId());
							}

							const rawClones: Array<PlacedBuilding> = selectedItems.map(
								(item) => {
									const nextCloneId =
										cloneIdByOriginalId.get(item.id) ?? generateBuildingId();
									const mappedParentId = item.parentId
										? cloneIdByOriginalId.get(item.parentId)
										: undefined;
									const mappedChildIds = item.childIds
										? item.childIds
												.map((childId) => cloneIdByOriginalId.get(childId))
												.filter(
													(childId): childId is string => childId !== undefined
												)
										: undefined;

									return {
										id: nextCloneId,
										presetId: item.presetId,
										x: item.x + offsetX,
										y: item.y + offsetY,
										width: item.width,
										height: item.height,
										rotated: item.rotated,
										...(item.customColor
											? { customColor: item.customColor }
											: {}),
										...(item.customLabel
											? { customLabel: item.customLabel }
											: {}),
										...(mappedParentId ? { parentId: mappedParentId } : {}),
										...(mappedChildIds && mappedChildIds.length > 0
											? { childIds: mappedChildIds }
											: {}),
									};
								}
							);
							const clones = reconcileParentChildLinks(rawClones);
							set({
								past: pushUndoSnapshot(state.past, state.buildings),
								future: [],
								buildings: [...state.buildings, ...clones],
								selectedIds: clones.map((clone) => clone.id),
								activeTool: "select",
							});
							if (get().autoAscend) {
								void triggerAutoAscend({ recordHistory: false });
							}
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
					autoAscendRunSequence += 1;
					set({
						buildings: previousSnapshot,
						past: state.past.slice(0, -1),
						future: [[...state.buildings], ...state.future].slice(
							0,
							MAX_HISTORY_ENTRIES
						),
						selectedIds: [],
						isAutoAscending: false,
					});
				},

				redo: (): void => {
					const state = get();
					const nextSnapshot = state.future[0];
					if (!nextSnapshot) {
						return;
					}
					autoAscendRunSequence += 1;
					set({
						buildings: nextSnapshot,
						past: pushUndoSnapshot(state.past, state.buildings),
						future: state.future.slice(1),
						selectedIds: [],
						isAutoAscending: false,
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
					if (get().autoAscend) {
						void triggerAutoAscend({ recordHistory: false });
					}
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
					if (get().autoAscend) {
						void triggerAutoAscend({ recordHistory: false });
					}
				},

				clearBoard: (): void => {
					const state = get();
					autoAscendRunSequence += 1;
					if (state.buildings.length === 0) {
						if (state.isAutoAscending) {
							set({ isAutoAscending: false });
						}
						return;
					}
					set({
						past: pushUndoSnapshot(state.past, state.buildings),
						future: [],
						buildings: [],
						selectedIds: [],
						hoveredBuildingId: null,
						isAutoAscending: false,
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

				setShowLabels: (visible: boolean): void => {
					set({ showLabels: visible });
				},

				toggleShowDiscreteTiles: (): void => {
					set((state) => ({ showDiscreteTiles: !state.showDiscreteTiles }));
				},

				populateTreesForBuilding: (buildingId: string): number => {
					const state = get();
					const parent = state.buildings.find((item) => item.id === buildingId);
					if (!parent || !TREE_FARM_RULES.has(parent.presetId)) {
						return 0;
					}

					const plan = computeTreePopulatePlan(
						parent,
						state.buildings,
						state.gridWidth,
						state.gridHeight
					);
					const totalAffected =
						plan.newTreePoints.length + plan.adoptedTreeIds.length;
					if (totalAffected === 0) {
						return 0;
					}

					const adoptedSet = new Set(plan.adoptedTreeIds);
					const updatedExisting =
						adoptedSet.size > 0
							? state.buildings.map((item) =>
									adoptedSet.has(item.id)
										? { ...item, parentId: parent.id }
										: item
								)
							: state.buildings;

					const newTrees: Array<PlacedBuilding> = plan.newTreePoints.map(
						(point) => ({
							id: generateBuildingId(),
							presetId: TREE_TILE_PRESET_ID,
							x: point.x,
							y: point.y,
							width: 1,
							height: 1,
							rotated: false,
							parentId: parent.id,
						})
					);

					set({
						past: pushUndoSnapshot(state.past, state.buildings),
						future: [],
						buildings: reconcileParentChildLinks([
							...updatedExisting,
							...newTrees,
						]),
					});
					if (get().autoAscend) {
						void triggerAutoAscend({ recordHistory: false });
					}
					return totalAffected;
				},

				spawnFieldsForFarm: (farmId: string, maxToSpawn?: number): number => {
					const state = get();
					const farm = state.buildings.find((item) => item.id === farmId);
					if (!farm || !FARM_FIELD_RULES.has(farm.presetId)) {
						return 0;
					}

					const candidates = computeSpawnFieldCandidates(
						farm,
						state.buildings,
						state.gridWidth,
						state.gridHeight,
						maxToSpawn
					);
					if (candidates.length === 0) {
						return 0;
					}

					const spawnedFields: Array<PlacedBuilding> = candidates.map(
						(candidate) => ({
							id: generateBuildingId(),
							presetId: candidate.presetId,
							x: candidate.x,
							y: candidate.y,
							width: candidate.width,
							height: candidate.height,
							rotated: candidate.rotated,
							parentId: farm.id,
						})
					);

					set({
						past: pushUndoSnapshot(state.past, state.buildings),
						future: [],
						buildings: reconcileParentChildLinks([
							...state.buildings,
							...spawnedFields,
						]),
					});
					if (get().autoAscend) {
						void triggerAutoAscend({ recordHistory: false });
					}
					return spawnedFields.length;
				},

				assignFieldToFarm: (fieldId: string, farmId: string): boolean => {
					const state = get();
					const field = state.buildings.find((item) => item.id === fieldId);
					const farm = state.buildings.find((item) => item.id === farmId);
					if (!field || !farm || field.parentId !== undefined) {
						return false;
					}

					const rule = FARM_FIELD_RULES.get(farm.presetId);
					const farmPreset = PRESET_BY_ID.get(farm.presetId);
					if (
						!rule ||
						!farmPreset ||
						farmPreset.influenceRadius <= 0 ||
						field.presetId !== rule.fieldPresetId
					) {
						return false;
					}

					const currentChildrenCount = farm.childIds?.length ?? 0;
					if (currentChildrenCount >= rule.maxFields) {
						return false;
					}
					if (!isRectCoveredBySource(field, farm, farmPreset.influenceRadius)) {
						return false;
					}

					const reconciled = reconcileParentChildLinks(
						state.buildings.map((item) =>
							item.id === field.id ? { ...item, parentId: farm.id } : item
						)
					);
					const updatedField = reconciled.find((item) => item.id === field.id);
					if (updatedField?.parentId !== farm.id) {
						return false;
					}

					set({
						past: pushUndoSnapshot(state.past, state.buildings),
						future: [],
						buildings: reconciled,
					});
					return true;
				},

				assignTreeToBuilding: (treeId: string, parentId: string): boolean => {
					const state = get();
					const tree = state.buildings.find((item) => item.id === treeId);
					const parent = state.buildings.find((item) => item.id === parentId);
					if (
						!tree ||
						!parent ||
						tree.parentId !== undefined ||
						tree.presetId !== TREE_TILE_PRESET_ID ||
						!TREE_FARM_RULES.has(parent.presetId)
					) {
						return false;
					}

					const parentPreset = PRESET_BY_ID.get(parent.presetId);
					if (
						!parentPreset ||
						parentPreset.influenceRadius <= 0 ||
						!isRectCoveredBySource(tree, parent, parentPreset.influenceRadius)
					) {
						return false;
					}

					const reconciled = reconcileParentChildLinks(
						state.buildings.map((item) =>
							item.id === tree.id ? { ...item, parentId: parent.id } : item
						)
					);
					const updatedTree = reconciled.find((item) => item.id === tree.id);
					if (updatedTree?.parentId !== parent.id) {
						return false;
					}

					set({
						past: pushUndoSnapshot(state.past, state.buildings),
						future: [],
						buildings: reconciled,
					});
					return true;
				},

				unassignChildFromParent: (childId: string): boolean => {
					const state = get();
					const child = state.buildings.find((item) => item.id === childId);
					if (!child?.parentId) {
						return false;
					}
					const previousParentId = child.parentId;
					const strippedBuildings = state.buildings.map((item) => {
						if (item.id === child.id) {
							return {
								id: item.id,
								presetId: item.presetId,
								x: item.x,
								y: item.y,
								width: item.width,
								height: item.height,
								rotated: item.rotated,
								...(item.customColor ? { customColor: item.customColor } : {}),
								...(item.customLabel ? { customLabel: item.customLabel } : {}),
								...(item.childIds && item.childIds.length > 0
									? { childIds: item.childIds }
									: {}),
							};
						}
						if (item.id === previousParentId && item.childIds) {
							const filteredChildIds = item.childIds.filter(
								(id) => id !== child.id
							);
							return {
								id: item.id,
								presetId: item.presetId,
								x: item.x,
								y: item.y,
								width: item.width,
								height: item.height,
								rotated: item.rotated,
								...(item.customColor ? { customColor: item.customColor } : {}),
								...(item.customLabel ? { customLabel: item.customLabel } : {}),
								...(item.parentId ? { parentId: item.parentId } : {}),
								...(filteredChildIds.length > 0
									? { childIds: filteredChildIds }
									: {}),
							};
						}
						return item;
					});

					set({
						past: pushUndoSnapshot(state.past, state.buildings),
						future: [],
						buildings: reconcileParentChildLinks(strippedBuildings),
					});
					return true;
				},

				clearChildrenOfBuilding: (parentId: string): number => {
					const state = get();
					const parent = state.buildings.find((item) => item.id === parentId);
					if (!parent?.childIds || parent.childIds.length === 0) {
						return 0;
					}

					const removeSet = new Set(parent.childIds);
					const remaining = state.buildings.filter(
						(item) => !removeSet.has(item.id)
					);
					const removedCount = state.buildings.length - remaining.length;
					if (removedCount === 0) {
						return 0;
					}

					set({
						past: pushUndoSnapshot(state.past, state.buildings),
						future: [],
						buildings: reconcileParentChildLinks(remaining),
						selectedIds: state.selectedIds.filter((id) => !removeSet.has(id)),
						hoveredBuildingId:
							state.hoveredBuildingId && removeSet.has(state.hoveredBuildingId)
								? null
								: state.hoveredBuildingId,
					});
					if (get().autoAscend) {
						void triggerAutoAscend({ recordHistory: false });
					}
					return removedCount;
				},

				setAutoAscend: (enabled: boolean): Promise<number> => {
					if (!enabled) {
						autoAscendRunSequence += 1;
						set({ autoAscend: false, isAutoAscending: false });
						return Promise.resolve(0);
					}
					set({ autoAscend: true });
					return triggerAutoAscend({ recordHistory: true });
				},

				toggleAutoAscend: (): Promise<number> => {
					return get().setAutoAscend(!get().autoAscend);
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
			};
		},
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
