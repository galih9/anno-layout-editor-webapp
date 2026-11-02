import rawColors from "../../assets/presets_data/colors.json";
import rawPresets from "../../assets/presets_data/presets.json";
import rawTreeLocalization from "../../assets/presets_data/treeLocalization.json";
import type {
	AnnoRegion,
	BuildingCategory,
	BuildingPreset,
	RgbaColor,
	ServiceNeedDefinition,
} from "./types";

type RawPresetBuilding = {
	readonly Header: string | null;
	readonly Faction: string | null;
	readonly Group: string | null;
	readonly Identifier: string;
	readonly IconFileName: string | null;
	readonly BuildBlocker: { readonly x: number; readonly z: number };
	readonly Template: string;
	readonly InfluenceRadius: number;
	readonly Road: boolean;
	readonly Borderless: boolean;
	readonly Localization: Readonly<Record<string, string>>;
};

type RawColorEntry = {
	readonly TargetTemplate: string;
	readonly TargetIdentifiers: ReadonlyArray<string>;
	readonly Color: {
		readonly A: number;
		readonly R: number;
		readonly G: number;
		readonly B: number;
	};
};

const iconModules = import.meta.glob<string>(
	"../../assets/presets_data/icons/A4_*.png",
	{
		eager: true,
		import: "default",
	}
);

const iconUrlByFilename = new Map<string, string>();
for (const [modulePath, assetUrl] of Object.entries(iconModules)) {
	const segments = modulePath.split("/");
	const filename = segments[segments.length - 1];
	if (filename) {
		iconUrlByFilename.set(filename, assetUrl);
	}
}

const englishTreeLabels = new Map<string, string>();
const englishEntry = rawTreeLocalization.languages.find(
	(language) => language.languageCode === "eng"
);
if (englishEntry) {
	for (const translation of englishEntry.translations) {
		englishTreeLabels.set(translation.key, translation.value);
	}
}

const defaultColorEntries: ReadonlyArray<RawColorEntry> =
	rawColors.AvailableSchemes[0]?.Colors ?? [];

const FALLBACK_COLOR: RgbaColor = { r: 148, g: 163, b: 184, a: 255 };

const ORIENT_IDENTIFIERS = new Set<string>([
	"NomadsTent",
	"AmbassadorHouse",
	"Bazaar",
	"Mosque",
	"BathHouse",
	"SultanMosque",
	"Oriental_Markethouse",
	"Oriental_Warehouse",
	"OrientalShipyard",
	"Noria",
	"SmallNoria",
	"OrientalFort",
	"OrientEncampment",
	"AssassinEncampment",
	"SpiceFarm",
	"DateGrove",
	"IndigoFarm",
	"SilkPlantation",
	"AlmondGrove",
	"SugarcanePlantation",
	"SugarMill",
	"ConfectionerWorkshop",
	"CoffeePlantation",
	"RoastHouse",
	"RoseNursery",
	"Perfumery",
	"PearlFisherHut",
	"Pearl wokrshop",
	"MosaicWorkshop",
	"CarpetWorkshop",
	"SilkWeavingMill",
	"Goatfarm",
	"Claypit",
	"QuartzQuarry",
]);

const UNIVERSAL_IDENTIFIERS = new Set<string>([
	"CobblestoneRoad_1x1",
	"DirtRoad_1x1",
	"PlazaTile_1x1",
	"TreeTile_1x1",
	"BlockTile_1x1",
	"Street_1x4",
	"Street_1x6",
	"Street_1x10",
	"FarmField_3x2",
	"FarmField_3x3",
	"FarmField_4x3",
	"FarmField_4x4",
	"StoreHouse",
	"StoreHouseLarge",
	"Pier",
	"RepairDock",
	"PortTower",
	"HarbourSystem",
	"HarbourMastersOffice",
	"FireStation",
	"CarpenterHouse",
	"Surgery",
	"OreMine",
	"CoalMine",
	"CopperMine",
	"GoldMine",
	"SaltMine",
]);

const toCssRgba = (color: RgbaColor, alphaOverride?: number): string => {
	const alpha = alphaOverride ?? Number((color.a / 255).toFixed(3));
	return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
};

export const rgbaToHex = (color: RgbaColor): string => {
	const toHex = (channel: number): string =>
		Math.max(0, Math.min(255, Math.round(channel)))
			.toString(16)
			.padStart(2, "0");
	return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
};

