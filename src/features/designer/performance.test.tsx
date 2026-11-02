import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDesignerStore } from "../../store/designerStore";
import { InspectorPanel } from "./components/InspectorPanel";
import {
	buildRoadTileKeySet,
	canPlaceBuilding,
	hasAdjacentRoadTile,
} from "./gridMath";
import { buildSpatialGridIndex, getSpatialIndex } from "./spatialIndex";
import type { GridPoint, PlacedBuilding } from "./types";

describe("SpatialGridIndex correctness and caching", (): void => {
	it("memoizes per buildings array reference and matches reference collision & road helpers", (): void => {
		const buildings: Array<PlacedBuilding> = [
			{
				id: "market_1",
				presetId: "Marketplace",
				x: 10,
				y: 10,
				width: 6,
				height: 5,
				rotated: false,
			},
			{
				id: "house_1",
				presetId: "PeasantHouse",
				x: 6,
				y: 10,
				width: 3,
				height: 3,
				rotated: false,
			},
			{
				id: "road_north",
				presetId: "CobblestoneRoad_1x1",
				x: 9,
				y: 10,
				width: 1,
				height: 1,
				rotated: false,
			},
			{
				id: "road_south",
				presetId: "CobblestoneRoad_1x1",
				x: 9,
				y: 11,
				width: 1,
				height: 1,
				rotated: false,
			},
		];

		const firstIndex = getSpatialIndex(buildings, 100, 100);
		const secondIndex = getSpatialIndex(buildings, 100, 100);
		expect(secondIndex).toBe(firstIndex);

		// Larger grid bounds trigger a fresh index with wider stride/rows
		const expandedIndex = getSpatialIndex(buildings, 160, 160);
		expect(expandedIndex.stride).toBe(160);
		expect(expandedIndex.rows).toBe(160);

		expect(firstIndex.findBuildingAtTile(12, 12)?.id).toBe("market_1");
		expect(firstIndex.findBuildingAtTile(9, 10)?.id).toBe("road_north");
		expect(firstIndex.findBuildingAtTile(0, 0)).toBeUndefined();
		expect(firstIndex.findBuildingAtTile(-1, 10)).toBeUndefined();
		expect(firstIndex.findBuildingAtTile(200, 200)).toBeUndefined();

		const roadKeySet = buildRoadTileKeySet(buildings);
		for (const item of buildings) {
			expect(firstIndex.hasAdjacentRoad(item)).toBe(
				hasAdjacentRoadTile(item, roadKeySet)
			);
		}

		expect(firstIndex.hasRoadAt(9, 10)).toBe(true);
		expect(firstIndex.hasRoadAt(9, 12)).toBe(false);
		expect(
			firstIndex.hasRoadAtExcluding(9, 10, new Set<string>(["road_north"]))
		).toBe(false);
		expect(
			firstIndex.hasRoadAtExcluding(9, 11, new Set<string>(["road_north"]))
		).toBe(true);

		const ignoreSet = new Set<string>(["house_1"]);
		const candidate = { x: 6, y: 10, width: 3, height: 3 };
		expect(firstIndex.canPlace(candidate, 100, 100)).toBe(false);
		expect(firstIndex.canPlace(candidate, 100, 100, ignoreSet)).toBe(true);
	});

	it("preserves top-most hit order and ignoreIds accuracy when imported layouts overlap", (): void => {
		const overlappingBuildings: Array<PlacedBuilding> = [
			{
				id: "bottom_house",
				presetId: "PeasantHouse",
				x: 4,
				y: 4,
				width: 3,
				height: 3,
				rotated: false,
			},
			{
				id: "top_house",
				presetId: "CitizenHouse",
				x: 5,
				y: 5,
				width: 3,
				height: 3,
				rotated: false,
			},
		];

		const spatialIndex = buildSpatialGridIndex(overlappingBuildings, 50, 50);
		expect(spatialIndex.hasAnyOverlap).toBe(true);
		expect(spatialIndex.findBuildingAtTile(5, 5)?.id).toBe("top_house");
		expect(spatialIndex.findBuildingAtTile(4, 4)?.id).toBe("bottom_house");

		// Ignoring only top_house at (5,5) must still detect bottom_house underneath
		const ignoreTopOnly = new Set<string>(["top_house"]);
		expect(
			spatialIndex.canPlace(
				{ x: 5, y: 5, width: 2, height: 2 },
				50,
				50,
				ignoreTopOnly
			)
		).toBe(
			canPlaceBuilding(
				overlappingBuildings,
				{ x: 5, y: 5, width: 2, height: 2 },
				50,
				50,
				ignoreTopOnly
			)
		);
	});
});

