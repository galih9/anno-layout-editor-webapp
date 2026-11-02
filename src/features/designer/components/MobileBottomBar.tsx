import {
	ArrowPathIcon,
	BuildingOffice2Icon,
	ChartBarSquareIcon,
	CheckCircleIcon,
	CursorArrowRaysIcon,
	DocumentDuplicateIcon,
	ExclamationTriangleIcon,
	HandRaisedIcon,
	Squares2X2Icon,
	TrashIcon,
	XMarkIcon,
} from "@heroicons/react/24/outline";
import { useMemo } from "react";
import type { FunctionComponent } from "../../../common/types";
import { useDesignerStore } from "../../../store/designerStore";
import { PRESET_BY_ID } from "../presetsData";
import { getSpatialIndex } from "../spatialIndex";
import type { ActiveTool } from "../types";

export type MobileDrawerKind = "palette" | "inspector";

export type MobileBottomBarProps = {
	readonly inspectorDrawerId: string;
	readonly openDrawer: MobileDrawerKind | null;
	readonly paletteDrawerId: string;
	readonly onCloseDrawers: () => void;
	readonly onToggleDrawer: (drawer: MobileDrawerKind) => void;
};

export const MobileBottomBar = ({
	inspectorDrawerId,
	openDrawer,
	paletteDrawerId,
	onCloseDrawers,
	onToggleDrawer,
}: MobileBottomBarProps): FunctionComponent => {
	const buildings = useDesignerStore((state) => state.buildings);
	const gridWidth = useDesignerStore((state) => state.gridWidth);
	const gridHeight = useDesignerStore((state) => state.gridHeight);
	const activeTool = useDesignerStore((state) => state.activeTool);
	const activePresetId = useDesignerStore((state) => state.activePresetId);
	const placementRotated = useDesignerStore((state) => state.placementRotated);
	const selectedIds = useDesignerStore((state) => state.selectedIds);

	const setActiveTool = useDesignerStore((state) => state.setActiveTool);
	const cancelActiveAction = useDesignerStore(
		(state) => state.cancelActiveAction
	);
	const rotateActiveOrSelection = useDesignerStore(
		(state) => state.rotateActiveOrSelection
	);
	const duplicateSelectedBuildings = useDesignerStore(
		(state) => state.duplicateSelectedBuildings
	);
	const removeBuildings = useDesignerStore((state) => state.removeBuildings);

	const spatialIndex = useMemo(
		() => getSpatialIndex(buildings, gridWidth, gridHeight),
		[buildings, gridHeight, gridWidth]
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

	const activeBrushPreset = useMemo(() => {
		if ((activeTool === "place" || activeTool === "road") && activePresetId) {
			return PRESET_BY_ID.get(activePresetId) ?? null;
		}
		return null;
	}, [activePresetId, activeTool]);

	const handleSelectTool = (tool: ActiveTool): void => {
		onCloseDrawers();
		setActiveTool(tool);
	};

	const showSelectionBar = activeTool === "select" && selectedIds.length > 0;
	const showArmedBrushBar = !showSelectionBar && activeBrushPreset !== null;

	return (
		<nav
			aria-label="Mobile designer tools and panels"
			className="flex flex-col border-t border-amber-500/20 bg-stone-950 text-stone-100 select-none"
		>
			{/* Contextual Quick-Action Strip for Active Selection */}
			{showSelectionBar && (
				<div className="flex items-center justify-between gap-2 border-b border-stone-800/90 bg-stone-900/90 px-2.5 py-1.5">
					<button
						className="flex min-w-0 flex-1 items-center gap-2 text-left"
						type="button"
						onClick={(): void => {
							onToggleDrawer("inspector");
						}}
					>
						{singleSelectedBuilding && singleSelectedPreset ? (
							<>
								<span
									aria-hidden="true"
									className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-black/40"
									style={{
										backgroundColor:
											singleSelectedBuilding.customColor ??
											singleSelectedPreset.cssColor,
									}}
								>
									{singleSelectedPreset.iconUrl ? (
										<img
											alt=""
											className="h-5 w-5 object-contain"
											height={20}
											src={singleSelectedPreset.iconUrl}
											width={20}
										/>
									) : (
										<span className="font-mono text-[9px] font-bold text-stone-950">
											{singleSelectedBuilding.width}×
											{singleSelectedBuilding.height}
										</span>
									)}
								</span>
								<span className="min-w-0 flex-1">
									<span className="block truncate text-xs font-semibold text-amber-300">
										{singleSelectedPreset.name}
									</span>
									<span className="flex items-center gap-1.5 text-[10px] text-stone-400">
										<span className="font-mono text-stone-300">
											{singleSelectedBuilding.width}×
											{singleSelectedBuilding.height}
										</span>
										{!singleSelectedPreset.isRoad &&
											singleSelectedPreset.group !== "Farm Fields" &&
											(spatialIndex.hasAdjacentRoad(singleSelectedBuilding) ? (
												<span className="inline-flex items-center gap-0.5 text-emerald-400">
													<CheckCircleIcon
														aria-hidden="true"
														className="h-3 w-3"
													/>
													Road
												</span>
											) : (
												<span className="inline-flex items-center gap-0.5 text-amber-400">
													<ExclamationTriangleIcon
														aria-hidden="true"
														className="h-3 w-3"
													/>
													No road
												</span>
											))}
									</span>
								</span>
							</>
						) : (
							<span className="truncate text-xs font-semibold text-amber-300">
								{selectedIds.length} items selected • Tap for stats
							</span>
						)}
					</button>

					<div className="flex shrink-0 items-center gap-1">
						<button
							aria-label="Rotate selected"
							className="anno-touch-target inline-flex items-center justify-center gap-1 rounded-md border border-stone-700 bg-stone-800 px-2.5 py-1.5 text-xs font-medium text-stone-200 active:bg-stone-700 disabled:opacity-35"
							type="button"
							disabled={
								singleSelectedBuilding !== null &&
								singleSelectedBuilding.width === singleSelectedBuilding.height
							}
							onClick={rotateActiveOrSelection}
						>
							<ArrowPathIcon aria-hidden="true" className="h-4 w-4" />
							<span className="hidden sm:inline">Rotate</span>
						</button>
						<button
							aria-label="Duplicate selected"
							className="anno-touch-target inline-flex items-center justify-center gap-1 rounded-md border border-stone-700 bg-stone-800 px-2.5 py-1.5 text-xs font-medium text-stone-200 active:bg-stone-700"
							type="button"
							onClick={duplicateSelectedBuildings}
						>
							<DocumentDuplicateIcon aria-hidden="true" className="h-4 w-4" />
							<span className="hidden sm:inline">Clone</span>
						</button>
						<button
							aria-label="Delete selected"
							className="anno-touch-target inline-flex items-center justify-center gap-1 rounded-md border border-red-900/60 bg-red-950/50 px-2.5 py-1.5 text-xs font-medium text-red-300 active:bg-red-900/60"
							type="button"
							onClick={(): void => {
								removeBuildings(selectedIds);
							}}
						>
							<TrashIcon aria-hidden="true" className="h-4 w-4" />
							<span className="hidden sm:inline">Delete</span>
						</button>
						<button
							aria-label="Clear selection"
							className="anno-touch-target inline-flex items-center justify-center rounded-md border border-stone-700 bg-stone-800/80 p-1.5 text-stone-300 active:bg-stone-700"
							type="button"
							onClick={cancelActiveAction}
						>
							<XMarkIcon aria-hidden="true" className="h-4 w-4" />
						</button>
					</div>
				</div>
			)}

			{/* Contextual Strip for Armed Building / Road Brush */}
			{showArmedBrushBar && activeBrushPreset && (
				<div className="flex items-center justify-between gap-2 border-b border-amber-500/25 bg-amber-950/25 px-2.5 py-1.5">
					<button
						className="flex min-w-0 flex-1 items-center gap-2 text-left"
						type="button"
						onClick={(): void => {
							onToggleDrawer("palette");
						}}
					>
						<span
							aria-hidden="true"
							className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-black/40"
							style={{ backgroundColor: activeBrushPreset.cssColor }}
						>
							{activeBrushPreset.iconUrl ? (
								<img
									alt=""
									className="h-5 w-5 object-contain"
									height={20}
									src={activeBrushPreset.iconUrl}
									width={20}
								/>
							) : (
								<span className="font-mono text-[9px] font-bold text-stone-950">
									{activeBrushPreset.width}×{activeBrushPreset.height}
								</span>
							)}
						</span>
						<span className="min-w-0 flex-1">
							<span className="block truncate text-xs font-semibold text-stone-100">
								{activeBrushPreset.name}
							</span>
							<span className="block font-mono text-[10px] text-amber-300">
								{placementRotated
									? `${activeBrushPreset.height}×${activeBrushPreset.width}`
									: `${activeBrushPreset.width}×${activeBrushPreset.height}`}
								{activeBrushPreset.influenceRadius > 0
									? ` • ◎ ${activeBrushPreset.influenceRadius}`
									: ""}{" "}
								• Tap to swap
							</span>
						</span>
					</button>

					<div className="flex shrink-0 items-center gap-1">
						{activeBrushPreset.width !== activeBrushPreset.height && (
							<button
								aria-label="Rotate building footprint"
								className="anno-touch-target inline-flex items-center justify-center gap-1 rounded-md border border-amber-500/40 bg-stone-900 px-2.5 py-1.5 text-xs font-medium text-amber-200 active:bg-stone-800"
								type="button"
								onClick={rotateActiveOrSelection}
							>
								<ArrowPathIcon aria-hidden="true" className="h-4 w-4" />
								<span>Rotate</span>
							</button>
						)}
						<button
							className="anno-touch-target inline-flex items-center justify-center gap-1 rounded-md border border-stone-700 bg-stone-900 px-2.5 py-1.5 text-xs font-medium text-stone-200 active:bg-stone-800"
							type="button"
							onClick={cancelActiveAction}
						>
							<XMarkIcon aria-hidden="true" className="h-3.5 w-3.5" />
							<span>Done</span>
						</button>
					</div>
				</div>
			)}

			{/* Primary 6-Tab Bottom Dock */}
			<div className="grid grid-cols-6 gap-1 px-1 pt-1">
				<button
					aria-controls={paletteDrawerId}
					aria-expanded={openDrawer === "palette"}
					type="button"
					className={`flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 text-[10px] font-medium transition ${
						openDrawer === "palette" || activeTool === "place"
							? "bg-amber-400/20 text-amber-300 ring-1 ring-amber-400/40"
							: "text-stone-300 hover:bg-stone-900 active:bg-stone-800"
					}`}
					onClick={(): void => {
						onToggleDrawer("palette");
					}}
				>
					<BuildingOffice2Icon aria-hidden="true" className="h-5 w-5" />
					<span>Palette</span>
				</button>

				<button
					aria-pressed={activeTool === "select" && openDrawer === null}
					type="button"
					className={`flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 text-[10px] font-medium transition ${
						activeTool === "select" && openDrawer === null
							? "bg-amber-400 text-stone-950 shadow-xs"
							: "text-stone-300 hover:bg-stone-900 active:bg-stone-800"
					}`}
					onClick={(): void => {
						handleSelectTool("select");
					}}
				>
					<CursorArrowRaysIcon aria-hidden="true" className="h-5 w-5" />
					<span>Select</span>
				</button>

				<button
					aria-pressed={activeTool === "road" && openDrawer === null}
					type="button"
					className={`flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 text-[10px] font-medium transition ${
						activeTool === "road" && openDrawer === null
							? "bg-amber-400 text-stone-950 shadow-xs"
							: "text-stone-300 hover:bg-stone-900 active:bg-stone-800"
					}`}
					onClick={(): void => {
						handleSelectTool("road");
					}}
				>
					<Squares2X2Icon aria-hidden="true" className="h-5 w-5" />
					<span>Road</span>
				</button>

				<button
					aria-pressed={activeTool === "erase" && openDrawer === null}
					type="button"
					className={`flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 text-[10px] font-medium transition ${
						activeTool === "erase" && openDrawer === null
							? "bg-amber-400 text-stone-950 shadow-xs"
							: "text-stone-300 hover:bg-stone-900 active:bg-stone-800"
					}`}
					onClick={(): void => {
						handleSelectTool("erase");
					}}
				>
					<TrashIcon aria-hidden="true" className="h-5 w-5" />
					<span>Erase</span>
				</button>

				<button
					aria-pressed={activeTool === "pan" && openDrawer === null}
					type="button"
					className={`flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 text-[10px] font-medium transition ${
						activeTool === "pan" && openDrawer === null
							? "bg-amber-400 text-stone-950 shadow-xs"
							: "text-stone-300 hover:bg-stone-900 active:bg-stone-800"
					}`}
					onClick={(): void => {
						handleSelectTool("pan");
					}}
				>
					<HandRaisedIcon aria-hidden="true" className="h-5 w-5" />
					<span>Pan</span>
				</button>

				<button
					aria-controls={inspectorDrawerId}
					aria-expanded={openDrawer === "inspector"}
					type="button"
					className={`relative flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 text-[10px] font-medium transition ${
						openDrawer === "inspector"
							? "bg-amber-400/20 text-amber-300 ring-1 ring-amber-400/40"
							: "text-stone-300 hover:bg-stone-900 active:bg-stone-800"
					}`}
					onClick={(): void => {
						onToggleDrawer("inspector");
					}}
				>
					<ChartBarSquareIcon aria-hidden="true" className="h-5 w-5" />
					<span>Inspect</span>
					{selectedIds.length > 0 && (
						<span className="absolute top-1 right-2 rounded-full bg-amber-400 px-1 font-mono text-[9px] leading-tight font-bold text-stone-950">
							{selectedIds.length}
						</span>
					)}
				</button>
			</div>
		</nav>
	);
};
