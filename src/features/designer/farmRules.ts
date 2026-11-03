import {
	computeCoveredTileSpans,
	isRectCoveredBySource,
	isWithinGrid,
	rectanglesOverlap,
} from "./gridMath";
import { PRESET_BY_ID } from "./presetsData";
import { getSpatialIndex, type SpatialGridIndex } from "./spatialIndex";
import type {
	BuildingPreset,
	GridPoint,
	GridRect,
	InfluenceDisplayMode,
	PlacedBuilding,
} from "./types";

export const TREE_TILE_PRESET_ID = "TreeTile_1x1";

export type ColorPresetSwatch = {
	readonly name: string;
	readonly hex: string;
};

export const CUSTOM_COLOR_PRESETS: ReadonlyArray<ColorPresetSwatch> = [
	{ name: "Crimson", hex: "#ef4444" },
	{ name: "Terracotta", hex: "#ea580c" },
	{ name: "Amber", hex: "#f59e0b" },
	{ name: "Emerald", hex: "#10b981" },
	{ name: "Teal", hex: "#14b8a6" },
	{ name: "Sky", hex: "#0ea5e9" },
	{ name: "Indigo", hex: "#6366f1" },
	{ name: "Violet", hex: "#a855f7" },
	{ name: "Rose", hex: "#ec4899" },
	{ name: "Slate", hex: "#64748b" },
];

export type TreeFarmRule = {
	readonly presetId: string;
	readonly optimalTrees: number;
	readonly productLabel: string;
};

const TREE_FARM_RULE_LIST: ReadonlyArray<TreeFarmRule> = [
	{
		presetId: "LumberHut",
		optimalTrees: 33,
		productLabel: "Wood",
	},
	{
		presetId: "CharburnerHut",
		optimalTrees: 120,
		productLabel: "Coal",
	},
	{
		presetId: "ForestGlassworks",
		optimalTrees: 132,
		productLabel: "Potash",
	},
];

export const TREE_FARM_RULES: ReadonlyMap<string, TreeFarmRule> = new Map(
	TREE_FARM_RULE_LIST.map((rule) => [rule.presetId, rule])
);

export type FarmFieldRule = {
	readonly farmPresetId: string;
	readonly fieldPresetId: string;
	readonly fieldDimensionsLabel: string;
	readonly maxFields: number;
	readonly fieldLabel: string;
};

