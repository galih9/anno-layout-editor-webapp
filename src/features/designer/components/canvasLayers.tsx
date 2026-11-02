import type Konva from "konva";
import { memo, useCallback } from "react";
import { Layer, Shape } from "react-konva";
import { PRESET_BY_ID } from "../presetsData";
import type { SpatialGridIndex } from "../spatialIndex";
import type {
	BuildingPreset,
	CanvasTheme,
	GridRect,
	PlacedBuilding,
	TileSpan,
} from "../types";
import { ensureImageLoaded } from "../useImageCache";

export const CELL_SIZE = 28;

const LABEL_FONT = "bold 10px ui-sans-serif, system-ui, sans-serif";
const GHOST_BADGE_FONT = "bold 10px ui-monospace, monospace";
const MAX_TRUNCATION_CACHE_ENTRIES = 2048;
const FULL_CIRCLE_RADIANS = Math.PI * 2;

const truncatedLabelCache = new Map<string, string>();

export type DragMoveSession = {
	readonly movingIds: ReadonlyArray<string>;
	readonly anchorWorldX: number;
	readonly anchorWorldY: number;
	readonly deltaX: number;
	readonly deltaY: number;
	readonly hasMoved: boolean;
};

export type MarqueeSession = {
	readonly startWorldX: number;
	readonly startWorldY: number;
	readonly currentWorldX: number;
	readonly currentWorldY: number;
	readonly additive: boolean;
};

export type GhostPlacementRect = {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
	readonly valid: boolean;
};

export type VisibleInfluenceSource = {
	readonly key: string;
	readonly rect: GridRect;
	readonly radius: number;
	readonly color: string;
	readonly isPrimary: boolean;
};

type StageWorldBounds = {
	readonly minX: number;
	readonly maxX: number;
	readonly minY: number;
	readonly maxY: number;
	readonly scale: number;
};

const clampNumber = (value: number, minimum: number, maximum: number): number =>
	Math.max(minimum, Math.min(maximum, value));

const getStageWorldBounds = (shape: Konva.Shape): StageWorldBounds => {
	const stage = shape.getStage();
	const scale = stage ? Math.max(0.05, stage.scaleX()) : 1;
	const width = stage?.width() ?? 0;
	const height = stage?.height() ?? 0;

	if (!stage || width <= 0 || height <= 0) {
		return {
			minX: Number.NEGATIVE_INFINITY,
			maxX: Number.POSITIVE_INFINITY,
			minY: Number.NEGATIVE_INFINITY,
			maxY: Number.POSITIVE_INFINITY,
			scale,
		};
	}

	const marginWorld = 6 / scale;
	return {
		minX: -stage.x() / scale - marginWorld,
		maxX: (width - stage.x()) / scale + marginWorld,
		minY: -stage.y() / scale - marginWorld,
		maxY: (height - stage.y()) / scale + marginWorld,
		scale,
	};
};

const isWorldRectVisible = (
	xPx: number,
	yPx: number,
	widthPx: number,
	heightPx: number,
	bounds: StageWorldBounds
): boolean =>
	xPx + widthPx >= bounds.minX &&
	xPx <= bounds.maxX &&
	yPx + heightPx >= bounds.minY &&
	yPx <= bounds.maxY;

const traceRoundedRectPath = (
	rawContext: CanvasRenderingContext2D,
	x: number,
	y: number,
	width: number,
	height: number,
	radius: number
): void => {
	if (radius <= 0 || width <= 0 || height <= 0) {
		rawContext.rect(x, y, width, height);
		return;
	}
	if (typeof rawContext.roundRect === "function") {
		rawContext.roundRect(x, y, width, height, radius);
		return;
	}
	const clampedRadius = Math.min(radius, width * 0.5, height * 0.5);
	rawContext.moveTo(x + clampedRadius, y);
	rawContext.arcTo(x + width, y, x + width, y + height, clampedRadius);
	rawContext.arcTo(x + width, y + height, x, y + height, clampedRadius);
	rawContext.arcTo(x, y + height, x, y, clampedRadius);
	rawContext.arcTo(x, y, x + width, y, clampedRadius);
	rawContext.closePath();
};

const getTruncatedLabel = (
	rawContext: CanvasRenderingContext2D,
	label: string,
	maxWidthPx: number
): string => {
	if (maxWidthPx <= 4 || label.length === 0) {
		return "";
	}
	const roundedWidth = Math.floor(maxWidthPx);
	const cacheKey = `${roundedWidth}|${label}`;
	const cached = truncatedLabelCache.get(cacheKey);
	if (cached !== undefined) {
		return cached;
	}

	const fullMeasurement = rawContext.measureText(label);
	if (!fullMeasurement || fullMeasurement.width <= roundedWidth) {
		if (truncatedLabelCache.size >= MAX_TRUNCATION_CACHE_ENTRIES) {
			truncatedLabelCache.clear();
		}
		truncatedLabelCache.set(cacheKey, label);
		return label;
	}

	const ellipsis = "…";
	if (rawContext.measureText(ellipsis).width > roundedWidth) {
		truncatedLabelCache.set(cacheKey, "");
		return "";
	}

	let low = 0;
	let high = label.length;
	while (low < high) {
		const middle = Math.ceil((low + high) / 2);
		const candidate = `${label.slice(0, middle)}${ellipsis}`;
		if (rawContext.measureText(candidate).width <= roundedWidth) {
			low = middle;
		} else {
			high = middle - 1;
		}
	}

	const result = low > 0 ? `${label.slice(0, low)}${ellipsis}` : ellipsis;
	if (truncatedLabelCache.size >= MAX_TRUNCATION_CACHE_ENTRIES) {
		truncatedLabelCache.clear();
	}
	truncatedLabelCache.set(cacheKey, result);
	return result;
};

