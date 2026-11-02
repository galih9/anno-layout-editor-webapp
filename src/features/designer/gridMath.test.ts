import { beforeEach, describe, expect, it } from "vitest";
import { useDesignerStore } from "../../store/designerStore";
import {
	buildRoadTileKeySet,
	canPlaceBuilding,
	computeCoveredTileSpans,
	computeLayoutStatistics,
	hasAdjacentRoadTile,
	isRectCoveredBySource,
	parseLayoutJson,
	rectanglesOverlap,
	serializeAnnoDesignerAdJson,
	serializePlaygroundJson,
} from "./gridMath";
import { ANNO_1404_PRESETS, PRESET_BY_ID } from "./presetsData";
import { STARTER_TEMPLATES } from "./starterTemplates";
import type { PlacedBuilding } from "./types";

describe("Anno 1404 presets & starter templates", (): void => {
	it("includes Anno 1404 buildings, Flour Mill, Quay wall icon, and road tiles", (): void => {
		expect(ANNO_1404_PRESETS.length).toBeGreaterThan(130);
		expect(PRESET_BY_ID.get("Marketplace")?.width).toBe(6);
		expect(PRESET_BY_ID.get("Marketplace")?.height).toBe(5);
		expect(PRESET_BY_ID.get("Marketplace")?.influenceRadius).toBe(20);
		expect(PRESET_BY_ID.get("FlourMill")?.iconFileName).toBe(
			"A4_icon_116_26.png"
		);
		expect(PRESET_BY_ID.get("HarbourSystem")?.iconFileName).toBe(
			"A4_icon_116_121.png"
		);
	});

	it("ensures every starter template has zero overlapping buildings", (): void => {
		for (const template of STARTER_TEMPLATES) {
			expect(template.buildings.length).toBeGreaterThan(10);
			for (let first = 0; first < template.buildings.length; first += 1) {
				for (
					let second = first + 1;
					second < template.buildings.length;
					second += 1
				) {
					const buildingA = template.buildings[first];
					const buildingB = template.buildings[second];
					if (buildingA && buildingB) {
						expect(rectanglesOverlap(buildingA, buildingB)).toBe(false);
					}
				}
			}
		}
	});
});

describe("Grid collision, Euclidean coverage, and serialization", (): void => {
	it("validates grid bounds and collisions accurately", (): void => {
		const placed: Array<PlacedBuilding> = [
			{
				id: "market_1",
				presetId: "Marketplace",
				x: 10,
				y: 10,
				width: 6,
				height: 5,
				rotated: false,
			},
		];

		expect(
			canPlaceBuilding(placed, { x: 16, y: 10, width: 3, height: 3 }, 100, 100)
		).toBe(true);
		expect(
			canPlaceBuilding(placed, { x: 15, y: 10, width: 3, height: 3 }, 100, 100)
		).toBe(false);
		expect(
			canPlaceBuilding(placed, { x: 98, y: 10, width: 3, height: 3 }, 100, 100)
		).toBe(false);
	});

	it("computes Anno 1404 Lumberjack Euclidean coverage spans (~79 total tiles)", (): void => {
		const lumberHut = { x: 20, y: 20, width: 3, height: 3 };
		const spans = computeCoveredTileSpans(lumberHut, 5, 100, 100);
		const coveredTileCount = spans.reduce((sum, span) => sum + span.width, 0);
		// Lumberjack hut is 9 tiles + ~70 forest tiles inside radius 5
		expect(coveredTileCount).toBeGreaterThanOrEqual(75);
		expect(coveredTileCount).toBeLessThanOrEqual(81);

		const nearbyHouse = { x: 24, y: 20, width: 3, height: 3 };
		const distantHouse = { x: 40, y: 40, width: 3, height: 3 };
		expect(isRectCoveredBySource(nearbyHouse, lumberHut, 10)).toBe(true);
		expect(isRectCoveredBySource(distantHouse, lumberHut, 10)).toBe(false);
	});

	it("detects adjacent road connections and layout bounding statistics", (): void => {
		const items: Array<PlacedBuilding> = [
			{
				id: "house_1",
				presetId: "PeasantHouse",
				x: 5,
				y: 5,
				width: 3,
				height: 3,
				rotated: false,
			},
			{
				id: "road_1",
				presetId: "CobblestoneRoad_1x1",
				x: 8,
				y: 6,
				width: 1,
				height: 1,
				rotated: false,
			},
		];

		const roadSet = buildRoadTileKeySet(items);
		expect(hasAdjacentRoadTile(items[0]!, roadSet)).toBe(true);

		const statistics = computeLayoutStatistics(items);
		expect(statistics.boundingBox).toEqual({
			x: 5,
			y: 5,
			width: 4,
			height: 3,
		});
		expect(statistics.buildingTiles).toBe(9);
		expect(statistics.roadTiles).toBe(1);
	});

	it("round-trips both web JSON and Anno Designer .ad JSON formats", (): void => {
		const sampleBuildings: Array<PlacedBuilding> = [
			{
				id: "chapel_1",
				presetId: "Chapel",
				x: 12,
				y: 14,
				width: 3,
				height: 5,
				rotated: true,
			},
			{
				id: "road_1",
				presetId: "CobblestoneRoad_1x1",
				x: 11,
				y: 14,
				width: 1,
				height: 1,
				rotated: false,
			},
		];

		const webJson = serializePlaygroundJson({
			layoutName: "Test Settlement",
			gridWidth: 100,
			gridHeight: 100,
			buildings: sampleBuildings,
		});
		const parsedWeb = parseLayoutJson(webJson);
		expect(parsedWeb.layoutName).toBe("Test Settlement");
		expect(parsedWeb.buildings).toHaveLength(2);
		expect(parsedWeb.buildings[0]?.rotated).toBe(true);

		const adJson = serializeAnnoDesignerAdJson(sampleBuildings);
		const parsedAd = parseLayoutJson(adJson);
		expect(parsedAd.buildings).toHaveLength(2);
		expect(parsedAd.buildings[0]?.presetId).toBe("Chapel");
	});
});

describe("Designer Zustand store actions", (): void => {
	beforeEach((): void => {
		useDesignerStore.getState().clearBoard();
	});

	it("places, rotates, moves, duplicates, and undoes/redoes cleanly", (): void => {
		const store = useDesignerStore.getState();
		store.selectPreset("Chapel"); // 5x3
		store.rotateActiveOrSelection(); // rotated -> 3x5

		const placedId = useDesignerStore.getState().placeBuildingAt(10, 10);
		expect(placedId).toBeTruthy();

		const placed = useDesignerStore
			.getState()
			.buildings.find((item) => item.id === placedId);
		expect(placed?.width).toBe(3);
		expect(placed?.height).toBe(5);

		useDesignerStore.getState().setSelectedIds([placedId!]);
		const moved = useDesignerStore
			.getState()
			.moveBuildingsByDelta([placedId!], 4, 2);
		expect(moved).toBe(true);
		expect(useDesignerStore.getState().buildings[0]?.x).toBe(14);
		expect(useDesignerStore.getState().buildings[0]?.y).toBe(12);

		useDesignerStore.getState().duplicateSelectedBuildings();
		expect(useDesignerStore.getState().buildings).toHaveLength(2);

		useDesignerStore.getState().undo();
		expect(useDesignerStore.getState().buildings).toHaveLength(1);

		useDesignerStore.getState().redo();
		expect(useDesignerStore.getState().buildings).toHaveLength(2);
	});
});