const FARM_FIELD_RULE_LIST: ReadonlyArray<FarmFieldRule> = [
	// Occidental Farms & Plantations
	{
		farmPresetId: "CropFarm",
		fieldPresetId: "FarmField_4x4",
		fieldDimensionsLabel: "4×4",
		maxFields: 3,
		fieldLabel: "Wheat fields",
	},
	{
		farmPresetId: "CiderFarm",
		fieldPresetId: "FarmField_4x3",
		fieldDimensionsLabel: "4×3",
		maxFields: 4,
		fieldLabel: "Orchards",
	},
	{
		farmPresetId: "HempPlantation",
		fieldPresetId: "FarmField_4x3",
		fieldDimensionsLabel: "4×3",
		maxFields: 4,
		fieldLabel: "Hemp fields",
	},
	{
		farmPresetId: "MonasteryGarden",
		fieldPresetId: "FarmField_3x2",
		fieldDimensionsLabel: "3×2",
		maxFields: 8,
		fieldLabel: "Herb beds",
	},
	{
		farmPresetId: "Vineyard",
		fieldPresetId: "FarmField_4x3",
		fieldDimensionsLabel: "4×3",
		maxFields: 5,
		fieldLabel: "Vineyards",
	},
	{
		farmPresetId: "Apiary",
		fieldPresetId: "FarmField_3x3",
		fieldDimensionsLabel: "3×3",
		maxFields: 5,
		fieldLabel: "Beehives",
	},
	{
		farmPresetId: "Cattlefarm",
		fieldPresetId: "FarmField_4x4",
		fieldDimensionsLabel: "4×4",
		maxFields: 5,
		fieldLabel: "Cattle pens",
	},
	{
		farmPresetId: "Pigfarm",
		fieldPresetId: "FarmField_4x4",
		fieldDimensionsLabel: "4×4",
		maxFields: 4,
		fieldLabel: "Pig pens",
	},
	// Oriental Farms & Plantations
	{
		farmPresetId: "SpiceFarm",
		fieldPresetId: "FarmField_4x3",
		fieldDimensionsLabel: "4×3",
		maxFields: 4,
		fieldLabel: "Spice fields",
	},
	{
		farmPresetId: "DateGrove",
		fieldPresetId: "FarmField_4x3",
		fieldDimensionsLabel: "4×3",
		maxFields: 5,
		fieldLabel: "Date groves",
	},
	{
		farmPresetId: "IndigoFarm",
		fieldPresetId: "FarmField_4x3",
		fieldDimensionsLabel: "4×3",
		maxFields: 5,
		fieldLabel: "Indigo fields",
	},
	{
		farmPresetId: "SilkPlantation",
		fieldPresetId: "FarmField_4x3",
		fieldDimensionsLabel: "4×3",
		maxFields: 5,
		fieldLabel: "Silk groves",
	},
	{
		farmPresetId: "CoffeePlantation",
		fieldPresetId: "FarmField_4x3",
		fieldDimensionsLabel: "4×3",
		maxFields: 5,
		fieldLabel: "Coffee fields",
	},
	{
		farmPresetId: "SugarcanePlantation",
		fieldPresetId: "FarmField_4x3",
		fieldDimensionsLabel: "4×3",
		maxFields: 5,
		fieldLabel: "Cane fields",
	},
	{
		farmPresetId: "AlmondGrove",
		fieldPresetId: "FarmField_4x4",
		fieldDimensionsLabel: "4×4",
		maxFields: 5,
		fieldLabel: "Almond groves",
	},
	{
		farmPresetId: "Goatfarm",
		fieldPresetId: "FarmField_4x4",
		fieldDimensionsLabel: "4×4",
		maxFields: 3,
		fieldLabel: "Goat pens",
	},
	{
		farmPresetId: "RoseNursery",
		fieldPresetId: "FarmField_4x3",
		fieldDimensionsLabel: "4×3",
		maxFields: 6,
		fieldLabel: "Rose beds",
	},
];

export const FARM_FIELD_RULES: ReadonlyMap<string, FarmFieldRule> = new Map(
	FARM_FIELD_RULE_LIST.map((rule) => [rule.farmPresetId, rule])
);

export const FARM_FIELD_PRESET_IDS: ReadonlySet<string> = new Set<string>([
	"FarmField_3x2",
	"FarmField_3x3",
	"FarmField_4x3",
	"FarmField_4x4",
]);

export const isParentWithChildrenRule = (presetId: string): boolean =>
	TREE_FARM_RULES.has(presetId) || FARM_FIELD_RULES.has(presetId);

const areStringArraysEqual = (
	first: ReadonlyArray<string> | undefined,
	second: ReadonlyArray<string> | undefined
): boolean => {
	const firstLength = first?.length ?? 0;
	const secondLength = second?.length ?? 0;
	if (firstLength !== secondLength) {
		return false;
	}
	if (firstLength === 0) {
		return true;
	}
	for (let index = 0; index < firstLength; index += 1) {
		if (first?.[index] !== second?.[index]) {
			return false;
		}
	}
	return true;
};

const isChildValidForParent = (
	child: PlacedBuilding,
	parent: PlacedBuilding
): boolean => {
	if (child.id === parent.id) {
		return false;
	}
	const parentPreset = PRESET_BY_ID.get(parent.presetId);
	if (!parentPreset || parentPreset.influenceRadius <= 0) {
		return false;
	}
	if (!isRectCoveredBySource(child, parent, parentPreset.influenceRadius)) {
		return false;
	}
	if (TREE_FARM_RULES.has(parent.presetId)) {
		return child.presetId === TREE_TILE_PRESET_ID;
	}
	const farmRule = FARM_FIELD_RULES.get(parent.presetId);
	if (farmRule) {
		return child.presetId === farmRule.fieldPresetId;
	}
	return false;
};