const drawSingleStructure = (
	rawContext: CanvasRenderingContext2D,
	building: PlacedBuilding,
	preset: BuildingPreset | undefined,
	options: {
		readonly xPx: number;
		readonly yPx: number;
		readonly widthPx: number;
		readonly heightPx: number;
		readonly fillAlpha: number;
		readonly borderStroke: string;
		readonly borderWidth: number;
		readonly scale: number;
		readonly showIcons: boolean;
		readonly showLabels: boolean;
	}
): void => {
	const {
		xPx,
		yPx,
		widthPx,
		heightPx,
		fillAlpha,
		borderStroke,
		borderWidth,
		scale,
		showIcons,
		showLabels,
	} = options;
	const fill =
		building.customColor ?? preset?.cssColor ?? "rgba(148, 163, 184, 1)";
	const cornerRadius = preset?.isBorderless || scale < 0.4 ? 0 : 3;

	rawContext.globalAlpha = fillAlpha;
	rawContext.fillStyle = fill;
	rawContext.strokeStyle = borderStroke;
	rawContext.lineWidth = borderWidth;

	if (cornerRadius === 0) {
		rawContext.fillRect(xPx, yPx, widthPx, heightPx);
		rawContext.strokeRect(xPx, yPx, widthPx, heightPx);
	} else {
		rawContext.beginPath();
		traceRoundedRectPath(rawContext, xPx, yPx, widthPx, heightPx, cornerRadius);
		rawContext.fill();
		rawContext.stroke();
	}

	if (!preset?.isBorderless && scale >= 0.45 && widthPx > 4 && heightPx > 4) {
		rawContext.globalAlpha = 1;
		rawContext.strokeStyle = "rgba(255, 255, 255, 0.22)";
		rawContext.lineWidth = 1;
		rawContext.beginPath();
		traceRoundedRectPath(
			rawContext,
			xPx + 2,
			yPx + 2,
			widthPx - 4,
			heightPx - 4,
			2
		);
		rawContext.stroke();
	}

	const canShowText =
		showLabels &&
		scale >= 0.55 &&
		widthPx >= 2 * CELL_SIZE &&
		heightPx >= 2 * CELL_SIZE;

	if (showIcons && scale >= 0.24) {
		const iconImage = ensureImageLoaded(preset?.iconUrl);
		if (iconImage) {
			const minSidePx = Math.min(widthPx, heightPx);
			const iconSize = clampNumber(minSidePx * 0.56, 18, 52);
			const iconX = xPx + (widthPx - iconSize) * 0.5;
			const iconY = canShowText
				? yPx + Math.max(4, (heightPx - iconSize) * 0.5 - 7)
				: yPx + (heightPx - iconSize) * 0.5;
			rawContext.globalAlpha = 1;
			rawContext.drawImage(iconImage, iconX, iconY, iconSize, iconSize);
		}
	}

	if (canShowText) {
		const displayLabel =
			building.customLabel ?? preset?.name ?? building.presetId;
		rawContext.globalAlpha = 1;
		rawContext.font = LABEL_FONT;
		rawContext.fillStyle = "#0f172a";
		rawContext.textAlign = "center";
		rawContext.textBaseline = "middle";
		const truncated = getTruncatedLabel(rawContext, displayLabel, widthPx - 8);
		if (truncated) {
			rawContext.fillText(truncated, xPx + widthPx * 0.5, yPx + heightPx - 9);
		}
	}
};

export type GridLayerProps = {
	readonly gridWidth: number;
	readonly gridHeight: number;
	readonly showGrid: boolean;
	readonly canvasTheme: CanvasTheme;
};

