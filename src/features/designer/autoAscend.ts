import { getSpatialIndex, type SpatialGridIndex } from "./spatialIndex";
import type { PlacedBuilding } from "./types";

const TIME_BUDGET_MS = 50;

const UPGRADABLE_RESIDENCE_IDS = new Set<string>([
	"PeasantHouse",
	"CitizenHouse",
	"PatricianHouse",
	"NomadsTent",
]);

const OCCIDENT_UPGRADABLE_IDS = new Set<string>([
	"PeasantHouse",
	"CitizenHouse",
	"PatricianHouse",
]);

const MARKET_PROVIDER_IDS = new Set<string>([
	"Marketplace",
	"ImperialCathedral",
]);
const CHAPEL_PROVIDER_IDS = new Set<string>([
	"Chapel",
	"Church",
	"ImperialCathedral",
]);
const TAVERN_PROVIDER_IDS = new Set<string>(["Tavern", "ImperialCathedral"]);
const CHURCH_PROVIDER_IDS = new Set<string>(["Church", "ImperialCathedral"]);
const PRISON_PROVIDER_IDS = new Set<string>([
	"DebtorsPrison",
	"ImperialCathedral",
]);
const BAZAAR_PROVIDER_IDS = new Set<string>(["Bazaar", "SultanMosque"]);
const MOSQUE_PROVIDER_IDS = new Set<string>(["Mosque", "SultanMosque"]);

type ProviderCircle = {
	readonly centerX: number;
	readonly centerY: number;
	readonly thresholdSquared: number;
};

export type AscensionServiceBuckets = {
	readonly market: ReadonlyArray<ProviderCircle>;
	readonly chapel: ReadonlyArray<ProviderCircle>;
	readonly tavern: ReadonlyArray<ProviderCircle>;
	readonly church: ReadonlyArray<ProviderCircle>;
	readonly prison: ReadonlyArray<ProviderCircle>;
	readonly bazaar: ReadonlyArray<ProviderCircle>;
	readonly mosque: ReadonlyArray<ProviderCircle>;
};

export const buildAscensionServiceBuckets = (
	spatialIndex: SpatialGridIndex
): AscensionServiceBuckets => {
	const market: Array<ProviderCircle> = [];
	const chapel: Array<ProviderCircle> = [];
	const tavern: Array<ProviderCircle> = [];
	const church: Array<ProviderCircle> = [];
	const prison: Array<ProviderCircle> = [];
	const bazaar: Array<ProviderCircle> = [];
	const mosque: Array<ProviderCircle> = [];

	for (const entry of spatialIndex.influenceBuildings) {
		const presetId = entry.building.presetId;
		const circle: ProviderCircle = {
			centerX: entry.centerX,
			centerY: entry.centerY,
			thresholdSquared: entry.thresholdSquared,
		};

		if (MARKET_PROVIDER_IDS.has(presetId)) {
			market.push(circle);
		}
		if (CHAPEL_PROVIDER_IDS.has(presetId)) {
			chapel.push(circle);
		}
		if (TAVERN_PROVIDER_IDS.has(presetId)) {
			tavern.push(circle);
		}
		if (CHURCH_PROVIDER_IDS.has(presetId)) {
			church.push(circle);
		}
		if (PRISON_PROVIDER_IDS.has(presetId)) {
			prison.push(circle);
		}
		if (BAZAAR_PROVIDER_IDS.has(presetId)) {
			bazaar.push(circle);
		}
		if (MOSQUE_PROVIDER_IDS.has(presetId)) {
			mosque.push(circle);
		}
	}

	return {
		market,
		chapel,
		tavern,
		church,
		prison,
		bazaar,
		mosque,
	};
};

const isPointCoveredByAny = (
	centerX: number,
	centerY: number,
	providers: ReadonlyArray<ProviderCircle>
): boolean => {
	for (const provider of providers) {
		const deltaX = centerX - provider.centerX;
		const deltaY = centerY - provider.centerY;
		if (deltaX * deltaX + deltaY * deltaY <= provider.thresholdSquared) {
			return true;
		}
	}
	return false;
};

