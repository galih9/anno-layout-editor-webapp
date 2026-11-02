import {
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
} from "@heroicons/react/24/outline";
import type Konva from "konva";
import { useId } from "react";
import type { FunctionComponent } from "../../../common/types";
import { useDesignerStore } from "../../../store/designerStore";
import type { ActiveTool, InfluenceDisplayMode } from "../types";
import type { ModalTab } from "./TemplatesModal";

export type TopToolbarProps = {
	readonly onOpenModal: (tab: ModalTab) => void;
	readonly stageRef: React.RefObject<Konva.Stage | null>;
};

export const TopToolbar = ({
	onOpenModal,
	stageRef,
}: TopToolbarProps): FunctionComponent => {
	const layoutNameInputId = useId();
	const influenceSelectId = useId();

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
	const toggleShowLabels = useDesignerStore((state) => state.toggleShowLabels);
	const toggleShowDiscreteTiles = useDesignerStore(
		(state) => state.toggleShowDiscreteTiles
	);
	const setInfluenceMode = useDesignerStore((state) => state.setInfluenceMode);
	const setCanvasTheme = useDesignerStore((state) => state.setCanvasTheme);
	const clearBoard = useDesignerStore((state) => state.clearBoard);

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
						aria-pressed={showLabels}
						type="button"
						className={`rounded px-2 py-1 text-[11px] font-medium ${
							showLabels
								? "bg-amber-500/20 text-amber-300"
								: "text-stone-400 hover:text-stone-200"
						}`}
						onClick={toggleShowLabels}
					>
						Labels
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