export const GridLayer = memo(function GridLayer({
	gridWidth,
	gridHeight,
	showGrid,
	canvasTheme,
}: GridLayerProps): React.ReactElement {
	const drawGridScene = useCallback(
		(context: Konva.Context, shape: Konva.Shape): void => {
			const rawContext = context._context;
			const bounds = getStageWorldBounds(shape);
			const isDark = canvasTheme === "dark";
			const totalWidthPx = gridWidth * CELL_SIZE;
			const totalHeightPx = gridHeight * CELL_SIZE;

			rawContext.save();
			rawContext.fillStyle = isDark ? "#181c24" : "#f2ead7";
			rawContext.fillRect(0, 0, totalWidthPx, totalHeightPx);

			if (showGrid) {
				const startColumn = Math.max(0, Math.floor(bounds.minX / CELL_SIZE));
				const endColumn = Math.min(
					gridWidth,
					Math.ceil(bounds.maxX / CELL_SIZE)
				);
				const startRow = Math.max(0, Math.floor(bounds.minY / CELL_SIZE));
				const endRow = Math.min(gridHeight, Math.ceil(bounds.maxY / CELL_SIZE));

				const clampedMinX = Math.max(0, bounds.minX);
				const clampedMaxX = Math.min(totalWidthPx, bounds.maxX);
				const clampedMinY = Math.max(0, bounds.minY);
				const clampedMaxY = Math.min(totalHeightPx, bounds.maxY);

				if (clampedMaxX > clampedMinX && clampedMaxY > clampedMinY) {
					// Minor grid lines batched into a single draw call
					rawContext.beginPath();
					for (let column = startColumn; column <= endColumn; column += 1) {
						if (column % 5 === 0) {
							continue;
						}
						const xPx = column * CELL_SIZE;
						rawContext.moveTo(xPx, clampedMinY);
						rawContext.lineTo(xPx, clampedMaxY);
					}
					for (let row = startRow; row <= endRow; row += 1) {
						if (row % 5 === 0) {
							continue;
						}
						const yPx = row * CELL_SIZE;
						rawContext.moveTo(clampedMinX, yPx);
						rawContext.lineTo(clampedMaxX, yPx);
					}
					rawContext.strokeStyle = isDark
						? "rgba(148, 163, 184, 0.10)"
						: "rgba(120, 98, 66, 0.14)";
					rawContext.lineWidth = 1;
					rawContext.stroke();

					// Major 5-tile grid lines batched into a single draw call
					rawContext.beginPath();
					for (let column = startColumn; column <= endColumn; column += 1) {
						if (column % 5 !== 0) {
							continue;
						}
						const xPx = column * CELL_SIZE;
						rawContext.moveTo(xPx, clampedMinY);
						rawContext.lineTo(xPx, clampedMaxY);
					}
					for (let row = startRow; row <= endRow; row += 1) {
						if (row % 5 !== 0) {
							continue;
						}
						const yPx = row * CELL_SIZE;
						rawContext.moveTo(clampedMinX, yPx);
						rawContext.lineTo(clampedMaxX, yPx);
					}
					rawContext.strokeStyle = isDark
						? "rgba(212, 168, 83, 0.22)"
						: "rgba(120, 98, 66, 0.30)";
					rawContext.lineWidth = 1.25;
					rawContext.stroke();
				}
			}

			rawContext.strokeStyle = isDark
				? "rgba(212, 168, 83, 0.45)"
				: "rgba(120, 88, 42, 0.55)";
			rawContext.lineWidth = 2;
			rawContext.strokeRect(0, 0, totalWidthPx, totalHeightPx);
			rawContext.restore();
		},
		[canvasTheme, gridHeight, gridWidth, showGrid]
	);

	return (
		<Layer listening={false}>
			<Shape
				listening={false}
				perfectDrawEnabled={false}
				sceneFunc={drawGridScene}
				shadowForStrokeEnabled={false}
			/>
		</Layer>
	);
});

export type InfluenceLayerProps = {
	readonly discreteCoverageSpans: ReadonlyArray<TileSpan>;
	readonly visibleInfluenceSources: ReadonlyArray<VisibleInfluenceSource>;
};

export const InfluenceLayer = memo(function InfluenceLayer({
	discreteCoverageSpans,
	visibleInfluenceSources,
}: InfluenceLayerProps): React.ReactElement {
	const drawInfluenceScene = useCallback(
		(context: Konva.Context, shape: Konva.Shape): void => {
			if (
				discreteCoverageSpans.length === 0 &&
				visibleInfluenceSources.length === 0
			) {
				return;
			}
			const rawContext = context._context;
			const bounds = getStageWorldBounds(shape);

			rawContext.save();

			if (discreteCoverageSpans.length > 0) {
				rawContext.beginPath();
				let hasVisibleSpan = false;
				for (const span of discreteCoverageSpans) {
					const xPx = span.xStart * CELL_SIZE;
					const yPx = span.y * CELL_SIZE;
					const widthPx = span.width * CELL_SIZE;
					if (!isWorldRectVisible(xPx, yPx, widthPx, CELL_SIZE, bounds)) {
						continue;
					}
					rawContext.rect(xPx, yPx, widthPx, CELL_SIZE);
					hasVisibleSpan = true;
				}
				if (hasVisibleSpan) {
					rawContext.fillStyle = "rgba(52, 211, 153, 0.14)";
					rawContext.fill();
					rawContext.strokeStyle = "rgba(52, 211, 153, 0.25)";
					rawContext.lineWidth = 0.75;
					rawContext.stroke();
				}
			}

			if (visibleInfluenceSources.length > 0) {
				for (const source of visibleInfluenceSources) {
					if (source.isPrimary) {
						continue;
					}
					const centerXPx =
						(source.rect.x + source.rect.width * 0.5) * CELL_SIZE;
					const centerYPx =
						(source.rect.y + source.rect.height * 0.5) * CELL_SIZE;
					const radiusPx = source.radius * CELL_SIZE;
					if (
						!isWorldRectVisible(
							centerXPx - radiusPx,
							centerYPx - radiusPx,
							radiusPx * 2,
							radiusPx * 2,
							bounds
						)
					) {
						continue;
					}
					rawContext.setLineDash([5, 6]);
					rawContext.lineWidth = 1.25;
					rawContext.fillStyle = "rgba(56, 189, 248, 0.05)";
					rawContext.strokeStyle = "rgba(125, 211, 252, 0.45)";
					rawContext.beginPath();
					rawContext.arc(
						centerXPx,
						centerYPx,
						radiusPx,
						0,
						FULL_CIRCLE_RADIANS
					);
					rawContext.fill();
					rawContext.stroke();
				}

				for (const source of visibleInfluenceSources) {
					if (!source.isPrimary) {
						continue;
					}
					const centerXPx =
						(source.rect.x + source.rect.width * 0.5) * CELL_SIZE;
					const centerYPx =
						(source.rect.y + source.rect.height * 0.5) * CELL_SIZE;
					const radiusPx = source.radius * CELL_SIZE;
					if (
						!isWorldRectVisible(
							centerXPx - radiusPx,
							centerYPx - radiusPx,
							radiusPx * 2,
							radiusPx * 2,
							bounds
						)
					) {
						continue;
					}
					rawContext.setLineDash([8, 5]);
					rawContext.lineWidth = 2;
					rawContext.fillStyle = "rgba(251, 191, 36, 0.11)";
					rawContext.strokeStyle = "rgba(251, 191, 36, 0.85)";
					rawContext.beginPath();
					rawContext.arc(
						centerXPx,
						centerYPx,
						radiusPx,
						0,
						FULL_CIRCLE_RADIANS
					);
					rawContext.fill();
					rawContext.stroke();
				}
			}

			rawContext.restore();
		},
		[discreteCoverageSpans, visibleInfluenceSources]
	);

	return (
		<Layer listening={false}>
			<Shape
				listening={false}
				perfectDrawEnabled={false}
				sceneFunc={drawInfluenceScene}
				shadowForStrokeEnabled={false}
			/>
		</Layer>
	);
});

