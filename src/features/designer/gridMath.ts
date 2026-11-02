import { PRESET_BY_ID } from "./presetsData";
import type {
	BuildingCategory,
	BuildingPreset,
	GridPoint,
	GridRect,
	PlacedBuilding,
	TileSpan,
} from "./types";

export const toTileKey = (x: number, y: number): string => `${x},${y}`;

export const rectanglesOverlap = (
	first: GridRect,
	second: GridRect
): boolean => {
	return (
		first.x < second.x + second.width &&
		first.x + first.width > second.x &&
		first.y < second.y + second.height &&
		first.y + first.height > second.y
	);
};

export const isWithinGrid = (
	rectangle: GridRect,
	gridWidth: number,
	gridHeight: number
): boolean => {
	return (
		rectangle.x >= 0 &&
		rectangle.y >= 0 &&
		rectangle.x + rectangle.width <= gridWidth &&
		rectangle.y + rectangle.height <= gridHeight
	);
};

export const canPlaceBuilding = (
	buildings: ReadonlyArray<PlacedBuilding>,
	candidate: GridRect,
	gridWidth: number,
	gridHeight: number,
	ignoreIds?: ReadonlySet<string>
): boolean => {
	if (!isWithinGrid(candidate, gridWidth, gridHeight)) {
		return false;
	}

	for (const existing of buildings) {
		if (ignoreIds?.has(existing.id)) {
			continue;
		}
		if (rectanglesOverlap(candidate, existing)) {
			return false;
		}
	}

	return true;
};

export const getRectCenter = (rectangle: GridRect): GridPoint => ({
	x: rectangle.x + rectangle.width / 2,
	y: rectangle.y + rectangle.height / 2,
});

export const isRectCoveredBySource = (
	target: GridRect,
	source: GridRect,
	radius: number
): boolean => {
	if (radius <= 0) {
		return false;
	}
	const targetCenter = getRectCenter(target);
	const sourceCenter = getRectCenter(source);
	const distance = Math.hypot(
		targetCenter.x - sourceCenter.x,
		targetCenter.y - sourceCenter.y
	);
	return distance <= radius + 1e-6;
};

export const computeCoveredTileSpans = (
	source: GridRect,
	radius: number,
	gridWidth: number,
	gridHeight: number
): Array<TileSpan> => {
	if (radius <= 0) {
		return [];
	}

	const centerX = source.x + source.width / 2;
	const centerY = source.y + source.height / 2;
	const minimumRow = Math.max(0, Math.floor(centerY - radius));
	const maximumRow = Math.min(gridHeight - 1, Math.ceil(centerY + radius));
	const radiusSquared = radius * radius;
	const spans: Array<TileSpan> = [];

	for (let row = minimumRow; row <= maximumRow; row += 1) {
		const deltaY = row + 0.5 - centerY;
		const deltaYSquared = deltaY * deltaY;
		if (deltaYSquared > radiusSquared) {
			continue;
		}
		const maximumDeltaX = Math.sqrt(radiusSquared - deltaYSquared);
		const startColumn = Math.max(
			0,
			Math.ceil(centerX - maximumDeltaX - 0.5 - 1e-9)
		);
		const endColumn = Math.min(
			gridWidth - 1,
			Math.floor(centerX + maximumDeltaX - 0.5 + 1e-9)
		);
		if (endColumn >= startColumn) {
			spans.push({
				y: row,
				xStart: startColumn,
				width: endColumn - startColumn + 1,
			});
		}
	}

	return spans;
};

export const buildRoadTileKeySet = (
	buildings: ReadonlyArray<PlacedBuilding>,
	presetMap: ReadonlyMap<string, BuildingPreset> = PRESET_BY_ID
): Set<string> => {
	const keys = new Set<string>();
	for (const building of buildings) {
		const preset = presetMap.get(building.presetId);
		if (!preset?.isRoad) {
			continue;
		}
		for (let dx = 0; dx < building.width; dx += 1) {
			for (let dy = 0; dy < building.height; dy += 1) {
				keys.add(toTileKey(building.x + dx, building.y + dy));
			}
		}
	}
	return keys;
};

