import { act, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDesignerStore } from "../../store/designerStore";
import {
	computeAutoAscendUpgradesAsync,
	computeAutoAscendUpgradesSync,
} from "./autoAscend";
import { TopToolbar } from "./components/TopToolbar";
import type { PlacedBuilding, StarterTemplateItem } from "./types";

describe("Housing Auto Ascend rules, reactive store, UI loading, and 400+ house chunking", (): void => {
	beforeEach((): void => {
		void useDesignerStore.getState().setAutoAscend(false);
		useDesignerStore.getState().clearBoard();
		useDesignerStore.getState().setGridDimensions(180, 180);
	});

	it("requires road connection + Marketplace + tier service radii for Occident progression", (): void => {
		const buildings: Array<PlacedBuilding> = [
			// Central Marketplace (radius 20) + Chapel (radius 16) at (20, 20)
			{
				id: "market_1",
				presetId: "Marketplace",
				x: 20,
				y: 20,
				width: 6,
				height: 5,
				rotated: false,
			},
			{
				id: "chapel_1",
				presetId: "Chapel",
				x: 20,
				y: 16,
				width: 5,
				height: 3,
				rotated: false,
			},
			// House A: inside Market + Chapel + adjacent road -> CitizenHouse
			{
				id: "house_road_and_services",
				presetId: "PeasantHouse",
				x: 16,
				y: 16,
				width: 3,
				height: 3,
				rotated: false,
			},
			{
				id: "road_for_a",
				presetId: "CobblestoneRoad_1x1",
				x: 15,
				y: 16,
				width: 1,
				height: 1,
				rotated: false,
			},
			// House B: inside Market + Chapel, NO road -> stays PeasantHouse
			{
				id: "house_no_road",
				presetId: "PeasantHouse",
				x: 27,
				y: 16,
				width: 3,
				height: 3,
				rotated: false,
			},
			// Isolated Chapel without Marketplace at (80, 80) + road-connected PeasantHouse -> stays PeasantHouse
			{
				id: "chapel_isolated",
				presetId: "Chapel",
				x: 80,
				y: 80,
				width: 5,
				height: 3,
				rotated: false,
			},
			{
				id: "house_no_market",
				presetId: "PeasantHouse",
				x: 76,
				y: 80,
				width: 3,
				height: 3,
				rotated: false,
			},
			{
				id: "road_isolated",
				presetId: "CobblestoneRoad_1x1",
				x: 75,
				y: 80,
				width: 1,
				height: 1,
				rotated: false,
			},
		];

		const firstPass = computeAutoAscendUpgradesSync(buildings, 180, 180);
		expect(firstPass.get("house_road_and_services")).toBe("CitizenHouse");
		expect(firstPass.has("house_no_road")).toBe(false);
		expect(firstPass.has("house_no_market")).toBe(false);

		// Add Tavern -> Citizen/Peasant with road + Market + Chapel + Tavern becomes PatricianHouse
		const withTavern: Array<PlacedBuilding> = [
			...buildings,
			{
				id: "tavern_1",
				presetId: "Tavern",
				x: 20,
				y: 26,
				width: 3,
				height: 4,
				rotated: false,
			},
		];
		const secondPass = computeAutoAscendUpgradesSync(withTavern, 180, 180);
		expect(secondPass.get("house_road_and_services")).toBe("PatricianHouse");

		// Add Church + Debtor's Prison -> ascends all the way from PeasantHouse to NoblemanHouse
		const withChurchAndPrison: Array<PlacedBuilding> = [
			...withTavern,
			{
				id: "church_1",
				presetId: "Church",
				x: 14,
				y: 20,
				width: 6,
				height: 8,
				rotated: false,
			},
			{
				id: "prison_1",
				presetId: "DebtorsPrison",
				x: 24,
				y: 26,
				width: 5,
				height: 4,
				rotated: false,
			},
		];
		const thirdPass = computeAutoAscendUpgradesSync(
			withChurchAndPrison,
			180,
			180
		);
		expect(thirdPass.get("house_road_and_services")).toBe("NoblemanHouse");

		// Imperial Cathedral alone (+ road) satisfies all Occident needs up to NoblemanHouse
		const cathedralDistrict: Array<PlacedBuilding> = [
			{
				id: "cathedral_1",
				presetId: "ImperialCathedral",
				x: 40,
				y: 40,
				width: 11,
				height: 18,
				rotated: false,
			},
			{
				id: "peasant_cathedral",
				presetId: "PeasantHouse",
				x: 36,
				y: 44,
				width: 3,
				height: 3,
				rotated: false,
			},
			{
				id: "road_cathedral",
				presetId: "CobblestoneRoad_1x1",
				x: 35,
				y: 44,
				width: 1,
				height: 1,
				rotated: false,
			},
		];
		const cathedralUpgrades = computeAutoAscendUpgradesSync(
			cathedralDistrict,
			180,
			180
		);
		expect(cathedralUpgrades.get("peasant_cathedral")).toBe("NoblemanHouse");
	});

	it("requires road connection + Bazaar + Mosque (or Sultan's Mosque) for Orient progression", (): void => {
		const orientBuildings: Array<PlacedBuilding> = [
			{
				id: "bazaar_1",
				presetId: "Bazaar",
				x: 30,
				y: 30,
				width: 6,
				height: 5,
				rotated: false,
			},
			{
				id: "mosque_1",
				presetId: "Mosque",
				x: 30,
				y: 23,
				width: 6,
				height: 6,
				rotated: false,
			},
			{
				id: "nomad_connected",
				presetId: "NomadsTent",
				x: 26,
				y: 28,
				width: 3,
				height: 3,
				rotated: false,
			},
			{
				id: "orient_road",
				presetId: "DirtRoad_1x1",
				x: 25,
				y: 28,
				width: 1,
				height: 1,
				rotated: false,
			},
			{
				id: "nomad_disconnected",
				presetId: "NomadsTent",
				x: 37,
				y: 28,
				width: 3,
				height: 3,
				rotated: false,
			},
		];

		const upgrades = computeAutoAscendUpgradesSync(orientBuildings, 180, 180);
		expect(upgrades.get("nomad_connected")).toBe("AmbassadorHouse");
		expect(upgrades.has("nomad_disconnected")).toBe(false);
	});

	it("enforces ascend-only behavior, live reactive upgrades on placement, and single-step undo", async (): Promise<void> => {
		const items: Array<StarterTemplateItem> = [
			{
				presetId: "Marketplace",
				x: 20,
				y: 20,
				width: 6,
				height: 5,
				rotated: false,
			},
			{
				presetId: "Chapel",
				x: 20,
				y: 16,
				width: 5,
				height: 3,
				rotated: false,
			},
			{
				presetId: "PeasantHouse",
				x: 16,
				y: 16,
				width: 3,
				height: 3,
				rotated: false,
			},
			{
				presetId: "CobblestoneRoad_1x1",
				x: 15,
				y: 16,
				width: 1,
				height: 1,
				rotated: false,
			},
		];

		useDesignerStore.getState().importBuildings("Ascend Test", items);
		expect(useDesignerStore.getState().autoAscend).toBe(false);

		const upgradedCount = await useDesignerStore.getState().setAutoAscend(true);
		expect(upgradedCount).toBe(1);

		const houseAfterCheck = useDesignerStore
			.getState()
			.buildings.find((building) => building.x === 16 && building.y === 16);
		expect(houseAfterCheck?.presetId).toBe("CitizenHouse");

		// Removing the Chapel must NOT downgrade CitizenHouse (ascend-only)
		const chapelBuilding = useDesignerStore
			.getState()
			.buildings.find((building) => building.presetId === "Chapel");
		expect(chapelBuilding).toBeDefined();
		if (chapelBuilding) {
			useDesignerStore.getState().removeBuildings([chapelBuilding.id]);
		}
		expect(
			useDesignerStore
				.getState()
				.buildings.find((building) => building.x === 16 && building.y === 16)
				?.presetId
		).toBe("CitizenHouse");

		// Restore Chapel and place a Tavern while Auto Ascend is checked -> auto-upgrades to PatricianHouse
		useDesignerStore.getState().placeBuildingAt(20, 16, {
			presetId: "Chapel",
			rotated: false,
		});
		const historyBeforeTavern = useDesignerStore.getState().past.length;
		useDesignerStore.getState().placeBuildingAt(20, 26, {
			presetId: "Tavern",
			rotated: false,
		});

		// Wait for reactive auto-ascend pass triggered by Tavern placement
		await vi.waitFor((): void => {
			expect(useDesignerStore.getState().isAutoAscending).toBe(false);
			expect(
				useDesignerStore
					.getState()
					.buildings.find((building) => building.x === 16 && building.y === 16)
					?.presetId
			).toBe("PatricianHouse");
		});

		// Placing Tavern + reactive auto-ascend coalesced into a single undo entry
		expect(useDesignerStore.getState().past.length).toBe(
			historyBeforeTavern + 1
		);
		useDesignerStore.getState().undo();
		expect(
			useDesignerStore
				.getState()
				.buildings.find((building) => building.x === 16 && building.y === 16)
				?.presetId
		).toBe("CitizenHouse");
		expect(
			useDesignerStore
				.getState()
				.buildings.some((building) => building.presetId === "Tavern")
		).toBe(false);

		// Unchecking Auto Ascend preserves ascended tiers
		await useDesignerStore.getState().setAutoAscend(false);
		expect(
			useDesignerStore
				.getState()
				.buildings.find((building) => building.x === 16 && building.y === 16)
				?.presetId
		).toBe("CitizenHouse");
	});

	it("renders unchecked toolbar checklist by default, displays loading indicator, and ascends 400 houses without freezing", async (): Promise<void> => {
		const largeSettlement: Array<StarterTemplateItem> = [];

		// Place 12 Imperial Cathedrals (radius 36) spaced across the 180x180 board so all 400 houses are covered
		const cathedralCoords: ReadonlyArray<readonly [number, number]> = [
			[15, 10],
			[60, 10],
			[105, 10],
			[148, 10],
			[15, 60],
			[60, 60],
			[105, 60],
			[148, 60],
			[15, 110],
			[60, 110],
			[105, 110],
			[148, 110],
		];

		for (const [cathedralX, cathedralY] of cathedralCoords) {
			largeSettlement.push({
				presetId: "ImperialCathedral",
				x: cathedralX,
				y: cathedralY,
				width: 11,
				height: 18,
				rotated: false,
			});
		}

		// Place 400 PeasantHouses + adjacent road tiles across the settlement
		let placedHouses = 0;
		for (let row = 0; row < 40 && placedHouses < 400; row += 1) {
			const houseY = row * 4 + 2;
			for (let column = 0; column < 35 && placedHouses < 400; column += 1) {
				const houseX = column * 5 + 2;
				const overlapsCathedral = cathedralCoords.some(
					([cx, cy]) =>
						houseX < cx + 12 &&
						houseX + 4 > cx &&
						houseY < cy + 19 &&
						houseY + 3 > cy
				);
				if (overlapsCathedral || houseX + 4 > 178 || houseY + 3 > 145) {
					continue;
				}
				largeSettlement.push(
					{
						presetId: "PeasantHouse",
						x: houseX,
						y: houseY,
						width: 3,
						height: 3,
						rotated: false,
					},
					{
						presetId: "CobblestoneRoad_1x1",
						x: houseX + 3,
						y: houseY,
						width: 1,
						height: 1,
						rotated: false,
					}
				);
				placedHouses += 1;
			}
		}

		expect(placedHouses).toBe(400);
		useDesignerStore
			.getState()
			.importBuildings("400 House Metropolis", largeSettlement);

		const stageRef = createRef<null>();
		const onOpenModal = vi.fn();

		const { unmount } = render(
			<TopToolbar stageRef={stageRef} onOpenModal={onOpenModal} />
		);

		const checkbox = screen.getByRole<HTMLInputElement>("checkbox", {
			name: /Auto Ascend/i,
		});
		expect(checkbox.checked).toBe(false);
		expect(screen.queryByRole("status")).toBeNull();

		// Toggle Auto Ascend ON -> immediately checked + shows Calculating... status indicator before yielding completes
		fireEvent.click(checkbox);
		expect(checkbox.checked).toBe(true);
		expect(useDesignerStore.getState().isAutoAscending).toBe(true);
		expect(screen.getByRole("status").textContent).toContain("Calculating");

		await act(async (): Promise<void> => {
			await vi.waitFor((): void => {
				expect(useDesignerStore.getState().isAutoAscending).toBe(false);
			});
		});

		expect(screen.queryByRole("status")).toBeNull();

		const noblemanCount = useDesignerStore
			.getState()
			.buildings.filter(
				(building) => building.presetId === "NoblemanHouse"
			).length;
		expect(noblemanCount).toBe(400);

		unmount();

		// Also verify compact mobile TopToolbar exposes Auto Ascend inside View & Actions menu
		await act(async (): Promise<void> => {
			await useDesignerStore.getState().setAutoAscend(false);
		});
		render(
			<TopToolbar isCompact stageRef={stageRef} onOpenModal={onOpenModal} />
		);
		fireEvent.click(screen.getByLabelText("View overlays and board actions"));
		const compactCheckbox = screen.getByRole<HTMLInputElement>("checkbox", {
			name: /Auto Ascend/i,
		});
		expect(compactCheckbox.checked).toBe(false);
	});

	it("yields across chunks via scheduler.yield or setTimeout fallback when time budget is exceeded", async (): Promise<void> => {
		const buildings: Array<PlacedBuilding> = [
			{
				id: "cathedral_chunk",
				presetId: "ImperialCathedral",
				x: 40,
				y: 40,
				width: 11,
				height: 18,
				rotated: false,
			},
		];

		for (let index = 0; index < 25; index += 1) {
			const yPosition = 20 + index * 3;
			buildings.push(
				{
					id: `house_${index}`,
					presetId: "PeasantHouse",
					x: 35,
					y: yPosition,
					width: 3,
					height: 3,
					rotated: false,
				},
				{
					id: `road_${index}`,
					presetId: "CobblestoneRoad_1x1",
					x: 34,
					y: yPosition,
					width: 1,
					height: 1,
					rotated: false,
				}
			);
		}

		const yieldSpy = vi.fn((): Promise<void> => Promise.resolve());
		const originalSchedulerDescriptor = Object.getOwnPropertyDescriptor(
			window,
			"scheduler"
		);
		Object.defineProperty(window, "scheduler", {
			configurable: true,
			writable: true,
			value: { yield: yieldSpy },
		});

		try {
			// timeBudgetMs: 0 forces yielding after every item slice
			const upgrades = await computeAutoAscendUpgradesAsync(
				buildings,
				180,
				180,
				{
					timeBudgetMs: 0,
				}
			);
			expect(upgrades).not.toBeNull();
			expect(upgrades?.size).toBeGreaterThan(10);
			expect(yieldSpy).toHaveBeenCalledTimes(24);
		} finally {
			if (originalSchedulerDescriptor) {
				Object.defineProperty(window, "scheduler", originalSchedulerDescriptor);
			} else {
				Reflect.deleteProperty(window, "scheduler");
			}
		}

		// Also verify graceful cancellation mid-stream via shouldAbort
		let checks = 0;
		const abortedResult = await computeAutoAscendUpgradesAsync(
			buildings,
			180,
			180,
			{
				timeBudgetMs: 0,
				shouldAbort: (): boolean => {
					checks += 1;
					return checks > 3;
				},
			}
		);
		expect(abortedResult).toBeNull();
	});
});