/**
 * Synchronizes bidirectional `parentId` <-> `childIds` links across all placed buildings,
 * enforcing Anno 1404 game rules (influence radius, matching field size, and max field count).
 */
export const reconcileParentChildLinks = (
	buildings: ReadonlyArray<PlacedBuilding>
): Array<PlacedBuilding> => {
	let hasAnyLinkMetadata = false;
	for (const building of buildings) {
		if (
			building.parentId !== undefined ||
			(building.childIds !== undefined && building.childIds.length > 0)
		) {
			hasAnyLinkMetadata = true;
			break;
		}
	}
	if (!hasAnyLinkMetadata) {
		return [...buildings];
	}

	const buildingById = new Map<string, PlacedBuilding>();
	for (const building of buildings) {
		buildingById.set(building.id, building);
	}

	const validParentByChildId = new Map<string, string>();
	const childrenByParentId = new Map<string, Array<string>>();

	const tryAttach = (child: PlacedBuilding, parent: PlacedBuilding): void => {
		if (validParentByChildId.has(child.id)) {
			return;
		}
		if (!isChildValidForParent(child, parent)) {
			return;
		}
		const farmRule = FARM_FIELD_RULES.get(parent.presetId);
		const currentChildren = childrenByParentId.get(parent.id) ?? [];
		if (farmRule && currentChildren.length >= farmRule.maxFields) {
			return;
		}
		validParentByChildId.set(child.id, parent.id);
		if (currentChildren.length === 0) {
			childrenByParentId.set(parent.id, [child.id]);
		} else {
			currentChildren.push(child.id);
		}
	};

	// Pass 1: Honor existing ordering in parent.childIds where child also has matching/empty parentId
	for (const parent of buildings) {
		if (!parent.childIds || parent.childIds.length === 0) {
			continue;
		}
		for (const childId of parent.childIds) {
			const child = buildingById.get(childId);
			if (!child) {
				continue;
			}
			if (child.parentId !== undefined && child.parentId !== parent.id) {
				continue;
			}
			tryAttach(child, parent);
		}
	}

	// Pass 2: Attach any remaining buildings specifying child.parentId directly
	for (const child of buildings) {
		if (!child.parentId || validParentByChildId.has(child.id)) {
			continue;
		}
		const parent = buildingById.get(child.parentId);
		if (!parent) {
			continue;
		}
		tryAttach(child, parent);
	}

	let anyChanged = false;
	const reconciled = buildings.map((building) => {
		const nextParentId = validParentByChildId.get(building.id);
		const rawChildren = childrenByParentId.get(building.id);
		const nextChildIds =
			rawChildren && rawChildren.length > 0 ? rawChildren : undefined;

		if (
			building.parentId === nextParentId &&
			areStringArraysEqual(building.childIds, nextChildIds)
		) {
			return building;
		}

		anyChanged = true;
		const updated: PlacedBuilding = {
			id: building.id,
			presetId: building.presetId,
			x: building.x,
			y: building.y,
			width: building.width,
			height: building.height,
			rotated: building.rotated,
			...(building.customColor ? { customColor: building.customColor } : {}),
			...(building.customLabel ? { customLabel: building.customLabel } : {}),
			...(nextParentId ? { parentId: nextParentId } : {}),
			...(nextChildIds ? { childIds: nextChildIds } : {}),
		};
		return updated;
	});

	return anyChanged ? reconciled : [...buildings];
};

export type TreePopulatePlan = {
	readonly newTreePoints: ReadonlyArray<GridPoint>;
	readonly adoptedTreeIds: ReadonlyArray<string>;
};