export const hasAdjacentRoadTile = (
	rectangle: GridRect,
	roadTileKeys: ReadonlySet<string>
): boolean => {
	for (let x = rectangle.x; x < rectangle.x + rectangle.width; x += 1) {
		if (
			roadTileKeys.has(toTileKey(x, rectangle.y - 1)) ||
			roadTileKeys.has(toTileKey(x, rectangle.y + rectangle.height))
		) {
			return true;
		}
	}
	for (let y = rectangle.y; y < rectangle.y + rectangle.height; y += 1) {
		if (
			roadTileKeys.has(toTileKey(rectangle.x - 1, y)) ||
			roadTileKeys.has(toTileKey(rectangle.x + rectangle.width, y))
		) {
			return true;
		}
	}
	return false;
};

export const computeLineCells = (
	start: GridPoint,
	end: GridPoint,
	orthogonalLock: boolean
): Array<GridPoint> => {
	if (orthogonalLock) {
		const points: Array<GridPoint> = [];
		const deltaX = end.x - start.x;
		const deltaY = end.y - start.y;
		const stepX = deltaX >= 0 ? 1 : -1;
		const stepY = deltaY >= 0 ? 1 : -1;

		if (Math.abs(deltaX) >= Math.abs(deltaY)) {
			for (let x = start.x; x !== end.x; x += stepX) {
				points.push({ x, y: start.y });
			}
			for (let y = start.y; y !== end.y + stepY; y += stepY) {
				points.push({ x: end.x, y });
			}
		} else {
			for (let y = start.y; y !== end.y; y += stepY) {
				points.push({ x: start.x, y });
			}
			for (let x = start.x; x !== end.x + stepX; x += stepX) {
				points.push({ x, y: end.y });
			}
		}
		return points;
	}

	const points: Array<GridPoint> = [];
	let currentX = start.x;
	let currentY = start.y;
	const distanceX = Math.abs(end.x - start.x);
	const distanceY = -Math.abs(end.y - start.y);
	const stepX = start.x < end.x ? 1 : -1;
	const stepY = start.y < end.y ? 1 : -1;
	let errorTerm = distanceX + distanceY;

	for (let guard = 0; guard < 1000; guard += 1) {
		points.push({ x: currentX, y: currentY });
		if (currentX === end.x && currentY === end.y) {
			break;
		}
		const doubledError = 2 * errorTerm;
		if (doubledError >= distanceY) {
			errorTerm += distanceY;
			currentX += stepX;
		}
		if (doubledError <= distanceX) {
			errorTerm += distanceX;
			currentY += stepY;
		}
	}

	return points;
};

export type PresetCountSummary = {
	readonly presetId: string;
	readonly name: string;
	readonly iconUrl: string | null;
	readonly cssColor: string;
	readonly category: BuildingCategory;
	readonly count: number;
	readonly totalTiles: number;
};

export type LayoutStatistics = {
	readonly totalBuildings: number;
	readonly nonRoadBuildings: number;
	readonly roadTiles: number;
	readonly buildingTiles: number;
	readonly occupiedTiles: number;
	readonly boundingBox: GridRect | null;
	readonly boundingArea: number;
	readonly spaceEfficiencyPercent: number;
	readonly residenceCount: number;
	readonly presetCounts: ReadonlyArray<PresetCountSummary>;
};

