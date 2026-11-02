import type Konva from "konva";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	Circle,
	Group,
	Image as KonvaImage,
	Layer,
	Line,
	Rect,
	Stage,
	Text,
} from "react-konva";
import type { FunctionComponent } from "../../../common/types";
import { useDesignerStore } from "../../../store/designerStore";
import {
	buildRoadTileKeySet,
	canPlaceBuilding,
	computeCoveredTileSpans,
	computeLineCells,
	getRectCenter,
	isRectCoveredBySource,
	rectanglesOverlap,
	toTileKey,
} from "../gridMath";
import { PRESET_BY_ID } from "../presetsData";
import type {
	BuildingPreset,
	GridPoint,
	GridRect,
	PlacedBuilding,
} from "../types";
import { useImageCache } from "../useImageCache";

export const CELL_SIZE = 28;
const MIN_SCALE = 0.25;
const MAX_SCALE = 3.0;
const TOUCH_PAN_EMPTY_BUTTON = -1;

type ViewportTransform = {
	readonly x: number;
	readonly y: number;
	readonly scale: number;
};

type DragMoveSession = {
	readonly movingIds: ReadonlyArray<string>;
	readonly anchorWorldX: number;
	readonly anchorWorldY: number;
	readonly deltaX: number;
	readonly deltaY: number;
	readonly hasMoved: boolean;
};

type MarqueeSession = {
	readonly startWorldX: number;
	readonly startWorldY: number;
	readonly currentWorldX: number;
	readonly currentWorldY: number;
	readonly additive: boolean;
};

type PanSession = {
	readonly startClientX: number;
	readonly startClientY: number;
	readonly startViewportX: number;
	readonly startViewportY: number;
	readonly button: number;
	readonly movedDistance: number;
};