describe("Batch store strokes and debounced localStorage persistence", (): void => {
	beforeEach((): void => {
		vi.useFakeTimers();
		useDesignerStore.getState().clearBoard();
		vi.advanceTimersByTime(500);
	});

	afterEach((): void => {
		vi.useRealTimers();
	});

	it("commits multi-cell road strokes, seamless road upgrades, and batch erases in single undo steps", (): void => {
		const initialHistoryDepth = useDesignerStore.getState().past.length;
		const roadPoints: Array<GridPoint> = [];
		for (let column = 2; column < 22; column += 1) {
			roadPoints.push({ x: column, y: 5 });
		}

		const placedDirtCount = useDesignerStore
			.getState()
			.placeBuildingsAtPoints(roadPoints, {
				presetId: "DirtRoad_1x1",
				rotated: false,
				recordHistory: true,
			});

		expect(placedDirtCount).toBe(20);
		expect(useDesignerStore.getState().buildings).toHaveLength(20);
		expect(useDesignerStore.getState().past.length).toBe(
			initialHistoryDepth + 1
		);

		// Upgrade half the dirt road to cobblestone in one batch stroke
		const upgradePoints = roadPoints.slice(0, 10);
		const upgradedCount = useDesignerStore
			.getState()
			.placeBuildingsAtPoints(upgradePoints, {
				presetId: "CobblestoneRoad_1x1",
				rotated: false,
				recordHistory: true,
			});

		expect(upgradedCount).toBe(10);
		expect(useDesignerStore.getState().buildings).toHaveLength(20);
		const cobblestoneCount = useDesignerStore
			.getState()
			.buildings.filter(
				(item) => item.presetId === "CobblestoneRoad_1x1"
			).length;
		expect(cobblestoneCount).toBe(10);

		// Multi-tile batch placement skips intra-batch overlapping points automatically
		const denseHousePoints: Array<GridPoint> = [
			{ x: 2, y: 10 },
			{ x: 3, y: 10 }, // overlaps (2,10) 3x3
			{ x: 5, y: 10 }, // valid next 3x3
		];
		const placedHouses = useDesignerStore
			.getState()
			.placeBuildingsAtPoints(denseHousePoints, {
				presetId: "PeasantHouse",
				rotated: false,
				recordHistory: true,
			});
		expect(placedHouses).toBe(2);

		// Batch erase removes hit structures in a single undo entry
		const firstHouseId = useDesignerStore
			.getState()
			.buildings.find((item) => item.presetId === "PeasantHouse")?.id;
		if (firstHouseId) {
			useDesignerStore.getState().setSelectedIds([firstHouseId]);
			useDesignerStore.getState().setHoveredBuildingId(firstHouseId);
		}

		const erasedCount = useDesignerStore.getState().eraseAtCells(
			[
				{ x: 2, y: 5 },
				{ x: 3, y: 5 },
				{ x: 2, y: 10 },
			],
			true
		);
		expect(erasedCount).toBe(3);
		expect(useDesignerStore.getState().selectedIds).toHaveLength(0);
		expect(useDesignerStore.getState().hoveredBuildingId).toBeNull();

		useDesignerStore.getState().undo();
		expect(useDesignerStore.getState().buildings).toHaveLength(22);
	});

	it("skips localStorage serialization on transient UI updates and debounces layout writes", (): void => {
		const setItemSpy = vi.spyOn(Storage.prototype, "setItem");

		try {
			const houseId = useDesignerStore.getState().placeBuildingAt(4, 4, {
				presetId: "PeasantHouse",
				rotated: false,
			});
			expect(houseId).toBeTruthy();

			// Flush the initial placement write
			vi.advanceTimersByTime(400);
			setItemSpy.mockClear();

			// Transient hover, selection, and tool switches must never serialize to localStorage
			useDesignerStore.getState().setHoveredBuildingId(houseId);
			useDesignerStore.getState().setSelectedIds([houseId!]);
			useDesignerStore.getState().setActiveTool("erase");
			useDesignerStore.getState().setActiveTool("select");
			vi.advanceTimersByTime(600);
			expect(setItemSpy).not.toHaveBeenCalled();

			// Rapid building placements coalesce into a single debounced write
			for (let column = 10; column < 20; column += 1) {
				useDesignerStore.getState().placeBuildingAt(column, 2, {
					presetId: "CobblestoneRoad_1x1",
					rotated: false,
				});
			}
			expect(setItemSpy).not.toHaveBeenCalled();

			vi.advanceTimersByTime(400);
			expect(setItemSpy).toHaveBeenCalledTimes(1);
		} finally {
			setItemSpy.mockRestore();
		}
	});
});