export const computeLayoutStatistics = (
	buildings: ReadonlyArray<PlacedBuilding>,
	presetMap: ReadonlyMap<string, BuildingPreset> = PRESET_BY_ID
): LayoutStatistics => {
	if (buildings.length === 0) {
		return {
			totalBuildings: 0,
			nonRoadBuildings: 0,
			roadTiles: 0,
			buildingTiles: 0,
			occupiedTiles: 0,
			boundingBox: null,
			boundingArea: 0,
			spaceEfficiencyPercent: 0,
			residenceCount: 0,
			presetCounts: [],
		};
	}

	let minimumX = Number.POSITIVE_INFINITY;
	let minimumY = Number.POSITIVE_INFINITY;
	let maximumX = Number.NEGATIVE_INFINITY;
	let maximumY = Number.NEGATIVE_INFINITY;
	let roadTiles = 0;
	let buildingTiles = 0;
	let nonRoadBuildings = 0;
	let residenceCount = 0;

	const countByPreset = new Map<
		string,
		{ count: number; totalTiles: number; preset: BuildingPreset | undefined }
	>();

	for (const item of buildings) {
		minimumX = Math.min(minimumX, item.x);
		minimumY = Math.min(minimumY, item.y);
		maximumX = Math.max(maximumX, item.x + item.width);
		maximumY = Math.max(maximumY, item.y + item.height);

		const area = item.width * item.height;
		const preset = presetMap.get(item.presetId);
		if (preset?.isRoad) {
			roadTiles += area;
		} else {
			buildingTiles += area;
			nonRoadBuildings += 1;
		}

		if (preset?.category === "residence") {
			residenceCount += 1;
		}

		const current = countByPreset.get(item.presetId);
		if (current) {
			current.count += 1;
			current.totalTiles += area;
		} else {
			countByPreset.set(item.presetId, {
				count: 1,
				totalTiles: area,
				preset,
			});
		}
	}

	const boundingWidth = maximumX - minimumX;
	const boundingHeight = maximumY - minimumY;
	const boundingArea = boundingWidth * boundingHeight;
	const occupiedTiles = roadTiles + buildingTiles;
	const spaceEfficiencyPercent =
		boundingArea > 0 ? Math.round((buildingTiles / boundingArea) * 100) : 0;

	const presetCounts: Array<PresetCountSummary> = [...countByPreset.entries()]
		.map(([presetId, entry]) => ({
			presetId,
			name: entry.preset?.name ?? presetId,
			iconUrl: entry.preset?.iconUrl ?? null,
			cssColor: entry.preset?.cssColor ?? "rgba(148, 163, 184, 1)",
			category: entry.preset?.category ?? "production",
			count: entry.count,
			totalTiles: entry.totalTiles,
		}))
		.sort((first, second) => {
			if (first.category === "roads" && second.category !== "roads") {
				return 1;
			}
			if (first.category !== "roads" && second.category === "roads") {
				return -1;
			}
			return second.count - first.count;
		});

	return {
		totalBuildings: buildings.length,
		nonRoadBuildings,
		roadTiles,
		buildingTiles,
		occupiedTiles,
		boundingBox: {
			x: minimumX,
			y: minimumY,
			width: boundingWidth,
			height: boundingHeight,
		},
		boundingArea,
		spaceEfficiencyPercent,
		residenceCount,
		presetCounts,
	};
};

type AnnoDesignerObject = {
	readonly Identifier?: string;
	readonly Label?: string;
	readonly Position?: string;
	readonly Size?: string;
	readonly Road?: boolean;
};

type SerializedPlaygroundLayout = {
	readonly format?: string;
	readonly version?: number;
	readonly layoutName?: string;
	readonly gridWidth?: number;
	readonly gridHeight?: number;
	readonly buildings?: ReadonlyArray<{
		readonly presetId: string;
		readonly x: number;
		readonly y: number;
		readonly width: number;
		readonly height: number;
		readonly rotated?: boolean;
		readonly customColor?: string;
		readonly customLabel?: string;
	}>;
	readonly FileVersion?: number;
	readonly Objects?: ReadonlyArray<AnnoDesignerObject>;
};

export const serializePlaygroundJson = (options: {
	readonly layoutName: string;
	readonly gridWidth: number;
	readonly gridHeight: number;
	readonly buildings: ReadonlyArray<PlacedBuilding>;
}): string => {
	return JSON.stringify(
		{
			format: "anno-1404-layout-playground",
			version: 1,
			layoutName: options.layoutName,
			gridWidth: options.gridWidth,
			gridHeight: options.gridHeight,
			buildings: options.buildings.map((building) => ({
				presetId: building.presetId,
				x: building.x,
				y: building.y,
				width: building.width,
				height: building.height,
				rotated: building.rotated,
				...(building.customColor ? { customColor: building.customColor } : {}),
				...(building.customLabel ? { customLabel: building.customLabel } : {}),
			})),
		},
		null,
		2
	);
};

export const serializeAnnoDesignerAdJson = (
	buildings: ReadonlyArray<PlacedBuilding>,
	presetMap: ReadonlyMap<string, BuildingPreset> = PRESET_BY_ID
): string => {
	const objects = buildings.map((building) => {
		const preset = presetMap.get(building.presetId);
		const isRoad = preset?.isRoad ?? false;
		return {
			Identifier: isRoad ? "Road" : building.presetId,
			Label: building.customLabel ?? preset?.name ?? building.presetId,
			Position: `${building.x},${building.y}`,
			Size: `${building.width},${building.height}`,
			Icon: preset?.iconFileName ?? undefined,
			Template: preset?.template ?? "SimpleBuilding",
			InfluenceRange: -2,
			PavedStreet: building.presetId !== "DirtRoad_1x1",
			Radius: preset?.influenceRadius ?? 0,
			Color: preset
				? {
						A: preset.color.a,
						R: preset.color.r,
						G: preset.color.g,
						B: preset.color.b,
					}
				: { A: 255, R: 169, G: 169, B: 169 },
			Borderless: preset?.isBorderless ?? false,
			Road: isRoad,
		};
	});

	return JSON.stringify(
		{
			FileVersion: 4,
			LayoutVersion: "1.0.0.0",
			Objects: objects,
		},
		null,
		2
	);
};

