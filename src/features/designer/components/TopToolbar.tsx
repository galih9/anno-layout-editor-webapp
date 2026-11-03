import {
	AdjustmentsHorizontalIcon,
	ArrowPathIcon,
	ArrowUturnLeftIcon,
	ArrowUturnRightIcon,
	CameraIcon,
	CursorArrowRaysIcon,
	EyeDropperIcon,
	FolderOpenIcon,
	HandRaisedIcon,
	QuestionMarkCircleIcon,
	SparklesIcon,
	Squares2X2Icon,
	SunIcon,
	TrashIcon,
	XMarkIcon,
} from "@heroicons/react/24/outline";
import type Konva from "konva";
import { useEffect, useId, useRef, useState } from "react";
import type { FunctionComponent } from "../../../common/types";
import { useDesignerStore } from "../../../store/designerStore";
import type { ActiveTool, InfluenceDisplayMode } from "../types";
import type { ModalTab } from "./TemplatesModal";

export type TopToolbarProps = {
	readonly isCompact?: boolean;
	readonly onOpenModal: (tab: ModalTab) => void;
	readonly stageRef: React.RefObject<Konva.Stage | null>;
};

export const TopToolbar = ({
	isCompact = false,
	onOpenModal,
	stageRef,
}: TopToolbarProps): FunctionComponent => {
	const layoutNameInputId = useId();
	const influenceSelectId = useId();
	const autoAscendInputId = useId();
	const showLabelsInputId = useId();
	const mobileMenuId = useId();

	const [isViewMenuOpen, setIsViewMenuOpen] = useState<boolean>(false);
	const viewMenuContainerRef = useRef<HTMLDivElement | null>(null);

	const layoutName = useDesignerStore((state) => state.layoutName);
	const activeTool = useDesignerStore((state) => state.activeTool);
	const canUndo = useDesignerStore((state) => state.past.length > 0);
	const canRedo = useDesignerStore((state) => state.future.length > 0);
	const showGrid = useDesignerStore((state) => state.showGrid);
	const showIcons = useDesignerStore((state) => state.showIcons);
	const showLabels = useDesignerStore((state) => state.showLabels);
	const showDiscreteTiles = useDesignerStore(
		(state) => state.showDiscreteTiles
	);
	const autoAscend = useDesignerStore((state) => state.autoAscend);
	const isAutoAscending = useDesignerStore((state) => state.isAutoAscending);
	const influenceMode = useDesignerStore((state) => state.influenceMode);
	const canvasTheme = useDesignerStore((state) => state.canvasTheme);

	const setLayoutName = useDesignerStore((state) => state.setLayoutName);
	const setActiveTool = useDesignerStore((state) => state.setActiveTool);
	const rotateActiveOrSelection = useDesignerStore(
		(state) => state.rotateActiveOrSelection
	);
	const undo = useDesignerStore((state) => state.undo);
	const redo = useDesignerStore((state) => state.redo);
	const toggleShowGrid = useDesignerStore((state) => state.toggleShowGrid);
	const toggleShowIcons = useDesignerStore((state) => state.toggleShowIcons);
	const setShowLabels = useDesignerStore((state) => state.setShowLabels);
	const toggleShowDiscreteTiles = useDesignerStore(
		(state) => state.toggleShowDiscreteTiles
	);
	const setAutoAscend = useDesignerStore((state) => state.setAutoAscend);
	const setInfluenceMode = useDesignerStore((state) => state.setInfluenceMode);
	const setCanvasTheme = useDesignerStore((state) => state.setCanvasTheme);
	const clearBoard = useDesignerStore((state) => state.clearBoard);

	useEffect((): (() => void) => {
		if (!isViewMenuOpen) {
			return (): void => {};
		}
		const handlePointerDownOutside = (event: PointerEvent): void => {
			const container = viewMenuContainerRef.current;
			if (
				container &&
				event.target instanceof Node &&
				!container.contains(event.target)
			) {
				setIsViewMenuOpen(false);
			}
		};
		const handleEscape = (event: KeyboardEvent): void => {
			if (event.key === "Escape") {
				setIsViewMenuOpen(false);
			}
		};
		document.addEventListener("pointerdown", handlePointerDownOutside);
		document.addEventListener("keydown", handleEscape);
		return (): void => {
			document.removeEventListener("pointerdown", handlePointerDownOutside);
			document.removeEventListener("keydown", handleEscape);
		};
	}, [isViewMenuOpen]);

	const handleExportPng = (): void => {
		const stage = stageRef.current;
		if (!stage) {
			return;
		}
		const dataUrl = stage.toDataURL({ pixelRatio: 2 });
		const anchor = document.createElement("a");
		const safeSlug =
			layoutName
				.trim()
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, "-")
				.replace(/^-|-$/g, "") || "anno-1404-layout";
		anchor.href = dataUrl;
		anchor.download = `${safeSlug}.png`;
		document.body.append(anchor);
		anchor.click();
		anchor.remove();
	};

	if (isCompact) {
		return (
			<header className="relative z-30 flex items-center justify-between gap-2 border-b border-amber-500/20 bg-stone-950 py-1.5 text-stone-100">
				<div className="flex min-w-0 flex-1 items-center gap-2">
					<span className="shrink-0 rounded bg-amber-400 px-1.5 py-0.5 font-serif text-xs font-extrabold tracking-wider text-stone-950">
						1404
					</span>
					<label className="sr-only" htmlFor={layoutNameInputId}>
						Layout Name
					</label>
					<input
						className="min-w-0 flex-1 rounded border border-stone-800 bg-stone-900 px-2 py-1 text-base font-medium text-stone-100 focus:border-amber-400 focus:outline-none sm:max-w-60 sm:text-sm"
						id={layoutNameInputId}
						type="text"
						value={layoutName}
						onChange={(event): void => {
							setLayoutName(event.target.value);
						}}
					/>
				</div>

				<div className="flex shrink-0 items-center gap-1">
					<div className="flex items-center rounded-md border border-stone-800 bg-stone-900">
						<button
							aria-label="Undo"
							className="anno-touch-target inline-flex items-center justify-center px-2 py-1.5 text-stone-200 active:bg-stone-800 disabled:opacity-35"
							disabled={!canUndo}
							type="button"
							onClick={undo}
						>
							<ArrowUturnLeftIcon aria-hidden="true" className="h-4 w-4" />
						</button>
						<span aria-hidden="true" className="h-4 w-px bg-stone-800" />
						<button
							aria-label="Redo"
							className="anno-touch-target inline-flex items-center justify-center px-2 py-1.5 text-stone-200 active:bg-stone-800 disabled:opacity-35"
							disabled={!canRedo}
							type="button"
							onClick={redo}
						>
							<ArrowUturnRightIcon aria-hidden="true" className="h-4 w-4" />
						</button>
					</div>

					<button
						aria-label="Starter layouts"
						className="anno-touch-target inline-flex items-center justify-center gap-1 rounded-md border border-amber-500/35 bg-amber-500/15 px-2 py-1.5 text-xs font-medium text-amber-300 active:bg-amber-500/25"
						type="button"
						onClick={(): void => {
							setIsViewMenuOpen(false);
							onOpenModal("templates");
						}}
					>
						<SparklesIcon aria-hidden="true" className="h-4 w-4" />
						<span className="hidden md:inline">Layouts</span>
					</button>

					<button
						aria-label="Import, export, and grid settings"
						className="anno-touch-target inline-flex items-center justify-center gap-1 rounded-md border border-stone-800 bg-stone-900 px-2 py-1.5 text-xs font-medium text-stone-200 active:bg-stone-800"
						type="button"
						onClick={(): void => {
							setIsViewMenuOpen(false);
							onOpenModal("io");
						}}
					>
						<FolderOpenIcon aria-hidden="true" className="h-4 w-4" />
						<span className="hidden md:inline">File</span>
					</button>

					{isAutoAscending && !isViewMenuOpen && (
						<span
							aria-live="polite"
							className="inline-flex items-center gap-1 rounded-md border border-amber-500/35 bg-amber-500/15 px-2 py-1 text-[11px] font-medium text-amber-300"
							role="status"
						>
							<ArrowPathIcon
								aria-hidden="true"
								className="h-3.5 w-3.5 animate-spin"
							/>
							<span className="hidden sm:inline">Calculating…</span>
						</span>
					)}

					<div ref={viewMenuContainerRef} className="relative">
						<button
							aria-controls={mobileMenuId}
							aria-expanded={isViewMenuOpen}
							aria-label="View overlays and board actions"
							type="button"
							className={`anno-touch-target inline-flex items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-xs font-medium transition ${
								isViewMenuOpen
									? "border-amber-400 bg-amber-400 text-stone-950"
									: "border-stone-800 bg-stone-900 text-stone-200 active:bg-stone-800"
							}`}
							onClick={(): void => {
								setIsViewMenuOpen((previous) => !previous);
							}}
						>
							<AdjustmentsHorizontalIcon
								aria-hidden="true"
								className="h-4 w-4"
							/>
							<span className="hidden sm:inline">View</span>
						</button>

						{isViewMenuOpen && (
							<div
								aria-label="View overlays and studio actions"
								className="absolute right-0 mt-2 w-72 max-w-[calc(100dvw-1rem)] rounded-xl border border-amber-500/30 bg-stone-950 p-3 text-xs text-stone-100 shadow-2xl"
								id={mobileMenuId}
								role="region"
							>
								<div className="flex items-center justify-between border-b border-stone-800 pb-2">
									<span className="font-semibold tracking-wider text-amber-300 uppercase">
										View &amp; Actions
									</span>
									<button
										aria-label="Close view menu"
										className="rounded p-1 text-stone-400 hover:bg-stone-800 hover:text-stone-100"
										type="button"
										onClick={(): void => {
											setIsViewMenuOpen(false);
										}}
									>
										<XMarkIcon aria-hidden="true" className="h-4 w-4" />
									</button>
								</div>

								<div className="mt-2.5 flex flex-col gap-3">
									<label
										aria-busy={isAutoAscending}
										htmlFor={autoAscendInputId}
										className={`flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-xs font-medium transition select-none ${
											autoAscend
												? "border-amber-500/40 bg-amber-500/15 text-amber-300"
												: "border-stone-800 bg-stone-900 text-stone-200"
										}`}
									>
										<span className="inline-flex items-center gap-2">
											<input
												checked={autoAscend}
												className="anno-checkbox"
												id={autoAscendInputId}
												type="checkbox"
												onChange={(event): void => {
													void setAutoAscend(event.target.checked);
												}}
											/>
											<span>Auto Ascend</span>
										</span>
										{isAutoAscending && (
											<span
												aria-live="polite"
												className="inline-flex items-center gap-1 text-[11px] font-normal text-amber-200"
												role="status"
											>
												<ArrowPathIcon
													aria-hidden="true"
													className="h-3.5 w-3.5 animate-spin text-amber-400"
												/>
												<span>Calculating…</span>
											</span>
										)}
									</label>

									<label
										htmlFor={showLabelsInputId}
										className={`flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-xs font-medium transition select-none ${
											showLabels
												? "border-amber-500/40 bg-amber-500/15 text-amber-300"
												: "border-stone-800 bg-stone-900 text-stone-200"
										}`}
									>
										<span className="inline-flex items-center gap-2">
											<input
												checked={showLabels}
												className="anno-checkbox"
												id={showLabelsInputId}
												type="checkbox"
												onChange={(event): void => {
													setShowLabels(event.target.checked);
												}}
											/>
											<span>Show Labels</span>
										</span>
									</label>

									<div>
										<label
											className="block text-[11px] font-medium text-stone-400"
											htmlFor={influenceSelectId}
										>
											Influence Radii Display
										</label>
										<select
											className="mt-1 w-full rounded-md border border-stone-700 bg-stone-900 px-2.5 py-1.5 text-base font-medium text-amber-300 focus:border-amber-400 focus:outline-none sm:text-xs"
											id={influenceSelectId}
											value={influenceMode}
											onChange={(event): void => {
												setInfluenceMode(
													event.target.value as InfluenceDisplayMode
												);
											}}
										>
											<option value="active">Selected / Hover</option>
											<option value="services">All Public Services</option>
											<option value="all">All Buildings</option>
											<option value="none">Hidden</option>
										</select>
									</div>

									<div className="grid grid-cols-3 gap-1.5">
										<button
											aria-pressed={showDiscreteTiles}
											type="button"
											className={`anno-touch-target rounded-md border px-2 py-2 text-xs font-medium ${
												showDiscreteTiles
													? "border-emerald-500/40 bg-emerald-500/20 text-emerald-300"
													: "border-stone-800 bg-stone-900 text-stone-300"
											}`}
											onClick={toggleShowDiscreteTiles}
										>
											Tile Area
										</button>
										<button
											aria-pressed={showGrid}
											type="button"
											className={`anno-touch-target rounded-md border px-2 py-2 text-xs font-medium ${
												showGrid
													? "border-amber-500/40 bg-amber-500/20 text-amber-300"
													: "border-stone-800 bg-stone-900 text-stone-300"
											}`}
											onClick={toggleShowGrid}
										>
											Grid Lines
										</button>
										<button
											aria-pressed={showIcons}
											type="button"
											className={`anno-touch-target rounded-md border px-2 py-2 text-xs font-medium ${
												showIcons
													? "border-amber-500/40 bg-amber-500/20 text-amber-300"
													: "border-stone-800 bg-stone-900 text-stone-300"
											}`}
											onClick={toggleShowIcons}
										>
											Icons
										</button>
									</div>

									<div className="grid grid-cols-2 gap-1.5 border-t border-stone-800 pt-2.5">
										<button
											aria-pressed={activeTool === "eyedropper"}
											type="button"
											className={`anno-touch-target inline-flex items-center justify-center gap-1.5 rounded-md border px-2.5 py-2 text-xs font-medium ${
												activeTool === "eyedropper"
													? "border-amber-400 bg-amber-400 text-stone-950"
													: "border-stone-800 bg-stone-900 text-stone-200"
											}`}
											onClick={(): void => {
												setActiveTool("eyedropper");
												setIsViewMenuOpen(false);
											}}
										>
											<EyeDropperIcon aria-hidden="true" className="h-4 w-4" />
											<span>Pick Tool</span>
										</button>

										<button
											className="anno-touch-target inline-flex items-center justify-center gap-1.5 rounded-md border border-stone-800 bg-stone-900 px-2.5 py-2 text-xs font-medium text-stone-200"
											type="button"
											onClick={(): void => {
												setCanvasTheme(
													canvasTheme === "dark" ? "parchment" : "dark"
												);
											}}
										>
											<SunIcon aria-hidden="true" className="h-4 w-4" />
											<span>
												{canvasTheme === "dark" ? "Parchment" : "Dark Canvas"}
											</span>
										</button>

										<button
											className="anno-touch-target inline-flex items-center justify-center gap-1.5 rounded-md border border-stone-800 bg-stone-900 px-2.5 py-2 text-xs font-medium text-stone-200"
											type="button"
											onClick={(): void => {
												handleExportPng();
												setIsViewMenuOpen(false);
											}}
										>
											<CameraIcon aria-hidden="true" className="h-4 w-4" />
											<span>Export PNG</span>
										</button>

										<button
											className="anno-touch-target inline-flex items-center justify-center gap-1.5 rounded-md border border-stone-800 bg-stone-900 px-2.5 py-2 text-xs font-medium text-stone-200"
											type="button"
											onClick={(): void => {
												setIsViewMenuOpen(false);
												onOpenModal("shortcuts");
											}}
										>
											<QuestionMarkCircleIcon
												aria-hidden="true"
												className="h-4 w-4"
											/>
											<span>Help &amp; Controls</span>
										</button>
									</div>

									<button
										className="anno-touch-target w-full rounded-md border border-red-900/60 bg-red-950/40 py-2 text-xs font-medium text-red-300 active:bg-red-900/50"
										type="button"
										onClick={(): void => {
											clearBoard();
											setIsViewMenuOpen(false);
										}}
									>
										Clear Entire Board
									</button>
								</div>
							</div>
						)}
					</div>
				</div>
			</header>
		);
	}

	const toolButtons: ReadonlyArray<{
		readonly id: ActiveTool;
		readonly label: string;
		readonly shortcut: string;
		readonly icon: React.ComponentType<{
			readonly className?: string;
			readonly "aria-hidden"?: boolean;
		}>;
	}> = [
		{
			id: "select",
			label: "Select",
			shortcut: "V",
			icon: CursorArrowRaysIcon,
		},
		{
			id: "place",
			label: "Place",
			shortcut: "B",
			icon: Squares2X2Icon,
		},
		{
			id: "road",
			label: "Road",
			shortcut: "D",
			icon: Squares2X2Icon,
		},
		{
			id: "erase",
			label: "Erase",
			shortcut: "E",
			icon: TrashIcon,
		},
		{
			id: "eyedropper",
			label: "Pick",
			shortcut: "I",
			icon: EyeDropperIcon,
		},
		{
			id: "pan",
			label: "Pan",
			shortcut: "H",
			icon: HandRaisedIcon,
		},
	];

	return (
		<header className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/20 bg-stone-950 px-3 py-2 text-stone-100">
			{/* Brand + Layout Name */}
			<div className="flex min-w-0 items-center gap-2.5">
				<div className="flex items-center gap-2">
					<span className="rounded bg-amber-400 px-2 py-0.5 font-serif text-xs font-extrabold tracking-wider text-stone-950">
						1404
					</span>
					<h1 className="hidden text-sm font-bold tracking-tight text-amber-200 xl:block">
						Anno Layout Designer
					</h1>
				</div>
				<label className="sr-only" htmlFor={layoutNameInputId}>
					Layout Name
				</label>
				<input
					className="w-40 rounded border border-stone-800 bg-stone-900 px-2 py-1 text-xs font-medium text-stone-100 focus:border-amber-400 focus:outline-none sm:w-48"
					id={layoutNameInputId}
					type="text"
					value={layoutName}
					onChange={(event): void => {
						setLayoutName(event.target.value);
					}}
				/>
			</div>

			{/* Primary Tool Strip + Rotate + Undo/Redo */}
			<div className="flex flex-wrap items-center gap-1.5">
				<div className="flex items-center gap-0.5 rounded-lg border border-stone-800 bg-stone-900 p-0.5">
					{toolButtons.map((toolItem) => {
						const IconComponent = toolItem.icon;
						const active = activeTool === toolItem.id;
						return (
							<button
								key={toolItem.id}
								aria-pressed={active}
								type="button"
								className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition ${
									active
										? "bg-amber-400 text-stone-950 shadow-xs"
										: "text-stone-300 hover:bg-stone-800 hover:text-stone-100"
								}`}
								onClick={(): void => {
									setActiveTool(toolItem.id);
								}}
							>
								<IconComponent aria-hidden className="h-3.5 w-3.5" />
								<span>{toolItem.label}</span>
								<span
									className={`hidden font-mono text-[10px] 2xl:inline ${
										active ? "text-stone-800" : "text-stone-500"
									}`}
								>
									{toolItem.shortcut}
								</span>
							</button>
						);
					})}
				</div>

				<button
					className="inline-flex items-center gap-1 rounded-md border border-stone-800 bg-stone-900 px-2.5 py-1.5 text-xs font-medium text-stone-200 hover:border-amber-400/40 hover:text-amber-300"
					type="button"
					onClick={rotateActiveOrSelection}
				>
					<ArrowPathIcon aria-hidden="true" className="h-3.5 w-3.5" />
					<span>Rotate</span>
				</button>

				<div className="flex items-center rounded-md border border-stone-800 bg-stone-900">
					<button
						aria-label="Undo"
						className="px-2 py-1.5 text-stone-200 hover:text-amber-300 disabled:opacity-35"
						disabled={!canUndo}
						type="button"
						onClick={undo}
					>
						<ArrowUturnLeftIcon aria-hidden="true" className="h-3.5 w-3.5" />
					</button>
					<span aria-hidden="true" className="h-4 w-px bg-stone-800" />
					<button
						aria-label="Redo"
						className="px-2 py-1.5 text-stone-200 hover:text-amber-300 disabled:opacity-35"
						disabled={!canRedo}
						type="button"
						onClick={redo}
					>
						<ArrowUturnRightIcon aria-hidden="true" className="h-3.5 w-3.5" />
					</button>
				</div>
			</div>

			{/* View Overlays & Studio Actions */}
			<div className="flex flex-wrap items-center gap-1.5 text-xs">
				<label
					aria-busy={isAutoAscending}
					htmlFor={autoAscendInputId}
					title="Automatically upgrade road-connected houses within Marketplace/Bazaar and service radii to their highest eligible tier"
					className={`anno-checkbox-hit inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition select-none ${
						autoAscend
							? "border-amber-500/40 bg-amber-500/15 text-amber-300"
							: "border-stone-800 bg-stone-900 text-stone-200 hover:border-amber-400/40 hover:text-amber-300"
					}`}
				>
					<input
						checked={autoAscend}
						className="anno-checkbox"
						id={autoAscendInputId}
						type="checkbox"
						onChange={(event): void => {
							void setAutoAscend(event.target.checked);
						}}
					/>
					<span>Auto Ascend</span>
					{isAutoAscending && (
						<span
							aria-live="polite"
							className="inline-flex items-center gap-1 text-[11px] font-normal text-amber-200"
							role="status"
						>
							<ArrowPathIcon
								aria-hidden="true"
								className="h-3.5 w-3.5 animate-spin text-amber-400"
							/>
							<span>Calculating…</span>
						</span>
					)}
				</label>

				<label
					htmlFor={showLabelsInputId}
					title="Show or hide text labels on placed buildings"
					className={`anno-checkbox-hit inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition select-none ${
						showLabels
							? "border-amber-500/40 bg-amber-500/15 text-amber-300"
							: "border-stone-800 bg-stone-900 text-stone-200 hover:border-amber-400/40 hover:text-amber-300"
					}`}
				>
					<input
						checked={showLabels}
						className="anno-checkbox"
						id={showLabelsInputId}
						type="checkbox"
						onChange={(event): void => {
							setShowLabels(event.target.checked);
						}}
					/>
					<span>Show Labels</span>
				</label>

				<div className="flex items-center gap-1 rounded-md border border-stone-800 bg-stone-900 px-2 py-1">
					<label
						className="text-[11px] text-stone-400"
						htmlFor={influenceSelectId}
					>
						Radii:
					</label>
					<select
						className="bg-stone-900 text-xs font-medium text-amber-300 focus:outline-none"
						id={influenceSelectId}
						value={influenceMode}
						onChange={(event): void => {
							setInfluenceMode(event.target.value as InfluenceDisplayMode);
						}}
					>
						<option value="active">Selected / Hover</option>
						<option value="services">All Public Services</option>
						<option value="all">All Buildings</option>
						<option value="none">Hidden</option>
					</select>
				</div>

				<div className="flex items-center gap-0.5 rounded-md border border-stone-800 bg-stone-900 p-0.5">
					<button
						aria-pressed={showDiscreteTiles}
						type="button"
						className={`rounded px-2 py-1 text-[11px] font-medium ${
							showDiscreteTiles
								? "bg-emerald-500/20 text-emerald-300"
								: "text-stone-400 hover:text-stone-200"
						}`}
						onClick={toggleShowDiscreteTiles}
					>
						Tile Area
					</button>
					<button
						aria-pressed={showGrid}
						type="button"
						className={`rounded px-2 py-1 text-[11px] font-medium ${
							showGrid
								? "bg-amber-500/20 text-amber-300"
								: "text-stone-400 hover:text-stone-200"
						}`}
						onClick={toggleShowGrid}
					>
						Grid
					</button>
					<button
						aria-pressed={showIcons}
						type="button"
						className={`rounded px-2 py-1 text-[11px] font-medium ${
							showIcons
								? "bg-amber-500/20 text-amber-300"
								: "text-stone-400 hover:text-stone-200"
						}`}
						onClick={toggleShowIcons}
					>
						Icons
					</button>
					<button
						aria-label="Toggle parchment or dark canvas theme"
						className="rounded px-1.5 py-1 text-stone-400 hover:text-amber-300"
						type="button"
						onClick={(): void => {
							setCanvasTheme(canvasTheme === "dark" ? "parchment" : "dark");
						}}
					>
						<SunIcon aria-hidden="true" className="h-3.5 w-3.5" />
					</button>
				</div>

				<button
					className="inline-flex items-center gap-1 rounded-md border border-amber-500/35 bg-amber-500/15 px-2.5 py-1.5 font-medium text-amber-300 hover:bg-amber-500/25"
					type="button"
					onClick={(): void => {
						onOpenModal("templates");
					}}
				>
					<SparklesIcon aria-hidden="true" className="h-3.5 w-3.5" />
					<span>Layouts</span>
				</button>

				<button
					className="inline-flex items-center gap-1 rounded-md border border-stone-800 bg-stone-900 px-2.5 py-1.5 font-medium text-stone-200 hover:border-amber-400/40 hover:text-amber-300"
					type="button"
					onClick={(): void => {
						onOpenModal("io");
					}}
				>
					<FolderOpenIcon aria-hidden="true" className="h-3.5 w-3.5" />
					<span>File</span>
				</button>

				<button
					aria-label="Export PNG image"
					className="inline-flex items-center gap-1 rounded-md border border-stone-800 bg-stone-900 px-2 py-1.5 font-medium text-stone-200 hover:border-amber-400/40 hover:text-amber-300"
					type="button"
					onClick={handleExportPng}
				>
					<CameraIcon aria-hidden="true" className="h-3.5 w-3.5" />
					<span className="hidden sm:inline">PNG</span>
				</button>

				<button
					aria-label="Clear board"
					className="rounded-md border border-red-900/50 bg-red-950/30 px-2 py-1.5 font-medium text-red-300 hover:bg-red-900/40"
					type="button"
					onClick={clearBoard}
				>
					Clear
				</button>

				<button
					aria-label="Keyboard shortcuts and help"
					className="rounded-md border border-stone-800 bg-stone-900 p-1.5 text-stone-300 hover:text-amber-300"
					type="button"
					onClick={(): void => {
						onOpenModal("shortcuts");
					}}
				>
					<QuestionMarkCircleIcon aria-hidden="true" className="h-4 w-4" />
				</button>
			</div>
		</header>
	);
};
