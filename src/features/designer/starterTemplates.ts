import { rectanglesOverlap, toTileKey } from "./gridMath";
import type { StarterTemplate, StarterTemplateItem } from "./types";

const buildSafeTemplate = (
	structures: ReadonlyArray<StarterTemplateItem>,
	roadPresetId: string,
	roadSegments: ReadonlyArray<{
		readonly x1: number;
		readonly y1: number;
		readonly x2: number;
		readonly y2: number;
	}>
): Array<StarterTemplateItem> => {
	const result: Array<StarterTemplateItem> = [];

	for (const structure of structures) {
		const collides = result.some((existing) =>
			rectanglesOverlap(structure, existing)
		);
		if (!collides) {
			result.push(structure);
		}
	}

	const seenRoadKeys = new Set<string>();
	for (const segment of roadSegments) {
		const startX = Math.min(segment.x1, segment.x2);
		const endX = Math.max(segment.x1, segment.x2);
		const startY = Math.min(segment.y1, segment.y2);
		const endY = Math.max(segment.y1, segment.y2);

		for (let x = startX; x <= endX; x += 1) {
			for (let y = startY; y <= endY; y += 1) {
				const key = toTileKey(x, y);
				if (seenRoadKeys.has(key)) {
					continue;
				}
				seenRoadKeys.add(key);

				const tile: StarterTemplateItem = {
					presetId: roadPresetId,
					x,
					y,
					width: 1,
					height: 1,
					rotated: false,
				};
				const collides = result.some((existing) =>
					rectanglesOverlap(tile, existing)
				);
				if (!collides) {
					result.push(tile);
				}
			}
		}
	}

	return result;
};

const createOccidentMarketDistrict = (): Array<StarterTemplateItem> => {
	const structures: Array<StarterTemplateItem> = [
		// Central civic spine (x: 40..45)
		{
			presetId: "FireStation",
			x: 40,
			y: 25,
			width: 3,
			height: 4,
			rotated: true,
		},
		{
			presetId: "Surgery",
			x: 43,
			y: 26,
			width: 3,
			height: 3,
			rotated: false,
		},
		{
			presetId: "Chapel",
			x: 40,
			y: 30,
			width: 5,
			height: 3,
			rotated: false,
		},
		{
			presetId: "PlazaTile_1x1",
			x: 45,
			y: 30,
			width: 1,
			height: 1,
			rotated: false,
		},
		{
			presetId: "PlazaTile_1x1",
			x: 45,
			y: 31,
			width: 1,
			height: 1,
			rotated: false,
		},
		{
			presetId: "PlazaTile_1x1",
			x: 45,
			y: 32,
			width: 1,
			height: 1,
			rotated: false,
		},
		{
			presetId: "Marketplace",
			x: 40,
			y: 34,
			width: 6,
			height: 5,
			rotated: false,
		},
		{
			presetId: "Tavern",
			x: 40,
			y: 40,
			width: 3,
			height: 4,
			rotated: false,
		},
		{
			presetId: "CarpenterHouse",
			x: 43,
			y: 40,
			width: 3,
			height: 3,
			rotated: false,
		},
	];

	// Symmetric Patrician & Citizen housing blocks on West (x: 33, 36) and East (x: 47, 50)
	const upperRows = [25, 28, 31];
	const lowerRows = [35, 38, 41];

	for (const y of upperRows) {
		structures.push(
			{
				presetId: "PatricianHouse",
				x: 36,
				y,
				width: 3,
				height: 3,
				rotated: false,
			},
			{
				presetId: "CitizenHouse",
				x: 33,
				y,
				width: 3,
				height: 3,
				rotated: false,
			},
			{
				presetId: "PatricianHouse",
				x: 47,
				y,
				width: 3,
				height: 3,
				rotated: false,
			},
			{
				presetId: "CitizenHouse",
				x: 50,
				y,
				width: 3,
				height: 3,
				rotated: false,
			}
		);
	}

	for (const y of lowerRows) {
		structures.push(
			{
				presetId: "PatricianHouse",
				x: 36,
				y,
				width: 3,
				height: 3,
				rotated: false,
			},
			{
				presetId: "CitizenHouse",
				x: 33,
				y,
				width: 3,
				height: 3,
				rotated: false,
			},
			{
				presetId: "PatricianHouse",
				x: 47,
				y,
				width: 3,
				height: 3,
				rotated: false,
			},
			{
				presetId: "CitizenHouse",
				x: 50,
				y,
				width: 3,
				height: 3,
				rotated: false,
			}
		);
	}

	return buildSafeTemplate(structures, "CobblestoneRoad_1x1", [
		{ x1: 32, y1: 24, x2: 53, y2: 24 },
		{ x1: 32, y1: 44, x2: 53, y2: 44 },
		{ x1: 32, y1: 24, x2: 32, y2: 44 },
		{ x1: 39, y1: 24, x2: 39, y2: 44 },
		{ x1: 46, y1: 24, x2: 46, y2: 44 },
		{ x1: 53, y1: 24, x2: 53, y2: 44 },
		{ x1: 32, y1: 34, x2: 39, y2: 34 },
		{ x1: 46, y1: 34, x2: 53, y2: 34 },
		{ x1: 39, y1: 29, x2: 46, y2: 29 },
		{ x1: 39, y1: 33, x2: 46, y2: 33 },
		{ x1: 39, y1: 39, x2: 46, y2: 39 },
	]);
};