const resolveColor = (identifier: string, template: string): RgbaColor => {
	const exactMatch =
		defaultColorEntries.find(
			(entry) =>
				entry.TargetTemplate === template &&
				entry.TargetIdentifiers.includes(identifier)
		) ??
		defaultColorEntries.find((entry) =>
			entry.TargetIdentifiers.includes(identifier)
		);

	if (!exactMatch) {
		return FALLBACK_COLOR;
	}

	return {
		r: exactMatch.Color.R,
		g: exactMatch.Color.G,
		b: exactMatch.Color.B,
		a: exactMatch.Color.A,
	};
};

const resolveCategory = (
	faction: string,
	group: string,
	isRoad: boolean
): BuildingCategory => {
	if (isRoad) {
		return "roads";
	}
	if (group === "Residence") {
		return "residence";
	}
	if (group === "Harbour" || group === "Trade" || group === "Marine") {
		return "harbour";
	}
	if (faction === "Public") {
		if (group === "Military") {
			return "military";
		}
		return "public";
	}
	if (faction === "Military") {
		return "military";
	}
	if (faction === "Ornament") {
		return "ornament";
	}
	if (
		group === "Plantation" ||
		group === "Farm" ||
		group === "Animalfarm" ||
		group === "Farm Fields"
	) {
		return "farms";
	}
	return "production";
};

const resolveRegion = (identifier: string): AnnoRegion => {
	if (UNIVERSAL_IDENTIFIERS.has(identifier)) {
		return "universal";
	}
	if (ORIENT_IDENTIFIERS.has(identifier)) {
		return "orient";
	}
	return "occident";
};

const resolveGroupLabel = (group: string): string => {
	const normalizedKey = group.replace(/\s+/g, "");
	return (
		englishTreeLabels.get(group) ??
		englishTreeLabels.get(normalizedKey) ??
		group
	);
};

const createCustomPreset = (options: {
	readonly identifier: string;
	readonly name: string;
	readonly faction: string;
	readonly group: string;
	readonly groupLabel: string;
	readonly category: BuildingCategory;
	readonly region: AnnoRegion;
	readonly template: string;
	readonly width: number;
	readonly height: number;
	readonly influenceRadius: number;
	readonly isRoad: boolean;
	readonly isBorderless: boolean;
	readonly iconFileName: string | null;
	readonly color: RgbaColor;
}): BuildingPreset => ({
	...options,
	localizations: { eng: options.name },
	iconUrl: options.iconFileName
		? (iconUrlByFilename.get(options.iconFileName) ?? null)
		: null,
	cssColor: toCssRgba(options.color),
});