export const computeTreePopulatePlan = (
	parent: PlacedBuilding,
	buildings: ReadonlyArray<PlacedBuilding>,
	gridWidth: number,
	gridHeight: number
): TreePopulatePlan => {
	if (!TREE_FARM_RULES.has(parent.presetId)) {
		return { newTreePoints: [], adoptedTreeIds: [] };
	}
	const parentPreset = PRESET_BY_ID.get(parent.presetId);
	if (!parentPreset || parentPreset.influenceRadius <= 0) {
		return { newTreePoints: [], adoptedTreeIds: [] };
	}

	const spatialIndex = getSpatialIndex(buildings, gridWidth, gridHeight);
	const spans = computeCoveredTileSpans(
		parent,
		parentPreset.influenceRadius,
		gridWidth,
		gridHeight
	);

	const newTreePoints: Array<GridPoint> = [];
	const adoptedTreeIds: Array<string> = [];

	for (const span of spans) {
		const endColumn = span.xStart + span.width;
		for (let x = span.xStart; x < endColumn; x += 1) {
			const occupying = spatialIndex.findBuildingAtTile(x, span.y);
			if (!occupying) {
				newTreePoints.push({ x, y: span.y });
			} else if (
				occupying.presetId === TREE_TILE_PRESET_ID &&
				occupying.parentId === undefined
			) {
				adoptedTreeIds.push(occupying.id);
			}
		}
	}

	return { newTreePoints, adoptedTreeIds };
};

const computeSharedEdgeLength = (first: GridRect, second: GridRect): number => {
	let shared = 0;
	if (
		first.x + first.width === second.x ||
		second.x + second.width === first.x
	) {
		const overlapY =
			Math.min(first.y + first.height, second.y + second.height) -
			Math.max(first.y, second.y);
		if (overlapY > 0) {
			shared += overlapY;
		}
	}
	if (
		first.y + first.height === second.y ||
		second.y + second.height === first.y
	) {
		const overlapX =
			Math.min(first.x + first.width, second.x + second.width) -
			Math.max(first.x, second.x);
		if (overlapX > 0) {
			shared += overlapX;
		}
	}
	return shared;
};

const hasOpenPerimeterTile = (
	farm: GridRect,
	spatialIndexCanPlace: (tile: GridRect) => boolean,
	newlySpawned: ReadonlyArray<GridRect>
): boolean => {
	const checkTile = (tileX: number, tileY: number): boolean => {
		const tileRect: GridRect = { x: tileX, y: tileY, width: 1, height: 1 };
		if (!spatialIndexCanPlace(tileRect)) {
			return false;
		}
		return !newlySpawned.some((placed) => rectanglesOverlap(tileRect, placed));
	};

	for (let x = farm.x; x < farm.x + farm.width; x += 1) {
		if (checkTile(x, farm.y - 1) || checkTile(x, farm.y + farm.height)) {
			return true;
		}
	}
	for (let y = farm.y; y < farm.y + farm.height; y += 1) {
		if (checkTile(farm.x - 1, y) || checkTile(farm.x + farm.width, y)) {
			return true;
		}
	}
	return false;
};

export type SpawnedFieldCandidate = {
	readonly presetId: string;
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
	readonly rotated: boolean;
};