type PaintStrokeSession = {
	readonly mode: "place" | "erase";
	readonly lastCell: GridPoint;
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

export const LayoutCanvas = ({
	paletteDraggedPresetId,
	onClearPaletteDrag,
	stageRef,
}: LayoutCanvasProps): FunctionComponent => {
	const containerRef = useRef<HTMLDivElement | null>(null);
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
	const [cursorCell, setCursorCell] = useState<GridPoint | null>(null);
	const [isSpacePressed, setIsSpacePressed] = useState<boolean>(false);
	const [isMultiSelectMode, setIsMultiSelectMode] = useState<boolean>(false);
	const [dragMove, setDragMove] = useState<DragMoveSession | null>(null);
	const [marquee, setMarquee] = useState<MarqueeSession | null>(null);
	const [panSession, setPanSession] = useState<PanSession | null>(null);
	const [isPaletteDragOver, setIsPaletteDragOver] = useState<boolean>(false);

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
	const recordStrokeSnapshot = useDesignerStore(
		(state) => state.recordStrokeSnapshot
	);
	const placeBuildingAt = useDesignerStore((state) => state.placeBuildingAt);
	const eraseAtCell = useDesignerStore((state) => state.eraseAtCell);
	const moveBuildingsByDelta = useDesignerStore(
		(state) => state.moveBuildingsByDelta
	);
	const setSelectedIds = useDesignerStore((state) => state.setSelectedIds);
	const setHoveredBuildingId = useDesignerStore(
		(state) => state.setHoveredBuildingId
	);

	// Preload icons for placed buildings + active/dragged preset
	const neededIconUrls = useMemo((): Array<string | null> => {
		const urls = new Set<string | null>();
		for (const item of buildings) {
			const preset = PRESET_BY_ID.get(item.presetId);
			if (preset?.iconUrl) {
				urls.add(preset.iconUrl);
			}
		}
		if (activePresetId) {
			urls.add(PRESET_BY_ID.get(activePresetId)?.iconUrl ?? null);
		}
		if (paletteDraggedPresetId) {
			urls.add(PRESET_BY_ID.get(paletteDraggedPresetId)?.iconUrl ?? null);
		}
		return [...urls];
	}, [buildings, activePresetId, paletteDraggedPresetId]);

	const getCachedImage = useImageCache(neededIconUrls);

	// Track container dimensions
	useEffect((): (() => void) => {
		const element = containerRef.current;
		if (!element) {
			return (): void => {};
		}
		const updateSize = (): void => {
			const bounds = element.getBoundingClientRect();
			if (bounds.width > 0 && bounds.height > 0) {
				setStageSize({
					width: Math.floor(bounds.width),
					height: Math.floor(bounds.height),
				});
			}
		};
		updateSize();
		const observer = new ResizeObserver(updateSize);
		observer.observe(element);
		return (): void => {
			observer.disconnect();
		};
	}, []);

	const fitLayoutInViewport = useCallback((): void => {
		if (stageSize.width <= 0 || stageSize.height <= 0) {
			return;
		}
		if (buildings.length === 0) {
			const defaultScale = stageSize.width < 640 ? 0.65 : 0.95;
			setViewport({
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
		for (const item of buildings) {
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

		setViewport({
			scale: Number(nextScale.toFixed(3)),
			x: Math.round(stageSize.width / 2 - centerWorldX * nextScale),
			y: Math.round(stageSize.height / 2 - centerWorldY * nextScale),
		});
	}, [buildings, gridHeight, gridWidth, stageSize.height, stageSize.width]);

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
				setIsSpacePressed(true);
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

	// Effective buildings accounting for live drag-move preview
	const movingIdSet = useMemo(
		(): Set<string> => new Set(dragMove?.movingIds ?? []),
		[dragMove]
	);

	const effectiveBuildings = useMemo((): ReadonlyArray<PlacedBuilding> => {
		if (!dragMove || (dragMove.deltaX === 0 && dragMove.deltaY === 0)) {
			return buildings;
		}
		return buildings.map((building) =>
			movingIdSet.has(building.id)
				? {
						...building,
						x: building.x + dragMove.deltaX,
						y: building.y + dragMove.deltaY,
					}
				: building
		);
	}, [buildings, dragMove, movingIdSet]);

	const isDragMoveValid = useMemo((): boolean => {
		if (!dragMove || (dragMove.deltaX === 0 && dragMove.deltaY === 0)) {
			return true;
		}
		for (const item of effectiveBuildings) {
			if (!movingIdSet.has(item.id)) {
				continue;
			}
			if (
				!canPlaceBuilding(buildings, item, gridWidth, gridHeight, movingIdSet)
			) {
				return false;
			}
		}
		return true;
	}, [
		buildings,
		dragMove,
		effectiveBuildings,
		gridHeight,
		gridWidth,
		movingIdSet,
	]);

	const roadTileKeys = useMemo(
		(): Set<string> => buildRoadTileKeySet(effectiveBuildings),
		[effectiveBuildings]
	);

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
	const effectiveGhostPreset = useMemo(() => {
		if (isPaletteDragOver && paletteDraggedPresetId) {
			return PRESET_BY_ID.get(paletteDraggedPresetId) ?? null;
		}
		if (
			(activeTool === "place" || activeTool === "road") &&
			activePresetId &&
			!isSpacePressed &&
			!panSession
		) {
			return PRESET_BY_ID.get(activePresetId) ?? null;
		}
		return null;
	}, [
		activePresetId,
		activeTool,
		isPaletteDragOver,
		isSpacePressed,
		paletteDraggedPresetId,
		panSession,
	]);

	const ghostRect = useMemo((): {
		readonly x: number;
		readonly y: number;
		readonly width: number;
		readonly height: number;
		readonly valid: boolean;
	} | null => {
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

		let valid = canPlaceBuilding(
			buildings,
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
			const overlapping = buildings.find((item) =>
				rectanglesOverlap(item, {
					x: snappedX,
					y: snappedY,
					width: 1,
					height: 1,
				})
			);
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
		buildings,
		computeSnappedOrigin,
		cursorCell,
		effectiveGhostPreset,
		gridHeight,
		gridWidth,
		isPaletteDragOver,
		paletteDraggedPresetId,
		placementRotated,
	]);

	const selectedIdSet = useMemo(
		(): Set<string> => new Set(selectedIds),
		[selectedIds]
	);

	// Determine visible influence circles
	const visibleInfluenceSources = useMemo((): Array<{
		readonly key: string;
		readonly rect: GridRect;
		readonly radius: number;
		readonly color: string;
		readonly isPrimary: boolean;
	}> => {
		if (influenceMode === "none") {
			return [];
		}

		const sources: Array<{
			readonly key: string;
			readonly rect: GridRect;
			readonly radius: number;
			readonly color: string;
			readonly isPrimary: boolean;
		}> = [];

		for (const item of effectiveBuildings) {
			const preset = PRESET_BY_ID.get(item.presetId);
			if (!preset || preset.influenceRadius <= 0) {
				continue;
			}
			const isSelected = selectedIdSet.has(item.id);
			const isHovered = hoveredBuildingId === item.id;
			const isServiceBuilding =
				preset.category === "public" ||
				preset.category === "harbour" ||
				preset.category === "ornament";

			const shouldInclude =
				influenceMode === "all" ||
				(influenceMode === "services" &&
					(isServiceBuilding || isSelected || isHovered)) ||
				(influenceMode === "active" && (isSelected || isHovered));

			if (shouldInclude) {
				sources.push({
					key: item.id,
					rect: item,
					radius: preset.influenceRadius,
					color: item.customColor ?? preset.cssColor,
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

		return sources;
	}, [
		effectiveBuildings,
		effectiveGhostPreset,
		ghostRect,
		hoveredBuildingId,
		influenceMode,
		selectedIdSet,
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
		if (selectedIds.length === 1) {
			const selectedBuilding = effectiveBuildings.find(
				(item) => item.id === selectedIds[0]
			);
			const preset = selectedBuilding
				? PRESET_BY_ID.get(selectedBuilding.presetId)
				: undefined;
			if (selectedBuilding && preset && preset.influenceRadius > 0) {
				return {
					rect: selectedBuilding,
					radius: preset.influenceRadius,
				};
			}
		}
		if (hoveredBuildingId && !effectiveGhostPreset) {
			const hoveredBuilding = effectiveBuildings.find(
				(item) => item.id === hoveredBuildingId
			);
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
		effectiveBuildings,
		effectiveGhostPreset,
		ghostRect,
		hoveredBuildingId,
		selectedIds,
	]);

	const coveredBuildingIds = useMemo((): Set<string> => {
		const covered = new Set<string>();
		if (!primaryCoverageSource || influenceMode === "none") {
			return covered;
		}
		for (const item of effectiveBuildings) {
			const preset = PRESET_BY_ID.get(item.presetId);
			if (!preset || preset.isRoad || preset.template === "Blocker") {
				continue;
			}
			if (
				isRectCoveredBySource(
					item,
					primaryCoverageSource.rect,
					primaryCoverageSource.radius
				)
			) {
				covered.add(item.id);
			}
		}
		return covered;
	}, [effectiveBuildings, influenceMode, primaryCoverageSource]);

	const discreteCoverageSpans = useMemo(() => {
		if (
			!showDiscreteTiles ||
			!primaryCoverageSource ||
			influenceMode === "none"
		) {
			return [];
		}
		return computeCoveredTileSpans(
			primaryCoverageSource.rect,
			primaryCoverageSource.radius,
			gridWidth,
			gridHeight
		);
	}, [
		gridHeight,
		gridWidth,
		influenceMode,
		primaryCoverageSource,
		showDiscreteTiles,
	]);

	// Grid lines memoized cleanly
	const gridLines = useMemo(() => {
		if (!showGrid) {
			return { minor: [], major: [] };
		}
		const minor: Array<{ key: string; points: Array<number> }> = [];
		const major: Array<{ key: string; points: Array<number> }> = [];
		const totalWidthPx = gridWidth * CELL_SIZE;
		const totalHeightPx = gridHeight * CELL_SIZE;

		for (let column = 0; column <= gridWidth; column += 1) {
			const xPx = column * CELL_SIZE;
			const entry = {
				key: `v_${column}`,
				points: [xPx, 0, xPx, totalHeightPx],
			};
			if (column % 5 === 0) {
				major.push(entry);
			} else {
				minor.push(entry);
			}
		}
		for (let row = 0; row <= gridHeight; row += 1) {
			const yPx = row * CELL_SIZE;
			const entry = {
				key: `h_${row}`,
				points: [0, yPx, totalWidthPx, yPx],
			};
			if (row % 5 === 0) {
				major.push(entry);
			} else {
				minor.push(entry);
			}
		}
		return { minor, major };
	}, [gridHeight, gridWidth, showGrid]);

	const screenToWorld = useCallback(
		(stageX: number, stageY: number): { worldX: number; worldY: number } => ({
			worldX: (stageX - viewport.x) / viewport.scale,
			worldY: (stageY - viewport.y) / viewport.scale,
		}),
		[viewport.scale, viewport.x, viewport.y]
	);

	const updateCursorFromStagePoint = useCallback(
		(stageX: number, stageY: number): GridPoint => {
			const { worldX, worldY } = screenToWorld(stageX, stageY);
			const tileX = Math.floor(worldX / CELL_SIZE);
			const tileY = Math.floor(worldY / CELL_SIZE);
			setCursorCell((previous) =>
				previous && previous.x === tileX && previous.y === tileY
					? previous
					: { x: tileX, y: tileY }
			);
			return { x: tileX, y: tileY };
		},
		[screenToWorld]
	);

	const zoomAroundPoint = useCallback(
		(targetScale: number, anchorStageX: number, anchorStageY: number): void => {
			const clampedScale = clampValue(targetScale, MIN_SCALE, MAX_SCALE);
			const worldPointX = (anchorStageX - viewport.x) / viewport.scale;
			const worldPointY = (anchorStageY - viewport.y) / viewport.scale;

			setViewport({
				scale: Number(clampedScale.toFixed(3)),
				x: Math.round(anchorStageX - worldPointX * clampedScale),
				y: Math.round(anchorStageY - worldPointY * clampedScale),
			});
		},
		[viewport.scale, viewport.x, viewport.y]
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
			zoomAroundPoint(viewport.scale * zoomFactor, pointer.x, pointer.y);
		},
		[viewport.scale, zoomAroundPoint]
	);

	const findBuildingAtTile = useCallback(
		(tileX: number, tileY: number): PlacedBuilding | undefined => {
			const cellRect = { x: tileX, y: tileY, width: 1, height: 1 };
			for (let index = buildings.length - 1; index >= 0; index -= 1) {
				const candidate = buildings[index];
				if (candidate && rectanglesOverlap(candidate, cellRect)) {
					return candidate;
				}
			}
			return undefined;
		},
		[buildings]
	);

	const readStageTouches = useCallback(
		(touchList: TouchList): Array<StageTouchPoint> => {
			const container = containerRef.current;
			if (!container) {
				return [];
			}
			const bounds = container.getBoundingClientRect();
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
				setPanSession({
					startClientX: nativeEvent.clientX,
					startClientY: nativeEvent.clientY,
					startViewportX: viewport.x,
					startViewportY: viewport.y,
					button: nativeEvent.button,
					movedDistance: 0,
				});
				return;
			}

			if (nativeEvent.button !== 0) {
				return;
			}

			const tile = updateCursorFromStagePoint(pointer.x, pointer.y);
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
				recordStrokeSnapshot();
				eraseAtCell(tile.x, tile.y, false);
				paintStrokeRef.current = { mode: "erase", lastCell: tile };
				return;
			}

			if (activeTool === "place" || activeTool === "road") {
				const preset = activePresetId
					? PRESET_BY_ID.get(activePresetId)
					: undefined;
				if (preset) {
					const snapped = computeSnappedOrigin(tile, preset, placementRotated);
					recordStrokeSnapshot();
					placeBuildingAt(snapped.x, snapped.y, { recordHistory: false });
					paintStrokeRef.current = {
						mode: "place",
						lastCell: { x: snapped.x, y: snapped.y },
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
			computeSnappedOrigin,
			eraseAtCell,
			findBuildingAtTile,
			isMultiSelectMode,
			isSpacePressed,
			placeBuildingAt,
			placementRotated,
			recordStrokeSnapshot,
			screenToWorld,
			selectPreset,
			selectedIdSet,
			selectedIds,
			setSelectedIds,
			updateCursorFromStagePoint,
			viewport.x,
			viewport.y,
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

			if (panSession) {
				const deltaX = nativeEvent.clientX - panSession.startClientX;
				const deltaY = nativeEvent.clientY - panSession.startClientY;
				const distance = Math.hypot(deltaX, deltaY);
				setPanSession({
					...panSession,
					movedDistance: Math.max(panSession.movedDistance, distance),
				});
				setViewport((current) => ({
					...current,
					x: Math.round(panSession.startViewportX + deltaX),
					y: Math.round(panSession.startViewportY + deltaY),
				}));
				return;
			}

			const tile = updateCursorFromStagePoint(pointer.x, pointer.y);
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
					const cells = computeLineCells(
						activeStroke.lastCell,
						tile,
						nativeEvent.shiftKey
					);
					for (const point of cells) {
						eraseAtCell(point.x, point.y, false);
					}
					paintStrokeRef.current = { mode: "erase", lastCell: tile };
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
						for (const point of pathCells) {
							placeBuildingAt(point.x, point.y, { recordHistory: false });
						}
						paintStrokeRef.current = { mode: "place", lastCell: targetOrigin };
					}
				}
				return;
			}

			// Hover detection in select mode
			const hovered = findBuildingAtTile(tile.x, tile.y);
			const nextHoveredId = hovered?.id ?? null;
			if (nextHoveredId !== hoveredBuildingId) {
				setHoveredBuildingId(nextHoveredId);
			}
		},
		[
			computeSnappedOrigin,
			dragMove,
			effectiveGhostPreset,
			eraseAtCell,
			findBuildingAtTile,
			hoveredBuildingId,
			marquee,
			panSession,
			placeBuildingAt,
			placementRotated,
			screenToWorld,
			setHoveredBuildingId,
			updateCursorFromStagePoint,
		]
	);

	const finalizePointerInteraction = useCallback(
		(pointer?: { x: number; y: number } | null): void => {
			if (panSession) {
				// Quick right-click (< 5px movement) erases tile under cursor or cancels placement
				if (
					panSession.button === 2 &&
					panSession.movedDistance < 5 &&
					pointer
				) {
					const tile = updateCursorFromStagePoint(pointer.x, pointer.y);
					const hit = findBuildingAtTile(tile.x, tile.y);
					if (hit) {
						eraseAtCell(tile.x, tile.y, true);
					} else {
						cancelActiveAction();
					}
				} else if (
					panSession.button === TOUCH_PAN_EMPTY_BUTTON &&
					panSession.movedDistance < 6
				) {
					setSelectedIds([], false);
				}
				setPanSession(null);
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
						.filter((item) => rectanglesOverlap(item, selectionBox))
						.map((item) => item.id);
					setSelectedIds(matchedIds, marquee.additive);
				}
				setMarquee(null);
			}

			paintStrokeRef.current = null;
		},
		[
			buildings,
			cancelActiveAction,
			dragMove,
			eraseAtCell,
			findBuildingAtTile,
			marquee,
			moveBuildingsByDelta,
			panSession,
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
			setPanSession(null);
			setCursorCell(null);

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
				initialScale: viewport.scale,
				anchorWorldX: (midpointX - viewport.x) / viewport.scale,
				anchorWorldY: (midpointY - viewport.y) / viewport.scale,
			};
		},
		[viewport.scale, viewport.x, viewport.y]
	);

	const handleStageTouchStart = useCallback(
		(event: Konva.KonvaEventObject<TouchEvent>): void => {
			lastTouchTimestampRef.current = Date.now();
			const nativeEvent = event.evt;
			if (nativeEvent.cancelable) {
				nativeEvent.preventDefault();
			}

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
				setPanSession({
					startClientX: touchPoint.clientX,
					startClientY: touchPoint.clientY,
					startViewportX: viewport.x,
					startViewportY: viewport.y,
					button: 0,
					movedDistance: 0,
				});
				return;
			}

			const tile = updateCursorFromStagePoint(
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
				setCursorCell(null);
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
				setPanSession({
					startClientX: touchPoint.clientX,
					startClientY: touchPoint.clientY,
					startViewportX: viewport.x,
					startViewportY: viewport.y,
					button: TOUCH_PAN_EMPTY_BUTTON,
					movedDistance: 0,
				});
			}
		},
		[
			activePresetId,
			activeTool,
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
			updateCursorFromStagePoint,
			viewport.x,
			viewport.y,
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
				setViewport({
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

			if (panSession) {
				const deltaX = touchPoint.clientX - panSession.startClientX;
				const deltaY = touchPoint.clientY - panSession.startClientY;
				const distance = Math.hypot(deltaX, deltaY);
				setPanSession({
					...panSession,
					movedDistance: Math.max(panSession.movedDistance, distance),
				});
				setViewport((current) => ({
					...current,
					x: Math.round(panSession.startViewportX + deltaX),
					y: Math.round(panSession.startViewportY + deltaY),
				}));
				return;
			}

			const tile = updateCursorFromStagePoint(
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
					recordStrokeSnapshot();
					if (pendingStroke.mode === "erase") {
						const initialCells = computeLineCells(
							pendingStroke.startTile,
							tile,
							false
						);
						for (const point of initialCells) {
							eraseAtCell(point.x, point.y, false);
						}
						paintStrokeRef.current = { mode: "erase", lastCell: tile };
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
						for (const point of initialCells) {
							placeBuildingAt(point.x, point.y, { recordHistory: false });
						}
						paintStrokeRef.current = {
							mode: "place",
							lastCell: { x: currentSnapped.x, y: currentSnapped.y },
						};
					}
				}
				return;
			}

			const activeStroke = paintStrokeRef.current;
			if (activeStroke) {
				if (activeStroke.mode === "erase") {
					const cells = computeLineCells(activeStroke.lastCell, tile, false);
					for (const point of cells) {
						eraseAtCell(point.x, point.y, false);
					}
					paintStrokeRef.current = { mode: "erase", lastCell: tile };
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
						for (const point of pathCells) {
							placeBuildingAt(point.x, point.y, { recordHistory: false });
						}
						paintStrokeRef.current = { mode: "place", lastCell: targetOrigin };
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
			computeSnappedOrigin,
			dragMove,
			effectiveGhostPreset,
			eraseAtCell,
			marquee,
			panSession,
			placeBuildingAt,
			placementRotated,
			readStageTouches,
			recordStrokeSnapshot,
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
				setCursorCell(null);
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
				setCursorCell(null);
				return;
			}

			finalizePointerInteraction(null);
			setCursorCell(null);
		},
		[
			activePresetId,
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
				setIsPaletteDragOver(true);
			}
			const container = containerRef.current;
			if (!container) {
				return;
			}
			const bounds = container.getBoundingClientRect();
			updateCursorFromStagePoint(
				event.clientX - bounds.left,
				event.clientY - bounds.top
			);
		},
		[isPaletteDragOver, updateCursorFromStagePoint]
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

			const container = containerRef.current;
			if (!container || !presetId) {
				return;
			}
			const preset = PRESET_BY_ID.get(presetId);
			if (!preset) {
				return;
			}

			const bounds = container.getBoundingClientRect();
			const tile = updateCursorFromStagePoint(
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
			updateCursorFromStagePoint,
		]
	);

	const isDark = canvasTheme === "dark";
	const boardBackground = isDark ? "#181c24" : "#f2ead7";
	const minorGridStroke = isDark
		? "rgba(148, 163, 184, 0.10)"
		: "rgba(120, 98, 66, 0.14)";
	const majorGridStroke = isDark
		? "rgba(212, 168, 83, 0.22)"
		: "rgba(120, 98, 66, 0.30)";
	const boardBorderStroke = isDark
		? "rgba(212, 168, 83, 0.45)"
		: "rgba(120, 88, 42, 0.55)";

	const cursorStyle = useMemo((): string => {
		if (panSession || isSpacePressed || activeTool === "pan") {
			return panSession ? "grabbing" : "grab";
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
	}, [activeTool, dragMove?.hasMoved, isSpacePressed, panSession]);

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
					setCursorCell(null);
					setHoveredBuildingId(null);
					if (paintStrokeRef.current) {
						paintStrokeRef.current = null;
					}
				}}
			>
				{/* Layer 1: Island Drafting Surface & Grid */}
				<Layer listening={false}>
					<Rect
						fill={boardBackground}
						height={gridHeight * CELL_SIZE}
						stroke={boardBorderStroke}
						strokeWidth={2}
						width={gridWidth * CELL_SIZE}
						x={0}
						y={0}
					/>
					{gridLines.minor.map((line) => (
						<Line
							key={line.key}
							points={line.points}
							stroke={minorGridStroke}
							strokeWidth={1}
						/>
					))}
					{gridLines.major.map((line) => (
						<Line
							key={line.key}
							points={line.points}
							stroke={majorGridStroke}
							strokeWidth={1.25}
						/>
					))}
				</Layer>

				{/* Layer 2: Influence Circles & Discrete Euclidean Tile Spans */}
				<Layer listening={false}>
					{discreteCoverageSpans.map((span) => (
						<Rect
							key={`span_${span.y}_${span.xStart}`}
							fill="rgba(52, 211, 153, 0.14)"
							height={CELL_SIZE}
							stroke="rgba(52, 211, 153, 0.25)"
							strokeWidth={0.75}
							width={span.width * CELL_SIZE}
							x={span.xStart * CELL_SIZE}
							y={span.y * CELL_SIZE}
						/>
					))}

					{visibleInfluenceSources.map((source) => {
						const center = getRectCenter(source.rect);
						return (
							<Circle
								key={source.key}
								dash={source.isPrimary ? [8, 5] : [5, 6]}
								radius={source.radius * CELL_SIZE}
								strokeWidth={source.isPrimary ? 2 : 1.25}
								x={center.x * CELL_SIZE}
								y={center.y * CELL_SIZE}
								fill={
									source.isPrimary
										? "rgba(251, 191, 36, 0.11)"
										: "rgba(56, 189, 248, 0.05)"
								}
								stroke={
									source.isPrimary
										? "rgba(251, 191, 36, 0.85)"
										: "rgba(125, 211, 252, 0.45)"
								}
							/>
						);
					})}
				</Layer>

				{/* Layer 3: Placed Roads & Buildings */}
				<Layer listening={false}>
					{effectiveBuildings.map((building) => {
						const preset = PRESET_BY_ID.get(building.presetId);
						const xPx = building.x * CELL_SIZE;
						const yPx = building.y * CELL_SIZE;
						const widthPx = building.width * CELL_SIZE;
						const heightPx = building.height * CELL_SIZE;
						const fill =
							building.customColor ??
							preset?.cssColor ??
							"rgba(148, 163, 184, 1)";
						const isSelected = selectedIdSet.has(building.id);
						const isHovered = hoveredBuildingId === building.id;
						const isMoving = movingIdSet.has(building.id);
						const isCovered = coveredBuildingIds.has(building.id);

						// Seamless borderless road rendering
						if (
							preset?.isRoad &&
							building.width === 1 &&
							building.height === 1
						) {
							const hasNorth = roadTileKeys.has(
								toTileKey(building.x, building.y - 1)
							);
							const hasSouth = roadTileKeys.has(
								toTileKey(building.x, building.y + 1)
							);
							const hasWest = roadTileKeys.has(
								toTileKey(building.x - 1, building.y)
							);
							const hasEast = roadTileKeys.has(
								toTileKey(building.x + 1, building.y)
							);
							const edgeColor = "rgba(15, 23, 42, 0.45)";

							return (
								<Group key={building.id} x={xPx} y={yPx}>
									<Rect
										fill={fill}
										height={CELL_SIZE}
										opacity={isMoving ? 0.8 : 0.94}
										width={CELL_SIZE}
									/>
									{!hasNorth && (
										<Line
											points={[0, 0.5, CELL_SIZE, 0.5]}
											stroke={edgeColor}
											strokeWidth={1}
										/>
									)}
									{!hasSouth && (
										<Line
											points={[0, CELL_SIZE - 0.5, CELL_SIZE, CELL_SIZE - 0.5]}
											stroke={edgeColor}
											strokeWidth={1}
										/>
									)}
									{!hasWest && (
										<Line
											points={[0.5, 0, 0.5, CELL_SIZE]}
											stroke={edgeColor}
											strokeWidth={1}
										/>
									)}
									{!hasEast && (
										<Line
											points={[CELL_SIZE - 0.5, 0, CELL_SIZE - 0.5, CELL_SIZE]}
											stroke={edgeColor}
											strokeWidth={1}
										/>
									)}
									{isSelected && (
										<Rect
											height={CELL_SIZE - 2}
											stroke={isDragMoveValid ? "#fbbf24" : "#ef4444"}
											strokeWidth={2}
											width={CELL_SIZE - 2}
											x={1}
											y={1}
										/>
									)}
								</Group>
							);
						}

						const iconImage = showIcons
							? getCachedImage(preset?.iconUrl)
							: undefined;
						const minSidePx = Math.min(widthPx, heightPx);
						const iconSize = clampValue(minSidePx * 0.56, 18, 52);
						const displayLabel =
							building.customLabel ?? preset?.name ?? building.presetId;
						const canShowText =
							showLabels &&
							viewport.scale >= 0.55 &&
							widthPx >= 2 * CELL_SIZE &&
							heightPx >= 2 * CELL_SIZE;

						let borderStroke = "rgba(15, 23, 42, 0.78)";
						let borderWidth = 1.5;
						if (isMoving && !isDragMoveValid) {
							borderStroke = "#ef4444";
							borderWidth = 3;
						} else if (isSelected) {
							borderStroke = "#fbbf24";
							borderWidth = 2.75;
						} else if (isHovered) {
							borderStroke = "#f8fafc";
							borderWidth = 2;
						} else if (isCovered) {
							borderStroke = "#10b981";
							borderWidth = 2.25;
						}

						return (
							<Group key={building.id} x={xPx} y={yPx}>
								<Rect
									cornerRadius={preset?.isBorderless ? 0 : 3}
									fill={fill}
									height={heightPx}
									opacity={isMoving ? 0.82 : 0.92}
									stroke={borderStroke}
									strokeWidth={borderWidth}
									width={widthPx}
								/>
								{!preset?.isBorderless && (
									<Rect
										cornerRadius={2}
										height={Math.max(0, heightPx - 4)}
										stroke="rgba(255, 255, 255, 0.22)"
										strokeWidth={1}
										width={Math.max(0, widthPx - 4)}
										x={2}
										y={2}
									/>
								)}
								{isCovered && !isSelected && (
									<Circle
										fill="#10b981"
										radius={4.5}
										stroke="#052e16"
										strokeWidth={1}
										x={widthPx - 8}
										y={8}
									/>
								)}
								{iconImage && (
									<KonvaImage
										height={iconSize}
										image={iconImage}
										width={iconSize}
										x={(widthPx - iconSize) / 2}
										y={
											canShowText
												? Math.max(4, (heightPx - iconSize) / 2 - 7)
												: (heightPx - iconSize) / 2
										}
									/>
								)}
								{canShowText && (
									<Text
										ellipsis
										align="center"
										fill="#0f172a"
										fontFamily="ui-sans-serif, system-ui, sans-serif"
										fontSize={10}
										fontStyle="bold"
										height={14}
										padding={2}
										text={displayLabel}
										width={widthPx - 4}
										wrap="none"
										x={2}
										y={heightPx - 16}
									/>
								)}
							</Group>
						);
					})}
				</Layer>

				{/* Layer 4: Live Placement Ghost & Marquee Box */}
				<Layer listening={false}>
					{ghostRect && effectiveGhostPreset && (
						<Group x={ghostRect.x * CELL_SIZE} y={ghostRect.y * CELL_SIZE}>
							<Rect
								cornerRadius={3}
								height={ghostRect.height * CELL_SIZE}
								opacity={0.72}
								stroke={ghostRect.valid ? "#34d399" : "#ef4444"}
								strokeWidth={2.5}
								width={ghostRect.width * CELL_SIZE}
								fill={
									ghostRect.valid
										? effectiveGhostPreset.cssColor
										: "rgba(239, 68, 68, 0.45)"
								}
							/>
							{showIcons && getCachedImage(effectiveGhostPreset.iconUrl) && (
								<KonvaImage
									image={getCachedImage(effectiveGhostPreset.iconUrl)}
									opacity={0.9}
									height={Math.min(
										44,
										Math.min(ghostRect.width, ghostRect.height) *
											CELL_SIZE *
											0.58
									)}
									width={Math.min(
										44,
										Math.min(ghostRect.width, ghostRect.height) *
											CELL_SIZE *
											0.58
									)}
									x={
										(ghostRect.width * CELL_SIZE -
											Math.min(
												44,
												Math.min(ghostRect.width, ghostRect.height) *
													CELL_SIZE *
													0.58
											)) /
										2
									}
									y={
										(ghostRect.height * CELL_SIZE -
											Math.min(
												44,
												Math.min(ghostRect.width, ghostRect.height) *
													CELL_SIZE *
													0.58
											)) /
										2
									}
								/>
							)}
							{ghostRect.width >= 2 && (
								<Text
									align="center"
									fill={ghostRect.valid ? "#ecfdf5" : "#fef2f2"}
									fontFamily="ui-monospace, monospace"
									fontSize={10}
									fontStyle="bold"
									text={`${ghostRect.width}×${ghostRect.height}`}
									width={ghostRect.width * CELL_SIZE}
									x={0}
									y={-15}
								/>
							)}
						</Group>
					)}

					{marquee && (
						<Rect
							dash={[5, 4]}
							fill="rgba(251, 191, 36, 0.14)"
							height={Math.abs(marquee.currentWorldY - marquee.startWorldY)}
							stroke="#fbbf24"
							strokeWidth={1.5 / viewport.scale}
							width={Math.abs(marquee.currentWorldX - marquee.startWorldX)}
							x={Math.min(marquee.startWorldX, marquee.currentWorldX)}
							y={Math.min(marquee.startWorldY, marquee.currentWorldY)}
						/>
					)}
				</Layer>
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
								viewport.scale / 1.2,
								stageSize.width / 2,
								stageSize.height / 2
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
							zoomAroundPoint(1, stageSize.width / 2, stageSize.height / 2);
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
								viewport.scale * 1.2,
								stageSize.width / 2,
								stageSize.height / 2
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