const createBreadProductionCluster = (): Array<StarterTemplateItem> => {
	const structures: Array<StarterTemplateItem> = [
		// Central Markethouse
		{
			presetId: "Markethouse01",
			x: 42,
			y: 34,
			width: 4,
			height: 4,
			rotated: false,
		},
		// Flour Mill & Bakery
		{
			presetId: "FlourMill",
			x: 38,
			y: 34,
			width: 3,
			height: 3,
			rotated: false,
		},
		{
			presetId: "Bakery",
			x: 47,
			y: 34,
			width: 3,
			height: 3,
			rotated: false,
		},
		// North Crop Farm + 4 Fields (4x3)
		{
			presetId: "CropFarm",
			x: 38,
			y: 29,
			width: 3,
			height: 3,
			rotated: false,
		},
		{
			presetId: "FarmField_4x3",
			x: 34,
			y: 29,
			width: 4,
			height: 3,
			rotated: false,
		},
		{
			presetId: "FarmField_4x3",
			x: 34,
			y: 26,
			width: 4,
			height: 3,
			rotated: false,
		},
		{
			presetId: "FarmField_4x3",
			x: 38,
			y: 26,
			width: 4,
			height: 3,
			rotated: false,
		},
		{
			presetId: "FarmField_3x3",
			x: 42,
			y: 29,
			width: 3,
			height: 3,
			rotated: false,
		},
		// South Crop Farm + 4 Fields
		{
			presetId: "CropFarm",
			x: 47,
			y: 39,
			width: 3,
			height: 3,
			rotated: false,
		},
		{
			presetId: "FarmField_4x3",
			x: 50,
			y: 39,
			width: 4,
			height: 3,
			rotated: false,
		},
		{
			presetId: "FarmField_4x3",
			x: 50,
			y: 42,
			width: 4,
			height: 3,
			rotated: false,
		},
		{
			presetId: "FarmField_4x3",
			x: 46,
			y: 42,
			width: 4,
			height: 3,
			rotated: false,
		},
		{
			presetId: "FarmField_3x3",
			x: 43,
			y: 39,
			width: 3,
			height: 3,
			rotated: false,
		},
	];

	return buildSafeTemplate(structures, "DirtRoad_1x1", [
		{ x1: 41, y1: 29, x2: 41, y2: 41 },
		{ x1: 46, y1: 30, x2: 46, y2: 41 },
		{ x1: 38, y1: 33, x2: 50, y2: 33 },
		{ x1: 38, y1: 38, x2: 50, y2: 38 },
	]);
};

const createOrientOasisQuarter = (): Array<StarterTemplateItem> => {
	const structures: Array<StarterTemplateItem> = [
		{
			presetId: "Mosque",
			x: 40,
			y: 27,
			width: 6,
			height: 6,
			rotated: false,
		},
		{
			presetId: "Bazaar",
			x: 40,
			y: 34,
			width: 6,
			height: 5,
			rotated: false,
		},
		{
			presetId: "BathHouse",
			x: 40,
			y: 40,
			width: 4,
			height: 5,
			rotated: false,
		},
		{
			presetId: "SmallNoria",
			x: 44,
			y: 40,
			width: 3,
			height: 3,
			rotated: false,
		},
	];

	const houseRows = [28, 31, 35, 38, 41];
	for (const y of houseRows) {
		structures.push(
			{
				presetId: "AmbassadorHouse",
				x: 36,
				y,
				width: 3,
				height: 3,
				rotated: false,
			},
			{
				presetId: "NomadsTent",
				x: 33,
				y,
				width: 3,
				height: 3,
				rotated: false,
			},
			{
				presetId: "AmbassadorHouse",
				x: 48,
				y,
				width: 3,
				height: 3,
				rotated: false,
			},
			{
				presetId: "NomadsTent",
				x: 51,
				y,
				width: 3,
				height: 3,
				rotated: false,
			}
		);
	}

	return buildSafeTemplate(structures, "DirtRoad_1x1", [
		{ x1: 32, y1: 26, x2: 54, y2: 26 },
		{ x1: 32, y1: 45, x2: 54, y2: 45 },
		{ x1: 32, y1: 26, x2: 32, y2: 45 },
		{ x1: 39, y1: 26, x2: 39, y2: 45 },
		{ x1: 47, y1: 26, x2: 47, y2: 45 },
		{ x1: 54, y1: 26, x2: 54, y2: 45 },
		{ x1: 32, y1: 34, x2: 54, y2: 34 },
		{ x1: 39, y1: 33, x2: 47, y2: 33 },
		{ x1: 39, y1: 39, x2: 47, y2: 39 },
	]);
};

export const STARTER_TEMPLATES: ReadonlyArray<StarterTemplate> = [
	{
		id: "occident-market-district",
		name: "Occident Market District",
		subtitle: "24 Houses • Market • Chapel • Tavern • Services",
		description:
			"Symmetric Patrician & Citizen housing blocks centered around a Marketplace, Chapel, Tavern, Carpenter, Fire Station, and Surgery.",
		region: "occident",
		buildings: createOccidentMarketDistrict(),
	},
	{
		id: "bread-production-cluster",
		name: "Bread Production Cluster",
		subtitle: "2 Crop Farms • 8 Fields • Mill • Bakery • Markethouse",
		description:
			"Classic Anno 1404 2:1:1 Wheat-to-Bread production chain tucked neatly inside a Small Market Building's cart pickup radius.",
		region: "occident",
		buildings: createBreadProductionCluster(),
	},
	{
		id: "orient-oasis-quarter",
		name: "Orient Envoy Quarter",
		subtitle: "20 Houses • Bazaar • Mosque • Bath House • Noria",
		description:
			"Compact desert settlement layout supplying Envoy and Nomad residences with Bazaar, Mosque, Bath House, and Noria coverage.",
		region: "orient",
		buildings: createOrientOasisQuarter(),
	},
];
