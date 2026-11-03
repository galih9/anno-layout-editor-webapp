import {
	ArrowPathIcon,
	CheckCircleIcon,
	CheckIcon,
	DocumentDuplicateIcon,
	ExclamationTriangleIcon,
	PlusIcon,
	SparklesIcon,
	TrashIcon,
	XMarkIcon,
} from "@heroicons/react/24/outline";
import { useDeferredValue, useId, useMemo } from "react";
import type { FunctionComponent } from "../../../common/types";
import { useDesignerStore } from "../../../store/designerStore";
import {
	computeTreePopulatePlan,
	CUSTOM_COLOR_PRESETS,
	FARM_FIELD_PRESET_IDS,
	FARM_FIELD_RULES,
	findEligibleFarmsForField,
	findEligibleTreeFarmsForTree,
	findUnassignedFieldsInRadius,
	isParentWithChildrenRule,
	TREE_FARM_RULES,
	TREE_TILE_PRESET_ID,
} from "../farmRules";
import { computeLayoutStatistics, isRectCoveredBySource } from "../gridMath";
import {
	MARKETHOUSE_PRESET_IDS,
	NORIA_PRESET_IDS,
	OCCIDENT_RESIDENCE_IDS,
	OCCIDENT_SERVICE_NEEDS,
	ORIENT_RESIDENCE_IDS,
	ORIENT_SERVICE_NEEDS,
	PRESET_BY_ID,
	rgbaToHex,
} from "../presetsData";
import { getSpatialIndex } from "../spatialIndex";

const COMMUNITY_PROVIDER_IDS = new Set<string>([
	"Marketplace",
	"Bazaar",
	"ImperialCathedral",
	"SultanMosque",
]);

export type InspectorPanelProps = {
	readonly isMobileDrawer?: boolean;
	readonly onCloseDrawer?: () => void;
};