export const computeSpawnFieldCandidates = (
	parent: PlacedBuilding,
	buildings: ReadonlyArray<PlacedBuilding>,
	gridWidth: number,
	gridHeight: number,
	maxToSpawn?: number
): Array<SpawnedFieldCandidate> => {
	const rule = FARM_FIELD_RULES.get(parent.presetId);
	const parentPreset = PRESET_BY_ID.get(parent.presetId);
	const fieldPreset = rule ? PRESET_BY_ID.get(rule.fieldPresetId) : undefined;
	if (
		!rule ||
		!parentPreset ||
		!fieldPreset ||
		parentPreset.influenceRadius <= 0
	) {
		return [];
	}

	const existingConnectedFields: Array<PlacedBuilding> = [];
	if (parent.childIds && parent.childIds.length > 0) {
		const childSet = new Set(parent.childIds);
		for (const item of buildings) {
			if (childSet.has(item.id) && isChildValidForParent(item, parent)) {
				existingConnectedFields.push(item);
			}
		}
	}

	const remainingSlots = Math.max(
		0,
		rule.maxFields - existingConnectedFields.length
	);
	const targetCount =
		maxToSpawn === undefined
			? remainingSlots
			: Math.max(0, Math.min(remainingSlots, maxToSpawn));
	if (targetCount === 0) {
		return [];
	}

	const spatialIndex = getSpatialIndex(buildings, gridWidth, gridHeight);
	const farmAlreadyHasRoad = spatialIndex.hasAdjacentRoad(parent);
	const centerX = parent.x + parent.width * 0.5;
	const centerY = parent.y + parent.height * 0.5;
	const radius = parentPreset.influenceRadius;

	const orientations: ReadonlyArray<{
		readonly width: number;
		readonly height: number;
		readonly rotated: boolean;
	}> =
		fieldPreset.width === fieldPreset.height
			? [
					{
						width: fieldPreset.width,
						height: fieldPreset.height,
						rotated: false,
					},
				]
			: [
					{
						width: fieldPreset.width,
						height: fieldPreset.height,
						rotated: false,
					},
					{
						width: fieldPreset.height,
						height: fieldPreset.width,
						rotated: true,
					},
				];

	const maxSide = Math.max(fieldPreset.width, fieldPreset.height);
	const searchMinX = Math.max(0, Math.floor(centerX - radius - maxSide));
	const searchMaxX = Math.min(gridWidth, Math.ceil(centerX + radius + maxSide));
	const searchMinY = Math.max(0, Math.floor(centerY - radius - maxSide));
	const searchMaxY = Math.min(
		gridHeight,
		Math.ceil(centerY + radius + maxSide)
	);

	const canPlaceSingleTile = (tile: GridRect): boolean =>
		spatialIndex.canPlace(tile, gridWidth, gridHeight);

	const spawned: Array<SpawnedFieldCandidate> = [];

	for (let step = 0; step < targetCount; step += 1) {
		let bestCandidate: SpawnedFieldCandidate | null = null;
		let bestScore = Number.NEGATIVE_INFINITY;

		let clusterMinX = parent.x;
		let clusterMinY = parent.y;
		let clusterMaxX = parent.x + parent.width;
		let clusterMaxY = parent.y + parent.height;
		for (const existingField of existingConnectedFields) {
			clusterMinX = Math.min(clusterMinX, existingField.x);
			clusterMinY = Math.min(clusterMinY, existingField.y);
			clusterMaxX = Math.max(
				clusterMaxX,
				existingField.x + existingField.width
			);
			clusterMaxY = Math.max(
				clusterMaxY,
				existingField.y + existingField.height
			);
		}
		for (const placedField of spawned) {
			clusterMinX = Math.min(clusterMinX, placedField.x);
			clusterMinY = Math.min(clusterMinY, placedField.y);
			clusterMaxX = Math.max(clusterMaxX, placedField.x + placedField.width);
			clusterMaxY = Math.max(clusterMaxY, placedField.y + placedField.height);
		}
		const currentClusterArea =
			(clusterMaxX - clusterMinX) * (clusterMaxY - clusterMinY);

		for (const orientation of orientations) {
			const maxValidY = searchMaxY - orientation.height;
			const maxValidX = searchMaxX - orientation.width;
			for (let y = searchMinY; y <= maxValidY; y += 1) {
				for (let x = searchMinX; x <= maxValidX; x += 1) {
					const candidateRect: GridRect = {
						x,
						y,
						width: orientation.width,
						height: orientation.height,
					};

					if (!isWithinGrid(candidateRect, gridWidth, gridHeight)) {
						continue;
					}
					if (!isRectCoveredBySource(candidateRect, parent, radius)) {
						continue;
					}
					if (!spatialIndex.canPlace(candidateRect, gridWidth, gridHeight)) {
						continue;
					}
					if (
						spawned.some((previous) =>
							rectanglesOverlap(candidateRect, previous)
						)
					) {
						continue;
					}

					let sharedEdges = computeSharedEdgeLength(candidateRect, parent) * 3;
					for (const existingField of existingConnectedFields) {
						sharedEdges +=
							computeSharedEdgeLength(candidateRect, existingField) * 2.5;
					}
					for (const placedField of spawned) {
						sharedEdges +=
							computeSharedEdgeLength(candidateRect, placedField) * 2.5;
					}

					const nextMinX = Math.min(clusterMinX, x);
					const nextMinY = Math.min(clusterMinY, y);
					const nextMaxX = Math.max(clusterMaxX, x + orientation.width);
					const nextMaxY = Math.max(clusterMaxY, y + orientation.height);
					const areaGrowth =
						(nextMaxX - nextMinX) * (nextMaxY - nextMinY) - currentClusterArea;

					const distanceToFarm = Math.hypot(
						x + orientation.width * 0.5 - centerX,
						y + orientation.height * 0.5 - centerY
					);

					let roadAccessPenalty = 0;
					if (
						!farmAlreadyHasRoad &&
						!hasOpenPerimeterTile(parent, canPlaceSingleTile, [
							...spawned,
							candidateRect,
						])
					) {
						roadAccessPenalty = 500;
					}

					const score =
						sharedEdges * 10 -
						areaGrowth * 1.2 -
						distanceToFarm * 2 -
						roadAccessPenalty;

					if (score > bestScore) {
						bestScore = score;
						bestCandidate = {
							presetId: rule.fieldPresetId,
							x,
							y,
							width: orientation.width,
							height: orientation.height,
							rotated: orientation.rotated,
						};
					}
				}
			}
		}

		if (!bestCandidate) {
			break;
		}
		spawned.push(bestCandidate);
	}

	return spawned;
};