const builtInTerrainPresets: Array<BuildingPreset> = [
	createCustomPreset({
		identifier: "CobblestoneRoad_1x1",
		name: "Cobblestone street (1x1)",
		faction: "Roads & Terrain",
		group: "Roads",
		groupLabel: "Roads & Plazas",
		category: "roads",
		region: "universal",
		template: "Road",
		width: 1,
		height: 1,
		influenceRadius: 0,
		isRoad: true,
		isBorderless: true,
		iconFileName: null,
		color: { r: 156, g: 163, b: 175, a: 255 },
	}),
	createCustomPreset({
		identifier: "DirtRoad_1x1",
		name: "Dirt road (1x1)",
		faction: "Roads & Terrain",
		group: "Roads",
		groupLabel: "Roads & Plazas",
		category: "roads",
		region: "universal",
		template: "Road",
		width: 1,
		height: 1,
		influenceRadius: 0,
		isRoad: true,
		isBorderless: true,
		iconFileName: null,
		color: { r: 180, g: 142, b: 98, a: 255 },
	}),
	createCustomPreset({
		identifier: "PlazaTile_1x1",
		name: "Imperial plaza (1x1)",
		faction: "Roads & Terrain",
		group: "Roads",
		groupLabel: "Roads & Plazas",
		category: "roads",
		region: "universal",
		template: "Road",
		width: 1,
		height: 1,
		influenceRadius: 0,
		isRoad: true,
		isBorderless: true,
		iconFileName: null,
		color: { r: 214, g: 190, b: 142, a: 255 },
	}),
	createCustomPreset({
		identifier: "Street_1x4",
		name: "Road strip (1x4)",
		faction: "Roads & Terrain",
		group: "Road Strips",
		groupLabel: "Road Strips",
		category: "roads",
		region: "universal",
		template: "Road",
		width: 1,
		height: 4,
		influenceRadius: 0,
		isRoad: true,
		isBorderless: true,
		iconFileName: null,
		color: { r: 156, g: 163, b: 175, a: 255 },
	}),
	createCustomPreset({
		identifier: "Street_1x6",
		name: "Road strip (1x6)",
		faction: "Roads & Terrain",
		group: "Road Strips",
		groupLabel: "Road Strips",
		category: "roads",
		region: "universal",
		template: "Road",
		width: 1,
		height: 6,
		influenceRadius: 0,
		isRoad: true,
		isBorderless: true,
		iconFileName: null,
		color: { r: 156, g: 163, b: 175, a: 255 },
	}),
	createCustomPreset({
		identifier: "Street_1x10",
		name: "Road strip (1x10)",
		faction: "Roads & Terrain",
		group: "Road Strips",
		groupLabel: "Road Strips",
		category: "roads",
		region: "universal",
		template: "Road",
		width: 1,
		height: 10,
		influenceRadius: 0,
		isRoad: true,
		isBorderless: true,
		iconFileName: null,
		color: { r: 156, g: 163, b: 175, a: 255 },
	}),
	createCustomPreset({
		identifier: "TreeTile_1x1",
		name: "Forest / Palm tile (1x1)",
		faction: "Roads & Terrain",
		group: "Terrain",
		groupLabel: "Terrain & Obstacles",
		category: "roads",
		region: "universal",
		template: "OrnamentalBuilding",
		width: 1,
		height: 1,
		influenceRadius: 0,
		isRoad: false,
		isBorderless: true,
		iconFileName: "A4_icon_116_0.png",
		color: { r: 58, g: 125, b: 68, a: 255 },
	}),
	createCustomPreset({
		identifier: "BlockTile_1x1",
		name: "River / Blocked tile (1x1)",
		faction: "Roads & Terrain",
		group: "Terrain",
		groupLabel: "Terrain & Obstacles",
		category: "roads",
		region: "universal",
		template: "Blocker",
		width: 1,
		height: 1,
		influenceRadius: 0,
		isRoad: false,
		isBorderless: true,
		iconFileName: null,
		color: { r: 45, g: 55, b: 72, a: 255 },
	}),
];

const anno1404RawBuildings = (
	rawPresets.Buildings as ReadonlyArray<RawPresetBuilding>
).filter((building) => building.Header === "(A4) Anno 1404");

const parsedAnno1404Presets: Array<BuildingPreset> = anno1404RawBuildings.map(
	(building) => {
		const faction = building.Faction ?? "PlayerBuildings";
		const group = building.Group ?? "Special";
		const resolvedIconName =
			building.Identifier === "HarbourSystem" && !building.IconFileName
				? "A4_icon_116_121.png"
				: building.IconFileName;
		const color = resolveColor(building.Identifier, building.Template);

		return {
			identifier: building.Identifier,
			name: building.Localization["eng"] ?? building.Identifier,
			localizations: building.Localization,
			faction,
			group,
			groupLabel: resolveGroupLabel(group),
			category: resolveCategory(faction, group, building.Road),
			region: resolveRegion(building.Identifier),
			template: building.Template,
			width: building.BuildBlocker.x,
			height: building.BuildBlocker.z,
			influenceRadius: building.InfluenceRadius,
			isRoad: building.Road,
			isBorderless: building.Borderless,
			iconFileName: resolvedIconName,
			iconUrl: resolvedIconName
				? (iconUrlByFilename.get(resolvedIconName) ?? null)
				: null,
			color,
			cssColor: toCssRgba(color),
		};
	}
);

// Include the Anno 1404 Flour Mill (A4_icon_116_26.png) right alongside Bakery
const flourMillPreset = createCustomPreset({
	identifier: "FlourMill",
	name: "Flour mill",
	faction: "Production",
	group: "Factory",
	groupLabel: "Factory",
	category: "production",
	region: "occident",
	template: "FactoryBuilding",
	width: 3,
	height: 3,
	influenceRadius: 12,
	isRoad: false,
	isBorderless: false,
	iconFileName: "A4_icon_116_26.png",
	color: { r: 0, g: 128, b: 0, a: 255 },
});

export const ANNO_1404_PRESETS: ReadonlyArray<BuildingPreset> = [
	...builtInTerrainPresets,
	...parsedAnno1404Presets,
	flourMillPreset,
];

export const PRESET_BY_ID: ReadonlyMap<string, BuildingPreset> = new Map(
	ANNO_1404_PRESETS.map((preset) => [preset.identifier, preset])
);

