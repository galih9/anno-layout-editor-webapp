import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useId, useMemo, useState } from "react";
import type { FunctionComponent } from "../../../common/types";
import { useDesignerStore } from "../../../store/designerStore";
import { ANNO_1404_PRESETS, CATEGORY_DEFINITIONS } from "../presetsData";
import type { AnnoRegion, BuildingCategory, BuildingPreset } from "../types";

export type BuildingPaletteProps = {
	readonly isMobileDrawer?: boolean;
	readonly onCloseDrawer?: () => void;
	readonly onEndPaletteDrag: () => void;
	readonly onPresetPicked?: () => void;
	readonly onStartPaletteDrag: (presetId: string) => void;
};

type RegionFilter = "all" | AnnoRegion;

export const BuildingPalette = ({
	isMobileDrawer = false,
	onCloseDrawer,
	onEndPaletteDrag,
	onPresetPicked,
	onStartPaletteDrag,
}: BuildingPaletteProps): FunctionComponent => {
	const searchInputId = useId();
	const [query, setQuery] = useState<string>("");
	const [activeCategory, setActiveCategory] = useState<
		BuildingCategory | "all"
	>("all");
	const [regionFilter, setRegionFilter] = useState<RegionFilter>("all");

	const activePresetId = useDesignerStore((state) => state.activePresetId);
	const activeTool = useDesignerStore((state) => state.activeTool);
	const selectPreset = useDesignerStore((state) => state.selectPreset);

	const isPlacementMode = activeTool === "place" || activeTool === "road";

	const groupedPresets = useMemo((): Array<{
		readonly groupKey: string;
		readonly groupLabel: string;
		readonly items: Array<BuildingPreset>;
	}> => {
		const normalizedQuery = query.trim().toLowerCase();

		const filtered = ANNO_1404_PRESETS.filter((preset) => {
			if (activeCategory !== "all" && preset.category !== activeCategory) {
				return false;
			}
			if (
				regionFilter !== "all" &&
				preset.region !== regionFilter &&
				preset.region !== "universal"
			) {
				return false;
			}
			if (!normalizedQuery) {
				return true;
			}
			const sizeToken = `${preset.width}x${preset.height}`;
			return (
				preset.name.toLowerCase().includes(normalizedQuery) ||
				preset.identifier.toLowerCase().includes(normalizedQuery) ||
				preset.groupLabel.toLowerCase().includes(normalizedQuery) ||
				sizeToken.includes(normalizedQuery)
			);
		});

		const groups = new Map<
			string,
			{ label: string; items: Array<BuildingPreset> }
		>();
		for (const preset of filtered) {
			const groupKey = `${preset.category}_${preset.groupLabel}`;
			const current = groups.get(groupKey);
			if (current) {
				current.items.push(preset);
			} else {
				groups.set(groupKey, {
					label: preset.groupLabel,
					items: [preset],
				});
			}
		}

		return [...groups.entries()].map(([groupKey, entry]) => ({
			groupKey,
			groupLabel: entry.label,
			items: entry.items,
		}));
	}, [activeCategory, query, regionFilter]);

	const totalVisibleCount = useMemo(
		(): number =>
			groupedPresets.reduce((sum, group) => sum + group.items.length, 0),
		[groupedPresets]
	);

	const content = (
		<>
			<search className="flex flex-col gap-2.5 border-b border-stone-800 p-3">
				<div className="flex items-center justify-between gap-2">
					<h2 className="text-xs font-semibold tracking-wider text-amber-400/90 uppercase">
						Anno 1404 Palette
					</h2>
					<div className="flex items-center gap-2">
						<span className="font-mono text-[11px] text-stone-400">
							{totalVisibleCount} presets
						</span>
						{isMobileDrawer && onCloseDrawer && (
							<button
								aria-label="Close building palette"
								className="anno-touch-target inline-flex items-center justify-center rounded-md p-1 text-stone-400 hover:bg-stone-800 hover:text-stone-100"
								type="button"
								onClick={onCloseDrawer}
							>
								<XMarkIcon aria-hidden="true" className="h-5 w-5" />
							</button>
						)}
					</div>
				</div>

				{/* Search input (16px on mobile prevents iOS Safari auto-zoom) */}
				<div className="relative flex items-center">
					<label className="sr-only" htmlFor={searchInputId}>
						Search Anno 1404 buildings
					</label>
					<MagnifyingGlassIcon
						aria-hidden="true"
						className="pointer-events-none absolute left-2.5 h-4 w-4 text-stone-400"
					/>
					<input
						className="w-full rounded-md border border-stone-700/80 bg-stone-900 py-1.5 pr-8 pl-8 text-base text-stone-100 placeholder:text-sm placeholder:text-stone-500 focus:border-amber-400 focus:outline-none lg:text-xs lg:placeholder:text-xs"
						id={searchInputId}
						placeholder="Search buildings or size (6x5)..."
						type="search"
						value={query}
						onChange={(event): void => {
							setQuery(event.target.value);
						}}
					/>
					{query && (
						<button
							aria-label="Clear search"
							className="absolute right-1.5 rounded p-1 text-stone-400 hover:text-stone-200"
							type="button"
							onClick={(): void => {
								setQuery("");
							}}
						>
							<XMarkIcon aria-hidden="true" className="h-4 w-4" />
						</button>
					)}
				</div>

				{/* Occident / Orient Region Filter */}
				<div className="grid grid-cols-3 gap-1 rounded-md bg-stone-900 p-0.5 text-[11px]">
					{(
						[
							{ id: "all", label: "All Regions" },
							{ id: "occident", label: "Occident" },
							{ id: "orient", label: "Orient" },
						] as const
					).map((regionOption) => {
						const active = regionFilter === regionOption.id;
						return (
							<button
								key={regionOption.id}
								type="button"
								className={`rounded py-1.5 font-medium transition lg:py-1 ${
									active
										? "bg-amber-500/20 text-amber-300 ring-1 ring-amber-400/40"
										: "text-stone-400 hover:text-stone-200"
								}`}
								onClick={(): void => {
									setRegionFilter(regionOption.id);
								}}
							>
								{regionOption.label}
							</button>
						);
					})}
				</div>

				{/* Category Filter Pills */}
				<div className="anno-pill-wrap gap-1">
					{CATEGORY_DEFINITIONS.map((categoryItem) => {
						const isSelected = activeCategory === categoryItem.id;
						return (
							<button
								key={categoryItem.id}
								type="button"
								className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition lg:px-2 lg:py-0.5 ${
									isSelected
										? "bg-amber-400 text-stone-950 shadow-xs"
										: "bg-stone-900 text-stone-300 ring-1 ring-stone-800 hover:bg-stone-800 hover:text-stone-100"
								}`}
								onClick={(): void => {
									setActiveCategory(categoryItem.id);
								}}
							>
								{categoryItem.shortLabel}
							</button>
						);
					})}
				</div>
			</search>

			{/* Scrollable Building List */}
			<div
				className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2.5"
				style={{ scrollbarGutter: "stable" }}
			>
				{groupedPresets.length === 0 ? (
					<div className="rounded-lg border border-dashed border-stone-800 p-6 text-center text-xs text-stone-400">
						No Anno 1404 buildings match your filter.
					</div>
				) : (
					<div className="flex flex-col gap-2.5">
						{groupedPresets.map((group) => (
							<details
								key={group.groupKey}
								open
								className="anno-palette-group group rounded-lg border border-stone-800/90 bg-stone-900/50"
							>
								<summary className="flex cursor-pointer list-none items-center justify-between px-2.5 py-2 text-xs font-semibold text-stone-200 select-none hover:text-amber-300 lg:py-1.5">
									<span className="flex items-center gap-1.5">
										<span
											aria-hidden="true"
											className="inline-block text-[10px] text-amber-400 transition-transform group-open:rotate-90"
										>
											▶
										</span>
										<span>{group.groupLabel}</span>
									</span>
									<span className="rounded bg-stone-800 px-1.5 py-0.5 font-mono text-[10px] text-stone-400">
										{group.items.length}
									</span>
								</summary>

								<div className="grid grid-cols-1 gap-1 border-t border-stone-800/70 p-1.5">
									{group.items.map((preset) => {
										const isArmed =
											isPlacementMode && activePresetId === preset.identifier;
										return (
											<button
												key={preset.identifier}
												draggable={!isMobileDrawer}
												type="button"
												className={`flex min-w-0 items-center gap-2.5 rounded-md px-2 py-2 text-left transition lg:cursor-grab lg:py-1.5 lg:active:cursor-grabbing ${
													isArmed
														? "bg-amber-500/20 ring-1 ring-amber-400"
														: "hover:bg-stone-800/80 active:bg-stone-800"
												}`}
												onClick={(): void => {
													selectPreset(preset.identifier);
													onPresetPicked?.();
												}}
												onDragEnd={(): void => {
													onEndPaletteDrag();
												}}
												onDragStart={(event): void => {
													if (isMobileDrawer) {
														event.preventDefault();
														return;
													}
													event.dataTransfer.setData(
														"application/anno1404-preset",
														preset.identifier
													);
													event.dataTransfer.effectAllowed = "copy";
													onStartPaletteDrag(preset.identifier);
												}}
											>
												<span
													aria-hidden="true"
													className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded border border-black/40 shadow-inner"
													style={{ backgroundColor: preset.cssColor }}
												>
													{preset.iconUrl ? (
														<img
															alt=""
															className="h-7 w-7 object-contain drop-shadow-xs"
															height={28}
															loading="lazy"
															src={preset.iconUrl}
															width={28}
														/>
													) : (
														<span className="font-mono text-[10px] font-bold text-stone-950/80">
															{preset.width}×{preset.height}
														</span>
													)}
												</span>

												<span className="flex min-w-0 flex-1 flex-col">
													<span className="truncate text-xs font-medium text-stone-100">
														{preset.name}
													</span>
													<span className="flex items-center gap-1.5 text-[10px] text-stone-400">
														<span className="font-mono text-stone-300">
															{preset.width}×{preset.height}
														</span>
														{preset.influenceRadius > 0 && (
															<span className="rounded bg-amber-500/15 px-1 font-mono text-amber-300">
																◎ {preset.influenceRadius}
															</span>
														)}
														{preset.region === "orient" && (
															<span className="rounded bg-orange-500/15 px-1 text-orange-300">
																Orient
															</span>
														)}
													</span>
												</span>
											</button>
										);
									})}
								</div>
							</details>
						))}
					</div>
				)}
			</div>

			<div className="border-t border-stone-800 bg-stone-950 px-3 py-2 text-[11px] text-stone-400">
				{isMobileDrawer
					? "Tap a building to arm brush, then tap or drag on the grid."
					: "Click a building then click grid, or drag & drop onto canvas."}
			</div>
		</>
	);

	if (isMobileDrawer) {
		return (
			<div className="flex h-full min-h-0 flex-col border-r border-amber-500/20 bg-stone-950 text-stone-100">
				{content}
			</div>
		);
	}

	return (
		<aside
			aria-label="Anno 1404 Building Presets"
			className="flex min-h-0 flex-col border-r border-amber-500/20 bg-stone-950 text-stone-100"
		>
			{content}
		</aside>
	);
};
