import type Konva from "konva";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Stage } from "react-konva";
import type { FunctionComponent } from "../../../common/types";
import { useDesignerStore } from "../../../store/designerStore";
import { computeHighlightedCoveredIds } from "../farmRules";
import { computeCoveredTileSpans, computeLineCells } from "../gridMath";
import { PRESET_BY_ID } from "../presetsData";
import { getSpatialIndex } from "../spatialIndex";
import type {
	BuildingPreset,
	GridPoint,
	GridRect,
	PlacedBuilding,
	TileSpan,
} from "../types";
import { ensureImageLoaded, useImageCacheVersion } from "../useImageCache";
import {
	BuildingsLayer,
	CELL_SIZE,
	type DragMoveSession,
	DynamicOverlayLayer,
	type GhostPlacementRect,
	GridLayer,
	InfluenceLayer,
	type MarqueeSession,
	type VisibleInfluenceSource,
} from "./canvasLayers";

export { CELL_SIZE } from "./canvasLayers";

const MIN_SCALE = 0.25;
const MAX_SCALE = 3.0;
const TOUCH_PAN_EMPTY_BUTTON = -1;

const EMPTY_STRING_SET: ReadonlySet<string> = new Set<string>();
const EMPTY_INFLUENCE_SOURCES: ReadonlyArray<VisibleInfluenceSource> = [];
const EMPTY_TILE_SPANS: ReadonlyArray<TileSpan> = [];

type ViewportTransform = {
	readonly x: number;
	readonly y: number;
	readonly scale: number;
};

type PanSession = {
	readonly startClientX: number;
	readonly startClientY: number;
	readonly startViewportX: number;
	readonly startViewportY: number;
	readonly button: number;
	movedDistance: number;
};

type PaintStrokeSession = {
	readonly mode: "place" | "erase";
	readonly lastCell: GridPoint;
	readonly hasRecordedHistory: boolean;
};

type PendingTouchStroke = {
	readonly mode: "place" | "erase";
	readonly startTile: GridPoint;
	readonly startClientX: number;
	readonly startClientY: number;
};

type PinchZoomSession = {
	readonly initialDistance: number;
	readonly initialScale: number;
	readonly anchorWorldX: number;
	readonly anchorWorldY: number;
};

type StageTouchPoint = {
	readonly stageX: number;
	readonly stageY: number;
	readonly clientX: number;
	readonly clientY: number;
};

export type LayoutCanvasProps = {
	readonly paletteDraggedPresetId: string | null;
	readonly onClearPaletteDrag: () => void;
	readonly stageRef: React.RefObject<Konva.Stage | null>;
};

const clampValue = (value: number, minimum: number, maximum: number): number =>
	Math.max(minimum, Math.min(maximum, value));

const rectanglesOverlapFast = (first: GridRect, second: GridRect): boolean =>
	first.x < second.x + second.width &&
	first.x + first.width > second.x &&
	first.y < second.y + second.height &&
	first.y + first.height > second.y;