export const resolveAscendedPresetId = (
	residence: PlacedBuilding,
	spatialIndex: SpatialGridIndex,
	buckets: AscensionServiceBuckets
): string => {
	if (!UPGRADABLE_RESIDENCE_IDS.has(residence.presetId)) {
		return residence.presetId;
	}

	if (!spatialIndex.hasAdjacentRoad(residence)) {
		return residence.presetId;
	}

	const centerX = residence.x + residence.width * 0.5;
	const centerY = residence.y + residence.height * 0.5;

	if (OCCIDENT_UPGRADABLE_IDS.has(residence.presetId)) {
		if (!isPointCoveredByAny(centerX, centerY, buckets.market)) {
			return residence.presetId;
		}

		let currentPresetId = residence.presetId;
		let chapelChecked = false;
		let hasChapel = false;
		let tavernChecked = false;
		let hasTavern = false;

		const ensureChapel = (): boolean => {
			if (!chapelChecked) {
				chapelChecked = true;
				hasChapel = isPointCoveredByAny(centerX, centerY, buckets.chapel);
			}
			return hasChapel;
		};

		const ensureTavern = (): boolean => {
			if (!tavernChecked) {
				tavernChecked = true;
				hasTavern = isPointCoveredByAny(centerX, centerY, buckets.tavern);
			}
			return hasTavern;
		};

		if (currentPresetId === "PeasantHouse" && ensureChapel()) {
			currentPresetId = "CitizenHouse";
		}

		if (
			currentPresetId === "CitizenHouse" &&
			ensureChapel() &&
			ensureTavern()
		) {
			currentPresetId = "PatricianHouse";
		}

		if (
			currentPresetId === "PatricianHouse" &&
			ensureTavern() &&
			isPointCoveredByAny(centerX, centerY, buckets.church) &&
			isPointCoveredByAny(centerX, centerY, buckets.prison)
		) {
			currentPresetId = "NoblemanHouse";
		}

		return currentPresetId;
	}

	if (
		residence.presetId === "NomadsTent" &&
		isPointCoveredByAny(centerX, centerY, buckets.bazaar) &&
		isPointCoveredByAny(centerX, centerY, buckets.mosque)
	) {
		return "AmbassadorHouse";
	}

	return residence.presetId;
};

export const yieldToMainThread = async (): Promise<void> => {
	if (typeof window !== "undefined" && "scheduler" in window) {
		const browserScheduler = (
			window as Window & {
				readonly scheduler?: { readonly yield?: () => Promise<void> };
			}
		).scheduler;
		if (typeof browserScheduler?.yield === "function") {
			await browserScheduler.yield();
			return;
		}
	}

	await new Promise<void>((resolve) => {
		setTimeout(resolve, 0);
	});
};

export const computeAutoAscendUpgradesSync = (
	buildings: ReadonlyArray<PlacedBuilding>,
	gridWidth: number,
	gridHeight: number
): Map<string, string> => {
	const upgrades = new Map<string, string>();
	if (buildings.length === 0) {
		return upgrades;
	}

	const spatialIndex = getSpatialIndex(buildings, gridWidth, gridHeight);
	if (spatialIndex.residences.length === 0) {
		return upgrades;
	}

	const buckets = buildAscensionServiceBuckets(spatialIndex);
	for (const residence of spatialIndex.residences) {
		if (!UPGRADABLE_RESIDENCE_IDS.has(residence.presetId)) {
			continue;
		}
		const nextPresetId = resolveAscendedPresetId(
			residence,
			spatialIndex,
			buckets
		);
		if (nextPresetId !== residence.presetId) {
			upgrades.set(residence.id, nextPresetId);
		}
	}

	return upgrades;
};

export type AsyncAutoAscendOptions = {
	readonly shouldAbort?: () => boolean;
	readonly timeBudgetMs?: number;
};

export const computeAutoAscendUpgradesAsync = async (
	buildings: ReadonlyArray<PlacedBuilding>,
	gridWidth: number,
	gridHeight: number,
	options?: AsyncAutoAscendOptions
): Promise<Map<string, string> | null> => {
	if (options?.shouldAbort?.()) {
		return null;
	}

	const upgrades = new Map<string, string>();
	if (buildings.length === 0) {
		return upgrades;
	}

	const spatialIndex = getSpatialIndex(buildings, gridWidth, gridHeight);
	const candidates = spatialIndex.residences.filter((residence) =>
		UPGRADABLE_RESIDENCE_IDS.has(residence.presetId)
	);
	if (candidates.length === 0) {
		return upgrades;
	}

	const buckets = buildAscensionServiceBuckets(spatialIndex);
	const budgetMs = options?.timeBudgetMs ?? TIME_BUDGET_MS;

	const processSlice = async (
		startIndex: number
	): Promise<Map<string, string> | null> => {
		if (options?.shouldAbort?.()) {
			return null;
		}

		const deadline = performance.now() + budgetMs;
		let index = startIndex;

		do {
			const residence = candidates[index];
			if (residence) {
				const nextPresetId = resolveAscendedPresetId(
					residence,
					spatialIndex,
					buckets
				);
				if (nextPresetId !== residence.presetId) {
					upgrades.set(residence.id, nextPresetId);
				}
			}
			index += 1;
		} while (index < candidates.length && performance.now() < deadline);

		if (index < candidates.length) {
			await yieldToMainThread();
			return processSlice(index);
		}

		return upgrades;
	};

	return processSlice(0);
};