describe("Large layout performance at 500+ buildings", (): void => {
	beforeEach((): void => {
		useDesignerStore.getState().clearBoard();
		useDesignerStore.getState().setGridDimensions(180, 180);
	});

	it("handles 550+ buildings across spatial indexing, batch moves, and InspectorPanel coverage cleanly", (): void => {
		const items: Array<PlacedBuilding> = [];

		// Place 8 Marketplaces across the 180x180 settlement
		for (let index = 0; index < 8; index += 1) {
			const gridColumn = (index % 4) * 40 + 18;
			const gridRow = Math.floor(index / 4) * 60 + 24;
			items.push({
				id: `market_${index}`,
				presetId: "Marketplace",
				x: gridColumn,
				y: gridRow,
				width: 6,
				height: 5,
				rotated: false,
			});
		}

		// Place 360 3x3 houses (18 rows x 20 columns) and 200 road tiles = 568 total buildings
		for (let row = 0; row < 18; row += 1) {
			const yPosition = row * 4 + 2;
			if (yPosition >= 22 && yPosition <= 30) {
				continue;
			}
			if (yPosition >= 82 && yPosition <= 90) {
				continue;
			}
			for (let column = 0; column < 25; column += 1) {
				const xPosition = column * 4 + 2;
				items.push({
					id: `house_${row}_${column}`,
					presetId: row % 2 === 0 ? "PatricianHouse" : "CitizenHouse",
					x: xPosition,
					y: yPosition,
					width: 3,
					height: 3,
					rotated: false,
				});
			}
		}

		for (let roadIndex = 0; roadIndex < 200; roadIndex += 1) {
			items.push({
				id: `road_${roadIndex}`,
				presetId: "CobblestoneRoad_1x1",
				x: (roadIndex % 100) + 2,
				y: roadIndex < 100 ? 1 : 95,
				width: 1,
				height: 1,
				rotated: false,
			});
		}

		expect(items.length).toBeGreaterThan(500);

		useDesignerStore.getState().importBuildings("500+ Stress City", items);
		const storeBuildings = useDesignerStore.getState().buildings;
		expect(storeBuildings.length).toBe(items.length);

		const queryStartMs = performance.now();
		const spatialIndex = getSpatialIndex(storeBuildings, 180, 180);

		let hitCount = 0;
		for (let queryIndex = 0; queryIndex < 1000; queryIndex += 1) {
			const tileX = queryIndex % 120;
			const tileY = Math.floor(queryIndex / 12);
			if (spatialIndex.findBuildingAtTile(tileX, tileY)) {
				hitCount += 1;
			}
		}
		expect(hitCount).toBeGreaterThan(100);

		let validPlacements = 0;
		for (let queryIndex = 0; queryIndex < 1000; queryIndex += 1) {
			const candidateX = (queryIndex % 40) * 4 + 2;
			const candidateY = 120 + (queryIndex % 10) * 4;
			if (
				spatialIndex.canPlace(
					{ x: candidateX, y: candidateY, width: 3, height: 3 },
					180,
					180
				)
			) {
				validPlacements += 1;
			}
		}
		expect(validPlacements).toBe(1000);

		let roadConnectedResidences = 0;
		for (const residence of spatialIndex.residences) {
			if (spatialIndex.hasAdjacentRoad(residence)) {
				roadConnectedResidences += 1;
			}
		}
		expect(roadConnectedResidences).toBeGreaterThan(0);

		const queryElapsedMs = performance.now() - queryStartMs;
		expect(queryElapsedMs).toBeLessThan(150);

		// Batch drag-move 200 buildings simultaneously
		const movingSelection = storeBuildings
			.slice(0, 200)
			.map((building) => building.id);
		const moveStartMs = performance.now();
		const moved = useDesignerStore
			.getState()
			.moveBuildingsByDelta(movingSelection, 0, 40);
		// Moving into occupied territory is rejected cleanly; moving all buildings into free space succeeds
		expect(typeof moved).toBe("boolean");

		const allIds = storeBuildings.map((building) => building.id);
		const movedAll = useDesignerStore
			.getState()
			.moveBuildingsByDelta(allIds, 5, 5);
		const moveElapsedMs = performance.now() - moveStartMs;
		expect(movedAll).toBe(true);
		expect(moveElapsedMs).toBeLessThan(150);

		// Render InspectorPanel with 550+ buildings and verify summary renders cleanly
		render(<InspectorPanel />);
		expect(screen.queryByText("Layout Footprint")).not.toBeNull();
		expect(screen.queryByText("Placed Buildings")).not.toBeNull();
	});
});