export type EligibleFarmMatch = {
	readonly farm: PlacedBuilding;
	readonly rule: FarmFieldRule;
	readonly connectedCount: number;
	readonly distance: number;
};

export const findEligibleFarmsForField = (
	field: PlacedBuilding,
	buildings: ReadonlyArray<PlacedBuilding>
): Array<EligibleFarmMatch> => {
	if (
		!FARM_FIELD_PRESET_IDS.has(field.presetId) ||
		field.parentId !== undefined
	) {
		return [];
	}

	const fieldCenterX = field.x + field.width * 0.5;
	const fieldCenterY = field.y + field.height * 0.5;
	const matches: Array<EligibleFarmMatch> = [];

	for (const candidate of buildings) {
		const rule = FARM_FIELD_RULES.get(candidate.presetId);
		if (!rule || rule.fieldPresetId !== field.presetId) {
			continue;
		}
		const farmPreset = PRESET_BY_ID.get(candidate.presetId);
		if (!farmPreset || farmPreset.influenceRadius <= 0) {
			continue;
		}
		if (!isRectCoveredBySource(field, candidate, farmPreset.influenceRadius)) {
			continue;
		}
		const connectedCount = candidate.childIds?.length ?? 0;
		if (connectedCount >= rule.maxFields) {
			continue;
		}
		const distance = Math.hypot(
			fieldCenterX - (candidate.x + candidate.width * 0.5),
			fieldCenterY - (candidate.y + candidate.height * 0.5)
		);
		matches.push({
			farm: candidate,
			rule,
			connectedCount,
			distance,
		});
	}

	matches.sort((first, second) => first.distance - second.distance);
	return matches;
};