const parsePair = (raw: string | undefined): [number, number] | null => {
	if (!raw) {
		return null;
	}
	const parts = raw.split(",").map((segment) => Number(segment.trim()));
	const first = parts[0];
	const second = parts[1];
	if (
		first === undefined ||
		second === undefined ||
		!Number.isFinite(first) ||
		!Number.isFinite(second)
	) {
		return null;
	}
	return [Math.round(first), Math.round(second)];
};

export const parseLayoutJson = (
	jsonText: string,
	presetMap: ReadonlyMap<string, BuildingPreset> = PRESET_BY_ID
): {
	readonly layoutName: string;
	readonly buildings: Array<Omit<PlacedBuilding, "id">>;
} => {
	const parsed = JSON.parse(jsonText) as SerializedPlaygroundLayout;

	if (Array.isArray(parsed.buildings)) {
		const validBuildings: Array<Omit<PlacedBuilding, "id">> = [];
		for (const entry of parsed.buildings) {
			if (
				typeof entry.presetId === "string" &&
				Number.isFinite(entry.x) &&
				Number.isFinite(entry.y) &&
				Number.isFinite(entry.width) &&
				Number.isFinite(entry.height) &&
				entry.width > 0 &&
				entry.height > 0
			) {
				validBuildings.push({
					presetId: presetMap.has(entry.presetId)
						? entry.presetId
						: "BlockTile_1x1",
					x: Math.max(0, Math.round(entry.x)),
					y: Math.max(0, Math.round(entry.y)),
					width: Math.round(entry.width),
					height: Math.round(entry.height),
					rotated: Boolean(entry.rotated),
					...(entry.customColor ? { customColor: entry.customColor } : {}),
					...(entry.customLabel ? { customLabel: entry.customLabel } : {}),
				});
			}
		}

		return {
			layoutName: parsed.layoutName ?? "Imported Layout",
			buildings: validBuildings,
		};
	}

	if (Array.isArray(parsed.Objects)) {
		const rawConverted: Array<Omit<PlacedBuilding, "id">> = [];
		let minimumX = 0;
		let minimumY = 0;

		for (const item of parsed.Objects) {
			const position = parsePair(item.Position);
			const size = parsePair(item.Size);
			if (!position || !size || size[0] <= 0 || size[1] <= 0) {
				continue;
			}
			minimumX = Math.min(minimumX, position[0]);
			minimumY = Math.min(minimumY, position[1]);

			let presetId = item.Identifier ?? "BlockTile_1x1";
			if (item.Road || presetId === "Road") {
				presetId = "CobblestoneRoad_1x1";
			} else if (!presetMap.has(presetId)) {
				presetId = "BlockTile_1x1";
			}

			const preset = presetMap.get(presetId);
			const rotated = Boolean(
				preset && size[0] === preset.height && size[1] === preset.width
			);

			if (presetId === "CobblestoneRoad_1x1" && (size[0] > 1 || size[1] > 1)) {
				for (let dx = 0; dx < size[0]; dx += 1) {
					for (let dy = 0; dy < size[1]; dy += 1) {
						rawConverted.push({
							presetId: "CobblestoneRoad_1x1",
							x: position[0] + dx,
							y: position[1] + dy,
							width: 1,
							height: 1,
							rotated: false,
						});
					}
				}
			} else {
				rawConverted.push({
					presetId,
					x: position[0],
					y: position[1],
					width: size[0],
					height: size[1],
					rotated,
					...(item.Label && item.Label !== preset?.name
						? { customLabel: item.Label }
						: {}),
				});
			}
		}

		const shiftX = minimumX < 4 ? 4 - minimumX : 0;
		const shiftY = minimumY < 4 ? 4 - minimumY : 0;

		return {
			layoutName: "Imported Anno Designer Layout",
			buildings: rawConverted.map((building) => ({
				...building,
				x: building.x + shiftX,
				y: building.y + shiftY,
			})),
		};
	}

	throw new Error("Unrecognized layout JSON structure.");
};