export const LayoutCanvas = ({
	paletteDraggedPresetId,
	onClearPaletteDrag,
	stageRef,
}: LayoutCanvasProps): FunctionComponent => {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const containerBoundsRef = useRef<{
		left: number;
		top: number;
		width: number;
		height: number;
	}>({
		left: 0,
		top: 0,
		width: 0,
		height: 0,
	});

	const [stageSize, setStageSize] = useState<{ width: number; height: number }>(
		{
			width: 0,
			height: 0,
		}
	);
	const [viewport, setViewport] = useState<ViewportTransform>({
		x: 0,
		y: 0,
		scale: 0.9,
	});
	const viewportRef = useRef<ViewportTransform>(viewport);
	const viewportAnimationFrameRef = useRef<number | null>(null);

	const [cursorCell, setCursorCell] = useState<GridPoint | null>(null);
	const cursorCellRef = useRef<GridPoint | null>(null);

	const [isSpacePressed, setIsSpacePressed] = useState<boolean>(false);
	const [isMultiSelectMode, setIsMultiSelectMode] = useState<boolean>(false);
	const [dragMove, setDragMove] = useState<DragMoveSession | null>(null);
	const [marquee, setMarquee] = useState<MarqueeSession | null>(null);
	const [isPanning, setIsPanning] = useState<boolean>(false);
	const [isPaletteDragOver, setIsPaletteDragOver] = useState<boolean>(false);

	const panSessionRef = useRef<PanSession | null>(null);
	const paintStrokeRef = useRef<PaintStrokeSession | null>(null);
	const pendingTouchStrokeRef = useRef<PendingTouchStroke | null>(null);
	const touchPlacePreviewRef = useRef<GridPoint | null>(null);
	const pinchSessionRef = useRef<PinchZoomSession | null>(null);
	const wasMultiTouchGestureRef = useRef<boolean>(false);
	const lastTouchTimestampRef = useRef<number>(0);
	const hasInitializedViewRef = useRef<boolean>(false);

	const gridWidth = useDesignerStore((state) => state.gridWidth);
	const gridHeight = useDesignerStore((state) => state.gridHeight);
	const buildings = useDesignerStore((state) => state.buildings);
	const activeTool = useDesignerStore((state) => state.activeTool);
	const activePresetId = useDesignerStore((state) => state.activePresetId);
	const placementRotated = useDesignerStore((state) => state.placementRotated);
	const selectedIds = useDesignerStore((state) => state.selectedIds);
	const hoveredBuildingId = useDesignerStore(
		(state) => state.hoveredBuildingId
	);
	const showGrid = useDesignerStore((state) => state.showGrid);
	const showIcons = useDesignerStore((state) => state.showIcons);
	const showLabels = useDesignerStore((state) => state.showLabels);
	const showDiscreteTiles = useDesignerStore(
		(state) => state.showDiscreteTiles
	);
	const influenceMode = useDesignerStore((state) => state.influenceMode);
	const canvasTheme = useDesignerStore((state) => state.canvasTheme);
	const fitViewVersion = useDesignerStore((state) => state.fitViewVersion);

	const selectPreset = useDesignerStore((state) => state.selectPreset);
	const cancelActiveAction = useDesignerStore(
		(state) => state.cancelActiveAction
	);
	const placeBuildingAt = useDesignerStore((state) => state.placeBuildingAt);
	const placeBuildingsAtPoints = useDesignerStore(
		(state) => state.placeBuildingsAtPoints
	);
	const eraseAtCell = useDesignerStore((state) => state.eraseAtCell);
	const eraseAtCells = useDesignerStore((state) => state.eraseAtCells);
	const moveBuildingsByDelta = useDesignerStore(
		(state) => state.moveBuildingsByDelta
	);
	const setSelectedIds = useDesignerStore((state) => state.setSelectedIds);
	const setHoveredBuildingId = useDesignerStore(
		(state) => state.setHoveredBuildingId
	);

	const imageCacheVersion = useImageCacheVersion();

	useEffect((): void => {
		if (activePresetId) {
			ensureImageLoaded(PRESET_BY_ID.get(activePresetId)?.iconUrl);
		}
		if (paletteDraggedPresetId) {
			ensureImageLoaded(PRESET_BY_ID.get(paletteDraggedPresetId)?.iconUrl);
		}
	}, [activePresetId, paletteDraggedPresetId]);

	const syncContainerBounds = useCallback((): void => {
		const element = containerRef.current;
		if (!element) {
			return;
		}
		const bounds = element.getBoundingClientRect();
		containerBoundsRef.current = {
			left: bounds.left,
			top: bounds.top,
			width: bounds.width,
			height: bounds.height,
		};
		if (bounds.width > 0 && bounds.height > 0) {
			const nextWidth = Math.floor(bounds.width);
			const nextHeight = Math.floor(bounds.height);
			setStageSize((previous) =>
				previous.width === nextWidth && previous.height === nextHeight
					? previous
					: { width: nextWidth, height: nextHeight }
			);
		}
	}, []);

	// Track container dimensions & cached client offset without layout thrashing
	useEffect((): (() => void) => {
		const element = containerRef.current;
		if (!element) {
			return (): void => {};
		}
		syncContainerBounds();
		const observer = new ResizeObserver(syncContainerBounds);
		observer.observe(element);
		window.addEventListener("resize", syncContainerBounds, { passive: true });
		return (): void => {
			observer.disconnect();
			window.removeEventListener("resize", syncContainerBounds);
		};
	}, [syncContainerBounds]);

	useEffect((): (() => void) => {
		return (): void => {
			if (viewportAnimationFrameRef.current !== null) {
				cancelAnimationFrame(viewportAnimationFrameRef.current);
				viewportAnimationFrameRef.current = null;
			}
		};
	}, []);

	const applyViewportImmediate = useCallback(
		(nextViewport: ViewportTransform): void => {
			if (viewportAnimationFrameRef.current !== null) {
				cancelAnimationFrame(viewportAnimationFrameRef.current);
				viewportAnimationFrameRef.current = null;
			}
			viewportRef.current = nextViewport;
			stageRef.current?.setAttrs({
				x: nextViewport.x,
				y: nextViewport.y,
				scaleX: nextViewport.scale,
				scaleY: nextViewport.scale,
			});
			setViewport(nextViewport);
		},
		[stageRef]
	);

	const applyViewportSmooth = useCallback(
		(nextViewport: ViewportTransform): void => {
			viewportRef.current = nextViewport;
			stageRef.current?.setAttrs({
				x: nextViewport.x,
				y: nextViewport.y,
				scaleX: nextViewport.scale,
				scaleY: nextViewport.scale,
			});
			stageRef.current?.batchDraw();
			if (viewportAnimationFrameRef.current === null) {
				viewportAnimationFrameRef.current = requestAnimationFrame(() => {
					viewportAnimationFrameRef.current = null;
					setViewport(viewportRef.current);
				});
			}
		},
		[stageRef]
	);

	const fitLayoutInViewport = useCallback((): void => {
		if (stageSize.width <= 0 || stageSize.height <= 0) {
			return;
		}
		const currentBuildings = useDesignerStore.getState().buildings;
		if (currentBuildings.length === 0) {
			const defaultScale = stageSize.width < 640 ? 0.65 : 0.95;
			applyViewportImmediate({
				scale: defaultScale,
				x: Math.round(
					stageSize.width / 2 - (gridWidth * CELL_SIZE * defaultScale) / 2
				),
				y: Math.round(
					stageSize.height / 2 - (gridHeight * CELL_SIZE * defaultScale) / 2
				),
			});
			return;
		}

		let minimumX = Number.POSITIVE_INFINITY;
		let minimumY = Number.POSITIVE_INFINITY;
		let maximumX = Number.NEGATIVE_INFINITY;
		let maximumY = Number.NEGATIVE_INFINITY;
		for (const item of currentBuildings) {
			minimumX = Math.min(minimumX, item.x);
			minimumY = Math.min(minimumY, item.y);
			maximumX = Math.max(maximumX, item.x + item.width);
			maximumY = Math.max(maximumY, item.y + item.height);
		}

		const paddingTiles = stageSize.width < 640 ? 4 : 8;
		const contentWidthPx = (maximumX - minimumX + paddingTiles * 2) * CELL_SIZE;
		const contentHeightPx =
			(maximumY - minimumY + paddingTiles * 2) * CELL_SIZE;
		const nextScale = clampValue(
			Math.min(
				stageSize.width / contentWidthPx,
				stageSize.height / contentHeightPx
			),
			MIN_SCALE,
			1.35
		);

		const centerWorldX = ((minimumX + maximumX) / 2) * CELL_SIZE;
		const centerWorldY = ((minimumY + maximumY) / 2) * CELL_SIZE;

		applyViewportImmediate({
			scale: Number(nextScale.toFixed(3)),
			x: Math.round(stageSize.width / 2 - centerWorldX * nextScale),
			y: Math.round(stageSize.height / 2 - centerWorldY * nextScale),
		});
	}, [
		applyViewportImmediate,
		gridHeight,
		gridWidth,
		stageSize.height,
		stageSize.width,
	]);

	useEffect((): void => {
		if (
			stageSize.width > 0 &&
			stageSize.height > 0 &&
			!hasInitializedViewRef.current
		) {
			hasInitializedViewRef.current = true;
			fitLayoutInViewport();
		}
	}, [fitLayoutInViewport, stageSize.height, stageSize.width]);

	const previousFitVersionRef = useRef<number>(fitViewVersion);
	useEffect((): void => {
		if (previousFitVersionRef.current !== fitViewVersion) {
			previousFitVersionRef.current = fitViewVersion;
			fitLayoutInViewport();
		}
	}, [fitLayoutInViewport, fitViewVersion]);

	// Spacebar hold for quick panning
	useEffect((): (() => void) => {
		const handleKeyDown = (event: KeyboardEvent): void => {
			const target = event.target as HTMLElement | null;
			if (
				target &&
				(target.tagName === "INPUT" ||
					target.tagName === "TEXTAREA" ||
					target.isContentEditable)
			) {
				return;
			}
			if (event.code === "Space") {
				event.preventDefault();
				setIsSpacePressed((previous) => (previous ? previous : true));
			}
		};
		const handleKeyUp = (event: KeyboardEvent): void => {
			if (event.code === "Space") {
				setIsSpacePressed(false);
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		window.addEventListener("keyup", handleKeyUp);
		return (): void => {
			window.removeEventListener("keydown", handleKeyDown);
			window.removeEventListener("keyup", handleKeyUp);
		};
	}, []);

	// Shared O(1) spatial grid index for current buildings
	const spatialIndex = useMemo(
		() => getSpatialIndex(buildings, gridWidth, gridHeight),
		[buildings, gridHeight, gridWidth]
	);

	// Stable moving ID set across drag deltas so stationary BuildingsLayer never redraws mid-drag
	const movingIdList = dragMove?.movingIds;
	const movingIdSet = useMemo(
		(): ReadonlySet<string> =>
			movingIdList && movingIdList.length > 0
				? new Set(movingIdList)
				: EMPTY_STRING_SET,
		[movingIdList]
	);

	const isActivelyDraggingSelection = Boolean(
		dragMove && (dragMove.deltaX !== 0 || dragMove.deltaY !== 0)
	);

	const hiddenBuildingIds = isActivelyDraggingSelection
		? movingIdSet
		: EMPTY_STRING_SET;

	const isDragMoveValid = useMemo((): boolean => {
		if (!dragMove || (dragMove.deltaX === 0 && dragMove.deltaY === 0)) {
			return true;
		}
		for (const movingId of dragMove.movingIds) {
			const baseItem = spatialIndex.buildingById.get(movingId);
			if (!baseItem) {
				continue;
			}
			const candidate: GridRect = {
				x: baseItem.x + dragMove.deltaX,
				y: baseItem.y + dragMove.deltaY,
				width: baseItem.width,
				height: baseItem.height,
			};
			if (
				!spatialIndex.canPlace(candidate, gridWidth, gridHeight, movingIdSet)
			) {
				return false;
			}
		}
		return true;
	}, [dragMove, gridHeight, gridWidth, movingIdSet, spatialIndex]);

	const computeSnappedOrigin = useCallback(
		(
			tile: GridPoint,
			preset: BuildingPreset,
			rotated: boolean
		): {
			readonly x: number;
			readonly y: number;
			readonly width: number;
			readonly height: number;
		} => {
			const width = rotated ? preset.height : preset.width;
			const height = rotated ? preset.width : preset.height;
			const snappedX = clampValue(
				Math.round(tile.x + 0.5 - width / 2),
				0,
				Math.max(0, gridWidth - width)
			);
			const snappedY = clampValue(
				Math.round(tile.y + 0.5 - height / 2),
				0,
				Math.max(0, gridHeight - height)
			);
			return { x: snappedX, y: snappedY, width, height };
		},
		[gridHeight, gridWidth]
	);

	// Determine active ghost preset & snapped rectangle
	const effectiveGhostPreset = useMemo((): BuildingPreset | null => {
		if (isPaletteDragOver && paletteDraggedPresetId) {
			return PRESET_BY_ID.get(paletteDraggedPresetId) ?? null;
		}
		if (
			(activeTool === "place" || activeTool === "road") &&
			activePresetId &&
			!isSpacePressed &&
			!isPanning
		) {
			return PRESET_BY_ID.get(activePresetId) ?? null;
		}
		return null;
	}, [
		activePresetId,
		activeTool,
		isPaletteDragOver,
		isPanning,
		isSpacePressed,
		paletteDraggedPresetId,
	]);

	const ghostRect = useMemo((): GhostPlacementRect | null => {
		if (!effectiveGhostPreset || !cursorCell) {
			return null;
		}
		const isDraggingFromPalette = Boolean(
			isPaletteDragOver && paletteDraggedPresetId
		);
		const rotated = isDraggingFromPalette ? false : placementRotated;
		const {
			x: snappedX,
			y: snappedY,
			width,
			height,
		} = computeSnappedOrigin(cursorCell, effectiveGhostPreset, rotated);

		let valid = spatialIndex.canPlace(
			{ x: snappedX, y: snappedY, width, height },
			gridWidth,
			gridHeight
		);

		if (
			!valid &&
			width === 1 &&
			height === 1 &&
			effectiveGhostPreset.isBorderless
		) {
			const overlapping = spatialIndex.findBuildingAtTile(snappedX, snappedY);
			const overlappingPreset = overlapping
				? PRESET_BY_ID.get(overlapping.presetId)
				: undefined;
			if (
				overlapping &&
				overlappingPreset?.isBorderless &&
				overlapping.width === 1 &&
				overlapping.height === 1
			) {
				valid = true;
			}
		}

		return { x: snappedX, y: snappedY, width, height, valid };
	}, [
		computeSnappedOrigin,
		cursorCell,
		effectiveGhostPreset,
		gridHeight,
		gridWidth,
		isPaletteDragOver,
		paletteDraggedPresetId,
		placementRotated,
		spatialIndex,
	]);

	const selectedIdSet = useMemo(
		(): ReadonlySet<string> =>
			selectedIds.length > 0 ? new Set(selectedIds) : EMPTY_STRING_SET,
		[selectedIds]
	);

	// Determine visible influence circles using pre-indexed influenceBuildings
	const visibleInfluenceSources =
		useMemo((): ReadonlyArray<VisibleInfluenceSource> => {
			if (influenceMode === "none") {
				return EMPTY_INFLUENCE_SOURCES;
			}

			const sources: Array<VisibleInfluenceSource> = [];

			for (const entry of spatialIndex.influenceBuildings) {
				const item = entry.building;
				const isSelected = selectedIdSet.has(item.id);
				const isHovered = hoveredBuildingId === item.id;

				const shouldInclude =
					influenceMode === "all" ||
					(influenceMode === "services" &&
						(entry.isServiceBuilding || isSelected || isHovered)) ||
					(influenceMode === "active" && (isSelected || isHovered));

				if (shouldInclude) {
					const isMovingItem =
						isActivelyDraggingSelection && movingIdSet.has(item.id);
					const effectiveRect: GridRect =
						isMovingItem && dragMove
							? {
									x: item.x + dragMove.deltaX,
									y: item.y + dragMove.deltaY,
									width: item.width,
									height: item.height,
								}
							: item;
					sources.push({
						key: item.id,
						rect: effectiveRect,
						radius: entry.radius,
						color: item.customColor ?? entry.preset.cssColor,
						isPrimary: isSelected || isHovered,
					});
				}
			}

			if (
				ghostRect &&
				effectiveGhostPreset &&
				effectiveGhostPreset.influenceRadius > 0
			) {
				sources.push({
					key: "ghost_influence",
					rect: ghostRect,
					radius: effectiveGhostPreset.influenceRadius,
					color: effectiveGhostPreset.cssColor,
					isPrimary: true,
				});
			}

			return sources.length > 0 ? sources : EMPTY_INFLUENCE_SOURCES;
		}, [
			dragMove,
			effectiveGhostPreset,
			ghostRect,
			hoveredBuildingId,
			influenceMode,
			isActivelyDraggingSelection,
			movingIdSet,
			selectedIdSet,
			spatialIndex,
		]);

	// Primary source for highlighting covered buildings on the canvas
	const primaryCoverageSource = useMemo((): {
		readonly rect: GridRect;
		readonly radius: number;
	} | null => {
		if (
			ghostRect &&
			effectiveGhostPreset &&
			effectiveGhostPreset.influenceRadius > 0
		) {
			return { rect: ghostRect, radius: effectiveGhostPreset.influenceRadius };
		}
		if (selectedIds.length === 1 && selectedIds[0]) {
			const selectedBuilding = spatialIndex.buildingById.get(selectedIds[0]);
			const preset = selectedBuilding
				? PRESET_BY_ID.get(selectedBuilding.presetId)
				: undefined;
			if (selectedBuilding && preset && preset.influenceRadius > 0) {
				const effectiveRect: GridRect =
					isActivelyDraggingSelection &&
					dragMove &&
					movingIdSet.has(selectedBuilding.id)
						? {
								x: selectedBuilding.x + dragMove.deltaX,
								y: selectedBuilding.y + dragMove.deltaY,
								width: selectedBuilding.width,
								height: selectedBuilding.height,
							}
						: selectedBuilding;
				return {
					rect: effectiveRect,
					radius: preset.influenceRadius,
				};
			}
		}
		if (hoveredBuildingId && !effectiveGhostPreset) {
			const hoveredBuilding = spatialIndex.buildingById.get(hoveredBuildingId);
			const preset = hoveredBuilding
				? PRESET_BY_ID.get(hoveredBuilding.presetId)
				: undefined;
			if (hoveredBuilding && preset && preset.influenceRadius > 0) {
				return {
					rect: hoveredBuilding,
					radius: preset.influenceRadius,
				};
			}
		}
		return null;
	}, [
		dragMove,
		effectiveGhostPreset,
		ghostRect,
		hoveredBuildingId,
		isActivelyDraggingSelection,
		movingIdSet,
		selectedIds,
		spatialIndex,
	]);

	const coveredBuildingIds = useMemo(
		(): ReadonlySet<string> =>
			computeHighlightedCoveredIds({
				spatialIndex,
				selectedIds,
				hoveredBuildingId,
				influenceMode,
				ghostRect,
				ghostPreset: effectiveGhostPreset,
				isActivelyDraggingSelection,
				movingIdSet,
				dragDeltaX: dragMove?.deltaX ?? 0,
				dragDeltaY: dragMove?.deltaY ?? 0,
			}),
		[
			dragMove,
			effectiveGhostPreset,
			ghostRect,
			hoveredBuildingId,
			influenceMode,
			isActivelyDraggingSelection,
			movingIdSet,
			selectedIds,
			spatialIndex,
		]
	);

	const discreteCoverageSpans = useMemo((): ReadonlyArray<TileSpan> => {
		if (
			!showDiscreteTiles ||
			!primaryCoverageSource ||
			influenceMode === "none"
		) {
			return EMPTY_TILE_SPANS;
		}
		const spans = computeCoveredTileSpans(
			primaryCoverageSource.rect,
			primaryCoverageSource.radius,
			gridWidth,
			gridHeight
		);
		return spans.length > 0 ? spans : EMPTY_TILE_SPANS;
	}, [
		gridHeight,
		gridWidth,
		influenceMode,
		primaryCoverageSource,
		showDiscreteTiles,
	]);

	const screenToWorld = useCallback(
		(stageX: number, stageY: number): { worldX: number; worldY: number } => {
			const currentViewport = viewportRef.current;
			return {
				worldX: (stageX - currentViewport.x) / currentViewport.scale,
				worldY: (stageY - currentViewport.y) / currentViewport.scale,
			};
		},
		[]
	);

	const clearCursorCell = useCallback((): void => {
		if (cursorCellRef.current !== null) {
			cursorCellRef.current = null;
			setCursorCell(null);
		}
	}, []);

	const updateCursorFromStagePoint = useCallback(
		(
			stageX: number,
			stageY: number
		): { readonly tile: GridPoint; readonly changed: boolean } => {
			const { worldX, worldY } = screenToWorld(stageX, stageY);
			const tileX = Math.floor(worldX / CELL_SIZE);
			const tileY = Math.floor(worldY / CELL_SIZE);
			const previous = cursorCellRef.current;
			if (previous && previous.x === tileX && previous.y === tileY) {
				return { tile: previous, changed: false };
			}
			const nextTile: GridPoint = { x: tileX, y: tileY };
			cursorCellRef.current = nextTile;
			setCursorCell(nextTile);
			return { tile: nextTile, changed: true };
		},
		[screenToWorld]
	);

	const zoomAroundPoint = useCallback(
		(
			targetScale: number,
			anchorStageX: number,
			anchorStageY: number,
			immediate = false
		): void => {
			const currentViewport = viewportRef.current;
			const clampedScale = clampValue(targetScale, MIN_SCALE, MAX_SCALE);
			const worldPointX =
				(anchorStageX - currentViewport.x) / currentViewport.scale;
			const worldPointY =
				(anchorStageY - currentViewport.y) / currentViewport.scale;

			const nextViewport: ViewportTransform = {
				scale: Number(clampedScale.toFixed(3)),
				x: Math.round(anchorStageX - worldPointX * clampedScale),
				y: Math.round(anchorStageY - worldPointY * clampedScale),
			};
			if (immediate) {
				applyViewportImmediate(nextViewport);
			} else {
				applyViewportSmooth(nextViewport);
			}
		},
		[applyViewportImmediate, applyViewportSmooth]
	);

	const handleWheel = useCallback(
		(event: Konva.KonvaEventObject<WheelEvent>): void => {
			event.evt.preventDefault();
			const stage = event.target.getStage();
			const pointer = stage?.getPointerPosition();
			if (!pointer) {
				return;
			}
			const zoomFactor = event.evt.deltaY < 0 ? 1.1 : 1 / 1.1;
			zoomAroundPoint(
				viewportRef.current.scale * zoomFactor,
				pointer.x,
				pointer.y,
				false
			);
		},
		[zoomAroundPoint]
	);

	const findBuildingAtTile = useCallback(
		(tileX: number, tileY: number): PlacedBuilding | undefined =>
			spatialIndex.findBuildingAtTile(tileX, tileY),
		[spatialIndex]
	);

	const readStageTouches = useCallback(
		(touchList: TouchList): Array<StageTouchPoint> => {
			const bounds = containerBoundsRef.current;
			const points: Array<StageTouchPoint> = [];
			for (let index = 0; index < touchList.length; index += 1) {
				const touch = touchList.item(index);
				if (touch) {
					points.push({
						stageX: touch.clientX - bounds.left,
						stageY: touch.clientY - bounds.top,
						clientX: touch.clientX,
						clientY: touch.clientY,
					});
				}
			}
			return points;
		},
		[]
	);

	const beginPanSession = useCallback(
		(clientX: number, clientY: number, button: number): void => {
			const currentViewport = viewportRef.current;
			panSessionRef.current = {
				startClientX: clientX,
				startClientY: clientY,
				startViewportX: currentViewport.x,
				startViewportY: currentViewport.y,
				button,
				movedDistance: 0,
			};
			setIsPanning(true);
		},
		[]
	);

	const endPanSession = useCallback((): void => {
		panSessionRef.current = null;
		setIsPanning(false);
	}, []);

	const handleStageMouseDown = useCallback(
		(event: Konva.KonvaEventObject<MouseEvent>): void => {
			if (Date.now() - lastTouchTimestampRef.current < 500) {
				return;
			}
			const nativeEvent = event.evt;
			const stage = event.target.getStage();
			const pointer = stage?.getPointerPosition();
			if (!pointer) {
				return;
			}

			// Middle button, right button, Spacebar, or Pan tool initiates pan tracking
			if (
				nativeEvent.button === 1 ||
				nativeEvent.button === 2 ||
				isSpacePressed ||
				activeTool === "pan"
			) {
				beginPanSession(
					nativeEvent.clientX,
					nativeEvent.clientY,
					nativeEvent.button
				);
				return;
			}

			if (nativeEvent.button !== 0) {
				return;
			}

			const { tile } = updateCursorFromStagePoint(pointer.x, pointer.y);
			const { worldX, worldY } = screenToWorld(pointer.x, pointer.y);
			const isAdditiveSelection = nativeEvent.shiftKey || isMultiSelectMode;

			// Alt + Click anywhere acts as Eyedropper
			if (nativeEvent.altKey || activeTool === "eyedropper") {
				const picked = findBuildingAtTile(tile.x, tile.y);
				if (picked) {
					selectPreset(picked.presetId, picked.rotated);
				}
				return;
			}

			if (activeTool === "erase") {
				const erased = eraseAtCell(tile.x, tile.y, true);
				paintStrokeRef.current = {
					mode: "erase",
					lastCell: tile,
					hasRecordedHistory: erased,
				};
				return;
			}

			if (activeTool === "place" || activeTool === "road") {
				const preset = activePresetId
					? PRESET_BY_ID.get(activePresetId)
					: undefined;
				if (preset) {
					const snapped = computeSnappedOrigin(tile, preset, placementRotated);
					const placedId = placeBuildingAt(snapped.x, snapped.y, {
						recordHistory: true,
					});
					paintStrokeRef.current = {
						mode: "place",
						lastCell: { x: snapped.x, y: snapped.y },
						hasRecordedHistory: placedId !== null,
					};
				}
				return;
			}

			// Select tool: check if clicking on a placed building or starting marquee
			const clickedBuilding = findBuildingAtTile(tile.x, tile.y);
			if (clickedBuilding) {
				if (isAdditiveSelection) {
					setSelectedIds([clickedBuilding.id], true);
					return;
				}
				const nextMovingIds = selectedIdSet.has(clickedBuilding.id)
					? selectedIds
					: [clickedBuilding.id];
				if (!selectedIdSet.has(clickedBuilding.id)) {
					setSelectedIds([clickedBuilding.id], false);
				}
				setDragMove({
					movingIds: nextMovingIds,
					anchorWorldX: worldX,
					anchorWorldY: worldY,
					deltaX: 0,
					deltaY: 0,
					hasMoved: false,
				});
			} else {
				if (!isAdditiveSelection) {
					setSelectedIds([], false);
				}
				setMarquee({
					startWorldX: worldX,
					startWorldY: worldY,
					currentWorldX: worldX,
					currentWorldY: worldY,
					additive: isAdditiveSelection,
				});
			}
		},
		[
			activePresetId,
			activeTool,
			beginPanSession,
			computeSnappedOrigin,
			eraseAtCell,
			findBuildingAtTile,
			isMultiSelectMode,
			isSpacePressed,
			placeBuildingAt,
			placementRotated,
			screenToWorld,
			selectPreset,
			selectedIdSet,
			selectedIds,
			setSelectedIds,
			updateCursorFromStagePoint,
		]
	);

	const handleStageMouseMove = useCallback(
		(event: Konva.KonvaEventObject<MouseEvent>): void => {
			if (Date.now() - lastTouchTimestampRef.current < 500) {
				return;
			}
			const nativeEvent = event.evt;
			const stage = event.target.getStage();
			const pointer = stage?.getPointerPosition();
			if (!pointer) {
				return;
			}

			const activePan = panSessionRef.current;
			if (activePan) {
				const deltaX = nativeEvent.clientX - activePan.startClientX;
				const deltaY = nativeEvent.clientY - activePan.startClientY;
				const distance = Math.hypot(deltaX, deltaY);
				if (distance > activePan.movedDistance) {
					activePan.movedDistance = distance;
				}
				applyViewportSmooth({
					scale: viewportRef.current.scale,
					x: Math.round(activePan.startViewportX + deltaX),
					y: Math.round(activePan.startViewportY + deltaY),
				});
				return;
			}

			const { tile, changed: tileChanged } = updateCursorFromStagePoint(
				pointer.x,
				pointer.y
			);
			const { worldX, worldY } = screenToWorld(pointer.x, pointer.y);

			if (dragMove) {
				const deltaGridX = Math.round(
					(worldX - dragMove.anchorWorldX) / CELL_SIZE
				);
				const deltaGridY = Math.round(
					(worldY - dragMove.anchorWorldY) / CELL_SIZE
				);
				if (deltaGridX !== dragMove.deltaX || deltaGridY !== dragMove.deltaY) {
					setDragMove({
						...dragMove,
						deltaX: deltaGridX,
						deltaY: deltaGridY,
						hasMoved: dragMove.hasMoved || deltaGridX !== 0 || deltaGridY !== 0,
					});
				}
				return;
			}

			if (marquee) {
				setMarquee({
					...marquee,
					currentWorldX: worldX,
					currentWorldY: worldY,
				});
				return;
			}

			const activeStroke = paintStrokeRef.current;
			if (activeStroke) {
				if (activeStroke.mode === "erase") {
					if (
						tile.x !== activeStroke.lastCell.x ||
						tile.y !== activeStroke.lastCell.y
					) {
						const cells = computeLineCells(
							activeStroke.lastCell,
							tile,
							nativeEvent.shiftKey
						);
						const removedCount = eraseAtCells(
							cells,
							!activeStroke.hasRecordedHistory
						);
						paintStrokeRef.current = {
							mode: "erase",
							lastCell: tile,
							hasRecordedHistory:
								activeStroke.hasRecordedHistory || removedCount > 0,
						};
					}
					return;
				}

				if (activeStroke.mode === "place" && effectiveGhostPreset) {
					const snapped = computeSnappedOrigin(
						tile,
						effectiveGhostPreset,
						placementRotated
					);
					const targetOrigin: GridPoint = { x: snapped.x, y: snapped.y };
					if (
						targetOrigin.x !== activeStroke.lastCell.x ||
						targetOrigin.y !== activeStroke.lastCell.y
					) {
						const pathCells = computeLineCells(
							activeStroke.lastCell,
							targetOrigin,
							nativeEvent.shiftKey
						);
						const placedCount = placeBuildingsAtPoints(pathCells, {
							recordHistory: !activeStroke.hasRecordedHistory,
						});
						paintStrokeRef.current = {
							mode: "place",
							lastCell: targetOrigin,
							hasRecordedHistory:
								activeStroke.hasRecordedHistory || placedCount > 0,
						};
					}
				}
				return;
			}

			// Hover detection only when not showing a placement ghost & only when cursor tile changed
			if (effectiveGhostPreset || activeTool === "pan") {
				if (hoveredBuildingId !== null) {
					setHoveredBuildingId(null);
				}
				return;
			}

			if (tileChanged) {
				const hovered = findBuildingAtTile(tile.x, tile.y);
				setHoveredBuildingId(hovered?.id ?? null);
			}
		},
		[
			activeTool,
			applyViewportSmooth,
			computeSnappedOrigin,
			dragMove,
			effectiveGhostPreset,
			eraseAtCells,
			findBuildingAtTile,
			hoveredBuildingId,
			marquee,
			placeBuildingsAtPoints,
			placementRotated,
			screenToWorld,
			setHoveredBuildingId,
			updateCursorFromStagePoint,
		]
	);

	const finalizePointerInteraction = useCallback(
		(pointer?: { x: number; y: number } | null): void => {
			const activePan = panSessionRef.current;
			if (activePan) {
				// Quick right-click (< 5px movement) erases tile under cursor or cancels placement
				if (activePan.button === 2 && activePan.movedDistance < 5 && pointer) {
					const { tile } = updateCursorFromStagePoint(pointer.x, pointer.y);
					const hit = findBuildingAtTile(tile.x, tile.y);
					if (hit) {
						eraseAtCell(tile.x, tile.y, true);
					} else {
						cancelActiveAction();
					}
				} else if (
					activePan.button === TOUCH_PAN_EMPTY_BUTTON &&
					activePan.movedDistance < 6
				) {
					setSelectedIds([], false);
				}
				endPanSession();
				applyViewportImmediate(viewportRef.current);
			}

			if (dragMove) {
				if (
					dragMove.hasMoved &&
					(dragMove.deltaX !== 0 || dragMove.deltaY !== 0)
				) {
					moveBuildingsByDelta(
						dragMove.movingIds,
						dragMove.deltaX,
						dragMove.deltaY
					);
				}
				setDragMove(null);
			}

			if (marquee) {
				const minWorldX = Math.min(marquee.startWorldX, marquee.currentWorldX);
				const maxWorldX = Math.max(marquee.startWorldX, marquee.currentWorldX);
				const minWorldY = Math.min(marquee.startWorldY, marquee.currentWorldY);
				const maxWorldY = Math.max(marquee.startWorldY, marquee.currentWorldY);

				if (maxWorldX - minWorldX > 4 || maxWorldY - minWorldY > 4) {
					const selectionBox: GridRect = {
						x: minWorldX / CELL_SIZE,
						y: minWorldY / CELL_SIZE,
						width: (maxWorldX - minWorldX) / CELL_SIZE,
						height: (maxWorldY - minWorldY) / CELL_SIZE,
					};
					const matchedIds = buildings
						.filter((item) => rectanglesOverlapFast(item, selectionBox))
						.map((item) => item.id);
					setSelectedIds(matchedIds, marquee.additive);
				}
				setMarquee(null);
			}

			paintStrokeRef.current = null;
		},
		[
			applyViewportImmediate,
			buildings,
			cancelActiveAction,
			dragMove,
			endPanSession,
			eraseAtCell,
			findBuildingAtTile,
			marquee,
			moveBuildingsByDelta,
			setSelectedIds,
			updateCursorFromStagePoint,
		]
	);

	const handleStageMouseUp = useCallback(
		(event: Konva.KonvaEventObject<MouseEvent>): void => {
			if (Date.now() - lastTouchTimestampRef.current < 500) {
				return;
			}
			const stage = event.target.getStage();
			finalizePointerInteraction(stage?.getPointerPosition());
		},
		[finalizePointerInteraction]
	);

	// Touch gesture handlers (2-finger pinch-zoom + pan, 1-finger smart tool interaction)
	const startPinchZoom = useCallback(
		(firstTouch: StageTouchPoint, secondTouch: StageTouchPoint): void => {
			wasMultiTouchGestureRef.current = true;
			paintStrokeRef.current = null;
			pendingTouchStrokeRef.current = null;
			touchPlacePreviewRef.current = null;
			setDragMove(null);
			setMarquee(null);
			endPanSession();
			clearCursorCell();

			const currentViewport = viewportRef.current;
			const midpointX = (firstTouch.stageX + secondTouch.stageX) / 2;
			const midpointY = (firstTouch.stageY + secondTouch.stageY) / 2;
			const initialDistance = Math.max(
				8,
				Math.hypot(
					secondTouch.stageX - firstTouch.stageX,
					secondTouch.stageY - firstTouch.stageY
				)
			);

			pinchSessionRef.current = {
				initialDistance,
				initialScale: currentViewport.scale,
				anchorWorldX: (midpointX - currentViewport.x) / currentViewport.scale,
				anchorWorldY: (midpointY - currentViewport.y) / currentViewport.scale,
			};
		},
		[clearCursorCell, endPanSession]
	);

	const handleStageTouchStart = useCallback(
		(event: Konva.KonvaEventObject<TouchEvent>): void => {
			lastTouchTimestampRef.current = Date.now();
			const nativeEvent = event.evt;
			if (nativeEvent.cancelable) {
				nativeEvent.preventDefault();
			}

			syncContainerBounds();
			const touches = readStageTouches(nativeEvent.touches);
			if (touches.length >= 2 && touches[0] && touches[1]) {
				startPinchZoom(touches[0], touches[1]);
				return;
			}

			if (touches.length !== 1 || !touches[0]) {
				return;
			}

			wasMultiTouchGestureRef.current = false;
			pinchSessionRef.current = null;
			const touchPoint = touches[0];

			if (activeTool === "pan" || isSpacePressed) {
				beginPanSession(touchPoint.clientX, touchPoint.clientY, 0);
				return;
			}

			const { tile } = updateCursorFromStagePoint(
				touchPoint.stageX,
				touchPoint.stageY
			);
			const { worldX, worldY } = screenToWorld(
				touchPoint.stageX,
				touchPoint.stageY
			);

			if (activeTool === "eyedropper") {
				const picked = findBuildingAtTile(tile.x, tile.y);
				if (picked) {
					selectPreset(picked.presetId, picked.rotated);
				}
				clearCursorCell();
				return;
			}

			if (activeTool === "erase") {
				pendingTouchStrokeRef.current = {
					mode: "erase",
					startTile: tile,
					startClientX: touchPoint.clientX,
					startClientY: touchPoint.clientY,
				};
				return;
			}

			if (activeTool === "road" || activeTool === "place") {
				const preset = activePresetId
					? PRESET_BY_ID.get(activePresetId)
					: undefined;
				if (!preset) {
					return;
				}
				const isSingleTileBrush =
					activeTool === "road" ||
					(preset.width === 1 && preset.height === 1 && preset.isBorderless);
				if (isSingleTileBrush) {
					pendingTouchStrokeRef.current = {
						mode: "place",
						startTile: tile,
						startClientX: touchPoint.clientX,
						startClientY: touchPoint.clientY,
					};
				} else {
					touchPlacePreviewRef.current = tile;
				}
				return;
			}

			// Select tool on touch
			const clickedBuilding = findBuildingAtTile(tile.x, tile.y);
			if (clickedBuilding) {
				if (isMultiSelectMode) {
					setSelectedIds([clickedBuilding.id], true);
					return;
				}
				const nextMovingIds = selectedIdSet.has(clickedBuilding.id)
					? selectedIds
					: [clickedBuilding.id];
				if (!selectedIdSet.has(clickedBuilding.id)) {
					setSelectedIds([clickedBuilding.id], false);
				}
				setDragMove({
					movingIds: nextMovingIds,
					anchorWorldX: worldX,
					anchorWorldY: worldY,
					deltaX: 0,
					deltaY: 0,
					hasMoved: false,
				});
			} else if (isMultiSelectMode) {
				setMarquee({
					startWorldX: worldX,
					startWorldY: worldY,
					currentWorldX: worldX,
					currentWorldY: worldY,
					additive: true,
				});
			} else {
				// 1-finger drag on empty canvas pans smoothly; tap deselects
				beginPanSession(
					touchPoint.clientX,
					touchPoint.clientY,
					TOUCH_PAN_EMPTY_BUTTON
				);
			}
		},
		[
			activePresetId,
			activeTool,
			beginPanSession,
			clearCursorCell,
			findBuildingAtTile,
			isMultiSelectMode,
			isSpacePressed,
			readStageTouches,
			screenToWorld,
			selectPreset,
			selectedIdSet,
			selectedIds,
			setSelectedIds,
			startPinchZoom,
			syncContainerBounds,
			updateCursorFromStagePoint,
		]
	);

	const handleStageTouchMove = useCallback(
		(event: Konva.KonvaEventObject<TouchEvent>): void => {
			lastTouchTimestampRef.current = Date.now();
			const nativeEvent = event.evt;
			if (nativeEvent.cancelable) {
				nativeEvent.preventDefault();
			}

			const touches = readStageTouches(nativeEvent.touches);
			if (touches.length >= 2 && touches[0] && touches[1]) {
				if (!pinchSessionRef.current) {
					startPinchZoom(touches[0], touches[1]);
					return;
				}
				const session = pinchSessionRef.current;
				const midpointX = (touches[0].stageX + touches[1].stageX) / 2;
				const midpointY = (touches[0].stageY + touches[1].stageY) / 2;
				const currentDistance = Math.max(
					8,
					Math.hypot(
						touches[1].stageX - touches[0].stageX,
						touches[1].stageY - touches[0].stageY
					)
				);
				const nextScale = clampValue(
					session.initialScale * (currentDistance / session.initialDistance),
					MIN_SCALE,
					MAX_SCALE
				);
				applyViewportSmooth({
					scale: Number(nextScale.toFixed(3)),
					x: Math.round(midpointX - session.anchorWorldX * nextScale),
					y: Math.round(midpointY - session.anchorWorldY * nextScale),
				});
				return;
			}

			if (
				wasMultiTouchGestureRef.current ||
				touches.length !== 1 ||
				!touches[0]
			) {
				return;
			}

			const touchPoint = touches[0];

			const activePan = panSessionRef.current;
			if (activePan) {
				const deltaX = touchPoint.clientX - activePan.startClientX;
				const deltaY = touchPoint.clientY - activePan.startClientY;
				const distance = Math.hypot(deltaX, deltaY);
				if (distance > activePan.movedDistance) {
					activePan.movedDistance = distance;
				}
				applyViewportSmooth({
					scale: viewportRef.current.scale,
					x: Math.round(activePan.startViewportX + deltaX),
					y: Math.round(activePan.startViewportY + deltaY),
				});
				return;
			}

			const { tile } = updateCursorFromStagePoint(
				touchPoint.stageX,
				touchPoint.stageY
			);
			const { worldX, worldY } = screenToWorld(
				touchPoint.stageX,
				touchPoint.stageY
			);

			if (touchPlacePreviewRef.current) {
				touchPlacePreviewRef.current = tile;
				return;
			}

			const pendingStroke = pendingTouchStrokeRef.current;
			if (pendingStroke) {
				const fingerMoveDistance = Math.hypot(
					touchPoint.clientX - pendingStroke.startClientX,
					touchPoint.clientY - pendingStroke.startClientY
				);
				if (
					fingerMoveDistance >= 6 ||
					tile.x !== pendingStroke.startTile.x ||
					tile.y !== pendingStroke.startTile.y
				) {
					pendingTouchStrokeRef.current = null;
					if (pendingStroke.mode === "erase") {
						const initialCells = computeLineCells(
							pendingStroke.startTile,
							tile,
							false
						);
						const removedCount = eraseAtCells(initialCells, true);
						paintStrokeRef.current = {
							mode: "erase",
							lastCell: tile,
							hasRecordedHistory: removedCount > 0,
						};
					} else if (effectiveGhostPreset) {
						const startSnapped = computeSnappedOrigin(
							pendingStroke.startTile,
							effectiveGhostPreset,
							placementRotated
						);
						const currentSnapped = computeSnappedOrigin(
							tile,
							effectiveGhostPreset,
							placementRotated
						);
						const initialCells = computeLineCells(
							{ x: startSnapped.x, y: startSnapped.y },
							{ x: currentSnapped.x, y: currentSnapped.y },
							false
						);
						const placedCount = placeBuildingsAtPoints(initialCells, {
							recordHistory: true,
						});
						paintStrokeRef.current = {
							mode: "place",
							lastCell: { x: currentSnapped.x, y: currentSnapped.y },
							hasRecordedHistory: placedCount > 0,
						};
					}
				}
				return;
			}

			const activeStroke = paintStrokeRef.current;
			if (activeStroke) {
				if (activeStroke.mode === "erase") {
					if (
						tile.x !== activeStroke.lastCell.x ||
						tile.y !== activeStroke.lastCell.y
					) {
						const cells = computeLineCells(activeStroke.lastCell, tile, false);
						const removedCount = eraseAtCells(
							cells,
							!activeStroke.hasRecordedHistory
						);
						paintStrokeRef.current = {
							mode: "erase",
							lastCell: tile,
							hasRecordedHistory:
								activeStroke.hasRecordedHistory || removedCount > 0,
						};
					}
					return;
				}
				if (activeStroke.mode === "place" && effectiveGhostPreset) {
					const snapped = computeSnappedOrigin(
						tile,
						effectiveGhostPreset,
						placementRotated
					);
					const targetOrigin: GridPoint = { x: snapped.x, y: snapped.y };
					if (
						targetOrigin.x !== activeStroke.lastCell.x ||
						targetOrigin.y !== activeStroke.lastCell.y
					) {
						const pathCells = computeLineCells(
							activeStroke.lastCell,
							targetOrigin,
							false
						);
						const placedCount = placeBuildingsAtPoints(pathCells, {
							recordHistory: !activeStroke.hasRecordedHistory,
						});
						paintStrokeRef.current = {
							mode: "place",
							lastCell: targetOrigin,
							hasRecordedHistory:
								activeStroke.hasRecordedHistory || placedCount > 0,
						};
					}
				}
				return;
			}

			if (dragMove) {
				const deltaGridX = Math.round(
					(worldX - dragMove.anchorWorldX) / CELL_SIZE
				);
				const deltaGridY = Math.round(
					(worldY - dragMove.anchorWorldY) / CELL_SIZE
				);
				if (deltaGridX !== dragMove.deltaX || deltaGridY !== dragMove.deltaY) {
					setDragMove({
						...dragMove,
						deltaX: deltaGridX,
						deltaY: deltaGridY,
						hasMoved: dragMove.hasMoved || deltaGridX !== 0 || deltaGridY !== 0,
					});
				}
				return;
			}

			if (marquee) {
				setMarquee({
					...marquee,
					currentWorldX: worldX,
					currentWorldY: worldY,
				});
			}
		},
		[
			applyViewportSmooth,
			computeSnappedOrigin,
			dragMove,
			effectiveGhostPreset,
			eraseAtCells,
			marquee,
			placeBuildingsAtPoints,
			placementRotated,
			readStageTouches,
			screenToWorld,
			startPinchZoom,
			updateCursorFromStagePoint,
		]
	);

	const handleStageTouchEnd = useCallback(
		(event: Konva.KonvaEventObject<TouchEvent>): void => {
			lastTouchTimestampRef.current = Date.now();
			const nativeEvent = event.evt;
			if (nativeEvent.cancelable) {
				nativeEvent.preventDefault();
			}

			if (nativeEvent.touches.length > 0) {
				pinchSessionRef.current = null;
				return;
			}

			pinchSessionRef.current = null;
			if (wasMultiTouchGestureRef.current) {
				wasMultiTouchGestureRef.current = false;
				applyViewportImmediate(viewportRef.current);
				return;
			}

			const pendingStroke = pendingTouchStrokeRef.current;
			if (pendingStroke) {
				pendingTouchStrokeRef.current = null;
				if (pendingStroke.mode === "erase") {
					eraseAtCell(
						pendingStroke.startTile.x,
						pendingStroke.startTile.y,
						true
					);
				} else if (activePresetId) {
					const preset = PRESET_BY_ID.get(activePresetId);
					if (preset) {
						const snapped = computeSnappedOrigin(
							pendingStroke.startTile,
							preset,
							placementRotated
						);
						placeBuildingAt(snapped.x, snapped.y, { recordHistory: true });
					}
				}
				clearCursorCell();
				return;
			}

			const previewTile = touchPlacePreviewRef.current;
			if (previewTile) {
				touchPlacePreviewRef.current = null;
				const preset = activePresetId
					? PRESET_BY_ID.get(activePresetId)
					: undefined;
				if (preset) {
					const snapped = computeSnappedOrigin(
						previewTile,
						preset,
						placementRotated
					);
					placeBuildingAt(snapped.x, snapped.y, { recordHistory: true });
				}
				clearCursorCell();
				return;
			}

			finalizePointerInteraction(null);
			clearCursorCell();
		},
		[
			activePresetId,
			applyViewportImmediate,
			clearCursorCell,
			computeSnappedOrigin,
			eraseAtCell,
			finalizePointerInteraction,
			placeBuildingAt,
			placementRotated,
		]
	);

	// HTML5 Drag & Drop handlers from Sidebar Palette
	const handleHtmlDragOver = useCallback(
		(event: React.DragEvent<HTMLDivElement>): void => {
			event.preventDefault();
			event.dataTransfer.dropEffect = "copy";
			if (!isPaletteDragOver) {
				syncContainerBounds();
				setIsPaletteDragOver(true);
			}
			const bounds = containerBoundsRef.current;
			updateCursorFromStagePoint(
				event.clientX - bounds.left,
				event.clientY - bounds.top
			);
		},
		[isPaletteDragOver, syncContainerBounds, updateCursorFromStagePoint]
	);

	const handleHtmlDragLeave = useCallback(
		(event: React.DragEvent<HTMLDivElement>): void => {
			const container = containerRef.current;
			if (
				container &&
				event.relatedTarget instanceof Node &&
				container.contains(event.relatedTarget)
			) {
				return;
			}
			setIsPaletteDragOver(false);
		},
		[]
	);

	const handleHtmlDrop = useCallback(
		(event: React.DragEvent<HTMLDivElement>): void => {
			event.preventDefault();
			setIsPaletteDragOver(false);
			const presetId =
				event.dataTransfer.getData("application/anno1404-preset") ||
				paletteDraggedPresetId;
			onClearPaletteDrag();

			if (!presetId) {
				return;
			}
			const preset = PRESET_BY_ID.get(presetId);
			if (!preset) {
				return;
			}

			syncContainerBounds();
			const bounds = containerBoundsRef.current;
			const { tile } = updateCursorFromStagePoint(
				event.clientX - bounds.left,
				event.clientY - bounds.top
			);
			const snapped = computeSnappedOrigin(tile, preset, false);

			const createdId = placeBuildingAt(snapped.x, snapped.y, {
				presetId,
				rotated: false,
				recordHistory: true,
			});
			if (createdId && activeTool === "select") {
				setSelectedIds([createdId], false);
			}
		},
		[
			activeTool,
			computeSnappedOrigin,
			onClearPaletteDrag,
			paletteDraggedPresetId,
			placeBuildingAt,
			setSelectedIds,
			syncContainerBounds,
			updateCursorFromStagePoint,
		]
	);

	const isDark = canvasTheme === "dark";

	const cursorStyle = useMemo((): string => {
		if (isPanning || isSpacePressed || activeTool === "pan") {
			return isPanning ? "grabbing" : "grab";
		}
		if (activeTool === "erase") {
			return "not-allowed";
		}
		if (activeTool === "eyedropper") {
			return "copy";
		}
		if (activeTool === "place" || activeTool === "road") {
			return "crosshair";
		}
		if (dragMove?.hasMoved) {
			return "grabbing";
		}
		return "default";
	}, [activeTool, dragMove?.hasMoved, isPanning, isSpacePressed]);

	return (
		<main
			ref={containerRef}
			aria-label="Anno 1404 Layout Grid Canvas"
			className="relative min-h-0 min-w-0 touch-none overflow-clip select-none"
			style={{
				cursor: cursorStyle,
				backgroundColor: isDark ? "#0f1218" : "#e5dcc5",
			}}
			onDragLeave={handleHtmlDragLeave}
			onDragOver={handleHtmlDragOver}
			onDrop={handleHtmlDrop}
			onContextMenu={(event): void => {
				event.preventDefault();
			}}
		>
			<Stage
				ref={stageRef}
				className="block"
				height={Math.max(1, stageSize.height)}
				scaleX={viewport.scale}
				scaleY={viewport.scale}
				width={Math.max(1, stageSize.width)}
				x={viewport.x}
				y={viewport.y}
				onMouseDown={handleStageMouseDown}
				onMouseMove={handleStageMouseMove}
				onMouseUp={handleStageMouseUp}
				onTouchCancel={handleStageTouchEnd}
				onTouchEnd={handleStageTouchEnd}
				onTouchMove={handleStageTouchMove}
				onTouchStart={handleStageTouchStart}
				onWheel={handleWheel}
				onMouseLeave={(): void => {
					clearCursorCell();
					setHoveredBuildingId(null);
					if (paintStrokeRef.current) {
						paintStrokeRef.current = null;
					}
				}}
			>
				{/* Layer 1: Island Drafting Surface & Batched Viewport-Culled Grid */}
				<GridLayer
					canvasTheme={canvasTheme}
					gridHeight={gridHeight}
					gridWidth={gridWidth}
					showGrid={showGrid}
				/>

				{/* Layer 2: Influence Circles & Discrete Euclidean Tile Spans */}
				<InfluenceLayer
					discreteCoverageSpans={discreteCoverageSpans}
					visibleInfluenceSources={visibleInfluenceSources}
				/>

				{/* Layer 3: Stationary Placed Roads & Buildings (zero redraws on cursor/hover/selection!) */}
				<BuildingsLayer
					buildings={buildings}
					hiddenBuildingIds={hiddenBuildingIds}
					imageCacheVersion={imageCacheVersion}
					showIcons={showIcons}
					showLabels={showLabels}
					spatialIndex={spatialIndex}
				/>

				{/* Layer 4: Dynamic Overlays (Coverage, Hover, Selection, Drag-Move, Ghost & Marquee) */}
				<DynamicOverlayLayer
					coveredBuildingIds={coveredBuildingIds}
					dragMove={dragMove}
					ghostPreset={effectiveGhostPreset}
					ghostRect={ghostRect}
					hoveredBuildingId={hoveredBuildingId}
					imageCacheVersion={imageCacheVersion}
					isDragMoveValid={isDragMoveValid}
					marquee={marquee}
					movingIdSet={movingIdSet}
					selectedIdSet={selectedIdSet}
					selectedIds={selectedIds}
					showIcons={showIcons}
					showLabels={showLabels}
					spatialIndex={spatialIndex}
				/>
			</Stage>

			{/* Bottom Canvas HUD Bar */}
			<div className="pointer-events-none absolute inset-x-2 bottom-2 flex items-center justify-between gap-2 sm:inset-x-3 sm:bottom-3 sm:gap-3">
				<div className="pointer-events-auto flex max-w-full shrink-0 items-center gap-1 rounded-lg border border-amber-500/25 bg-stone-950/90 px-1.5 py-1 text-xs text-stone-200 shadow-lg backdrop-blur-sm sm:gap-1.5 sm:px-2.5 sm:py-1.5">
					<button
						aria-label="Zoom out"
						className="anno-touch-target inline-flex items-center justify-center rounded px-2 py-0.5 font-mono text-sm text-stone-300 hover:bg-stone-800 hover:text-amber-300 active:bg-stone-800 sm:px-1.5"
						type="button"
						onClick={(): void => {
							zoomAroundPoint(
								viewportRef.current.scale / 1.2,
								stageSize.width / 2,
								stageSize.height / 2,
								true
							);
						}}
					>
						−
					</button>
					<button
						aria-label="Reset zoom to 100%"
						className="anno-touch-target inline-flex min-w-11 items-center justify-center rounded px-1 py-0.5 text-center font-mono text-amber-300 hover:bg-stone-800 active:bg-stone-800 sm:min-w-12 sm:px-1.5"
						type="button"
						onClick={(): void => {
							zoomAroundPoint(
								1,
								stageSize.width / 2,
								stageSize.height / 2,
								true
							);
						}}
					>
						{Math.round(viewport.scale * 100)}%
					</button>
					<button
						aria-label="Zoom in"
						className="anno-touch-target inline-flex items-center justify-center rounded px-2 py-0.5 font-mono text-sm text-stone-300 hover:bg-stone-800 hover:text-amber-300 active:bg-stone-800 sm:px-1.5"
						type="button"
						onClick={(): void => {
							zoomAroundPoint(
								viewportRef.current.scale * 1.2,
								stageSize.width / 2,
								stageSize.height / 2,
								true
							);
						}}
					>
						+
					</button>
					<span aria-hidden="true" className="mx-0.5 h-3.5 w-px bg-stone-700" />
					<button
						className="anno-touch-target inline-flex items-center justify-center rounded px-2 py-0.5 text-stone-300 hover:bg-stone-800 hover:text-amber-300 active:bg-stone-800"
						type="button"
						onClick={fitLayoutInViewport}
					>
						Fit
					</button>
					{activeTool === "select" && (
						<>
							<span
								aria-hidden="true"
								className="mx-0.5 h-3.5 w-px bg-stone-700"
							/>
							<button
								aria-label="Toggle multi-select mode"
								aria-pressed={isMultiSelectMode}
								type="button"
								className={`anno-touch-target inline-flex items-center justify-center rounded px-2 py-0.5 font-medium transition ${
									isMultiSelectMode
										? "bg-amber-400 text-stone-950"
										: "text-stone-300 hover:bg-stone-800 hover:text-amber-300"
								}`}
								onClick={(): void => {
									setIsMultiSelectMode((previous) => !previous);
								}}
							>
								+ Multi
							</button>
						</>
					)}
					<span
						aria-hidden="true"
						className="mx-0.5 hidden h-3.5 w-px bg-stone-700 sm:inline"
					/>
					<span className="hidden min-w-22 font-mono text-[11px] text-stone-400 sm:inline">
						{cursorCell &&
						cursorCell.x >= 0 &&
						cursorCell.x < gridWidth &&
						cursorCell.y >= 0 &&
						cursorCell.y < gridHeight
							? `Tile ${cursorCell.x}, ${cursorCell.y}`
							: `Grid ${gridWidth}×${gridHeight}`}
					</span>
				</div>

				<div className="hidden min-w-0 items-center gap-2 truncate rounded-full border border-stone-700/80 bg-stone-950/85 px-3.5 py-1.5 text-[11px] text-stone-300 shadow-lg backdrop-blur-sm xl:flex">
					{effectiveGhostPreset ? (
						<>
							<span className="truncate font-semibold text-amber-300">
								Placing: {effectiveGhostPreset.name}
							</span>
							<span className="text-stone-500">•</span>
							<span className="shrink-0">Click or drag to place</span>
							{effectiveGhostPreset.width !== effectiveGhostPreset.height && (
								<>
									<span className="text-stone-500">•</span>
									<span className="shrink-0">
										<kbd className="rounded bg-stone-800 px-1 py-0.5 font-mono text-[10px] text-amber-200">
											R
										</kbd>{" "}
										Rotate
									</span>
								</>
							)}
							{effectiveGhostPreset.width === 1 &&
								effectiveGhostPreset.height === 1 && (
									<>
										<span className="text-stone-500">•</span>
										<span className="shrink-0">
											<kbd className="rounded bg-stone-800 px-1 py-0.5 font-mono text-[10px] text-amber-200">
												Shift
											</kbd>{" "}
											Straight
										</span>
									</>
								)}
							<span className="text-stone-500">•</span>
							<span className="shrink-0">Right-click erase / Esc</span>
						</>
					) : (
						<>
							<span className="shrink-0">Click or box-drag to select</span>
							<span className="text-stone-500">•</span>
							<span className="shrink-0">Drag to snap-move</span>
							<span className="text-stone-500">•</span>
							<span className="shrink-0">Right-drag / Space pan</span>
							<span className="text-stone-500">•</span>
							<span className="shrink-0">Alt+Click pick</span>
						</>
					)}
				</div>
			</div>
		</main>
	);
};