export type BuildingsLayerProps = {
	readonly buildings: ReadonlyArray<PlacedBuilding>;
	readonly spatialIndex: SpatialGridIndex;
	readonly hiddenBuildingIds: ReadonlySet<string>;
	readonly showIcons: boolean;
	readonly showLabels: boolean;
	readonly imageCacheVersion: number;
};

type VisibleStructureEntry = {
	readonly building: PlacedBuilding;
	readonly preset: BuildingPreset | undefined;
	readonly xPx: number;
	readonly yPx: number;
	readonly widthPx: number;
	readonly heightPx: number;
};

export const BuildingsLayer = memo(function BuildingsLayer({
	buildings,
	spatialIndex,
	hiddenBuildingIds,
	showIcons,
	showLabels,
	imageCacheVersion,
}: BuildingsLayerProps): React.ReactElement {
	const drawBuildingsScene = useCallback(
		(context: Konva.Context, shape: Konva.Shape): void => {
			// Reference imageCacheVersion so ESLint exhaustive-deps tracks async icon loads
			void imageCacheVersion;

			if (buildings.length === 0) {
				return;
			}

			const rawContext = context._context;
			const bounds = getStageWorldBounds(shape);
			const hasHiddenSet = hiddenBuildingIds.size > 0;
			const visibleRoads: Array<VisibleStructureEntry> = [];
			const visibleStructures: Array<VisibleStructureEntry> = [];

			for (const building of buildings) {
				if (hasHiddenSet && hiddenBuildingIds.has(building.id)) {
					continue;
				}
				const xPx = building.x * CELL_SIZE;
				const yPx = building.y * CELL_SIZE;
				const widthPx = building.width * CELL_SIZE;
				const heightPx = building.height * CELL_SIZE;
				if (!isWorldRectVisible(xPx, yPx, widthPx, heightPx, bounds)) {
					continue;
				}

				const preset = PRESET_BY_ID.get(building.presetId);
				if (preset?.isRoad && building.width === 1 && building.height === 1) {
					visibleRoads.push({
						building,
						preset,
						xPx,
						yPx,
						widthPx,
						heightPx,
					});
				} else {
					visibleStructures.push({
						building,
						preset,
						xPx,
						yPx,
						widthPx,
						heightPx,
					});
				}
			}

			rawContext.save();

			// 1. Seamless 1x1 road tiles: fill rects + 1 batched stroke for all exposed edges
			if (visibleRoads.length > 0) {
				rawContext.globalAlpha = 0.94;
				let previousRoadFill = "";
				for (const entry of visibleRoads) {
					const fill =
						entry.building.customColor ??
						entry.preset?.cssColor ??
						"rgba(148, 163, 184, 1)";
					if (fill !== previousRoadFill) {
						rawContext.fillStyle = fill;
						previousRoadFill = fill;
					}
					rawContext.fillRect(entry.xPx, entry.yPx, CELL_SIZE, CELL_SIZE);
				}

				rawContext.globalAlpha = 1;
				rawContext.strokeStyle = "rgba(15, 23, 42, 0.45)";
				rawContext.lineWidth = 1;
				rawContext.beginPath();
				let hasAnyRoadEdge = false;

				for (const entry of visibleRoads) {
					const tileX = entry.building.x;
					const tileY = entry.building.y;
					const hasNorth = hasHiddenSet
						? spatialIndex.hasRoadAtExcluding(
								tileX,
								tileY - 1,
								hiddenBuildingIds
							)
						: spatialIndex.hasRoadAt(tileX, tileY - 1);
					const hasSouth = hasHiddenSet
						? spatialIndex.hasRoadAtExcluding(
								tileX,
								tileY + 1,
								hiddenBuildingIds
							)
						: spatialIndex.hasRoadAt(tileX, tileY + 1);
					const hasWest = hasHiddenSet
						? spatialIndex.hasRoadAtExcluding(
								tileX - 1,
								tileY,
								hiddenBuildingIds
							)
						: spatialIndex.hasRoadAt(tileX - 1, tileY);
					const hasEast = hasHiddenSet
						? spatialIndex.hasRoadAtExcluding(
								tileX + 1,
								tileY,
								hiddenBuildingIds
							)
						: spatialIndex.hasRoadAt(tileX + 1, tileY);

					if (!hasNorth) {
						rawContext.moveTo(entry.xPx, entry.yPx + 0.5);
						rawContext.lineTo(entry.xPx + CELL_SIZE, entry.yPx + 0.5);
						hasAnyRoadEdge = true;
					}
					if (!hasSouth) {
						rawContext.moveTo(entry.xPx, entry.yPx + CELL_SIZE - 0.5);
						rawContext.lineTo(
							entry.xPx + CELL_SIZE,
							entry.yPx + CELL_SIZE - 0.5
						);
						hasAnyRoadEdge = true;
					}
					if (!hasWest) {
						rawContext.moveTo(entry.xPx + 0.5, entry.yPx);
						rawContext.lineTo(entry.xPx + 0.5, entry.yPx + CELL_SIZE);
						hasAnyRoadEdge = true;
					}
					if (!hasEast) {
						rawContext.moveTo(entry.xPx + CELL_SIZE - 0.5, entry.yPx);
						rawContext.lineTo(
							entry.xPx + CELL_SIZE - 0.5,
							entry.yPx + CELL_SIZE
						);
						hasAnyRoadEdge = true;
					}
				}

				if (hasAnyRoadEdge) {
					rawContext.stroke();
				}
			}

			// 2. Non-road structures & multi-tile strips
			if (visibleStructures.length > 0) {
				if (spatialIndex.hasAnyOverlap) {
					for (const entry of visibleStructures) {
						drawSingleStructure(rawContext, entry.building, entry.preset, {
							xPx: entry.xPx,
							yPx: entry.yPx,
							widthPx: entry.widthPx,
							heightPx: entry.heightPx,
							fillAlpha: 0.92,
							borderStroke: "rgba(15, 23, 42, 0.78)",
							borderWidth: 1.5,
							scale: bounds.scale,
							showIcons,
							showLabels,
						});
					}
				} else {
					const useRoundedCorners = bounds.scale >= 0.4;

					// Pass A: Fills
					rawContext.globalAlpha = 0.92;
					let previousFill = "";
					for (const entry of visibleStructures) {
						const fill =
							entry.building.customColor ??
							entry.preset?.cssColor ??
							"rgba(148, 163, 184, 1)";
						if (fill !== previousFill) {
							rawContext.fillStyle = fill;
							previousFill = fill;
						}
						if (!useRoundedCorners || entry.preset?.isBorderless) {
							rawContext.fillRect(
								entry.xPx,
								entry.yPx,
								entry.widthPx,
								entry.heightPx
							);
						} else {
							rawContext.beginPath();
							traceRoundedRectPath(
								rawContext,
								entry.xPx,
								entry.yPx,
								entry.widthPx,
								entry.heightPx,
								3
							);
							rawContext.fill();
						}
					}

					// Pass B: Batched outer dark borders (1 draw call for all visible buildings)
					rawContext.globalAlpha = 0.92;
					rawContext.strokeStyle = "rgba(15, 23, 42, 0.78)";
					rawContext.lineWidth = 1.5;
					rawContext.beginPath();
					for (const entry of visibleStructures) {
						const radius =
							useRoundedCorners && !entry.preset?.isBorderless ? 3 : 0;
						traceRoundedRectPath(
							rawContext,
							entry.xPx,
							entry.yPx,
							entry.widthPx,
							entry.heightPx,
							radius
						);
					}
					rawContext.stroke();

					// Pass C: Batched inner bevel highlight (1 draw call when readable)
					if (bounds.scale >= 0.45) {
						rawContext.globalAlpha = 1;
						rawContext.strokeStyle = "rgba(255, 255, 255, 0.22)";
						rawContext.lineWidth = 1;
						rawContext.beginPath();
						let hasBevel = false;
						for (const entry of visibleStructures) {
							if (
								entry.preset?.isBorderless ||
								entry.widthPx <= 4 ||
								entry.heightPx <= 4
							) {
								continue;
							}
							traceRoundedRectPath(
								rawContext,
								entry.xPx + 2,
								entry.yPx + 2,
								entry.widthPx - 4,
								entry.heightPx - 4,
								2
							);
							hasBevel = true;
						}
						if (hasBevel) {
							rawContext.stroke();
						}
					}

					// Pass D: Building icons
					const canRenderLabelsAtScale = showLabels && bounds.scale >= 0.55;
					if (showIcons && bounds.scale >= 0.24) {
						rawContext.globalAlpha = 1;
						for (const entry of visibleStructures) {
							const iconImage = ensureImageLoaded(entry.preset?.iconUrl);
							if (!iconImage) {
								continue;
							}
							const minSidePx = Math.min(entry.widthPx, entry.heightPx);
							const iconSize = clampNumber(minSidePx * 0.56, 18, 52);
							const hasLabelOnThis =
								canRenderLabelsAtScale &&
								entry.widthPx >= 2 * CELL_SIZE &&
								entry.heightPx >= 2 * CELL_SIZE;
							const iconX = entry.xPx + (entry.widthPx - iconSize) * 0.5;
							const iconY = hasLabelOnThis
								? entry.yPx + Math.max(4, (entry.heightPx - iconSize) * 0.5 - 7)
								: entry.yPx + (entry.heightPx - iconSize) * 0.5;
							rawContext.drawImage(iconImage, iconX, iconY, iconSize, iconSize);
						}
					}

					// Pass E: Building text labels (font & alignment configured once!)
					if (canRenderLabelsAtScale) {
						rawContext.globalAlpha = 1;
						rawContext.font = LABEL_FONT;
						rawContext.fillStyle = "#0f172a";
						rawContext.textAlign = "center";
						rawContext.textBaseline = "middle";

						for (const entry of visibleStructures) {
							if (
								entry.widthPx < 2 * CELL_SIZE ||
								entry.heightPx < 2 * CELL_SIZE
							) {
								continue;
							}
							const displayLabel =
								entry.building.customLabel ??
								entry.preset?.name ??
								entry.building.presetId;
							const truncated = getTruncatedLabel(
								rawContext,
								displayLabel,
								entry.widthPx - 8
							);
							if (truncated) {
								rawContext.fillText(
									truncated,
									entry.xPx + entry.widthPx * 0.5,
									entry.yPx + entry.heightPx - 9
								);
							}
						}
					}
				}
			}

			rawContext.restore();
		},
		[
			buildings,
			hiddenBuildingIds,
			imageCacheVersion,
			showIcons,
			showLabels,
			spatialIndex,
		]
	);

	return (
		<Layer listening={false}>
			<Shape
				listening={false}
				perfectDrawEnabled={false}
				sceneFunc={drawBuildingsScene}
				shadowForStrokeEnabled={false}
			/>
		</Layer>
	);
});

