export type RgbaColor = {
	readonly r: number;
	readonly g: number;
	readonly b: number;
	readonly a: number;
};

export type BuildingCategory =
	| "roads"
	| "residence"
	| "public"
	| "farms"
	| "production"
	| "harbour"
	| "military"
	| "ornament";

export type AnnoRegion = "occident" | "orient" | "universal";

export type BuildingPreset = {
	readonly identifier: string;
	readonly name: string;
	readonly localizations: Readonly<Record<string, string>>;
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
	readonly iconUrl: string | null;
	readonly color: RgbaColor;
	readonly cssColor: string;
};

export type PlacedBuilding = {
	readonly id: string;
	readonly presetId: string;
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
	readonly rotated: boolean;
	readonly customColor?: string;
	readonly customLabel?: string;
};

export type GridPoint = {
	readonly x: number;
	readonly y: number;
};

export type GridRect = {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
};

export type TileSpan = {
	readonly y: number;
	readonly xStart: number;
	readonly width: number;
};

export type ActiveTool =
	| "select"
	| "place"
	| "road"
	| "erase"
	| "pan"
	| "eyedropper";

export type InfluenceDisplayMode = "active" | "services" | "all" | "none";

export type CanvasTheme = "dark" | "parchment";

export type StarterTemplateItem = Omit<PlacedBuilding, "id">;

export type StarterTemplate = {
	readonly id: string;
	readonly name: string;
	readonly subtitle: string;
	readonly description: string;
	readonly region: AnnoRegion;
	readonly buildings: ReadonlyArray<StarterTemplateItem>;
};

export type ServiceNeedDefinition = {
	readonly id: string;
	readonly label: string;
	readonly kind: "need" | "maintenance";
	readonly providerPresetIds: ReadonlyArray<string>;
};