export const findUnassignedFieldsInRadius = (
	farm: PlacedBuilding,
	buildings: ReadonlyArray<PlacedBuilding>
): Array<PlacedBuilding> => {
	const rule = FARM_FIELD_RULES.get(farm.presetId);
	const farmPreset = PRESET_BY_ID.get(farm.presetId);
	if (!rule || !farmPreset || farmPreset.influenceRadius <= 0) {
		return [];
	}

	const farmCenterX = farm.x + farm.width * 0.5;
	const farmCenterY = farm.y + farm.height * 0.5;
	const candidates: Array<{
		readonly building: PlacedBuilding;
		readonly distance: number;
	}> = [];

	for (const item of buildings) {
		if (item.parentId !== undefined || item.presetId !== rule.fieldPresetId) {
			continue;
		}
		if (!isRectCoveredBySource(item, farm, farmPreset.influenceRadius)) {
			continue;
		}
		const distance = Math.hypot(
			item.x + item.width * 0.5 - farmCenterX,
			item.y + item.height * 0.5 - farmCenterY
		);
		candidates.push({ building: item, distance });
	}

	candidates.sort((first, second) => first.distance - second.distance);
	return candidates.map((entry) => entry.building);
};

export const findEligibleTreeFarmsForTree = (
	tree: PlacedBuilding,
	buildings: ReadonlyArray<PlacedBuilding>
): Array<PlacedBuilding> => {
	if (tree.presetId !== TREE_TILE_PRESET_ID || tree.parentId !== undefined) {
		return [];
	}
	const treeCenterX = tree.x + 0.5;
	const treeCenterY = tree.y + 0.5;
	const matches: Array<{
		readonly farm: PlacedBuilding;
		readonly distance: number;
	}> = [];

	for (const candidate of buildings) {
		if (!TREE_FARM_RULES.has(candidate.presetId)) {
			continue;
		}
		const preset = PRESET_BY_ID.get(candidate.presetId);
		if (!preset || preset.influenceRadius <= 0) {
			continue;
		}
		if (!isRectCoveredBySource(tree, candidate, preset.influenceRadius)) {
			continue;
		}
		const distance = Math.hypot(
			treeCenterX - (candidate.x + candidate.width * 0.5),
			treeCenterY - (candidate.y + candidate.height * 0.5)
		);
		matches.push({ farm: candidate, distance });
	}

	matches.sort((first, second) => first.distance - second.distance);
	return matches.map((entry) => entry.farm);
};

const EMPTY_COVERED_SET: ReadonlySet<string> = new Set<string>();