export const InspectorPanel = ({
	isMobileDrawer = false,
	onCloseDrawer,
}: InspectorPanelProps): FunctionComponent => {
	const customLabelId = useId();
	const customColorId = useId();
	const customColorPresetsListId = useId();

	const buildings = useDesignerStore((state) => state.buildings);
	const gridWidth = useDesignerStore((state) => state.gridWidth);
	const gridHeight = useDesignerStore((state) => state.gridHeight);
	const selectedIds = useDesignerStore((state) => state.selectedIds);
	const activeTool = useDesignerStore((state) => state.activeTool);
	const activePresetId = useDesignerStore((state) => state.activePresetId);
	const placementRotated = useDesignerStore((state) => state.placementRotated);

	const rotateActiveOrSelection = useDesignerStore(
		(state) => state.rotateActiveOrSelection
	);
	const duplicateSelectedBuildings = useDesignerStore(
		(state) => state.duplicateSelectedBuildings
	);
	const removeBuildings = useDesignerStore((state) => state.removeBuildings);
	const updateBuildingCustomization = useDesignerStore(
		(state) => state.updateBuildingCustomization
	);
	const setSelectedIds = useDesignerStore((state) => state.setSelectedIds);
	const selectByPresetId = useDesignerStore((state) => state.selectByPresetId);
	const populateTreesForBuilding = useDesignerStore(
		(state) => state.populateTreesForBuilding
	);
	const spawnFieldsForFarm = useDesignerStore(
		(state) => state.spawnFieldsForFarm
	);
	const assignFieldToFarm = useDesignerStore(
		(state) => state.assignFieldToFarm
	);
	const assignTreeToBuilding = useDesignerStore(
		(state) => state.assignTreeToBuilding
	);
	const unassignChildFromParent = useDesignerStore(
		(state) => state.unassignChildFromParent
	);
	const clearChildrenOfBuilding = useDesignerStore(
		(state) => state.clearChildrenOfBuilding
	);
	const cancelActiveAction = useDesignerStore(
		(state) => state.cancelActiveAction
	);

	// Defer aggregate layout statistics & BOM reconciliation during rapid brush strokes
	const deferredBuildings = useDeferredValue(buildings);

	const spatialIndex = useMemo(
		() => getSpatialIndex(buildings, gridWidth, gridHeight),
		[buildings, gridHeight, gridWidth]
	);

	const deferredSpatialIndex = useMemo(
		() => getSpatialIndex(deferredBuildings, gridWidth, gridHeight),
		[deferredBuildings, gridHeight, gridWidth]
	);

	const statistics = useMemo(
		() => computeLayoutStatistics(deferredBuildings),
		[deferredBuildings]
	);

	const singleSelectedBuilding = useMemo(() => {
		if (selectedIds.length !== 1 || !selectedIds[0]) {
			return null;
		}
		return spatialIndex.buildingById.get(selectedIds[0]) ?? null;
	}, [selectedIds, spatialIndex]);

	const singleSelectedPreset = useMemo(() => {
		if (!singleSelectedBuilding) {
			return null;
		}
		return PRESET_BY_ID.get(singleSelectedBuilding.presetId) ?? null;
	}, [singleSelectedBuilding]);

	// Coverage analysis when a service/radius building (excluding tree/field farms) is selected
	const selectedCoverageStats = useMemo(() => {
		if (
			!singleSelectedBuilding ||
			!singleSelectedPreset ||
			singleSelectedPreset.influenceRadius <= 0 ||
			isParentWithChildrenRule(singleSelectedBuilding.presetId)
		) {
			return null;
		}

		let coveredResidences = 0;
		let totalResidences = 0;
		let coveredWorkshops = 0;
		let totalWorkshops = 0;
		let coveredFields = 0;

		for (const item of spatialIndex.coverableBuildings) {
			if (item.id === singleSelectedBuilding.id) {
				continue;
			}
			const preset = PRESET_BY_ID.get(item.presetId);
			if (!preset) {
				continue;
			}
			const isInside = isRectCoveredBySource(
				item,
				singleSelectedBuilding,
				singleSelectedPreset.influenceRadius
			);

			if (preset.category === "residence") {
				totalResidences += 1;
				if (isInside) {
					coveredResidences += 1;
				}
			} else if (preset.group === "Farm Fields") {
				if (isInside) {
					coveredFields += 1;
				}
			} else if (
				preset.category === "production" ||
				preset.category === "farms"
			) {
				totalWorkshops += 1;
				if (isInside) {
					coveredWorkshops += 1;
				}
			}
		}

		return {
			coveredResidences,
			totalResidences,
			coveredWorkshops,
			totalWorkshops,
			coveredFields,
		};
	}, [singleSelectedBuilding, singleSelectedPreset, spatialIndex]);

	// Service coverage checklist when a Residence is selected
	const residenceServiceChecks = useMemo(() => {
		if (!singleSelectedBuilding) {
			return null;
		}
		const isOccident = OCCIDENT_RESIDENCE_IDS.has(
			singleSelectedBuilding.presetId
		);
		const isOrient = ORIENT_RESIDENCE_IDS.has(singleSelectedBuilding.presetId);
		if (!isOccident && !isOrient) {
			return null;
		}

		const definitions = isOccident
			? OCCIDENT_SERVICE_NEEDS
			: ORIENT_SERVICE_NEEDS;
		const targetCenterX =
			singleSelectedBuilding.x + singleSelectedBuilding.width * 0.5;
		const targetCenterY =
			singleSelectedBuilding.y + singleSelectedBuilding.height * 0.5;

		return definitions.map((service) => {
			const providerSet = new Set(service.providerPresetIds);
			const isCovered = spatialIndex.influenceBuildings.some((candidate) => {
				if (!providerSet.has(candidate.building.presetId)) {
					return false;
				}
				const deltaX = targetCenterX - candidate.centerX;
				const deltaY = targetCenterY - candidate.centerY;
				return deltaX * deltaX + deltaY * deltaY <= candidate.thresholdSquared;
			});

			return {
				id: service.id,
				label: service.label,
				kind: service.kind,
				isCovered,
			};
		});
	}, [singleSelectedBuilding, spatialIndex]);

	// Farm / Production logistics checks (Markethouse + Noria)
	const logisticsChecks = useMemo(() => {
		if (!singleSelectedBuilding || !singleSelectedPreset) {
			return null;
		}
		if (
			singleSelectedPreset.category !== "farms" &&
			singleSelectedPreset.category !== "production"
		) {
			return null;
		}

		const targetCenterX =
			singleSelectedBuilding.x + singleSelectedBuilding.width * 0.5;
		const targetCenterY =
			singleSelectedBuilding.y + singleSelectedBuilding.height * 0.5;

		const hasMarkethouse = spatialIndex.influenceBuildings.some((candidate) => {
			if (!MARKETHOUSE_PRESET_IDS.has(candidate.building.presetId)) {
				return false;
			}
			const deltaX = targetCenterX - candidate.centerX;
			const deltaY = targetCenterY - candidate.centerY;
			return deltaX * deltaX + deltaY * deltaY <= candidate.thresholdSquared;
		});

		const hasNoria = spatialIndex.influenceBuildings.some((candidate) => {
			if (!NORIA_PRESET_IDS.has(candidate.building.presetId)) {
				return false;
			}
			const deltaX = targetCenterX - candidate.centerX;
			const deltaY = targetCenterY - candidate.centerY;
			return deltaX * deltaX + deltaY * deltaY <= candidate.thresholdSquared;
		});

		return { hasMarkethouse, hasNoria };
	}, [singleSelectedBuilding, singleSelectedPreset, spatialIndex]);

	// Tree-using building inspector state (Lumberjack's hut, Charcoal burner's hut, Forest glassworks)
	const selectedTreeFarmInfo = useMemo(() => {
		if (!singleSelectedBuilding) {
			return null;
		}
		const rule = TREE_FARM_RULES.get(singleSelectedBuilding.presetId);
		if (!rule) {
			return null;
		}
		const connectedCount = singleSelectedBuilding.childIds?.length ?? 0;
		const plan = computeTreePopulatePlan(
			singleSelectedBuilding,
			buildings,
			gridWidth,
			gridHeight
		);
		const availableToPopulate =
			plan.newTreePoints.length + plan.adoptedTreeIds.length;
		const productivityPercent = Math.min(
			100,
			Math.round((connectedCount / rule.optimalTrees) * 100)
		);
		return {
			rule,
			connectedCount,
			availableToPopulate,
			productivityPercent,
		};
	}, [buildings, gridHeight, gridWidth, singleSelectedBuilding]);

	// Field-using farm inspector state (all 17 Occidental & Oriental farms)
	const selectedFieldFarmInfo = useMemo(() => {
		if (!singleSelectedBuilding) {
			return null;
		}
		const rule = FARM_FIELD_RULES.get(singleSelectedBuilding.presetId);
		if (!rule) {
			return null;
		}
		const connectedCount = singleSelectedBuilding.childIds?.length ?? 0;
		const remainingSlots = Math.max(0, rule.maxFields - connectedCount);
		const unassignedInRadius =
			remainingSlots > 0
				? findUnassignedFieldsInRadius(singleSelectedBuilding, buildings)
				: [];
		const productivityPercent = Math.min(
			100,
			Math.round((connectedCount / rule.maxFields) * 100)
		);
		return {
			rule,
			connectedCount,
			remainingSlots,
			unassignedInRadius,
			productivityPercent,
		};
	}, [buildings, singleSelectedBuilding]);

	// Selected Farm Field assignment state (parent farm or eligible farms to assign)
	const selectedFieldAssignmentInfo = useMemo(() => {
		if (
			!singleSelectedBuilding ||
			!FARM_FIELD_PRESET_IDS.has(singleSelectedBuilding.presetId)
		) {
			return null;
		}
		const parentFarm = singleSelectedBuilding.parentId
			? (spatialIndex.buildingById.get(singleSelectedBuilding.parentId) ?? null)
			: null;
		const parentRule = parentFarm
			? (FARM_FIELD_RULES.get(parentFarm.presetId) ?? null)
			: null;
		const parentPreset = parentFarm
			? (PRESET_BY_ID.get(parentFarm.presetId) ?? null)
			: null;
		const eligibleFarms = parentFarm
			? []
			: findEligibleFarmsForField(singleSelectedBuilding, buildings);

		return {
			parentFarm,
			parentRule,
			parentPreset,
			eligibleFarms,
		};
	}, [buildings, singleSelectedBuilding, spatialIndex]);

	// Selected TreeTile_1x1 parent/assignment state
	const selectedTreeAssignmentInfo = useMemo(() => {
		if (
			!singleSelectedBuilding ||
			singleSelectedBuilding.presetId !== TREE_TILE_PRESET_ID
		) {
			return null;
		}
		const parentBuilding = singleSelectedBuilding.parentId
			? (spatialIndex.buildingById.get(singleSelectedBuilding.parentId) ?? null)
			: null;
		const parentPreset = parentBuilding
			? (PRESET_BY_ID.get(parentBuilding.presetId) ?? null)
			: null;
		const eligibleTreeFarms = parentBuilding
			? []
			: findEligibleTreeFarmsForTree(singleSelectedBuilding, buildings);

		return {
			parentBuilding,
			parentPreset,
			eligibleTreeFarms,
		};
	}, [buildings, singleSelectedBuilding, spatialIndex]);

	// Global settlement housing check powered by O(1) road adjacency & pre-indexed providers
	const globalHousingHealth = useMemo(() => {
		const residences = deferredSpatialIndex.residences;
		if (residences.length === 0) {
			return null;
		}

		const communityProviders = deferredSpatialIndex.influenceBuildings.filter(
			(entry) => COMMUNITY_PROVIDER_IDS.has(entry.building.presetId)
		);
		let marketCoveredCount = 0;
		let roadConnectedCount = 0;

		for (const residence of residences) {
			if (deferredSpatialIndex.hasAdjacentRoad(residence)) {
				roadConnectedCount += 1;
			}
			const residenceCenterX = residence.x + residence.width * 0.5;
			const residenceCenterY = residence.y + residence.height * 0.5;
			const coveredByMarket = communityProviders.some((provider) => {
				const deltaX = residenceCenterX - provider.centerX;
				const deltaY = residenceCenterY - provider.centerY;
				return deltaX * deltaX + deltaY * deltaY <= provider.thresholdSquared;
			});
			if (coveredByMarket) {
				marketCoveredCount += 1;
			}
		}

		return {
			totalResidences: residences.length,
			marketCoveredCount,
			roadConnectedCount,
		};
	}, [deferredSpatialIndex]);

	const activeBrushPreset =
		(activeTool === "place" || activeTool === "road") && activePresetId
			? (PRESET_BY_ID.get(activePresetId) ?? null)
			: null;

	const content = (
		<>
			{isMobileDrawer && (
				<div className="flex items-center justify-between border-b border-stone-800 px-3 py-2.5">
					<h2 className="text-xs font-semibold tracking-wider text-amber-400/90 uppercase">
						Inspector &amp; Stats
					</h2>
					{onCloseDrawer && (
						<button
							aria-label="Close inspector"
							className="anno-touch-target inline-flex items-center justify-center rounded-md p-1 text-stone-400 hover:bg-stone-800 hover:text-stone-100"
							type="button"
							onClick={onCloseDrawer}
						>
							<XMarkIcon aria-hidden="true" className="h-5 w-5" />
						</button>
					)}
				</div>
			)}

			<div
				className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain p-3"
				style={{ scrollbarGutter: "stable" }}
			>
				{/* Section 1: Selection or Active Brush Inspector */}
				{singleSelectedBuilding && singleSelectedPreset ? (
					<section className="rounded-lg border border-amber-500/30 bg-stone-900/80 p-3">
						<div className="flex items-start gap-2.5">
							<div
								className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-black/40 shadow-inner"
								style={{
									backgroundColor:
										singleSelectedBuilding.customColor ??
										singleSelectedPreset.cssColor,
								}}
							>
								{singleSelectedPreset.iconUrl ? (
									<img
										alt=""
										className="h-8 w-8 object-contain"
										height={32}
										src={singleSelectedPreset.iconUrl}
										width={32}
									/>
								) : (
									<span className="font-mono text-xs font-bold text-stone-950">
										{singleSelectedBuilding.width}×
										{singleSelectedBuilding.height}
									</span>
								)}
							</div>
							<div className="min-w-0 flex-1">
								<h3 className="truncate text-sm font-semibold text-amber-300">
									{singleSelectedPreset.name}
								</h3>
								<p className="text-[11px] text-stone-400">
									{singleSelectedPreset.groupLabel} • Tile (
									{singleSelectedBuilding.x}, {singleSelectedBuilding.y})
								</p>
								<div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
									<span className="rounded bg-stone-800 px-1.5 py-0.5 font-mono text-stone-200">
										{singleSelectedBuilding.width}×
										{singleSelectedBuilding.height}
									</span>
									{singleSelectedPreset.influenceRadius > 0 && (
										<span className="rounded bg-amber-500/15 px-1.5 py-0.5 font-mono text-amber-300">
											Radius {singleSelectedPreset.influenceRadius}
										</span>
									)}
									{!singleSelectedPreset.isRoad &&
										singleSelectedPreset.group !== "Farm Fields" &&
										(spatialIndex.hasAdjacentRoad(singleSelectedBuilding) ? (
											<span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-300">
												<CheckCircleIcon
													aria-hidden="true"
													className="h-3 w-3"
												/>
												Road
											</span>
										) : (
											<span className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-300">
												<ExclamationTriangleIcon
													aria-hidden="true"
													className="h-3 w-3"
												/>
												No road
											</span>
										))}
								</div>
							</div>
						</div>

						{/* Action buttons */}
						<div className="mt-3 grid grid-cols-3 gap-1.5">
							<button
								className="anno-touch-target inline-flex items-center justify-center gap-1 rounded border border-stone-700 bg-stone-800 px-2 py-1.5 text-xs font-medium text-stone-200 hover:border-amber-400/50 hover:text-amber-300 disabled:opacity-40 lg:py-1"
								type="button"
								disabled={
									singleSelectedBuilding.width === singleSelectedBuilding.height
								}
								onClick={rotateActiveOrSelection}
							>
								<ArrowPathIcon aria-hidden="true" className="h-3.5 w-3.5" />
								Rotate
							</button>
							<button
								className="anno-touch-target inline-flex items-center justify-center gap-1 rounded border border-stone-700 bg-stone-800 px-2 py-1.5 text-xs font-medium text-stone-200 hover:border-amber-400/50 hover:text-amber-300 lg:py-1"
								type="button"
								onClick={duplicateSelectedBuildings}
							>
								<DocumentDuplicateIcon
									aria-hidden="true"
									className="h-3.5 w-3.5"
								/>
								Clone
							</button>
							<button
								className="anno-touch-target inline-flex items-center justify-center gap-1 rounded border border-red-900/60 bg-red-950/40 px-2 py-1.5 text-xs font-medium text-red-300 hover:bg-red-900/50 lg:py-1"
								type="button"
								onClick={(): void => {
									removeBuildings([singleSelectedBuilding.id]);
								}}
							>
								<TrashIcon aria-hidden="true" className="h-3.5 w-3.5" />
								Delete
							</button>
						</div>

						{/* Custom Label & Color */}
						<div className="mt-3 border-t border-stone-800 pt-2.5">
							<div className="grid grid-cols-[1fr_auto] items-end gap-2">
								<div>
									<label
										className="block text-[10px] font-medium text-stone-400"
										htmlFor={customLabelId}
									>
										Custom Label
									</label>
									<input
										className="mt-0.5 w-full rounded border border-stone-700 bg-stone-950 px-2 py-1 text-base text-stone-100 placeholder:text-stone-500 focus:border-amber-400 focus:outline-none lg:text-xs"
										id={customLabelId}
										placeholder={singleSelectedPreset.name}
										type="text"
										value={singleSelectedBuilding.customLabel ?? ""}
										onChange={(event): void => {
											updateBuildingCustomization(singleSelectedBuilding.id, {
												customLabel: event.target.value,
											});
										}}
									/>
								</div>
								<div className="flex items-center gap-1">
									<label className="sr-only" htmlFor={customColorId}>
										Tile color override
									</label>
									<input
										className="anno-touch-target h-8 w-9 cursor-pointer rounded border border-stone-700 bg-stone-950 p-0.5 lg:h-7 lg:w-8"
										id={customColorId}
										list={customColorPresetsListId}
										type="color"
										value={
											singleSelectedBuilding.customColor ??
											rgbaToHex(singleSelectedPreset.color)
										}
										onChange={(event): void => {
											updateBuildingCustomization(singleSelectedBuilding.id, {
												customColor: event.target.value,
											});
										}}
									/>
									<datalist id={customColorPresetsListId}>
										{CUSTOM_COLOR_PRESETS.map((swatch) => (
											<option key={swatch.hex} value={swatch.hex} />
										))}
									</datalist>
									{singleSelectedBuilding.customColor && (
										<button
											className="rounded px-1.5 py-1 text-[10px] text-stone-400 hover:bg-stone-800 hover:text-stone-200"
											type="button"
											onClick={(): void => {
												updateBuildingCustomization(singleSelectedBuilding.id, {
													customColor: "",
												});
											}}
										>
											Reset
										</button>
									)}
								</div>
							</div>

							<div className="mt-2">
								<span className="block text-[10px] font-medium text-stone-400">
									Preset Colors
								</span>
								<div
									aria-label="Preset label and tile colors"
									className="mt-1 flex flex-wrap gap-1.5"
									role="group"
								>
									{CUSTOM_COLOR_PRESETS.map((swatch) => {
										const isActiveSwatch =
											singleSelectedBuilding.customColor?.toLowerCase() ===
											swatch.hex.toLowerCase();
										return (
											<button
												key={swatch.hex}
												aria-label={`Apply ${swatch.name} color (${swatch.hex})`}
												aria-pressed={isActiveSwatch}
												title={`${swatch.name} (${swatch.hex})`}
												type="button"
												className={`inline-flex h-6 w-6 items-center justify-center rounded border transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 ${
													isActiveSwatch
														? "scale-105 border-white ring-2 ring-amber-300 ring-offset-1 ring-offset-stone-900"
														: "border-black/50 hover:scale-105 hover:border-stone-200"
												}`}
												style={{
													backgroundColor: swatch.hex,
													forcedColorAdjust: "none",
												}}
												onClick={(): void => {
													updateBuildingCustomization(
														singleSelectedBuilding.id,
														{
															customColor: swatch.hex,
														}
													);
												}}
											>
												{isActiveSwatch && (
													<CheckIcon
														aria-hidden="true"
														className="h-3.5 w-3.5 stroke-[2.5] text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.85)]"
													/>
												)}
											</button>
										);
									})}
								</div>
							</div>
						</div>

						{/* Tree-Using Production / Farm: Populate Connected Forest */}
						{selectedTreeFarmInfo && (
							<div className="mt-3 border-t border-stone-800 pt-2.5">
								<div className="flex items-center justify-between">
									<h4 className="text-[11px] font-semibold tracking-wide text-emerald-300 uppercase">
										Connected Forest
									</h4>
									<span className="font-mono text-xs font-semibold text-emerald-400">
										{selectedTreeFarmInfo.connectedCount} /{" "}
										{selectedTreeFarmInfo.rule.optimalTrees} (
										{selectedTreeFarmInfo.productivityPercent}%)
									</span>
								</div>
								<p className="mt-0.5 text-[11px] text-stone-400">
									Requires {selectedTreeFarmInfo.rule.optimalTrees} connected
									trees for 100% {selectedTreeFarmInfo.rule.productLabel}{" "}
									output.
								</p>
								<div className="mt-1.5 h-1.5 w-full overflow-clip rounded-full bg-stone-800">
									<div
										className="h-full rounded-full bg-emerald-400 transition-all"
										style={{
											width: `${selectedTreeFarmInfo.productivityPercent}%`,
										}}
									/>
								</div>

								<button
									className="anno-touch-target mt-2.5 inline-flex w-full items-center justify-center gap-1.5 rounded border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-45"
									disabled={selectedTreeFarmInfo.availableToPopulate === 0}
									type="button"
									onClick={(): void => {
										populateTreesForBuilding(singleSelectedBuilding.id);
									}}
								>
									<SparklesIcon aria-hidden="true" className="h-3.5 w-3.5" />
									<span>
										{selectedTreeFarmInfo.availableToPopulate > 0
											? `Populate Trees (+${selectedTreeFarmInfo.availableToPopulate})`
											: "Radius Populated"}
									</span>
								</button>

								{selectedTreeFarmInfo.connectedCount > 0 && (
									<div className="mt-1.5 grid grid-cols-2 gap-1.5">
										<button
											className="anno-touch-target rounded border border-stone-700 bg-stone-800 px-2 py-1 text-[11px] font-medium text-stone-200 hover:border-emerald-400/50 hover:text-emerald-300"
											type="button"
											onClick={(): void => {
												setSelectedIds([
													singleSelectedBuilding.id,
													...(singleSelectedBuilding.childIds ?? []),
												]);
											}}
										>
											Select + Trees
										</button>
										<button
											className="anno-touch-target rounded border border-red-900/50 bg-red-950/30 px-2 py-1 text-[11px] font-medium text-red-300 hover:bg-red-900/40"
											type="button"
											onClick={(): void => {
												clearChildrenOfBuilding(singleSelectedBuilding.id);
											}}
										>
											Clear Trees
										</button>
									</div>
								)}
							</div>
						)}

						{/* Field-Using Farm: Spawn Fields & Assign Unassigned Fields */}
						{selectedFieldFarmInfo && (
							<div className="mt-3 border-t border-stone-800 pt-2.5">
								<div className="flex items-center justify-between">
									<h4 className="text-[11px] font-semibold tracking-wide text-emerald-300 uppercase">
										Farm Fields ({selectedFieldFarmInfo.rule.fieldDimensionsLabel}
										)
									</h4>
									<span className="font-mono text-xs font-semibold text-emerald-400">
										{selectedFieldFarmInfo.connectedCount} /{" "}
										{selectedFieldFarmInfo.rule.maxFields}
									</span>
								</div>
								<p className="mt-0.5 text-[11px] text-stone-400">
									Max {selectedFieldFarmInfo.rule.maxFields} ×{" "}
									{selectedFieldFarmInfo.rule.fieldDimensionsLabel}{" "}
									{selectedFieldFarmInfo.rule.fieldLabel} inside radius{" "}
									{singleSelectedPreset.influenceRadius}.
								</p>
								<div className="mt-1.5 h-1.5 w-full overflow-clip rounded-full bg-stone-800">
									<div
										className="h-full rounded-full bg-emerald-400 transition-all"
										style={{
											width: `${selectedFieldFarmInfo.productivityPercent}%`,
										}}
									/>
								</div>

								<div className="mt-2.5 grid grid-cols-[1fr_auto] gap-1.5">
									<button
										className="anno-touch-target inline-flex items-center justify-center gap-1.5 rounded border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-45"
										disabled={selectedFieldFarmInfo.remainingSlots === 0}
										type="button"
										onClick={(): void => {
											spawnFieldsForFarm(singleSelectedBuilding.id);
										}}
									>
										<SparklesIcon aria-hidden="true" className="h-3.5 w-3.5" />
										<span>
											{selectedFieldFarmInfo.remainingSlots > 0
												? `Spawn Fields (+${selectedFieldFarmInfo.remainingSlots})`
												: "All Fields Spawned"}
										</span>
									</button>
									<button
										aria-label="Spawn 1 field"
										className="anno-touch-target inline-flex items-center justify-center gap-1 rounded border border-stone-700 bg-stone-800 px-2.5 py-1.5 text-xs font-medium text-stone-200 hover:border-emerald-400/50 hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-45"
										disabled={selectedFieldFarmInfo.remainingSlots === 0}
										type="button"
										onClick={(): void => {
											spawnFieldsForFarm(singleSelectedBuilding.id, 1);
										}}
									>
										<PlusIcon aria-hidden="true" className="h-3.5 w-3.5" />
										<span>1 Field</span>
									</button>
								</div>

								{selectedFieldFarmInfo.connectedCount > 0 && (
									<div className="mt-1.5 grid grid-cols-2 gap-1.5">
										<button
											className="anno-touch-target rounded border border-stone-700 bg-stone-800 px-2 py-1 text-[11px] font-medium text-stone-200 hover:border-emerald-400/50 hover:text-emerald-300"
											type="button"
											onClick={(): void => {
												setSelectedIds([
													singleSelectedBuilding.id,
													...(singleSelectedBuilding.childIds ?? []),
												]);
											}}
										>
											Select + Fields
										</button>
										<button
											className="anno-touch-target rounded border border-red-900/50 bg-red-950/30 px-2 py-1 text-[11px] font-medium text-red-300 hover:bg-red-900/40"
											type="button"
											onClick={(): void => {
												clearChildrenOfBuilding(singleSelectedBuilding.id);
											}}
										>
											Clear Fields
										</button>
									</div>
								)}

								{selectedFieldFarmInfo.unassignedInRadius.length > 0 && (
									<div className="mt-2.5 rounded border border-stone-800 bg-stone-950/70 p-2">
										<span className="block text-[10px] font-semibold tracking-wide text-stone-400 uppercase">
											Unassigned Fields in Radius
										</span>
										<ul className="mt-1.5 flex flex-col gap-1" role="list">
											{selectedFieldFarmInfo.unassignedInRadius.map((field) => (
												<li
													key={field.id}
													className="flex items-center justify-between gap-2 rounded bg-stone-900 px-2 py-1 text-xs"
												>
													<span className="truncate font-mono text-[11px] text-stone-300">
														{field.width}×{field.height} at ({field.x},{" "}
														{field.y})
													</span>
													<button
														className="shrink-0 rounded border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/25"
														type="button"
														onClick={(): void => {
															assignFieldToFarm(
																field.id,
																singleSelectedBuilding.id
															);
														}}
													>
														Assign
													</button>
												</li>
											))}
										</ul>
									</div>
								)}
							</div>
						)}

						{/* Farm Field Selection: Connected Farm or Manual Assign Button */}
						{selectedFieldAssignmentInfo && (
							<div className="mt-3 border-t border-stone-800 pt-2.5">
								<h4 className="text-[11px] font-semibold tracking-wide text-emerald-300 uppercase">
									Parent Farm Connection
								</h4>
								{selectedFieldAssignmentInfo.parentFarm ? (
									<div className="mt-1.5 rounded border border-emerald-500/30 bg-emerald-950/20 p-2 text-xs">
										<div className="flex items-center justify-between gap-2">
											<span className="truncate font-medium text-emerald-200">
												{selectedFieldAssignmentInfo.parentFarm.customLabel ??
													selectedFieldAssignmentInfo.parentPreset?.name ??
													selectedFieldAssignmentInfo.parentFarm.presetId}
											</span>
											{selectedFieldAssignmentInfo.parentRule && (
												<span className="shrink-0 font-mono text-[11px] text-emerald-400">
													{selectedFieldAssignmentInfo.parentFarm.childIds
														?.length ?? 0}
													/{selectedFieldAssignmentInfo.parentRule.maxFields}
												</span>
											)}
										</div>
										<p className="mt-0.5 text-[11px] text-stone-400">
											Tile ({selectedFieldAssignmentInfo.parentFarm.x},{" "}
											{selectedFieldAssignmentInfo.parentFarm.y})
										</p>
										<div className="mt-2 grid grid-cols-2 gap-1.5">
											<button
												className="anno-touch-target rounded border border-stone-700 bg-stone-800 px-2 py-1 text-[11px] font-medium text-stone-200 hover:border-emerald-400/50 hover:text-emerald-300"
												type="button"
												onClick={(): void => {
													if (selectedFieldAssignmentInfo.parentFarm) {
														setSelectedIds([
															selectedFieldAssignmentInfo.parentFarm.id,
														]);
													}
												}}
											>
												Select Farm
											</button>
											<button
												className="anno-touch-target rounded border border-stone-700 bg-stone-800 px-2 py-1 text-[11px] font-medium text-amber-300 hover:bg-stone-700"
												type="button"
												onClick={(): void => {
													unassignChildFromParent(singleSelectedBuilding.id);
												}}
											>
												Unassign
											</button>
										</div>
									</div>
								) : selectedFieldAssignmentInfo.eligibleFarms.length > 0 ? (
									<div className="mt-1.5">
										<p className="text-[11px] text-stone-400">
											Unassigned field — choose an in-range farm with open
											field capacity:
										</p>
										<ul className="mt-1.5 flex flex-col gap-1.5" role="list">
											{selectedFieldAssignmentInfo.eligibleFarms.map(
												(match) => {
													const farmPreset = PRESET_BY_ID.get(
														match.farm.presetId
													);
													const farmDisplayName =
														match.farm.customLabel ??
														farmPreset?.name ??
														match.farm.presetId;
													return (
														<li
															key={match.farm.id}
															className="flex items-center justify-between gap-2 rounded border border-stone-800 bg-stone-950/80 px-2 py-1.5 text-xs"
														>
															<div className="min-w-0">
																<span className="block truncate font-medium text-stone-200">
																	{farmDisplayName}
																</span>
																<span className="font-mono text-[10px] text-stone-400">
																	({match.farm.x}, {match.farm.y}) •{" "}
																	{match.connectedCount}/{match.rule.maxFields}{" "}
																	fields
																</span>
															</div>
															<button
																aria-label={`Assign field to ${farmDisplayName} at (${match.farm.x}, ${match.farm.y})`}
																className="anno-touch-target shrink-0 rounded border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25"
																type="button"
																onClick={(): void => {
																	assignFieldToFarm(
																		singleSelectedBuilding.id,
																		match.farm.id
																	);
																}}
															>
																Assign
															</button>
														</li>
													);
												}
											)}
										</ul>
									</div>
								) : (
									<p className="mt-1 text-[11px] text-stone-400">
										Unassigned — no matching farm with open field slots covers
										this tile.
									</p>
								)}
							</div>
						)}

						{/* Tree Tile Selection: Connected Building or Assign Button */}
						{selectedTreeAssignmentInfo && (
							<div className="mt-3 border-t border-stone-800 pt-2.5">
								<h4 className="text-[11px] font-semibold tracking-wide text-emerald-300 uppercase">
									Forest Connection
								</h4>
								{selectedTreeAssignmentInfo.parentBuilding ? (
									<div className="mt-1.5 rounded border border-emerald-500/30 bg-emerald-950/20 p-2 text-xs">
										<p className="truncate font-medium text-emerald-200">
											{selectedTreeAssignmentInfo.parentBuilding.customLabel ??
												selectedTreeAssignmentInfo.parentPreset?.name ??
												selectedTreeAssignmentInfo.parentBuilding.presetId}
										</p>
										<p className="mt-0.5 text-[11px] text-stone-400">
											Tile ({selectedTreeAssignmentInfo.parentBuilding.x},{" "}
											{selectedTreeAssignmentInfo.parentBuilding.y})
										</p>
										<div className="mt-2 grid grid-cols-2 gap-1.5">
											<button
												className="anno-touch-target rounded border border-stone-700 bg-stone-800 px-2 py-1 text-[11px] font-medium text-stone-200 hover:border-emerald-400/50 hover:text-emerald-300"
												type="button"
												onClick={(): void => {
													if (selectedTreeAssignmentInfo.parentBuilding) {
														setSelectedIds([
															selectedTreeAssignmentInfo.parentBuilding.id,
														]);
													}
												}}
											>
												Select Parent
											</button>
											<button
												className="anno-touch-target rounded border border-stone-700 bg-stone-800 px-2 py-1 text-[11px] font-medium text-amber-300 hover:bg-stone-700"
												type="button"
												onClick={(): void => {
													unassignChildFromParent(singleSelectedBuilding.id);
												}}
											>
												Unassign
											</button>
										</div>
									</div>
								) : selectedTreeAssignmentInfo.eligibleTreeFarms.length > 0 ? (
									<ul className="mt-1.5 flex flex-col gap-1.5" role="list">
										{selectedTreeAssignmentInfo.eligibleTreeFarms.map(
											(farm) => {
												const farmPreset = PRESET_BY_ID.get(farm.presetId);
												const farmDisplayName =
													farm.customLabel ?? farmPreset?.name ?? farm.presetId;
												return (
													<li
														key={farm.id}
														className="flex items-center justify-between gap-2 rounded border border-stone-800 bg-stone-950/80 px-2 py-1.5 text-xs"
													>
														<span className="truncate text-stone-200">
															{farmDisplayName} ({farm.x}, {farm.y})
														</span>
														<button
															className="anno-touch-target shrink-0 rounded border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25"
															type="button"
															onClick={(): void => {
																assignTreeToBuilding(
																	singleSelectedBuilding.id,
																	farm.id
																);
															}}
														>
															Assign
														</button>
													</li>
												);
											}
										)}
									</ul>
								) : (
									<p className="mt-1 text-[11px] text-stone-400">
										Wild tree (not connected to any forest building).
									</p>
								)}
							</div>
						)}

						{/* Area Coverage Breakdown for Service / Radius Buildings */}
						{selectedCoverageStats && (
							<div className="mt-3 border-t border-stone-800 pt-2.5">
								<h4 className="text-[11px] font-semibold tracking-wide text-stone-300 uppercase">
									Influence Coverage
								</h4>
								{selectedCoverageStats.totalResidences > 0 && (
									<div className="mt-1.5">
										<div className="flex justify-between text-xs">
											<span className="text-stone-300">Residences Reached</span>
											<span className="font-mono font-semibold text-emerald-400">
												{selectedCoverageStats.coveredResidences} /{" "}
												{selectedCoverageStats.totalResidences}
											</span>
										</div>
										<div className="mt-1 h-1.5 w-full overflow-clip rounded-full bg-stone-800">
											<div
												className="h-full rounded-full bg-emerald-400 transition-all"
												style={{
													width: `${Math.round(
														(selectedCoverageStats.coveredResidences /
															selectedCoverageStats.totalResidences) *
															100
													)}%`,
												}}
											/>
										</div>
									</div>
								)}
								<div className="mt-2 flex flex-wrap gap-2 text-[11px] text-stone-400">
									{selectedCoverageStats.totalWorkshops > 0 && (
										<span>
											Workshops:{" "}
											<strong className="font-mono text-stone-200">
												{selectedCoverageStats.coveredWorkshops}/
												{selectedCoverageStats.totalWorkshops}
											</strong>
										</span>
									)}
									{selectedCoverageStats.coveredFields > 0 && (
										<span>
											Farm Fields:{" "}
											<strong className="font-mono text-stone-200">
												{selectedCoverageStats.coveredFields}
											</strong>
										</span>
									)}
								</div>
							</div>
						)}

						{/* Residence Service Needs Checklist */}
						{residenceServiceChecks && (
							<div className="mt-3 border-t border-stone-800 pt-2.5">
								<h4 className="text-[11px] font-semibold tracking-wide text-stone-300 uppercase">
									Service Coverage Check
								</h4>
								<ul className="mt-1.5 grid grid-cols-1 gap-1" role="list">
									{residenceServiceChecks.map((check) => (
										<li
											key={check.id}
											className="flex items-center justify-between rounded bg-stone-950/70 px-2 py-1 text-xs"
										>
											<span className="text-stone-300">{check.label}</span>
											<span
												className={`font-mono text-[11px] font-semibold ${
													check.isCovered
														? "text-emerald-400"
														: "text-stone-500"
												}`}
											>
												{check.isCovered ? "Covered ✓" : "Missing"}
											</span>
										</li>
									))}
								</ul>
							</div>
						)}

						{/* Logistics Check for Farms & Factories */}
						{logisticsChecks && (
							<div className="mt-3 border-t border-stone-800 pt-2.5">
								<h4 className="text-[11px] font-semibold tracking-wide text-stone-300 uppercase">
									Logistics &amp; Irrigation
								</h4>
								<div className="mt-1.5 flex flex-col gap-1 text-xs">
									<div className="flex items-center justify-between rounded bg-stone-950/70 px-2 py-1">
										<span className="text-stone-300">Markethouse Range</span>
										<span
											className={`font-mono text-[11px] font-semibold ${
												logisticsChecks.hasMarkethouse
													? "text-emerald-400"
													: "text-amber-400"
											}`}
										>
											{logisticsChecks.hasMarkethouse
												? "In Range ✓"
												: "Out of Range"}
										</span>
									</div>
									{singleSelectedPreset.region === "orient" && (
										<div className="flex items-center justify-between rounded bg-stone-950/70 px-2 py-1">
											<span className="text-stone-300">Noria Irrigation</span>
											<span
												className={`font-mono text-[11px] font-semibold ${
													logisticsChecks.hasNoria
														? "text-sky-400"
														: "text-stone-500"
												}`}
											>
												{logisticsChecks.hasNoria ? "Irrigated ✓" : "No Noria"}
											</span>
										</div>
									)}
								</div>
							</div>
						)}
					</section>
				) : selectedIds.length > 1 ? (
					<section className="rounded-lg border border-amber-500/30 bg-stone-900/80 p-3">
						<h3 className="text-sm font-semibold text-amber-300">
							{selectedIds.length} Items Selected
						</h3>
						<p className="mt-0.5 text-xs text-stone-400">
							Drag selection on the grid to move together, or clone as a block.
						</p>
						<div className="mt-3 grid grid-cols-3 gap-1.5">
							<button
								className="anno-touch-target inline-flex items-center justify-center gap-1 rounded border border-stone-700 bg-stone-800 px-2 py-1.5 text-xs font-medium text-stone-200 hover:text-amber-300 lg:py-1"
								type="button"
								onClick={rotateActiveOrSelection}
							>
								<ArrowPathIcon aria-hidden="true" className="h-3.5 w-3.5" />
								Rotate
							</button>
							<button
								className="anno-touch-target inline-flex items-center justify-center gap-1 rounded border border-stone-700 bg-stone-800 px-2 py-1.5 text-xs font-medium text-stone-200 hover:text-amber-300 lg:py-1"
								type="button"
								onClick={duplicateSelectedBuildings}
							>
								<DocumentDuplicateIcon
									aria-hidden="true"
									className="h-3.5 w-3.5"
								/>
								Clone
							</button>
							<button
								className="anno-touch-target inline-flex items-center justify-center gap-1 rounded border border-red-900/60 bg-red-950/40 px-2 py-1.5 text-xs font-medium text-red-300 hover:bg-red-900/50 lg:py-1"
								type="button"
								onClick={(): void => {
									removeBuildings(selectedIds);
								}}
							>
								<TrashIcon aria-hidden="true" className="h-3.5 w-3.5" />
								Delete
							</button>
						</div>
					</section>
				) : activeBrushPreset ? (
					<section className="rounded-lg border border-amber-500/35 bg-amber-950/20 p-3">
						<div className="flex items-center justify-between">
							<span className="text-[10px] font-semibold tracking-wider text-amber-400 uppercase">
								Armed Brush
							</span>
							<button
								className="text-[11px] text-stone-400 hover:text-stone-200"
								type="button"
								onClick={cancelActiveAction}
							>
								Done
							</button>
						</div>
						<div className="mt-2 flex items-center gap-2.5">
							<div
								className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-black/40"
								style={{ backgroundColor: activeBrushPreset.cssColor }}
							>
								{activeBrushPreset.iconUrl ? (
									<img
										alt=""
										className="h-7 w-7 object-contain"
										height={28}
										src={activeBrushPreset.iconUrl}
										width={28}
									/>
								) : (
									<span className="font-mono text-xs font-bold text-stone-950">
										{activeBrushPreset.width}×{activeBrushPreset.height}
									</span>
								)}
							</div>
							<div className="min-w-0 flex-1">
								<p className="truncate text-sm font-semibold text-stone-100">
									{activeBrushPreset.name}
								</p>
								<p className="font-mono text-xs text-amber-300">
									Size:{" "}
									{placementRotated
										? `${activeBrushPreset.height}×${activeBrushPreset.width}`
										: `${activeBrushPreset.width}×${activeBrushPreset.height}`}
									{activeBrushPreset.influenceRadius > 0
										? ` • Radius ${activeBrushPreset.influenceRadius}`
										: ""}
								</p>
							</div>
						</div>
						{activeBrushPreset.width !== activeBrushPreset.height && (
							<button
								className="anno-touch-target mt-2.5 inline-flex w-full items-center justify-center gap-1.5 rounded border border-amber-500/30 bg-stone-900 py-1.5 text-xs font-medium text-amber-200 hover:bg-stone-800 lg:py-1"
								type="button"
								onClick={rotateActiveOrSelection}
							>
								<ArrowPathIcon aria-hidden="true" className="h-3.5 w-3.5" />
								Rotate Footprint
							</button>
						)}
					</section>
				) : (
					<section className="rounded-lg border border-stone-800 bg-stone-900/50 p-3 text-xs text-stone-400">
						<p className="font-medium text-stone-200">Inspector Ready</p>
						<p className="mt-1">
							{isMobileDrawer
								? "Tap any building on the grid to inspect its service coverage, road access, or rotate/clone it."
								: "Click any building on the grid to inspect its service coverage, road access, or rotate/clone it."}
						</p>
					</section>
				)}

				{/* Section 2: Global Settlement Housing Health */}
				{globalHousingHealth && (
					<section className="rounded-lg border border-stone-800 bg-stone-900/50 p-3">
						<h3 className="text-xs font-semibold tracking-wider text-stone-300 uppercase">
							Housing Coverage
						</h3>
						<div className="mt-2 grid grid-cols-2 gap-2 text-xs">
							<div className="rounded bg-stone-950/80 p-2">
								<span className="block text-[10px] text-stone-400">
									Market / Bazaar
								</span>
								<span className="mt-0.5 block font-mono text-sm font-semibold text-emerald-400">
									{globalHousingHealth.marketCoveredCount}/
									{globalHousingHealth.totalResidences}
								</span>
							</div>
							<div className="rounded bg-stone-950/80 p-2">
								<span className="block text-[10px] text-stone-400">
									Road Access
								</span>
								<span className="mt-0.5 block font-mono text-sm font-semibold text-amber-300">
									{globalHousingHealth.roadConnectedCount}/
									{globalHousingHealth.totalResidences}
								</span>
							</div>
						</div>
					</section>
				)}

				{/* Section 3: Layout Dimensions & Efficiency */}
				<section className="rounded-lg border border-stone-800 bg-stone-900/50 p-3">
					<h3 className="text-xs font-semibold tracking-wider text-stone-300 uppercase">
						Layout Footprint
					</h3>
					<div className="mt-2 grid grid-cols-2 gap-2 text-xs">
						<div className="rounded bg-stone-950/80 p-2">
							<span className="block text-[10px] text-stone-400">
								Bounding Box
							</span>
							<span className="mt-0.5 block font-mono text-sm font-semibold text-stone-100">
								{statistics.boundingBox
									? `${statistics.boundingBox.width} × ${statistics.boundingBox.height}`
									: "0 × 0"}
							</span>
						</div>
						<div className="rounded bg-stone-950/80 p-2">
							<span className="block text-[10px] text-stone-400">
								Space Efficiency
							</span>
							<span className="mt-0.5 block font-mono text-sm font-semibold text-amber-300">
								{statistics.spaceEfficiencyPercent}%
							</span>
						</div>
						<div className="rounded bg-stone-950/80 p-2">
							<span className="block text-[10px] text-stone-400">
								Structures
							</span>
							<span className="mt-0.5 block font-mono text-sm font-semibold text-stone-100">
								{statistics.nonRoadBuildings}
							</span>
						</div>
						<div className="rounded bg-stone-950/80 p-2">
							<span className="block text-[10px] text-stone-400">
								Road Tiles
							</span>
							<span className="mt-0.5 block font-mono text-sm font-semibold text-stone-100">
								{statistics.roadTiles}
							</span>
						</div>
					</div>
				</section>

				{/* Section 4: Placed Bill of Materials */}
				<section className="flex flex-col rounded-lg border border-stone-800 bg-stone-900/50 p-3">
					<div className="flex items-center justify-between">
						<h3 className="text-xs font-semibold tracking-wider text-stone-300 uppercase">
							Placed Buildings
						</h3>
						<span className="text-[10px] text-stone-500">
							{isMobileDrawer ? "Tap to select" : "Click to select"}
						</span>
					</div>

					{statistics.presetCounts.length === 0 ? (
						<p className="mt-3 text-center text-xs text-stone-500">
							{isMobileDrawer
								? "Grid is empty. Open Palette below to pick a building!"
								: "Grid is empty. Pick or drag a preset from the left!"}
						</p>
					) : (
						<ul className="mt-2 flex flex-col gap-1" role="list">
							{statistics.presetCounts.map((entry) => (
								<li key={entry.presetId}>
									<button
										className="anno-touch-target flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs hover:bg-stone-800 active:bg-stone-800 lg:py-1"
										type="button"
										onClick={(): void => {
											selectByPresetId(entry.presetId);
											if (isMobileDrawer) {
												onCloseDrawer?.();
											}
										}}
									>
										<span className="flex min-w-0 items-center gap-2">
											<span
												aria-hidden="true"
												className="flex h-5 w-5 shrink-0 items-center justify-center rounded-xs border border-black/40"
												style={{ backgroundColor: entry.cssColor }}
											>
												{entry.iconUrl && (
													<img
														alt=""
														className="h-4 w-4 object-contain"
														height={16}
														loading="lazy"
														src={entry.iconUrl}
														width={16}
													/>
												)}
											</span>
											<span className="truncate text-stone-200">
												{entry.name}
											</span>
										</span>
										<span className="ml-2 shrink-0 rounded bg-stone-800 px-1.5 py-0.5 font-mono text-[11px] text-amber-300">
											×{entry.count}
										</span>
									</button>
								</li>
							))}
						</ul>
					)}
				</section>
			</div>
		</>
	);

	if (isMobileDrawer) {
		return (
			<div className="flex h-full min-h-0 flex-col border-l border-amber-500/20 bg-stone-950 text-stone-100">
				{content}
			</div>
		);
	}

	return (
		<aside
			aria-label="Coverage Inspector and Layout Statistics"
			className="flex min-h-0 flex-col border-l border-amber-500/20 bg-stone-950 text-stone-100"
		>
			{content}
		</aside>
	);
};