export type CategoryDefinition = {
	readonly id: BuildingCategory | "all";
	readonly label: string;
	readonly shortLabel: string;
};

export const CATEGORY_DEFINITIONS: ReadonlyArray<CategoryDefinition> = [
	{ id: "all", label: "All Buildings", shortLabel: "All" },
	{ id: "roads", label: "Roads & Terrain", shortLabel: "Roads" },
	{ id: "residence", label: "Residences", shortLabel: "Housing" },
	{ id: "public", label: "Public & Services", shortLabel: "Public" },
	{ id: "farms", label: "Farms & Plantations", shortLabel: "Farms" },
	{ id: "production", label: "Factories & Mines", shortLabel: "Industry" },
	{ id: "harbour", label: "Harbour & Trade", shortLabel: "Harbour" },
	{ id: "military", label: "Military & Fortresses", shortLabel: "Military" },
	{ id: "ornament", label: "Manorial Palace", shortLabel: "Palace" },
];

export const OCCIDENT_RESIDENCE_IDS = new Set<string>([
	"PeasantHouse",
	"CitizenHouse",
	"PatricianHouse",
	"NoblemanHouse",
]);

export const ORIENT_RESIDENCE_IDS = new Set<string>([
	"NomadsTent",
	"AmbassadorHouse",
]);

export const OCCIDENT_SERVICE_NEEDS: ReadonlyArray<ServiceNeedDefinition> = [
	{
		id: "market",
		label: "Marketplace",
		kind: "need",
		providerPresetIds: ["Marketplace", "ImperialCathedral"],
	},
	{
		id: "chapel",
		label: "Chapel (Faith)",
		kind: "need",
		providerPresetIds: ["Chapel", "Church", "ImperialCathedral"],
	},
	{
		id: "tavern",
		label: "Tavern (Amusement)",
		kind: "need",
		providerPresetIds: ["Tavern", "ImperialCathedral"],
	},
	{
		id: "church",
		label: "Church (Faith II)",
		kind: "need",
		providerPresetIds: ["Church", "ImperialCathedral"],
	},
	{
		id: "prison",
		label: "Debtor's Prison",
		kind: "need",
		providerPresetIds: ["DebtorsPrison", "ImperialCathedral"],
	},
	{
		id: "cathedral",
		label: "Imperial Cathedral",
		kind: "need",
		providerPresetIds: ["ImperialCathedral"],
	},
	{
		id: "carpenter",
		label: "Carpenter's House",
		kind: "maintenance",
		providerPresetIds: ["CarpenterHouse"],
	},
	{
		id: "fire",
		label: "Fire Station",
		kind: "maintenance",
		providerPresetIds: ["FireStation"],
	},
	{
		id: "surgery",
		label: "Surgery (Plague)",
		kind: "maintenance",
		providerPresetIds: ["Surgery"],
	},
];

export const ORIENT_SERVICE_NEEDS: ReadonlyArray<ServiceNeedDefinition> = [
	{
		id: "bazaar",
		label: "Bazaar",
		kind: "need",
		providerPresetIds: ["Bazaar", "SultanMosque"],
	},
	{
		id: "mosque",
		label: "Mosque",
		kind: "need",
		providerPresetIds: ["Mosque", "SultanMosque"],
	},
	{
		id: "bath",
		label: "Bath House",
		kind: "need",
		providerPresetIds: ["BathHouse", "SultanMosque"],
	},
	{
		id: "sultan",
		label: "Sultan's Mosque",
		kind: "need",
		providerPresetIds: ["SultanMosque"],
	},
	{
		id: "carpenter",
		label: "Carpenter's House",
		kind: "maintenance",
		providerPresetIds: ["CarpenterHouse"],
	},
	{
		id: "fire",
		label: "Fire Station",
		kind: "maintenance",
		providerPresetIds: ["FireStation"],
	},
	{
		id: "surgery",
		label: "Surgery",
		kind: "maintenance",
		providerPresetIds: ["Surgery"],
	},
];

export const MARKETHOUSE_PRESET_IDS = new Set<string>([
	"Markethouse01",
	"Warehouse01",
	"Oriental_Markethouse",
	"Oriental_Warehouse",
	"StorehouseTown",
	"HarbourMastersOffice",
]);

export const NORIA_PRESET_IDS = new Set<string>(["Noria", "SmallNoria"]);