export const computeHighlightedCoveredIds = (options: {
	readonly spatialIndex: SpatialGridIndex;
	readonly selectedIds: ReadonlyArray<string>;
	readonly hoveredBuildingId: string | null;
	readonly influenceMode: InfluenceDisplayMode;
	readonly ghostRect: GridRect | null;
	readonly ghostPreset: BuildingPreset | null;
	readonly isActivelyDraggingSelection: boolean;
	readonly movingIdSet: ReadonlySet<string>;
	readonly dragDeltaX: number;
	readonly dragDeltaY: number;
}): ReadonlySet<string> => {
	const {
		spatialIndex,
		selectedIds,
		hoveredBuildingId,
		influenceMode,
		ghostRect,
		ghostPreset,
		isActivelyDraggingSelection,
		movingIdSet,
		dragDeltaX,
		dragDeltaY,
	} = options;

	const getEffectiveRect = (building: PlacedBuilding): GridRect =>
		isActivelyDraggingSelection && movingIdSet.has(building.id)
			? {
					x: building.x + dragDeltaX,
					y: building.y + dragDeltaY,
					width: building.width,
					height: building.height,
				}
			: building;

	// 1. Placement ghost preview for non-farm service/radius buildings
	if (ghostRect && ghostPreset && ghostPreset.influenceRadius > 0) {
		if (
			influenceMode === "none" ||
			isParentWithChildrenRule(ghostPreset.identifier)
		) {
			return EMPTY_COVERED_SET;
		}
		const covered = new Set<string>();
		for (const item of spatialIndex.coverableBuildings) {
			if (isRectCoveredBySource(item, ghostRect, ghostPreset.influenceRadius)) {
				covered.add(item.id);
			}
		}
		return covered.size > 0 ? covered : EMPTY_COVERED_SET;
	}

	const addConnectedChildren = (
		parent: PlacedBuilding,
		targetSet: Set<string>
	): void => {
		if (!parent.childIds || parent.childIds.length === 0) {
			return;
		}
		const parentPreset = PRESET_BY_ID.get(parent.presetId);
		if (!parentPreset || parentPreset.influenceRadius <= 0) {
			return;
		}
		const effectiveParentRect = getEffectiveRect(parent);
		for (const childId of parent.childIds) {
			const child = spatialIndex.buildingById.get(childId);
			if (!child) {
				continue;
			}
			const effectiveChildRect = getEffectiveRect(child);
			if (
				isRectCoveredBySource(
					effectiveChildRect,
					effectiveParentRect,
					parentPreset.influenceRadius
				)
			) {
				targetSet.add(child.id);
			}
		}
	};

	// 2. Active selection: highlight connected children for tree/field farms, or parent if a child is selected
	if (selectedIds.length > 0) {
		const covered = new Set<string>();
		let hasFarmOrChildSelection = false;

		for (const selectedId of selectedIds) {
			const building = spatialIndex.buildingById.get(selectedId);
			if (!building) {
				continue;
			}
			if (isParentWithChildrenRule(building.presetId)) {
				hasFarmOrChildSelection = true;
				addConnectedChildren(building, covered);
			} else if (building.parentId && selectedIds.length === 1) {
				hasFarmOrChildSelection = true;
				const parent = spatialIndex.buildingById.get(building.parentId);
				const parentPreset = parent
					? PRESET_BY_ID.get(parent.presetId)
					: undefined;
				if (
					parent &&
					parentPreset &&
					isRectCoveredBySource(
						getEffectiveRect(building),
						getEffectiveRect(parent),
						parentPreset.influenceRadius
					)
				) {
					covered.add(parent.id);
				}
			}
		}

		if (hasFarmOrChildSelection) {
			return covered.size > 0 ? covered : EMPTY_COVERED_SET;
		}

		if (selectedIds.length === 1 && selectedIds[0] && influenceMode !== "none") {
			const selectedBuilding = spatialIndex.buildingById.get(selectedIds[0]);
			const preset = selectedBuilding
				? PRESET_BY_ID.get(selectedBuilding.presetId)
				: undefined;
			if (selectedBuilding && preset && preset.influenceRadius > 0) {
				const effectiveSource = getEffectiveRect(selectedBuilding);
				for (const item of spatialIndex.coverableBuildings) {
					if (item.id === selectedBuilding.id) {
						continue;
					}
					if (
						isRectCoveredBySource(
							getEffectiveRect(item),
							effectiveSource,
							preset.influenceRadius
						)
					) {
						covered.add(item.id);
					}
				}
				return covered.size > 0 ? covered : EMPTY_COVERED_SET;
			}
		}

		return EMPTY_COVERED_SET;
	}

	// 3. Hovered building when nothing is selected
	if (hoveredBuildingId && !ghostPreset) {
		const hoveredBuilding = spatialIndex.buildingById.get(hoveredBuildingId);
		if (!hoveredBuilding) {
			return EMPTY_COVERED_SET;
		}
		if (isParentWithChildrenRule(hoveredBuilding.presetId)) {
			const covered = new Set<string>();
			addConnectedChildren(hoveredBuilding, covered);
			return covered.size > 0 ? covered : EMPTY_COVERED_SET;
		}
		if (influenceMode !== "none") {
			const preset = PRESET_BY_ID.get(hoveredBuilding.presetId);
			if (preset && preset.influenceRadius > 0) {
				const covered = new Set<string>();
				for (const item of spatialIndex.coverableBuildings) {
					if (item.id === hoveredBuilding.id) {
						continue;
					}
					if (
						isRectCoveredBySource(item, hoveredBuilding, preset.influenceRadius)
					) {
						covered.add(item.id);
					}
				}
				return covered.size > 0 ? covered : EMPTY_COVERED_SET;
			}
		}
	}

	return EMPTY_COVERED_SET;
};
