import { act, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDesignerStore } from "../../store/designerStore";
import { InspectorPanel } from "./components/InspectorPanel";
import { TopToolbar } from "./components/TopToolbar";
import {
	computeHighlightedCoveredIds,
	CUSTOM_COLOR_PRESETS,
	FARM_FIELD_RULES,
	TREE_FARM_RULES,
	TREE_TILE_PRESET_ID,
} from "./farmRules";
import {
	hasAdjacentRoadTile,
	isRectCoveredBySource,
	parseLayoutJson,
	rectanglesOverlap,
	serializePlaygroundJson,
	toTileKey,
} from "./gridMath";
import { PRESET_BY_ID } from "./presetsData";
import { getSpatialIndex } from "./spatialIndex";

describe("Toolbar Show Labels checklist, Tree Populate, Preset Colors, and Farm Fields", (): void => {
	beforeEach((): void => {
		useDesignerStore.getState().clearBoard();
		useDesignerStore.getState().setGridDimensions(120, 120);
		useDesignerStore.getState().setShowLabels(true);
		useDesignerStore.getState().setInfluenceMode("active");
		useDesignerStore.getState().setActiveTool("select");
	});

	it("toggles building labels via the toolbar checklist in both desktop and compact mobile views", (): void => {
		const stageRef = createRef<null>();
		const onOpenModal = vi.fn();

		const { unmount } = render(
			<TopToolbar stageRef={stageRef} onOpenModal={onOpenModal} />
		);

		const desktopCheckbox = screen.getByRole<HTMLInputElement>("checkbox", {
			name: /Show Labels/i,
		});
		expect(desktopCheckbox.checked).toBe(true);
		expect(useDesignerStore.getState().showLabels).toBe(true);

		fireEvent.click(desktopCheckbox);
		expect(desktopCheckbox.checked).toBe(false);
		expect(useDesignerStore.getState().showLabels).toBe(false);

		fireEvent.click(desktopCheckbox);
		expect(desktopCheckbox.checked).toBe(true);
		expect(useDesignerStore.getState().showLabels).toBe(true);

		unmount();

		render(
			<TopToolbar isCompact stageRef={stageRef} onOpenModal={onOpenModal} />
		);
		fireEvent.click(screen.getByLabelText("View overlays and board actions"));

		const mobileCheckbox = screen.getByRole<HTMLInputElement>("checkbox", {
			name: /Show Labels/i,
		});
		expect(mobileCheckbox.checked).toBe(true);

		fireEvent.click(mobileCheckbox);
		expect(mobileCheckbox.checked).toBe(false);
		expect(useDesignerStore.getState().showLabels).toBe(false);
	});

	it("populates connected trees for LumberHut/CharburnerHut/ForestGlassworks, adopts wild trees without stealing, and highlights only connected children", (): void => {
		expect(TREE_FARM_RULES.get("LumberHut")?.optimalTrees).toBe(33);
		expect(TREE_FARM_RULES.get("CharburnerHut")?.optimalTrees).toBe(120);
		expect(TREE_FARM_RULES.get("ForestGlassworks")?.optimalTrees).toBe(132);

		// Place first LumberHut at (20, 20) and an unassigned wild tree inside its radius at (19, 20)
		const firstHutId = useDesignerStore.getState().placeBuildingAt(20, 20, {
			presetId: "LumberHut",
			rotated: false,
		});
		const wildTreeInsideId = useDesignerStore
			.getState()
			.placeBuildingAt(19, 20, {
				presetId: TREE_TILE_PRESET_ID,
				rotated: false,
			});
		// Also place an unconnected wild tree nearby at (19, 19) BEFORE populate? Let's place one outside radius at (10, 10)
		// and also test a wild tree inside radius when NOT populated!
		const wildTreeOutsideId = useDesignerStore
			.getState()
			.placeBuildingAt(10, 10, {
				presetId: TREE_TILE_PRESET_ID,
				rotated: false,
			});

		expect(firstHutId).toBeTruthy();
		expect(wildTreeInsideId).toBeTruthy();
		expect(wildTreeOutsideId).toBeTruthy();

		// Before clicking Populate, selecting firstHut should NOT highlight unconnected wildTreeInsideId!
		useDesignerStore.getState().setSelectedIds([firstHutId!]);
		const prePopulateIndex = getSpatialIndex(
			useDesignerStore.getState().buildings,
			120,
			120
		);
		const preHighlighted = computeHighlightedCoveredIds({
			spatialIndex: prePopulateIndex,
			selectedIds: [firstHutId!],
			hoveredBuildingId: null,
			influenceMode: "active",
			ghostRect: null,
			ghostPreset: null,
			isActivelyDraggingSelection: false,
			movingIdSet: new Set<string>(),
			dragDeltaX: 0,
			dragDeltaY: 0,
		});
		expect(preHighlighted.has(wildTreeInsideId!)).toBe(false);

		// Render InspectorPanel and click Populate Trees
		render(<InspectorPanel />);
		const populateButton = screen.getByRole("button", {
			name: /Populate Trees/i,
		});
		fireEvent.click(populateButton);

		const stateAfterFirstPopulate = useDesignerStore.getState();
		const firstHut = stateAfterFirstPopulate.buildings.find(
			(item) => item.id === firstHutId
		);
		expect(firstHut?.childIds).toBeDefined();
		// LumberHut 3x3 (9 tiles) inside radius 5 (~79 tiles) -> 70 connected trees >= 33 optimal!
		expect(firstHut!.childIds!.length).toBeGreaterThanOrEqual(65);
		expect(firstHut!.childIds).toContain(wildTreeInsideId);
		expect(firstHut!.childIds).not.toContain(wildTreeOutsideId);

		// Every child tree holds parentId === firstHutId and lies within radius 5
		for (const childId of firstHut!.childIds!) {
			const childTree = stateAfterFirstPopulate.buildings.find(
				(item) => item.id === childId
			);
			expect(childTree?.presetId).toBe(TREE_TILE_PRESET_ID);
			expect(childTree?.parentId).toBe(firstHutId);
			expect(isRectCoveredBySource(childTree!, firstHut!, 5)).toBe(true);
		}

		// Place a second overlapping-radius LumberHut at (27, 20) and populate it -> must NOT steal firstHut's trees!
		const firstHutTreeCount = firstHut!.childIds!.length;
		const secondHutId = useDesignerStore.getState().placeBuildingAt(27, 20, {
			presetId: "LumberHut",
			rotated: false,
		});
		expect(secondHutId).toBeTruthy();

		act((): void => {
			useDesignerStore.getState().populateTreesForBuilding(secondHutId!);
		});

		const stateWithTwoHuts = useDesignerStore.getState();
		const updatedFirstHut = stateWithTwoHuts.buildings.find(
			(item) => item.id === firstHutId
		);
		const updatedSecondHut = stateWithTwoHuts.buildings.find(
			(item) => item.id === secondHutId
		);
		expect(updatedFirstHut?.childIds?.length).toBe(firstHutTreeCount);
		expect(updatedSecondHut?.childIds?.length).toBeGreaterThan(25);

		const firstChildSet = new Set(updatedFirstHut!.childIds);
		for (const secondChildId of updatedSecondHut!.childIds!) {
			expect(firstChildSet.has(secondChildId)).toBe(false);
		}

		// Selecting secondHut highlights ONLY secondHut's connected trees (even if influenceMode === "none")
		const twoHutsIndex = getSpatialIndex(stateWithTwoHuts.buildings, 120, 120);
		const highlightedForSecond = computeHighlightedCoveredIds({
			spatialIndex: twoHutsIndex,
			selectedIds: [secondHutId!],
			hoveredBuildingId: null,
			influenceMode: "none",
			ghostRect: null,
			ghostPreset: null,
			isActivelyDraggingSelection: false,
			movingIdSet: new Set<string>(),
			dragDeltaX: 0,
			dragDeltaY: 0,
		});
		expect(highlightedForSecond.size).toBe(updatedSecondHut!.childIds!.length);
		for (const secondChildId of updatedSecondHut!.childIds!) {
			expect(highlightedForSecond.has(secondChildId)).toBe(true);
		}
		for (const firstChildId of updatedFirstHut!.childIds!) {
			expect(highlightedForSecond.has(firstChildId)).toBe(false);
		}

		// Painting a road over one of firstHut's connected trees cleanly removes that tree from firstHut.childIds
		const sampleTreeId = updatedFirstHut!.childIds![0]!;
		const sampleTree = stateWithTwoHuts.buildings.find(
			(item) => item.id === sampleTreeId
		)!;
		act((): void => {
			useDesignerStore.getState().placeBuildingAt(sampleTree.x, sampleTree.y, {
				presetId: "DirtRoad_1x1",
				rotated: false,
			});
		});
		const afterRoadHut = useDesignerStore
			.getState()
			.buildings.find((item) => item.id === firstHutId);
		expect(afterRoadHut?.childIds?.length).toBe(firstHutTreeCount - 1);
		expect(afterRoadHut?.childIds).not.toContain(sampleTreeId);
	});

	it("applies preset color swatches in Custom Label without losing parent-child links and supports Reset", (): void => {
		const farmId = useDesignerStore.getState().placeBuildingAt(30, 30, {
			presetId: "HempPlantation",
			rotated: false,
		});
		expect(farmId).toBeTruthy();
		useDesignerStore.getState().spawnFieldsForFarm(farmId!);
		useDesignerStore.getState().setSelectedIds([farmId!]);

		render(<InspectorPanel />);

		const targetSwatch = CUSTOM_COLOR_PRESETS[3]!; // Emerald #10b981
		const swatchButton = screen.getByRole("button", {
			name: new RegExp(`Apply ${targetSwatch.name} color`, "i"),
		});
		expect(swatchButton.getAttribute("aria-pressed")).toBe("false");

		fireEvent.click(swatchButton);
		expect(swatchButton.getAttribute("aria-pressed")).toBe("true");

		const customizedFarm = useDesignerStore
			.getState()
			.buildings.find((item) => item.id === farmId);
		expect(customizedFarm?.customColor).toBe(targetSwatch.hex);
		// Parent-child links remain intact after color & label customization
		expect(customizedFarm?.childIds).toHaveLength(4);

		const labelInput = screen.getByLabelText("Custom Label");
		fireEvent.change(labelInput, { target: { value: "North Hemp" } });
		expect(
			useDesignerStore.getState().buildings.find((item) => item.id === farmId)
				?.childIds
		).toHaveLength(4);

		fireEvent.click(screen.getByRole("button", { name: "Reset" }));
		expect(
			useDesignerStore.getState().buildings.find((item) => item.id === farmId)
				?.customColor
		).toBeUndefined();
	});

	it("packs 100% of Anno 1404 maxFields inside influence radius for all 17 farm types while preserving road access", (): void => {
		expect(FARM_FIELD_RULES.size).toBe(17);

		for (const [farmPresetId, rule] of FARM_FIELD_RULES.entries()) {
			useDesignerStore.getState().clearBoard();
			const farmPreset = PRESET_BY_ID.get(farmPresetId);
			expect(farmPreset).toBeDefined();

			const farmId = useDesignerStore.getState().placeBuildingAt(40, 40, {
				presetId: farmPresetId,
				rotated: false,
			});
			expect(farmId).toBeTruthy();

			const spawnedCount = useDesignerStore
				.getState()
				.spawnFieldsForFarm(farmId!);
			expect(spawnedCount).toBe(rule.maxFields);

			// Trying to spawn more once at maxFields returns 0
			expect(useDesignerStore.getState().spawnFieldsForFarm(farmId!)).toBe(0);

			const buildings = useDesignerStore.getState().buildings;
			const farm = buildings.find((item) => item.id === farmId)!;
			expect(farm.childIds).toHaveLength(rule.maxFields);

			// Verify zero overlaps and every spawned field is strictly inside farm's influenceRadius
			for (let first = 0; first < buildings.length; first += 1) {
				for (let second = first + 1; second < buildings.length; second += 1) {
					expect(rectanglesOverlap(buildings[first]!, buildings[second]!)).toBe(
						false
					);
				}
			}

			for (const fieldId of farm.childIds!) {
				const field = buildings.find((item) => item.id === fieldId)!;
				expect(field.presetId).toBe(rule.fieldPresetId);
				expect(field.parentId).toBe(farm.id);
				expect(
					isRectCoveredBySource(field, farm, farmPreset!.influenceRadius)
				).toBe(true);
			}

			// Verify at least 1 perimeter tile around the farm remains open for road connection
			const occupiedTiles = new Set<string>();
			for (const item of buildings) {
				for (let dx = 0; dx < item.width; dx += 1) {
					for (let dy = 0; dy < item.height; dy += 1) {
						occupiedTiles.add(toTileKey(item.x + dx, item.y + dy));
					}
				}
			}
			const freePerimeterTiles = new Set<string>();
			for (let x = 35; x < 50; x += 1) {
				for (let y = 35; y < 50; y += 1) {
					const key = toTileKey(x, y);
					if (!occupiedTiles.has(key)) {
						freePerimeterTiles.add(key);
					}
				}
			}
			expect(hasAdjacentRoadTile(farm, freePerimeterTiles)).toBe(true);
		}
	});

	it("supports Spawn Fields, +1 Field, manual Assign button on unassigned fields, game rule caps, radius disconnect, clone, and JSON round-trip", (): void => {
		// Place HempPlantation (3x3, radius 6, max 4 x FarmField_4x3) at (30, 30)
		const hempId = useDesignerStore.getState().placeBuildingAt(30, 30, {
			presetId: "HempPlantation",
			rotated: false,
		})!;

		// Place an unassigned 4x3 field in radius at (26, 30), a wrong-size 4x4 field in radius at (33, 30), and an out-of-radius 4x3 field at (10, 10)
		const unassignedValidFieldId = useDesignerStore
			.getState()
			.placeBuildingAt(26, 30, {
				presetId: "FarmField_4x3",
				rotated: false,
			})!;
		const wrongSizeFieldId = useDesignerStore
			.getState()
			.placeBuildingAt(33, 30, {
				presetId: "FarmField_4x4",
				rotated: false,
			})!;
		const outOfRadiusFieldId = useDesignerStore
			.getState()
			.placeBuildingAt(10, 10, {
				presetId: "FarmField_4x3",
				rotated: false,
			})!;

		// Game rules reject wrong field size and out-of-radius field
		expect(
			useDesignerStore.getState().assignFieldToFarm(wrongSizeFieldId, hempId)
		).toBe(false);
		expect(
			useDesignerStore.getState().assignFieldToFarm(outOfRadiusFieldId, hempId)
		).toBe(false);

		// Remove wrong-size field so HempPlantation has plenty of space around it
		useDesignerStore.getState().removeBuildings([wrongSizeFieldId]);

		// Select the unassigned valid 4x3 field and click Assign in InspectorPanel
		useDesignerStore.getState().setSelectedIds([unassignedValidFieldId]);
		const { rerender } = render(<InspectorPanel />);

		const assignButton = screen.getByRole("button", {
			name: /Assign field to Hemp plantation/i,
		});
		fireEvent.click(assignButton);

		expect(
			useDesignerStore
				.getState()
				.buildings.find((item) => item.id === unassignedValidFieldId)?.parentId
		).toBe(hempId);
		expect(
			useDesignerStore.getState().buildings.find((item) => item.id === hempId)
				?.childIds
		).toEqual([unassignedValidFieldId]);

		// Select HempPlantation -> shows 1 / 4, click "+1 Field", then click "Spawn Fields" -> reaches 4 / 4
		act((): void => {
			useDesignerStore.getState().setSelectedIds([hempId]);
		});
		rerender(<InspectorPanel />);

		fireEvent.click(screen.getByRole("button", { name: "Spawn 1 field" }));
		expect(
			useDesignerStore.getState().buildings.find((item) => item.id === hempId)
				?.childIds
		).toHaveLength(2);

		fireEvent.click(screen.getByRole("button", { name: /Spawn Fields/i }));
		const fullHemp = useDesignerStore
			.getState()
			.buildings.find((item) => item.id === hempId)!;
		expect(fullHemp.childIds).toHaveLength(4);

		// Cannot assign a 5th 4x3 field even if placed inside radius when HempPlantation already has 4/4!
		const fifthFieldId = useDesignerStore.getState().placeBuildingAt(30, 26, {
			presetId: "FarmField_4x3",
			rotated: false,
		});
		if (fifthFieldId) {
			expect(
				useDesignerStore.getState().assignFieldToFarm(fifthFieldId, hempId)
			).toBe(false);
		}

		// Selecting HempPlantation highlights ONLY its 4 connected fields (not fifthFieldId or outOfRadiusFieldId)
		const currentIndex = getSpatialIndex(
			useDesignerStore.getState().buildings,
			120,
			120
		);
		const highlightedFields = computeHighlightedCoveredIds({
			spatialIndex: currentIndex,
			selectedIds: [hempId],
			hoveredBuildingId: null,
			influenceMode: "active",
			ghostRect: null,
			ghostPreset: null,
			isActivelyDraggingSelection: false,
			movingIdSet: new Set<string>(),
			dragDeltaX: 0,
			dragDeltaY: 0,
		});
		expect(highlightedFields.size).toBe(4);
		for (const connectedId of fullHemp.childIds!) {
			expect(highlightedFields.has(connectedId)).toBe(true);
		}
		if (fifthFieldId) {
			expect(highlightedFields.has(fifthFieldId)).toBe(false);
		}
		expect(highlightedFields.has(outOfRadiusFieldId)).toBe(false);

		// Moving one connected field outside HempPlantation's radius automatically disconnects it (4 -> 3)
		const movedOutMoved = useDesignerStore
			.getState()
			.moveBuildingsByDelta([unassignedValidFieldId], -18, 0);
		expect(movedOutMoved).toBe(true);
		expect(
			useDesignerStore
				.getState()
				.buildings.find((item) => item.id === unassignedValidFieldId)?.parentId
		).toBeUndefined();
		expect(
			useDesignerStore.getState().buildings.find((item) => item.id === hempId)
				?.childIds
		).toHaveLength(3);

		// Moving HempPlantation + its 3 remaining connected fields together keeps all 3 connected
		const hempWithThree = useDesignerStore
			.getState()
			.buildings.find((item) => item.id === hempId)!;
		const groupMoveIds = [hempId, ...hempWithThree.childIds!];
		expect(
			useDesignerStore.getState().moveBuildingsByDelta(groupMoveIds, 0, 25)
		).toBe(true);
		expect(
			useDesignerStore.getState().buildings.find((item) => item.id === hempId)
				?.childIds
		).toHaveLength(3);

		// Cloning HempPlantation + its 3 fields together creates a cloned farm connected to 3 cloned fields
		useDesignerStore.getState().setSelectedIds(groupMoveIds);
		useDesignerStore.getState().duplicateSelectedBuildings();
		const clonedSelectionIds = useDesignerStore.getState().selectedIds;
		expect(clonedSelectionIds).toHaveLength(4);
		const clonedFarm = useDesignerStore
			.getState()
			.buildings.find(
				(item) =>
					clonedSelectionIds.includes(item.id) &&
					item.presetId === "HempPlantation"
			);
		expect(clonedFarm?.childIds).toHaveLength(3);

		// JSON export + import round-trips parentId & childIds cleanly
		const serialized = serializePlaygroundJson({
			layoutName: "Hemp Farm Test",
			gridWidth: 120,
			gridHeight: 120,
			buildings: useDesignerStore.getState().buildings,
		});
		const parsed = parseLayoutJson(serialized);
		useDesignerStore.getState().clearBoard();
		useDesignerStore
			.getState()
			.importBuildings(parsed.layoutName, parsed.buildings);

		const reimportedHempFarms = useDesignerStore
			.getState()
			.buildings.filter((item) => item.presetId === "HempPlantation");
		expect(reimportedHempFarms).toHaveLength(2);
		for (const farm of reimportedHempFarms) {
			expect(farm.childIds).toHaveLength(3);
			for (const childId of farm.childIds!) {
				const child = useDesignerStore
					.getState()
					.buildings.find((item) => item.id === childId);
				expect(child?.parentId).toBe(farm.id);
			}
		}
	});
});
