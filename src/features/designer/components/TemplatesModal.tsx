import {
	ArrowDownTrayIcon,
	ArrowUpTrayIcon,
	SparklesIcon,
	XMarkIcon,
} from "@heroicons/react/24/outline";
import { useEffect, useId, useRef, useState } from "react";
import type { FunctionComponent } from "../../../common/types";
import { useDesignerStore } from "../../../store/designerStore";
import {
	parseLayoutJson,
	serializeAnnoDesignerAdJson,
	serializePlaygroundJson,
} from "../gridMath";
import { STARTER_TEMPLATES } from "../starterTemplates";

export type ModalTab = "templates" | "io" | "shortcuts";

export type TemplatesModalProps = {
	readonly isOpen: boolean;
	readonly activeTab: ModalTab;
	readonly onTabChange: (tab: ModalTab) => void;
	readonly onClose: () => void;
};

const triggerFileDownload = (
	filename: string,
	content: string,
	mimeType: string
): void => {
	const blob = new Blob([content], { type: mimeType });
	const objectUrl = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = objectUrl;
	anchor.download = filename;
	document.body.append(anchor);
	anchor.click();
	anchor.remove();
	URL.revokeObjectURL(objectUrl);
};

export const TemplatesModal = ({
	isOpen,
	activeTab,
	onTabChange,
	onClose,
}: TemplatesModalProps): FunctionComponent => {
	const dialogRef = useRef<HTMLDialogElement | null>(null);
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const titleId = useId();
	const jsonTextareaId = useId();
	const gridWidthInputId = useId();
	const gridHeightInputId = useId();

	const [jsonInput, setJsonInput] = useState<string>("");
	const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

	const layoutName = useDesignerStore((state) => state.layoutName);
	const gridWidth = useDesignerStore((state) => state.gridWidth);
	const gridHeight = useDesignerStore((state) => state.gridHeight);
	const buildings = useDesignerStore((state) => state.buildings);
	const loadTemplateById = useDesignerStore((state) => state.loadTemplateById);
	const importBuildings = useDesignerStore((state) => state.importBuildings);
	const clearBoard = useDesignerStore((state) => state.clearBoard);
	const setGridDimensions = useDesignerStore(
		(state) => state.setGridDimensions
	);

	// Open / close native modal <dialog>
	useEffect((): void => {
		const dialog = dialogRef.current;
		if (!dialog) {
			return;
		}
		if (isOpen && !dialog.open) {
			dialog.showModal();
		} else if (!isOpen && dialog.open) {
			dialog.close();
		}
	}, [isOpen]);

	// Safari / legacy fallback when HTMLDialogElement.prototype lacks closedBy
	useEffect((): (() => void) => {
		const dialog = dialogRef.current;
		if (!dialog) {
			return (): void => {};
		}

		const handleNativeClose = (): void => {
			dialog.returnValue = "";
			onClose();
		};
		dialog.addEventListener("close", handleNativeClose);

		let handlePointerDown: ((event: PointerEvent) => void) | null = null;
		let handlePointerUp: ((event: PointerEvent) => void) | null = null;

		if (
			typeof HTMLDialogElement !== "undefined" &&
			!("closedBy" in HTMLDialogElement.prototype)
		) {
			let pressedOutside = false;
			const isPointerOutside = (event: PointerEvent): boolean => {
				const bounds = dialog.getBoundingClientRect();
				return (
					event.clientX < bounds.left ||
					event.clientX > bounds.right ||
					event.clientY < bounds.top ||
					event.clientY > bounds.bottom
				);
			};

			handlePointerDown = (event: PointerEvent): void => {
				pressedOutside = isPointerOutside(event);
			};
			handlePointerUp = (event: PointerEvent): void => {
				if (pressedOutside && isPointerOutside(event)) {
					dialog.close();
				}
				pressedOutside = false;
			};

			dialog.addEventListener("pointerdown", handlePointerDown);
			dialog.addEventListener("pointerup", handlePointerUp);
		}

		return (): void => {
			dialog.removeEventListener("close", handleNativeClose);
			if (handlePointerDown) {
				dialog.removeEventListener("pointerdown", handlePointerDown);
			}
			if (handlePointerUp) {
				dialog.removeEventListener("pointerup", handlePointerUp);
			}
		};
	}, [onClose]);

	const handleImportText = (rawText: string): void => {
		try {
			const parsed = parseLayoutJson(rawText);
			importBuildings(parsed.layoutName, parsed.buildings);
			setJsonInput("");
			setFeedbackMessage(null);
			onClose();
		} catch (error) {
			setFeedbackMessage(
				error instanceof Error
					? error.message
					: "Could not parse layout JSON file."
			);
		}
	};

	const safeSlug =
		layoutName
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "") || "anno-1404-layout";

	return (
		<dialog
			ref={dialogRef}
			aria-labelledby={titleId}
			className="m-auto w-[calc(100%-1.25rem)] max-w-2xl rounded-xl border border-amber-500/30 bg-stone-950 p-0 text-stone-100 shadow-2xl sm:w-full"
			{...({ closedby: "any" } as Record<string, unknown>)}
		>
			<div className="flex items-center justify-between border-b border-stone-800 px-4 py-3 sm:px-5 sm:py-3.5">
				<h2 className="text-base font-semibold text-amber-300" id={titleId}>
					Anno 1404 Layout Studio
				</h2>
				<button
					aria-label="Close modal"
					className="anno-touch-target inline-flex items-center justify-center rounded-md p-1 text-stone-400 hover:bg-stone-800 hover:text-stone-100"
					type="button"
					onClick={(): void => {
						dialogRef.current?.close();
					}}
				>
					<XMarkIcon aria-hidden="true" className="h-5 w-5" />
				</button>
			</div>

			{/* Modal Navigation Tabs */}
			<div className="flex gap-1 overflow-x-auto border-b border-stone-800 bg-stone-900/60 px-3 py-2 text-xs sm:px-5">
				{(
					[
						{
							id: "templates",
							label: "Starter Layouts",
							shortLabel: "Templates",
						},
						{
							id: "io",
							label: "Import / Export & Grid",
							shortLabel: "Import / Grid",
						},
						{
							id: "shortcuts",
							label: "Controls & Shortcuts",
							shortLabel: "Controls",
						},
					] as const
				).map((tab) => (
					<button
						key={tab.id}
						type="button"
						className={`anno-touch-target inline-flex flex-1 shrink-0 items-center justify-center rounded-md px-2.5 py-1.5 font-medium whitespace-nowrap transition sm:flex-initial sm:px-3 ${
							activeTab === tab.id
								? "bg-amber-400 text-stone-950"
								: "text-stone-300 hover:bg-stone-800"
						}`}
						onClick={(): void => {
							onTabChange(tab.id);
							setFeedbackMessage(null);
						}}
					>
						<span className="sm:hidden">{tab.shortLabel}</span>
						<span className="hidden sm:inline">{tab.label}</span>
					</button>
				))}
			</div>

			<div
				className="max-h-[72dvh] overflow-y-auto overscroll-contain p-4 sm:p-5"
				style={{ scrollbarGutter: "stable" }}
			>
				{activeTab === "templates" && (
					<div className="flex flex-col gap-3">
						<p className="text-xs text-stone-400">
							Load a pre-built Anno 1404 settlement or production block to
							experiment with service radii, road connections, and footprints.
						</p>
						{STARTER_TEMPLATES.map((template) => (
							<div
								key={template.id}
								className="flex flex-col justify-between gap-3 rounded-lg border border-stone-800 bg-stone-900/70 p-3.5 sm:flex-row sm:items-center sm:p-4"
							>
								<div>
									<div className="flex flex-wrap items-center gap-2">
										<h3 className="text-sm font-semibold text-stone-100">
											{template.name}
										</h3>
										<span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-300 uppercase">
											{template.region}
										</span>
									</div>
									<p className="mt-0.5 font-mono text-[11px] text-amber-400/90">
										{template.subtitle}
									</p>
									<p className="mt-1 text-xs text-stone-400">
										{template.description}
									</p>
								</div>
								<button
									className="anno-touch-target inline-flex w-full shrink-0 items-center justify-center gap-1.5 rounded-md bg-amber-400 px-3.5 py-2 text-xs font-semibold text-stone-950 hover:bg-amber-300 sm:w-auto"
									type="button"
									onClick={(): void => {
										loadTemplateById(template.id);
										onClose();
									}}
								>
									<SparklesIcon aria-hidden="true" className="h-4 w-4" />
									Load Layout
								</button>
							</div>
						))}

						<div className="flex flex-col justify-between gap-3 rounded-lg border border-dashed border-stone-700 bg-stone-900/30 p-3.5 sm:flex-row sm:items-center sm:p-4">
							<div>
								<h3 className="text-sm font-semibold text-stone-200">
									Blank Drafting Grid
								</h3>
								<p className="text-xs text-stone-400">
									Clear all placed buildings and start a fresh Anno 1404 layout
									from scratch.
								</p>
							</div>
							<button
								className="anno-touch-target w-full shrink-0 rounded-md border border-stone-700 bg-stone-800 px-3.5 py-2 text-xs font-medium text-stone-200 hover:border-amber-400/50 hover:text-amber-300 sm:w-auto"
								type="button"
								onClick={(): void => {
									clearBoard();
									onClose();
								}}
							>
								Start Empty
							</button>
						</div>
					</div>
				)}

				{activeTab === "io" && (
					<div className="flex flex-col gap-5">
						{/* Export */}
						<div>
							<h3 className="text-xs font-semibold tracking-wider text-stone-300 uppercase">
								Export Current Layout ({buildings.length} objects)
							</h3>
							<div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
								<button
									className="anno-touch-target inline-flex items-center justify-center gap-1.5 rounded-md bg-amber-400 px-3.5 py-2 text-xs font-semibold text-stone-950 hover:bg-amber-300"
									type="button"
									onClick={(): void => {
										const content = serializePlaygroundJson({
											layoutName,
											gridWidth,
											gridHeight,
											buildings,
										});
										triggerFileDownload(
											`${safeSlug}.json`,
											content,
											"application/json"
										);
									}}
								>
									<ArrowDownTrayIcon aria-hidden="true" className="h-4 w-4" />
									Download Web JSON (.json)
								</button>
								<button
									className="anno-touch-target inline-flex items-center justify-center gap-1.5 rounded-md border border-stone-700 bg-stone-800 px-3.5 py-2 text-xs font-medium text-stone-100 hover:border-amber-400/50 hover:text-amber-300"
									type="button"
									onClick={(): void => {
										const content = serializeAnnoDesignerAdJson(buildings);
										triggerFileDownload(
											`${safeSlug}.ad`,
											content,
											"application/json"
										);
									}}
								>
									<ArrowDownTrayIcon aria-hidden="true" className="h-4 w-4" />
									Export Anno Designer (.ad)
								</button>
							</div>
						</div>

						{/* Import */}
						<div className="border-t border-stone-800 pt-4">
							<h3 className="text-xs font-semibold tracking-wider text-stone-300 uppercase">
								Import Layout (.json or Anno Designer .ad)
							</h3>
							<div className="mt-2 flex items-center gap-2">
								<input
									ref={fileInputRef}
									accept=".json,.ad,application/json"
									className="hidden"
									type="file"
									onChange={(event): void => {
										const file = event.target.files?.[0];
										if (!file) {
											return;
										}
										void file.text().then((text) => {
											handleImportText(text);
										});
									}}
								/>
								<button
									className="anno-touch-target inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-stone-700 bg-stone-800 px-3.5 py-2 text-xs font-medium text-stone-100 hover:border-amber-400/50 hover:text-amber-300 sm:w-auto"
									type="button"
									onClick={(): void => {
										fileInputRef.current?.click();
									}}
								>
									<ArrowUpTrayIcon aria-hidden="true" className="h-4 w-4" />
									Choose .json / .ad File
								</button>
							</div>

							<div className="mt-3">
								<label
									className="block text-xs text-stone-400"
									htmlFor={jsonTextareaId}
								>
									Or paste layout JSON directly:
								</label>
								<textarea
									className="mt-1 h-24 w-full rounded-md border border-stone-700 bg-stone-900 p-2 font-mono text-base text-stone-200 placeholder:text-stone-600 focus:border-amber-400 focus:outline-none sm:text-xs"
									id={jsonTextareaId}
									placeholder='{"format": "anno-1404-layout-playground", ...}'
									value={jsonInput}
									onChange={(event): void => {
										setJsonInput(event.target.value);
									}}
								/>
								{feedbackMessage && (
									<p className="mt-1 text-xs text-red-400">{feedbackMessage}</p>
								)}
								{jsonInput.trim().length > 0 && (
									<button
										className="anno-touch-target mt-2 w-full rounded-md bg-amber-400 px-3 py-2 text-xs font-semibold text-stone-950 hover:bg-amber-300 sm:w-auto sm:py-1.5"
										type="button"
										onClick={(): void => {
											handleImportText(jsonInput);
										}}
									>
										Load Pasted JSON
									</button>
								)}
							</div>
						</div>

						{/* Grid Dimensions */}
						<div className="border-t border-stone-800 pt-4">
							<h3 className="text-xs font-semibold tracking-wider text-stone-300 uppercase">
								Island Grid Dimensions (30 – 250 tiles)
							</h3>
							<div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
								<div className="flex items-center gap-1.5">
									<label className="text-stone-400" htmlFor={gridWidthInputId}>
										Width:
									</label>
									<input
										className="w-20 rounded border border-stone-700 bg-stone-900 px-2 py-1 font-mono text-base text-stone-100 sm:text-xs"
										id={gridWidthInputId}
										max={250}
										min={30}
										type="number"
										value={gridWidth}
										onChange={(event): void => {
											setGridDimensions(Number(event.target.value), gridHeight);
										}}
									/>
								</div>
								<div className="flex items-center gap-1.5">
									<label className="text-stone-400" htmlFor={gridHeightInputId}>
										Height:
									</label>
									<input
										className="w-20 rounded border border-stone-700 bg-stone-900 px-2 py-1 font-mono text-base text-stone-100 sm:text-xs"
										id={gridHeightInputId}
										max={250}
										min={30}
										type="number"
										value={gridHeight}
										onChange={(event): void => {
											setGridDimensions(gridWidth, Number(event.target.value));
										}}
									/>
								</div>
							</div>
						</div>
					</div>
				)}

				{activeTab === "shortcuts" && (
					<div className="flex flex-col gap-4">
						<div>
							<h3 className="text-xs font-semibold tracking-wider text-amber-300 uppercase">
								Touch &amp; Mobile Gestures
							</h3>
							<div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
								{[
									{
										gesture: "2-Finger Pinch / Drag",
										action: "Zoom & pan canvas in any tool",
									},
									{
										gesture: "1-Finger Drag (Empty)",
										action: "Pan grid in Select mode",
									},
									{
										gesture: "Tap / Drag Building",
										action: "Select or snap-move structure",
									},
									{
										gesture: "Hold & Slide (Place)",
										action: "Preview radius, lift finger to place",
									},
									{
										gesture: "1-Finger Stroke",
										action: "Paint roads or erase along path",
									},
									{
										gesture: "+ Multi Toggle",
										action: "Tap or box-drag multiple items",
									},
								].map((item) => (
									<div
										key={item.gesture}
										className="flex items-center justify-between gap-2 rounded border border-stone-800 bg-stone-900/60 px-3 py-2 text-xs"
									>
										<span className="text-stone-300">{item.action}</span>
										<span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 font-mono text-[10px] text-amber-300">
											{item.gesture}
										</span>
									</div>
								))}
							</div>
						</div>

						<div>
							<h3 className="text-xs font-semibold tracking-wider text-stone-300 uppercase">
								Keyboard &amp; Mouse Shortcuts
							</h3>
							<div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
								{[
									{
										key: "V / Esc",
										action: "Select & Move tool / Cancel brush",
									},
									{ key: "B", action: "Place armed building preset" },
									{ key: "D", action: "Road brush (click & drag to paint)" },
									{
										key: "Shift + Drag",
										action: "Paint orthogonal straight road",
									},
									{ key: "R", action: "Rotate brush or selected building" },
									{ key: "E", action: "Eraser brush (drag to erase)" },
									{
										key: "I / Alt+Click",
										action: "Eyedropper (pick building)",
									},
									{ key: "H / Space+Drag", action: "Pan canvas" },
									{ key: "Right-Drag", action: "Pan canvas anywhere" },
									{
										key: "Right-Click",
										action: "Quick-erase tile or cancel brush",
									},
									{ key: "Mouse Wheel", action: "Zoom toward cursor" },
									{ key: "Ctrl/Cmd + D", action: "Duplicate selected block" },
									{ key: "Ctrl/Cmd + Z / Y", action: "Undo / Redo" },
									{
										key: "Delete / Backspace",
										action: "Remove selected items",
									},
								].map((shortcut) => (
									<div
										key={shortcut.key}
										className="flex items-center justify-between gap-2 rounded border border-stone-800 bg-stone-900/60 px-3 py-2 text-xs"
									>
										<span className="text-stone-300">{shortcut.action}</span>
										<kbd className="shrink-0 rounded bg-stone-800 px-1.5 py-0.5 font-mono text-[11px] text-amber-300">
											{shortcut.key}
										</kbd>
									</div>
								))}
							</div>
						</div>
					</div>
				)}
			</div>
		</dialog>
	);
};
