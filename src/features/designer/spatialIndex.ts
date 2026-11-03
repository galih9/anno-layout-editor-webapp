import { PRESET_BY_ID } from "./presetsData";
import type { BuildingPreset, GridRect, PlacedBuilding } from "./types";

export type IndexedInfluenceBuilding = {
	readonly building: PlacedBuilding;
	readonly preset: BuildingPreset;
	readonly centerX: number;
	readonly centerY: number;
	readonly radius: number;
	readonly thresholdSquared: number;
	readonly isServiceBuilding: boolean;
};

export type SpatialGridIndex = {
	readonly stride: number;
	readonly rows: number;
	readonly hasAnyOverlap: boolean;
	readonly hasNegativeCoordinates: boolean;
	readonly buildings: ReadonlyArray<PlacedBuilding>;
	readonly buildingById: ReadonlyMap<string, PlacedBuilding>;
	readonly residences: ReadonlyArray<PlacedBuilding>;
	readonly coverableBuildings: ReadonlyArray<PlacedBuilding>;
	readonly influenceBuildings: ReadonlyArray<IndexedInfluenceBuilding>;
	readonly findBuildingAtTile: (
		tileX: number,
		tileY: number
	) => PlacedBuilding | undefined;
	readonly canPlace: (
		candidate: GridRect,
		gridWidth: number,
		gridHeight: number,
		ignoreIds?: ReadonlySet<string>
	) => boolean;
	readonly hasRoadAt: (tileX: number, tileY: number) => boolean;
	readonly hasRoadAtExcluding: (
		tileX: number,
		tileY: number,
		excludedIds: ReadonlySet<string>
	) => boolean;
	readonly hasAdjacentRoad: (rectangle: GridRect) => boolean;
};

const rectanglesOverlapLocal = (first: GridRect, second: GridRect): boolean =>
	first.x < second.x + second.width &&
	first.x + first.width > second.x &&
	first.y < second.y + second.height &&
	first.y + first.height > second.y;