export type DynamicOverlayLayerProps = {
	readonly spatialIndex: SpatialGridIndex;
	readonly selectedIds: ReadonlyArray<string>;
	readonly selectedIdSet: ReadonlySet<string>;
	readonly hoveredBuildingId: string | null;
	readonly coveredBuildingIds: ReadonlySet<string>;
	readonly dragMove: DragMoveSession | null;
	readonly movingIdSet: ReadonlySet<string>;
	readonly isDragMoveValid: boolean;
	readonly ghostRect: GhostPlacementRect | null;
	readonly ghostPreset: BuildingPreset | null;
	readonly marquee: MarqueeSession | null;
	readonly showIcons: boolean;
	readonly showLabels: boolean;
	readonly imageCacheVersion: number;
};

export const DynamicOverlayLayer = memo(function DynamicOverlayLayer({
	spatialIndex,
	selectedIds,
	selectedIdSet,
	hoveredBuildingId,
	coveredBuildingIds,
	dragMove,
	movingIdSet,
	isDragMoveValid,
	ghostRect,
	ghostPreset,
	marquee,
	showIcons,
	showLabels,
	imageCacheVersion,
}: DynamicOverlayLayerProps): React.ReactElement {
	const drawOverlayScene = useCallback(
		(context: Konva.Context, shape: Konva.Shape): void => {
			void imageCacheVersion;

			const isActivelyMoving = Boolean(
				dragMove && (dragMove.deltaX !== 0 || dragMove.deltaY !== 0)
			);
			if (
				coveredBuildingIds.size === 0 &&
				!hoveredBuildingId &&
				selectedIds.length === 0 &&
				!isActivelyMoving &&
				!ghostRect &&
				!marquee
			) {
				return;
			}

			const rawContext = context._context;
			const bounds = getStageWorldBounds(shape);
			const useRoundedCorners = bounds.scale >= 0.4;

			rawContext.save();

			// 1. Covered building emerald borders + top-right indicator dots
			if (coveredBuildingIds.size > 0) {
				rawContext.beginPath();
				let hasCoveredBorders = false;
				const badgeCenters: Array<{ readonly x: number; readonly y: number }> =
					[];

				for (const coveredId of coveredBuildingIds) {
					if (selectedIdSet.has(coveredId)) {
						continue;
					}
					const baseBuilding = spatialIndex.buildingById.get(coveredId);
					if (!baseBuilding) {
						continue;
					}
					const isMovingThis = isActivelyMoving && movingIdSet.has(coveredId);
					const tileX =
						isMovingThis && dragMove
							? baseBuilding.x + dragMove.deltaX
							: baseBuilding.x;
					const tileY =
						isMovingThis && dragMove
							? baseBuilding.y + dragMove.deltaY
							: baseBuilding.y;
					const xPx = tileX * CELL_SIZE;
					const yPx = tileY * CELL_SIZE;
					const widthPx = baseBuilding.width * CELL_SIZE;
					const heightPx = baseBuilding.height * CELL_SIZE;

					if (!isWorldRectVisible(xPx, yPx, widthPx, heightPx, bounds)) {
						continue;
					}

					badgeCenters.push({ x: xPx + widthPx - 8, y: yPx + 8 });

					if (hoveredBuildingId === coveredId || isMovingThis) {
						continue;
					}
					const preset = PRESET_BY_ID.get(baseBuilding.presetId);
					const radius = useRoundedCorners && !preset?.isBorderless ? 3 : 0;
					traceRoundedRectPath(rawContext, xPx, yPx, widthPx, heightPx, radius);
					hasCoveredBorders = true;
				}

				if (hasCoveredBorders) {
					rawContext.strokeStyle = "#10b981";
					rawContext.lineWidth = 2.25;
					rawContext.stroke();
				}

				if (badgeCenters.length > 0) {
					rawContext.beginPath();
					for (const center of badgeCenters) {
						rawContext.moveTo(center.x + 4.5, center.y);
						rawContext.arc(center.x, center.y, 4.5, 0, FULL_CIRCLE_RADIANS);
					}
					rawContext.fillStyle = "#10b981";
					rawContext.fill();
					rawContext.strokeStyle = "#052e16";
					rawContext.lineWidth = 1;
					rawContext.stroke();
				}
			}

			// 2. Hovered building highlight border
			if (
				hoveredBuildingId &&
				!selectedIdSet.has(hoveredBuildingId) &&
				!(isActivelyMoving && movingIdSet.has(hoveredBuildingId))
			) {
				const hoveredBuilding =
					spatialIndex.buildingById.get(hoveredBuildingId);
				if (hoveredBuilding) {
					const preset = PRESET_BY_ID.get(hoveredBuilding.presetId);
					if (
						!(
							preset?.isRoad &&
							hoveredBuilding.width === 1 &&
							hoveredBuilding.height === 1
						)
					) {
						const xPx = hoveredBuilding.x * CELL_SIZE;
						const yPx = hoveredBuilding.y * CELL_SIZE;
						const widthPx = hoveredBuilding.width * CELL_SIZE;
						const heightPx = hoveredBuilding.height * CELL_SIZE;
						if (isWorldRectVisible(xPx, yPx, widthPx, heightPx, bounds)) {
							const radius = useRoundedCorners && !preset?.isBorderless ? 3 : 0;
							rawContext.beginPath();
							traceRoundedRectPath(
								rawContext,
								xPx,
								yPx,
								widthPx,
								heightPx,
								radius
							);
							rawContext.strokeStyle = "#f8fafc";
							rawContext.lineWidth = 2;
							rawContext.stroke();
						}
					}
				}
			}

			// 3. Selected stationary highlights OR actively drag-moving buildings
			if (isActivelyMoving && dragMove) {
				const moveBorderColor = isDragMoveValid ? "#fbbf24" : "#ef4444";
				const moveBorderWidth = isDragMoveValid ? 2.75 : 3;

				for (const movingId of dragMove.movingIds) {
					const baseBuilding = spatialIndex.buildingById.get(movingId);
					if (!baseBuilding) {
						continue;
					}
					const preset = PRESET_BY_ID.get(baseBuilding.presetId);
					const movedX = baseBuilding.x + dragMove.deltaX;
					const movedY = baseBuilding.y + dragMove.deltaY;
					const xPx = movedX * CELL_SIZE;
					const yPx = movedY * CELL_SIZE;
					const widthPx = baseBuilding.width * CELL_SIZE;
					const heightPx = baseBuilding.height * CELL_SIZE;

					if (!isWorldRectVisible(xPx, yPx, widthPx, heightPx, bounds)) {
						continue;
					}

					if (
						preset?.isRoad &&
						baseBuilding.width === 1 &&
						baseBuilding.height === 1
					) {
						const fill =
							baseBuilding.customColor ??
							preset.cssColor ??
							"rgba(148, 163, 184, 1)";
						rawContext.globalAlpha = 0.8;
						rawContext.fillStyle = fill;
						rawContext.fillRect(xPx, yPx, CELL_SIZE, CELL_SIZE);
						rawContext.globalAlpha = 1;
						rawContext.strokeStyle = moveBorderColor;
						rawContext.lineWidth = 2;
						rawContext.strokeRect(
							xPx + 1,
							yPx + 1,
							CELL_SIZE - 2,
							CELL_SIZE - 2
						);
					} else {
						drawSingleStructure(rawContext, baseBuilding, preset, {
							xPx,
							yPx,
							widthPx,
							heightPx,
							fillAlpha: 0.82,
							borderStroke: moveBorderColor,
							borderWidth: moveBorderWidth,
							scale: bounds.scale,
							showIcons,
							showLabels,
						});
					}
				}
			} else if (selectedIds.length > 0) {
				rawContext.beginPath();
				let hasSelectedRoads = false;
				for (const selectedId of selectedIds) {
					const selectedBuilding = spatialIndex.buildingById.get(selectedId);
					if (!selectedBuilding) {
						continue;
					}
					const preset = PRESET_BY_ID.get(selectedBuilding.presetId);
					if (
						preset?.isRoad &&
						selectedBuilding.width === 1 &&
						selectedBuilding.height === 1
					) {
						const xPx = selectedBuilding.x * CELL_SIZE;
						const yPx = selectedBuilding.y * CELL_SIZE;
						if (isWorldRectVisible(xPx, yPx, CELL_SIZE, CELL_SIZE, bounds)) {
							rawContext.rect(xPx + 1, yPx + 1, CELL_SIZE - 2, CELL_SIZE - 2);
							hasSelectedRoads = true;
						}
					}
				}
				if (hasSelectedRoads) {
					rawContext.strokeStyle = "#fbbf24";
					rawContext.lineWidth = 2;
					rawContext.stroke();
				}

				rawContext.beginPath();
				let hasSelectedStructures = false;
				for (const selectedId of selectedIds) {
					const selectedBuilding = spatialIndex.buildingById.get(selectedId);
					if (!selectedBuilding) {
						continue;
					}
					const preset = PRESET_BY_ID.get(selectedBuilding.presetId);
					if (
						preset?.isRoad &&
						selectedBuilding.width === 1 &&
						selectedBuilding.height === 1
					) {
						continue;
					}
					const xPx = selectedBuilding.x * CELL_SIZE;
					const yPx = selectedBuilding.y * CELL_SIZE;
					const widthPx = selectedBuilding.width * CELL_SIZE;
					const heightPx = selectedBuilding.height * CELL_SIZE;
					if (!isWorldRectVisible(xPx, yPx, widthPx, heightPx, bounds)) {
						continue;
					}
					const radius = useRoundedCorners && !preset?.isBorderless ? 3 : 0;
					traceRoundedRectPath(rawContext, xPx, yPx, widthPx, heightPx, radius);
					hasSelectedStructures = true;
				}
				if (hasSelectedStructures) {
					rawContext.strokeStyle = "#fbbf24";
					rawContext.lineWidth = 2.75;
					rawContext.stroke();
				}
			}

			// 4. Live placement ghost footprint
			if (ghostRect && ghostPreset) {
				const xPx = ghostRect.x * CELL_SIZE;
				const yPx = ghostRect.y * CELL_SIZE;
				const widthPx = ghostRect.width * CELL_SIZE;
				const heightPx = ghostRect.height * CELL_SIZE;

				rawContext.globalAlpha = 0.72;
				rawContext.fillStyle = ghostRect.valid
					? ghostPreset.cssColor
					: "rgba(239, 68, 68, 0.45)";
				rawContext.strokeStyle = ghostRect.valid ? "#34d399" : "#ef4444";
				rawContext.lineWidth = 2.5;
				rawContext.beginPath();
				traceRoundedRectPath(rawContext, xPx, yPx, widthPx, heightPx, 3);
				rawContext.fill();
				rawContext.stroke();

				if (showIcons) {
					const ghostIcon = ensureImageLoaded(ghostPreset.iconUrl);
					if (ghostIcon) {
						const ghostIconSize = Math.min(
							44,
							Math.min(ghostRect.width, ghostRect.height) * CELL_SIZE * 0.58
						);
						rawContext.globalAlpha = 0.9;
						rawContext.drawImage(
							ghostIcon,
							xPx + (widthPx - ghostIconSize) * 0.5,
							yPx + (heightPx - ghostIconSize) * 0.5,
							ghostIconSize,
							ghostIconSize
						);
					}
				}

				if (ghostRect.width >= 2) {
					rawContext.globalAlpha = 1;
					rawContext.font = GHOST_BADGE_FONT;
					rawContext.fillStyle = ghostRect.valid ? "#ecfdf5" : "#fef2f2";
					rawContext.textAlign = "center";
					rawContext.textBaseline = "top";
					rawContext.fillText(
						`${ghostRect.width}×${ghostRect.height}`,
						xPx + widthPx * 0.5,
						yPx - 15
					);
				}
			}

			// 5. Marquee selection box
			if (marquee) {
				const marqueeX = Math.min(marquee.startWorldX, marquee.currentWorldX);
				const marqueeY = Math.min(marquee.startWorldY, marquee.currentWorldY);
				const marqueeWidth = Math.abs(
					marquee.currentWorldX - marquee.startWorldX
				);
				const marqueeHeight = Math.abs(
					marquee.currentWorldY - marquee.startWorldY
				);

				rawContext.globalAlpha = 1;
				rawContext.setLineDash([5, 4]);
				rawContext.fillStyle = "rgba(251, 191, 36, 0.14)";
				rawContext.strokeStyle = "#fbbf24";
				rawContext.lineWidth = 1.5 / bounds.scale;
				rawContext.fillRect(marqueeX, marqueeY, marqueeWidth, marqueeHeight);
				rawContext.strokeRect(marqueeX, marqueeY, marqueeWidth, marqueeHeight);
			}

			rawContext.restore();
		},
		[
			coveredBuildingIds,
			dragMove,
			ghostPreset,
			ghostRect,
			hoveredBuildingId,
			imageCacheVersion,
			isDragMoveValid,
			marquee,
			movingIdSet,
			selectedIdSet,
			selectedIds,
			showIcons,
			showLabels,
			spatialIndex,
		]
	);

	return (
		<Layer listening={false}>
			<Shape
				listening={false}
				perfectDrawEnabled={false}
				sceneFunc={drawOverlayScene}
				shadowForStrokeEnabled={false}
			/>
		</Layer>
	);
});