export const buildSpatialGridIndex = (
	buildings: ReadonlyArray<PlacedBuilding>,
	minimumGridWidth = 100,
	minimumGridHeight = 100
): SpatialGridIndex => {
	let maxRight = Math.max(1, minimumGridWidth);
	let maxBottom = Math.max(1, minimumGridHeight);
	let hasNegativeCoordinates = false;

	for (const building of buildings) {
		if (building.x < 0 || building.y < 0) {
			hasNegativeCoordinates = true;
		}
		const right = building.x + building.width;
		const bottom = building.y + building.height;
		if (right > maxRight) {
			maxRight = right;
		}
		if (bottom > maxBottom) {
			maxBottom = bottom;
		}
	}

	// Cap typed-array dimensions against pathological imported coordinates
	const stride = Math.min(1024, maxRight);
	const rows = Math.min(1024, maxBottom);
	const totalCells = stride * rows;
	const cellBuildingIndex = new Int32Array(totalCells);
	const roadMask = new Uint8Array(totalCells);

	let hasAnyOverlap = maxRight > 1024 || maxBottom > 1024;
	const buildingById = new Map<string, PlacedBuilding>();
	const residences: Array<PlacedBuilding> = [];
	const coverableBuildings: Array<PlacedBuilding> = [];
	const influenceBuildings: Array<IndexedInfluenceBuilding> = [];

	for (let index = 0; index < buildings.length; index += 1) {
		const building = buildings[index];
		if (!building) {
			continue;
		}
		buildingById.set(building.id, building);

		const preset = PRESET_BY_ID.get(building.presetId);
		const isRoad = Boolean(preset?.isRoad);

		if (preset?.category === "residence") {
			residences.push(building);
		}
		if (
			preset &&
			!isRoad &&
			preset.template !== "Blocker" &&
			building.presetId !== "TreeTile_1x1"
		) {
			coverableBuildings.push(building);
		}
		if (preset && preset.influenceRadius > 0) {
			const threshold = preset.influenceRadius + 1e-6;
			influenceBuildings.push({
				building,
				preset,
				centerX: building.x + building.width * 0.5,
				centerY: building.y + building.height * 0.5,
				radius: preset.influenceRadius,
				thresholdSquared: threshold * threshold,
				isServiceBuilding:
					preset.category === "public" ||
					preset.category === "harbour" ||
					preset.category === "ornament",
			});
		}

		const encodedIndex = index + 1;
		const startX = Math.max(0, building.x);
		const endX = Math.min(stride, building.x + building.width);
		const startY = Math.max(0, building.y);
		const endY = Math.min(rows, building.y + building.height);

		for (let row = startY; row < endY; row += 1) {
			const rowOffset = row * stride;
			for (let column = startX; column < endX; column += 1) {
				const cellOffset = rowOffset + column;
				if (cellBuildingIndex[cellOffset] !== 0) {
					hasAnyOverlap = true;
				}
				cellBuildingIndex[cellOffset] = encodedIndex;
				if (isRoad) {
					roadMask[cellOffset] = 1;
				}
			}
		}
	}

	const findBuildingAtTile = (
		tileX: number,
		tileY: number
	): PlacedBuilding | undefined => {
		if (
			!hasNegativeCoordinates &&
			tileX >= 0 &&
			tileY >= 0 &&
			tileX < stride &&
			tileY < rows
		) {
			const encoded = cellBuildingIndex[tileY * stride + tileX] ?? 0;
			return encoded > 0 ? buildings[encoded - 1] : undefined;
		}
		if (tileX < 0 || tileY < 0 || tileX >= stride || tileY >= rows) {
			if (!hasNegativeCoordinates) {
				return undefined;
			}
		}
		const cellRect: GridRect = { x: tileX, y: tileY, width: 1, height: 1 };
		for (let index = buildings.length - 1; index >= 0; index -= 1) {
			const candidate = buildings[index];
			if (candidate && rectanglesOverlapLocal(candidate, cellRect)) {
				return candidate;
			}
		}
		return undefined;
	};

	const canPlace = (
		candidate: GridRect,
		gridWidth: number,
		gridHeight: number,
		ignoreIds?: ReadonlySet<string>
	): boolean => {
		if (
			candidate.x < 0 ||
			candidate.y < 0 ||
			candidate.x + candidate.width > gridWidth ||
			candidate.y + candidate.height > gridHeight
		) {
			return false;
		}

		if (
			hasNegativeCoordinates ||
			candidate.x + candidate.width > stride ||
			candidate.y + candidate.height > rows ||
			(hasAnyOverlap && ignoreIds !== undefined && ignoreIds.size > 0)
		) {
			for (const existing of buildings) {
				if (ignoreIds?.has(existing.id)) {
					continue;
				}
				if (rectanglesOverlapLocal(candidate, existing)) {
					return false;
				}
			}
			return true;
		}

		const endX = candidate.x + candidate.width;
		const endY = candidate.y + candidate.height;
		const hasIgnoreSet = ignoreIds !== undefined && ignoreIds.size > 0;

		for (let row = candidate.y; row < endY; row += 1) {
			const rowOffset = row * stride;
			for (let column = candidate.x; column < endX; column += 1) {
				const encoded = cellBuildingIndex[rowOffset + column] ?? 0;
				if (encoded !== 0) {
					if (!hasIgnoreSet) {
						return false;
					}
					const occupying = buildings[encoded - 1];
					if (occupying && !ignoreIds.has(occupying.id)) {
						return false;
					}
				}
			}
		}

		return true;
	};

	const hasRoadAt = (tileX: number, tileY: number): boolean =>
		tileX >= 0 &&
		tileY >= 0 &&
		tileX < stride &&
		tileY < rows &&
		roadMask[tileY * stride + tileX] === 1;

	const hasRoadAtExcluding = (
		tileX: number,
		tileY: number,
		excludedIds: ReadonlySet<string>
	): boolean => {
		if (
			tileX < 0 ||
			tileY < 0 ||
			tileX >= stride ||
			tileY >= rows ||
			roadMask[tileY * stride + tileX] !== 1
		) {
			return false;
		}
		if (excludedIds.size === 0) {
			return true;
		}
		const encoded = cellBuildingIndex[tileY * stride + tileX] ?? 0;
		const occupying = encoded > 0 ? buildings[encoded - 1] : undefined;
		return occupying ? !excludedIds.has(occupying.id) : false;
	};

	const hasAdjacentRoad = (rectangle: GridRect): boolean => {
		const topRow = rectangle.y - 1;
		const bottomRow = rectangle.y + rectangle.height;
		const endX = rectangle.x + rectangle.width;
		for (let column = rectangle.x; column < endX; column += 1) {
			if (hasRoadAt(column, topRow) || hasRoadAt(column, bottomRow)) {
				return true;
			}
		}

		const leftColumn = rectangle.x - 1;
		const rightColumn = rectangle.x + rectangle.width;
		const endY = rectangle.y + rectangle.height;
		for (let row = rectangle.y; row < endY; row += 1) {
			if (hasRoadAt(leftColumn, row) || hasRoadAt(rightColumn, row)) {
				return true;
			}
		}

		return false;
	};

	return {
		stride,
		rows,
		hasAnyOverlap,
		hasNegativeCoordinates,
		buildings,
		buildingById,
		residences,
		coverableBuildings,
		influenceBuildings,
		findBuildingAtTile,
		canPlace,
		hasRoadAt,
		hasRoadAtExcluding,
		hasAdjacentRoad,
	};
};

const spatialIndexCache = new WeakMap<
	ReadonlyArray<PlacedBuilding>,
	SpatialGridIndex
>();

export const getSpatialIndex = (
	buildings: ReadonlyArray<PlacedBuilding>,
	gridWidth = 100,
	gridHeight = 100
): SpatialGridIndex => {
	const cached = spatialIndexCache.get(buildings);
	if (cached && cached.stride >= gridWidth && cached.rows >= gridHeight) {
		return cached;
	}
	const built = buildSpatialGridIndex(buildings, gridWidth, gridHeight);
	spatialIndexCache.set(buildings, built);
	return built;
};
