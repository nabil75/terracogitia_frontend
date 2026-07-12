import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  Output,
  ViewChild,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import {
  ActiveSelection,
  Canvas,
  Circle,
  FabricObject,
  FabricText,
  Group,
  IText,
  Line,
  Point,
  Polygon,
  Polyline,
  Rect,
  Triangle,
  controlsUtils,
  util,
} from 'fabric';
import type { ControlActionHandler, TPointerEvent, TransformActionHandler } from 'fabric';
import { finalize } from 'rxjs/operators';
import { ApiService } from '../../api/api.service';

export type DrawingToolKind =
  | 'rect'
  | 'circle'
  | 'triangle'
  | 'diamond'
  | 'trapezoid'
  | 'arrow'
  | 'text';

const FABRIC_EXTRA_PROPS = [
  'terraKind',
  'terraId',
  'terraFromId',
  'terraToId',
  'terraLinkId',
  'terraConnectorPart',
  'terraPoints',
  'terraPolyArrowId',
  'terraPolyArrowPart',
  'terraSegmentIndex',
  'terraCaptionOfId',
  'terraCaptionOffsetX',
  'terraCaptionOffsetY',
];
const LINKABLE_KINDS = new Set(['rect', 'circle', 'triangle', 'diamond', 'trapezoid']);
const CONNECTOR_EDGE_CONTROLS = ['ml', 'mr', 'mt', 'mb'] as const;
const CONNECTOR_CORNER_CONTROLS = ['tl', 'tr', 'bl', 'br'] as const;
const CONNECTOR_HEAD_SIZE = 14;
const POLY_ARROW_HANDLE_RADIUS = 6;
const POLY_ARROW_SHAPE_SNAP_DISTANCE = 24;
const LABEL_FONT_SIZE_MIN = 5;
const LABEL_FONT_SIZE_MAX = 24;
const LABEL_FONT_SIZE_STEP = 1;
const LABEL_FONT_SIZE_DEFAULT = 13;
const CANVAS_ZOOM_MIN = 0.25;
const CANVAS_ZOOM_MAX = 4;
const CANVAS_ZOOM_STEP = 0.1;
const CANVAS_ZOOM_DEFAULT = 1;

const existingFabricCustomProps = FabricObject.customProperties ?? [];
FabricObject.customProperties = [
  ...existingFabricCustomProps,
  ...FABRIC_EXTRA_PROPS.filter((prop) => !existingFabricCustomProps.includes(prop)),
];

interface ConnectorDraft {
  source: FabricObject;
  preview: Line;
}

interface PolyArrowDraft {
  points: Point[];
  preview: Line;
  segments: Line[];
  handles: Circle[];
  draggingHandleIndex: number | null;
}

export interface DrawingData {
  idObjet: string;
  objectLabel: string;
}

export type DrawingResult = 'saved' | 'deleted' | undefined;

export const DRAWING_DIALOG_INITIAL_WIDTH = '96vw';
export const DRAWING_DIALOG_INITIAL_HEIGHT = '88vh';
export const DRAWING_DIALOG_MAXIMIZED_WIDTH = '100vw';
export const DRAWING_DIALOG_MAXIMIZED_HEIGHT = '100vh';
export const DRAWING_DIALOG_MAXIMIZED_PANEL_CLASS = 'app-drawing-dialog--maximized';

@Component({
  selector: 'app-drawing-editor',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    TranslateModule,
  ],
  templateUrl: './drawing-editor.component.html',
  styleUrl: './drawing-editor.component.scss',
})
export class DrawingEditorComponent implements AfterViewInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly translate = inject(TranslateService);

  @Input({ required: true }) idObjet!: string;
  @Input() objectLabel = '';

  @Output() saved = new EventEmitter<void>();
  @Output() deleted = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  @ViewChild('canvasWrap') canvasWrap?: ElementRef<HTMLDivElement>;
  @ViewChild('canvasHost') canvasHost?: ElementRef<HTMLDivElement>;

  loading = true;
  loadError = '';
  saving = false;
  deleting = false;
  saveError = '';
  hasDessin = false;
  polyArrowModeActive = false;
  canvasZoomPercent = 100;
  readonly labelFontSizeMin = LABEL_FONT_SIZE_MIN;
  readonly labelFontSizeMax = LABEL_FONT_SIZE_MAX;
  readonly labelFontSizeStep = LABEL_FONT_SIZE_STEP;
  labelFontSize = LABEL_FONT_SIZE_DEFAULT;
  labelFontSizeSliderEnabled = false;
  labelFontSizeMixed = false;
  labelFontSizeSelectionCount = 0;

  readonly primaryTools: { kind: DrawingToolKind; icon: string; labelKey: string }[] = [
    { kind: 'rect', icon: 'crop_square', labelKey: 'drawing.toolRect' },
    { kind: 'circle', icon: 'circle', labelKey: 'drawing.toolCircle' },
    { kind: 'triangle', icon: 'change_history', labelKey: 'drawing.toolTriangle' },
    { kind: 'diamond', icon: 'diamond', labelKey: 'drawing.toolDiamond' },
    { kind: 'trapezoid', icon: 'pentagon', labelKey: 'drawing.toolTrapezoid' },
    { kind: 'text', icon: 'text_fields', labelKey: 'drawing.toolText' },
  ];

  readonly secondaryTools: { kind: DrawingToolKind; icon: string; labelKey: string }[] = [
    { kind: 'arrow', icon: 'arrow_forward', labelKey: 'drawing.toolArrow' },
  ];

  private canvas: Canvas | null = null;
  private viewReady = false;
  private pendingDessin: Record<string, unknown> | null = null;
  private dessinFetchDone = false;
  private resizeObserver: ResizeObserver | null = null;
  private connectorDraft: ConnectorDraft | null = null;
  private polyArrowDraft: PolyArrowDraft | null = null;
  private polyArrowEditHandles: Circle[] = [];
  private polyArrowEditTarget: string | null = null;
  private readonly canvasKeyDownHandler = (event: KeyboardEvent): void =>
    this.handleCanvasKeyDown(event);
  private readonly windowResizeHandler = (): void => this.syncCanvasToWrapSize();
  private readonly canvasWheelHandler = (event: WheelEvent): void =>
    this.onCanvasWheel(event);

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.loadDessin();
  }

  ngOnDestroy(): void {
    this.clearPolyArrowEditHandles();
    this.unbindCanvasResize();
    this.unbindCanvasWheel();
    this.unbindCanvasKeyboard();
    this.canvas?.dispose();
    this.canvas = null;
  }

  onToolDragStart(event: DragEvent, kind: DrawingToolKind): void {
    event.dataTransfer?.setData('application/x-terra-drawing-tool', kind);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'copy';
    }
  }

  onCanvasDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  onCanvasDrop(event: DragEvent): void {
    event.preventDefault();
    const kind = event.dataTransfer?.getData(
      'application/x-terra-drawing-tool'
    ) as DrawingToolKind;
    if (!kind || !this.canvas) {
      return;
    }
    const point = this.canvas.getScenePoint(event);
    this.addShape(kind, point.x, point.y);
  }

  deleteSelected(): void {
    if (!this.canvas) {
      return;
    }
    const active = this.canvas.getActiveObjects();
    if (!active.length) {
      return;
    }
    const polyArrowIds = new Set<string>();
    active.forEach((obj) => {
      if (this.isPolyArrow(obj)) {
        const id = (obj.get('terraPolyArrowId') ?? obj.get('terraId')) as
          | string
          | undefined;
        if (id) {
          polyArrowIds.add(id);
        }
      }
    });
    if (polyArrowIds.size) {
      this.clearPolyArrowEditHandles();
    }
    polyArrowIds.forEach((id) => this.removePolyArrow(id));
    const connectorLinkIds = new Set<string>();
    active.forEach((obj) => {
      if (this.isConnector(obj)) {
        const linkId = obj.get('terraLinkId') as string | undefined;
        if (linkId) {
          connectorLinkIds.add(linkId);
        }
      }
    });
    connectorLinkIds.forEach((linkId) => this.removeConnectorLink(linkId));
    active.forEach((obj) => {
      if (this.isConnector(obj) || this.isPolyArrow(obj)) {
        return;
      }
      if (this.isLinkableShape(obj)) {
        this.removeConnectorsForShape(obj);
      }
      this.canvas!.remove(obj);
    });
    this.canvas.discardActiveObject();
    this.canvas.requestRenderAll();
  }

  focusCanvas(): void {
    this.canvasWrap?.nativeElement.focus();
  }

  zoomIn(): void {
    if (!this.canvas) {
      return;
    }
    this.applyCanvasZoom(this.canvas.getZoom() + CANVAS_ZOOM_STEP);
  }

  zoomOut(): void {
    if (!this.canvas) {
      return;
    }
    this.applyCanvasZoom(this.canvas.getZoom() - CANVAS_ZOOM_STEP);
  }

  resetCanvasZoom(): void {
    if (!this.canvas) {
      return;
    }
    this.canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    this.canvasZoomPercent = Math.round(CANVAS_ZOOM_DEFAULT * 100);
    this.canvas.requestRenderAll();
  }

  onLabelFontSizeInput(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (!Number.isFinite(value)) {
      return;
    }
    this.setLabelFontSize(value);
  }

  private setLabelFontSize(size: number): void {
    const clamped = Math.min(
      LABEL_FONT_SIZE_MAX,
      Math.max(LABEL_FONT_SIZE_MIN, Math.round(size))
    );
    this.labelFontSize = clamped;
    this.labelFontSizeMixed = false;
    this.applyLabelFontSizeToSelection(clamped);
  }

  private applyLabelFontSizeToSelection(size: number): void {
    if (!this.canvas) {
      return;
    }
    const texts = this.getSelectedLabelTexts();
    if (!texts.length) {
      return;
    }
    for (const text of texts) {
      text.set({ fontSize: size });
      text.setCoords();
      text.group?.setCoords();
    }
    this.canvas.requestRenderAll();
  }

  private syncLabelFontSizeFromSelection(): void {
    const texts = this.getSelectedLabelTexts();
    this.labelFontSizeSelectionCount = texts.length;
    this.labelFontSizeSliderEnabled = texts.length > 0;
    if (!texts.length) {
      this.labelFontSizeMixed = false;
      return;
    }
    const sizes = texts.map((text) =>
      Math.round(Number(text.fontSize ?? LABEL_FONT_SIZE_DEFAULT))
    );
    this.labelFontSizeMixed = new Set(sizes).size > 1;
    this.labelFontSize = Math.min(
      LABEL_FONT_SIZE_MAX,
      Math.max(LABEL_FONT_SIZE_MIN, sizes[0])
    );
  }

  private getSelectedLabelTexts(): IText[] {
    if (!this.canvas) {
      return [];
    }
    const activeObjects = this.canvas.getActiveObjects();
    if (!activeObjects.length) {
      return [];
    }
    const texts: IText[] = [];
    const seen = new Set<IText>();

    const add = (obj: FabricObject): void => {
      if (!(obj instanceof IText) || !this.isLabelText(obj) || seen.has(obj)) {
        return;
      }
      seen.add(obj);
      texts.push(obj);
    };

    const collect = (obj: FabricObject): void => {
      if (obj instanceof ActiveSelection) {
        for (const child of obj.getObjects()) {
          collect(child);
        }
        return;
      }
      add(obj);
    };

    for (const obj of activeObjects) {
      collect(obj);
    }
    return texts;
  }

  private isLabelText(obj: FabricObject): boolean {
    if (!(obj instanceof IText)) {
      return false;
    }
    const kind = obj.get('terraKind');
    return kind === 'caption' || kind === 'text' || kind === 'arrowLabel';
  }

  private handleCanvasKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      if (this.polyArrowDraft) {
        event.preventDefault();
        this.cancelPolyArrowDraft();
        return;
      }
      if (this.polyArrowModeActive) {
        event.preventDefault();
        this.exitPolyArrowMode();
        return;
      }
    }
    if ((event.ctrlKey || event.metaKey) && !this.isTextEditingActive()) {
      if (event.key === '=' || event.key === '+') {
        event.preventDefault();
        this.zoomIn();
        return;
      }
      if (event.key === '-' || event.key === '_') {
        event.preventDefault();
        this.zoomOut();
        return;
      }
      if (event.key === '0') {
        event.preventDefault();
        this.resetCanvasZoom();
        return;
      }
    }
    if (event.key !== 'Delete' && event.key !== 'Backspace') {
      return;
    }
    if (this.isTextEditingActive()) {
      return;
    }
    if (!this.canvas?.getActiveObjects().length) {
      return;
    }
    event.preventDefault();
    this.deleteSelected();
  }

  togglePolyArrowMode(): void {
    if (this.polyArrowModeActive) {
      this.exitPolyArrowMode();
      return;
    }
    this.clearPolyArrowEditHandles();
    this.polyArrowModeActive = true;
    if (this.canvas) {
      this.canvas.discardActiveObject();
      this.canvas.selection = false;
      this.canvas.defaultCursor = 'crosshair';
      this.canvas.hoverCursor = 'crosshair';
      this.canvas.requestRenderAll();
    }
  }

  private exitPolyArrowMode(): void {
    this.polyArrowModeActive = false;
    this.cancelPolyArrowDraft();
    if (this.canvas) {
      this.canvas.selection = true;
      this.canvas.defaultCursor = 'default';
      this.canvas.hoverCursor = 'move';
      this.canvas.requestRenderAll();
    }
  }

  private isTextEditingActive(): boolean {
    const activeElement = document.activeElement;
    if (
      activeElement instanceof HTMLTextAreaElement &&
      activeElement.getAttribute('data-fabric') === 'textarea'
    ) {
      return true;
    }
    const active = this.canvas?.getActiveObject();
    return active instanceof IText && active.isEditing;
  }

  private bindCanvasKeyboard(): void {
    window.addEventListener('keydown', this.canvasKeyDownHandler);
  }

  private unbindCanvasKeyboard(): void {
    window.removeEventListener('keydown', this.canvasKeyDownHandler);
  }

  private bindCanvasWheel(): void {
    this.canvasWrap?.nativeElement.addEventListener('wheel', this.canvasWheelHandler, {
      passive: false,
    });
  }

  private unbindCanvasWheel(): void {
    this.canvasWrap?.nativeElement.removeEventListener('wheel', this.canvasWheelHandler);
  }

  private onCanvasWheel(event: WheelEvent): void {
    if (!this.canvas || this.isTextEditingActive()) {
      return;
    }
    if (!event.ctrlKey && !event.metaKey) {
      return;
    }
    event.preventDefault();
    const delta = event.deltaY > 0 ? -CANVAS_ZOOM_STEP : CANVAS_ZOOM_STEP;
    const point = this.canvas.getScenePoint(event as unknown as TPointerEvent);
    this.applyCanvasZoom(this.canvas.getZoom() + delta, point);
  }

  private applyCanvasZoom(zoom: number, point?: Point): void {
    if (!this.canvas) {
      return;
    }
    const clamped = Math.min(CANVAS_ZOOM_MAX, Math.max(CANVAS_ZOOM_MIN, zoom));
    const anchor =
      point ?? new Point(this.canvas.width / 2, this.canvas.height / 2);
    this.canvas.zoomToPoint(anchor, clamped);
    this.canvasZoomPercent = Math.round(clamped * 100);
    this.refreshPolyArrowsAfterViewportChange();
    this.canvas.requestRenderAll();
  }

  private refreshPolyArrowsAfterViewportChange(): void {
    if (this.polyArrowEditTarget) {
      this.refreshPolyArrowEditHandlePositions(this.polyArrowEditTarget);
    }
  }

  private bindCanvasResize(): void {
    if (!this.canvasWrap?.nativeElement || this.resizeObserver) {
      return;
    }
    this.resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry || !this.canvas) {
        return;
      }
      const width = Math.round(entry.contentRect.width);
      const height = Math.round(entry.contentRect.height);
      if (width < 1 || height < 1) {
        return;
      }
      if (this.canvas.width === width && this.canvas.height === height) {
        return;
      }
      this.canvas.setDimensions({ width, height });
      this.canvas.requestRenderAll();
    });
    this.resizeObserver.observe(this.canvasWrap.nativeElement);
    window.addEventListener('resize', this.windowResizeHandler);
  }

  syncCanvasToWrapSize(): void {
    if (!this.canvas || !this.canvasWrap) {
      return;
    }
    const { width, height } = this.getCanvasWrapSize();
    if (width < 1 || height < 1) {
      return;
    }
    if (this.canvas.width === width && this.canvas.height === height) {
      return;
    }
    this.canvas.setDimensions({ width, height });
    this.canvas.requestRenderAll();
  }

  private unbindCanvasResize(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    window.removeEventListener('resize', this.windowResizeHandler);
  }

  private getCanvasWrapSize(): { width: number; height: number } {
    const rect = this.canvasWrap?.nativeElement.getBoundingClientRect();
    return {
      width: Math.max(Math.round(rect?.width ?? 0), 1),
      height: Math.max(Math.round(rect?.height ?? 0), 1),
    };
  }

  save(): void {
    if (!this.canvas || this.saving) {
      return;
    }
    this.clearPolyArrowEditHandles();
    this.saving = true;
    this.saveError = '';
    const dessin = this.canvas.toObject(FABRIC_EXTRA_PROPS) as Record<string, unknown>;
    this.api
      .saveObjectDessin(this.idObjet, dessin)
      .pipe(finalize(() => (this.saving = false)))
      .subscribe({
        next: () => {
          this.hasDessin = true;
          this.saved.emit();
        },
        error: () => {
          this.saveError = this.translate.instant('drawing.saveError');
        },
      });
  }

  deleteDessin(): void {
    if (!this.hasDessin || this.deleting) {
      return;
    }
    this.deleting = true;
    this.saveError = '';
    this.api
      .deleteObjectDessin(this.idObjet)
      .pipe(finalize(() => (this.deleting = false)))
      .subscribe({
        next: () => {
          this.hasDessin = false;
          this.deleted.emit();
        },
        error: () => {
          this.saveError = this.translate.instant('drawing.deleteError');
        },
      });
  }

  cancel(): void {
    this.cancelled.emit();
  }

  private loadDessin(): void {
    this.loading = true;
    this.loadError = '';
    this.api.getObjectDessin(this.idObjet).subscribe({
      next: (res) => {
        this.hasDessin = res.has_dessin;
        this.pendingDessin = res.dessin ?? null;
        this.dessinFetchDone = true;
        this.loading = false;
        this.initCanvasIfReady();
      },
      error: () => {
        this.loadError = this.translate.instant('drawing.loadError');
        this.dessinFetchDone = true;
        this.loading = false;
      },
    });
  }

  private initCanvasIfReady(): void {
    if (!this.viewReady || !this.canvasHost || !this.dessinFetchDone || this.loadError) {
      return;
    }
    if (!this.canvas) {
      const el = document.createElement('canvas');
      this.canvasHost.nativeElement.appendChild(el);
      const { width, height } = this.getCanvasWrapSize();
      this.canvas = new Canvas(el, {
        width,
        height,
        backgroundColor: '#fafafa',
        selection: true,
        preserveObjectStacking: true,
      });
      this.canvas.on('mouse:dblclick', (opt) => this.onCanvasDoubleClick(opt));
      this.canvas.on('mouse:down', (opt) => this.onCanvasMouseDown(opt));
      this.canvas.on('mouse:move', (opt) => this.onCanvasMouseMove(opt));
      this.canvas.on('mouse:up', (opt) => this.onCanvasMouseUp(opt));
      this.canvas.on('object:moving', (opt) => {
        const target = opt.target;
        if (target && this.isPolyArrowHandle(target)) {
          this.onPolyArrowHandleMoving(target as Circle);
          return;
        }
        this.onObjectTransform(target);
      });
      this.canvas.on('object:scaling', (opt) => this.onObjectTransform(opt.target));
      this.canvas.on('object:rotating', (opt) => this.onObjectTransform(opt.target));
      this.canvas.on('object:modified', (opt) => {
        const target = opt.target;
        if (target && this.isPolyArrowHandle(target)) {
          this.onPolyArrowHandleModified(target as Circle);
          return;
        }
        if (target instanceof IText && this.isShapeCaption(target)) {
          this.syncCaptionOffsetFromShape(target);
        }
        this.onObjectTransform(target);
      });
      this.canvas.on('selection:created', () => this.onCanvasSelectionChange());
      this.canvas.on('selection:updated', () => this.onCanvasSelectionChange());
      this.canvas.on('selection:cleared', () => {
        this.clearPolyArrowEditHandles();
        this.syncLabelFontSizeFromSelection();
      });
      this.bindCanvasKeyboard();
      this.bindCanvasWheel();
      this.bindCanvasResize();
    }
    if (this.pendingDessin) {
      void this.canvas
        .loadFromJSON(this.pendingDessin)
        .then(() => {
          this.normalizeLoadedCanvas();
          this.syncCanvasToWrapSize();
          if (this.canvas) {
            this.canvasZoomPercent = Math.round(this.canvas.getZoom() * 100);
          }
          this.canvas?.requestRenderAll();
        })
        .catch(() => {
          this.loadError = this.translate.instant('drawing.loadError');
        });
    } else {
      this.canvas.clear();
      this.canvas.backgroundColor = '#fafafa';
      this.canvas.requestRenderAll();
    }
  }

  private onCanvasMouseDown(opt: {
    e?: TPointerEvent;
    scenePoint?: Point;
  }): void {
    if (!this.polyArrowModeActive || !this.canvas) {
      return;
    }
    const event = opt.e;
    if (event instanceof MouseEvent) {
      if (event.button !== 0 || event.detail >= 2) {
        return;
      }
    }
    if (this.isTextEditingActive()) {
      return;
    }
    const pointer =
      opt.scenePoint ?? (event ? this.canvas.getScenePoint(event) : null);
    if (!pointer) {
      return;
    }
    const handleIndex = this.findDraftHandleIndexAt(pointer);
    if (handleIndex !== null && this.polyArrowDraft) {
      this.polyArrowDraft.draggingHandleIndex = handleIndex;
      return;
    }
    this.addPolyArrowPoint(pointer);
  }

  private onCanvasMouseMove(opt: {
    e?: TPointerEvent;
    scenePoint?: Point;
  }): void {
    if (!this.canvas) {
      return;
    }
    const event = opt.e;
    const pointer =
      opt.scenePoint ?? (event ? this.canvas.getScenePoint(event) : null);
    if (!pointer) {
      return;
    }
    if (this.polyArrowDraft && this.polyArrowDraft.draggingHandleIndex !== null) {
      const draft = this.polyArrowDraft;
      const index = draft.draggingHandleIndex as number;
      draft.points[index] = new Point(pointer.x, pointer.y);
      this.rebuildPolyArrowDraftGeometry();
      return;
    }
    if (!this.polyArrowDraft?.preview) {
      return;
    }
    const last = this.polyArrowDraft.points[this.polyArrowDraft.points.length - 1];
    this.polyArrowDraft.preview.set({
      x1: last.x,
      y1: last.y,
      x2: pointer.x,
      y2: pointer.y,
    });
    this.polyArrowDraft.preview.setCoords();
    this.canvas.requestRenderAll();
  }

  private addPolyArrowPoint(pointer: Point): void {
    if (!this.canvas) {
      return;
    }
    if (!this.polyArrowDraft) {
      const preview = new Line([pointer.x, pointer.y, pointer.x, pointer.y], {
        stroke: '#455a64',
        strokeWidth: 2,
        strokeDashArray: [6, 4],
        selectable: false,
        evented: false,
      });
      const handle = this.createPolyArrowDraftHandle(pointer, 0);
      this.polyArrowDraft = {
        points: [pointer],
        preview,
        segments: [],
        handles: [handle],
        draggingHandleIndex: null,
      };
      this.canvas.add(preview);
      this.canvas.add(handle);
      this.canvas.requestRenderAll();
      return;
    }
    const points = this.polyArrowDraft.points;
    const prev = points[points.length - 1];
    if (Math.hypot(pointer.x - prev.x, pointer.y - prev.y) < 3) {
      return;
    }
    points.push(pointer);
    const segment = new Line([prev.x, prev.y, pointer.x, pointer.y], {
      stroke: '#455a64',
      strokeWidth: 2,
      selectable: false,
      evented: false,
    });
    this.polyArrowDraft.segments.push(segment);
    const handle = this.createPolyArrowDraftHandle(pointer, points.length - 1);
    this.polyArrowDraft.handles.push(handle);
    this.canvas.add(segment);
    this.canvas.add(handle);
    this.canvas.requestRenderAll();
  }

  private createPolyArrowDraftHandle(point: Point, index: number): Circle {
    return new Circle({
      left: point.x,
      top: point.y,
      radius: POLY_ARROW_HANDLE_RADIUS,
      fill: '#ffffff',
      stroke: '#1565c0',
      strokeWidth: 2,
      originX: 'center',
      originY: 'center',
      selectable: false,
      evented: false,
      terraKind: 'polyArrowDraftHandle',
      terraHandleIndex: index,
    } as Record<string, unknown>);
  }

  private findDraftHandleIndexAt(pointer: Point): number | null {
    if (!this.polyArrowDraft) {
      return null;
    }
    const threshold = POLY_ARROW_HANDLE_RADIUS + 6;
    for (let index = this.polyArrowDraft.points.length - 1; index >= 0; index--) {
      const point = this.polyArrowDraft.points[index];
      if (Math.hypot(pointer.x - point.x, pointer.y - point.y) <= threshold) {
        return index;
      }
    }
    return null;
  }

  private rebuildPolyArrowDraftGeometry(): void {
    const draft = this.polyArrowDraft;
    if (!draft || !this.canvas) {
      return;
    }
    draft.segments.forEach((segment, index) => {
      const start = draft.points[index];
      const end = draft.points[index + 1];
      segment.set({ x1: start.x, y1: start.y, x2: end.x, y2: end.y });
      segment.setCoords();
    });
    draft.handles.forEach((handle, index) => {
      const point = draft.points[index];
      handle.set({ left: point.x, top: point.y });
      handle.setCoords();
    });
    const last = draft.points[draft.points.length - 1];
    draft.preview.set({ x1: last.x, y1: last.y });
    draft.preview.setCoords();
    this.canvas.requestRenderAll();
  }

  private finishPolyArrowDraft(pointer?: Point, eventTarget?: FabricObject): void {
    if (!this.canvas || !this.polyArrowDraft) {
      return;
    }
    if (pointer) {
      const last = this.polyArrowDraft.points[this.polyArrowDraft.points.length - 1];
      if (Math.hypot(pointer.x - last.x, pointer.y - last.y) >= 3) {
        this.addPolyArrowPoint(pointer);
      }
    }
    const { preview, segments, points, handles } = this.polyArrowDraft;
    const canvas = this.canvas;
    canvas.remove(preview);
    handles.forEach((handle) => canvas.remove(handle));
    this.polyArrowDraft = null;
    if (points.length < 2) {
      segments.forEach((segment) => canvas.remove(segment));
      canvas.requestRenderAll();
      return;
    }
    segments.forEach((segment) => canvas.remove(segment));

    const toShape = this.resolveLinkableShapeForPoint(
      points[points.length - 1],
      eventTarget,
      null
    );
    const fromShape = this.resolveLinkableShapeForPoint(points[0], null, toShape);
    const fromId = fromShape ? this.ensureTerraId(fromShape) : undefined;
    const toId = toShape ? this.ensureTerraId(toShape) : undefined;
    const resolvedPoints = this.resolvePolyArrowPoints(points, fromId, toId);

    const polyArrowId = this.createPolyArrowFromScenePoints(resolvedPoints, {
      terraFromId: fromId,
      terraToId: toId,
    });
    const parts = this.getPolyArrowParts(polyArrowId);
    if (parts.shaft) {
      canvas.setActiveObject(parts.shaft);
    }
    canvas.requestRenderAll();
    this.exitPolyArrowMode();
    this.showPolyArrowEditHandles(polyArrowId);
  }

  private cancelPolyArrowDraft(): void {
    if (!this.polyArrowDraft || !this.canvas) {
      this.polyArrowDraft = null;
      return;
    }
    const { preview, segments, handles } = this.polyArrowDraft;
    this.canvas.remove(preview);
    segments.forEach((segment) => this.canvas!.remove(segment));
    handles.forEach((handle) => this.canvas!.remove(handle));
    this.polyArrowDraft = null;
    this.canvas.requestRenderAll();
  }

  private createPolyArrowFromScenePoints(
    scenePoints: Point[],
    links?: { terraFromId?: string; terraToId?: string },
    existingPolyArrowId?: string
  ): string {
    if (!this.canvas || scenePoints.length < 2) {
      return existingPolyArrowId ?? '';
    }
    const polyArrowId = existingPolyArrowId ?? crypto.randomUUID();
    const pointsJson = JSON.stringify(
      scenePoints.map((point) => ({ x: point.x, y: point.y }))
    );
    const commonPartProps = this.getPolyArrowPartProps(polyArrowId);

    const shaft = new Polyline(this.getPolyArrowShaftScenePoints(scenePoints), {
      ...commonPartProps,
      terraPolyArrowPart: 'shaft',
      terraPoints: pointsJson,
      terraFromId: links?.terraFromId,
      terraToId: links?.terraToId,
      terraId: polyArrowId,
      fill: '',
      stroke: '#455a64',
      strokeWidth: 2,
      strokeLineJoin: 'round',
      strokeLineCap: 'round',
    } as Record<string, unknown>);
    this.canvas.add(shaft);

    const head = new Polygon(
      [
        { x: 0, y: 0 },
        { x: -CONNECTOR_HEAD_SIZE, y: -CONNECTOR_HEAD_SIZE * 0.5 },
        { x: -CONNECTOR_HEAD_SIZE, y: CONNECTOR_HEAD_SIZE * 0.5 },
      ],
      {
        ...commonPartProps,
        terraPolyArrowPart: 'head',
        fill: '#455a64',
        stroke: '#37474f',
        strokeWidth: 1,
        originX: 'left',
        originY: 'top',
      } as Record<string, unknown>
    );
    this.canvas.add(head);
    this.positionPolyArrowHead(head, scenePoints);
    return polyArrowId;
  }

  private getPolyArrowPartProps(polyArrowId: string): Record<string, unknown> {
    return {
      terraKind: 'polyArrow',
      terraPolyArrowId: polyArrowId,
      selectable: true,
      evented: true,
      lockMovementX: true,
      lockMovementY: true,
      lockScaling: true,
      lockRotation: true,
      hasControls: false,
      hasBorders: false,
      objectCaching: false,
    };
  }

  private getPolyArrowShaftScenePoints(
    scenePoints: Point[]
  ): { x: number; y: number }[] {
    if (scenePoints.length < 2) {
      return [];
    }
    const shaftPoints = scenePoints.map((point) => ({ x: point.x, y: point.y }));
    const prev = scenePoints[scenePoints.length - 2];
    const tip = scenePoints[scenePoints.length - 1];
    const dx = tip.x - prev.x;
    const dy = tip.y - prev.y;
    const len = Math.hypot(dx, dy);
    if (len > CONNECTOR_HEAD_SIZE) {
      shaftPoints[shaftPoints.length - 1] = {
        x: tip.x - (dx / len) * CONNECTOR_HEAD_SIZE,
        y: tip.y - (dy / len) * CONNECTOR_HEAD_SIZE,
      };
    }
    return shaftPoints;
  }

  private positionPolyArrowHead(
    head: Polygon,
    scenePoints: Point[]
  ): void {
    if (scenePoints.length < 2) {
      return;
    }
    const prev = scenePoints[scenePoints.length - 2];
    const tip = scenePoints[scenePoints.length - 1];
    const angleDeg =
      (Math.atan2(tip.y - prev.y, tip.x - prev.x) * 180) / Math.PI;
    this.positionArrowHead(head, tip, angleDeg);
  }

  private getPolyArrowParts(polyArrowId: string): {
    shaft: Polyline | null;
    head: Polygon | null;
    meta: FabricObject | null;
    legacySegments: Line[];
  } {
    let shaft: Polyline | null = null;
    let head: Polygon | null = null;
    let meta: FabricObject | null = null;
    const legacySegments: Line[] = [];
    for (const obj of this.canvas?.getObjects() ?? []) {
      if (!this.isPolyArrowPart(obj) || obj.get('terraPolyArrowId') !== polyArrowId) {
        continue;
      }
      if (
        obj.isType('Polyline') &&
        (obj.get('terraPolyArrowPart') === 'shaft' ||
          (!obj.get('terraPolyArrowPart') && obj.get('terraKind') === 'polyArrow'))
      ) {
        shaft = obj as Polyline;
        meta = obj;
      } else if (obj.get('terraPolyArrowPart') === 'segment' && obj instanceof Line) {
        legacySegments.push(obj);
        if (obj.get('terraSegmentIndex') === 0) {
          meta = meta ?? obj;
        }
      } else if (obj.get('terraPolyArrowPart') === 'head' && obj instanceof Polygon) {
        head = obj;
      }
    }
    legacySegments.sort(
      (a, b) =>
        (a.get('terraSegmentIndex') as number) - (b.get('terraSegmentIndex') as number)
    );
    return { shaft, head, meta, legacySegments };
  }

  private applyScenePointsToPolyArrow(
    polyArrowId: string,
    scenePoints: Point[]
  ): void {
    if (scenePoints.length < 2) {
      return;
    }
    const parts = this.getPolyArrowParts(polyArrowId);
    if (parts.legacySegments.length > 0 && !parts.shaft) {
      this.rebuildPolyArrow(polyArrowId, scenePoints);
      return;
    }
    if (!parts.shaft || !parts.head) {
      this.rebuildPolyArrow(polyArrowId, scenePoints);
      return;
    }
    parts.shaft.set({ points: this.getPolyArrowShaftScenePoints(scenePoints) });
    parts.shaft.setCoords();
    this.positionPolyArrowHead(parts.head, scenePoints);
    this.persistPolyArrowStoredPoints(polyArrowId, scenePoints);
  }

  private rebuildPolyArrow(polyArrowId: string, scenePoints: Point[]): void {
    const parts = this.getPolyArrowParts(polyArrowId);
    const fromId = parts.meta?.get('terraFromId') as string | undefined;
    const toId = parts.meta?.get('terraToId') as string | undefined;
    const wasEditing = this.polyArrowEditTarget === polyArrowId;
    this.removePolyArrowPartsOnly(polyArrowId);
    this.createPolyArrowFromScenePoints(
      scenePoints,
      { terraFromId: fromId, terraToId: toId },
      polyArrowId
    );
    if (wasEditing) {
      this.showPolyArrowEditHandles(polyArrowId);
    }
  }

  private removePolyArrowPartsOnly(polyArrowId: string): void {
    if (!this.canvas) {
      return;
    }
    for (const obj of [...this.canvas.getObjects()]) {
      if (this.isPolyArrowPart(obj) && obj.get('terraPolyArrowId') === polyArrowId) {
        this.canvas.remove(obj);
      }
    }
  }

  private removePolyArrow(polyArrowId: string): void {
    if (!this.canvas) {
      return;
    }
    if (this.polyArrowEditTarget === polyArrowId) {
      this.clearPolyArrowEditHandles();
    }
    this.removePolyArrowPartsOnly(polyArrowId);
    for (const obj of [...this.canvas.getObjects()]) {
      if (obj instanceof Group && this.isPolyArrow(obj) && this.getTerraId(obj) === polyArrowId) {
        this.canvas.remove(obj);
      }
    }
  }

  private resolvePolyArrowPoints(
    points: Point[],
    fromId?: string,
    toId?: string
  ): Point[] {
    const resolved = points.map((point) => new Point(point.x, point.y));
    const from = fromId ? this.findObjectByTerraId(fromId) : null;
    const to = toId ? this.findObjectByTerraId(toId) : null;
    if (from && resolved.length >= 2) {
      resolved[0] = this.getBorderPoint(from, resolved[1]);
    }
    if (to && resolved.length >= 2) {
      resolved[resolved.length - 1] = this.getBorderPoint(
        to,
        resolved[resolved.length - 2]
      );
    }
    return resolved;
  }

  private getPolyArrowStoredPointsById(polyArrowId: string): Point[] {
    const meta = this.getPolyArrowMeta(polyArrowId);
    if (!meta) {
      return [];
    }
    try {
      const raw = JSON.parse(String(meta.get('terraPoints') ?? '[]')) as {
        x: number;
        y: number;
      }[];
      return raw.map((point) => new Point(point.x, point.y));
    } catch {
      return [];
    }
  }

  /** Sommets en coordonnées scène (alignés sur le tracé affiché). */
  private getPolyArrowScenePoints(polyArrowId: string): Point[] {
    const fromGeometry = this.reconstructPolyArrowScenePoints(polyArrowId);
    if (fromGeometry.length >= 2) {
      return fromGeometry;
    }
    return this.getPolyArrowStoredPointsById(polyArrowId);
  }

  private getPolyArrowScenePointsFromShaft(shaft: Polyline): Point[] {
    const offset = shaft.pathOffset;
    return shaft.points.map((point) =>
      util.transformPoint(
        new Point(point.x - offset.x, point.y - offset.y),
        shaft.calcTransformMatrix()
      )
    );
  }

  private getPolyArrowTipFromHead(head: Polygon): Point {
    return util.transformPoint(new Point(0, 0), head.calcTransformMatrix());
  }

  private reconstructPolyArrowScenePoints(polyArrowId: string): Point[] {
    const parts = this.getPolyArrowParts(polyArrowId);
    if (parts.legacySegments.length >= 1) {
      const points: Point[] = [];
      const first = parts.legacySegments[0];
      points.push(new Point(first.x1!, first.y1!));
      for (const segment of parts.legacySegments) {
        points.push(new Point(segment.x2!, segment.y2!));
      }
      return points;
    }
    if (!parts.shaft || parts.shaft.points.length < 2) {
      return [];
    }
    const points = this.getPolyArrowScenePointsFromShaft(parts.shaft);
    if (parts.head && points.length >= 1) {
      points[points.length - 1] = this.getPolyArrowTipFromHead(parts.head);
    }
    return points;
  }

  private persistPolyArrowStoredPoints(
    polyArrowId: string,
    scenePoints: Point[]
  ): void {
    const meta = this.getPolyArrowMeta(polyArrowId);
    if (!meta || scenePoints.length < 2) {
      return;
    }
    meta.set(
      'terraPoints',
      JSON.stringify(scenePoints.map((point) => ({ x: point.x, y: point.y })))
    );
  }

  private repairPolyArrowPartMarkers(polyArrowId: string): void {
    for (const obj of this.canvas?.getObjects() ?? []) {
      if (obj.get('terraPolyArrowId') !== polyArrowId) {
        continue;
      }
      if (obj.isType('Polyline') && !obj.get('terraPolyArrowPart')) {
        obj.set('terraPolyArrowPart', 'shaft');
      } else if (obj.isType('Polygon') && !obj.get('terraPolyArrowPart')) {
        obj.set('terraPolyArrowPart', 'head');
      }
    }
  }

  private migrateLegacyPolyArrowSegmentsToShaft(polyArrowId: string): void {
    const parts = this.getPolyArrowParts(polyArrowId);
    if (parts.shaft || parts.legacySegments.length === 0) {
      return;
    }
    const scenePoints = this.reconstructPolyArrowScenePoints(polyArrowId);
    if (scenePoints.length < 2) {
      return;
    }
    const fromId = parts.meta?.get('terraFromId') as string | undefined;
    const toId = parts.meta?.get('terraToId') as string | undefined;
    const wasEditing = this.polyArrowEditTarget === polyArrowId;
    this.removePolyArrowPartsOnly(polyArrowId);
    this.createPolyArrowFromScenePoints(
      scenePoints,
      { terraFromId: fromId, terraToId: toId },
      polyArrowId
    );
    if (wasEditing) {
      this.showPolyArrowEditHandles(polyArrowId);
    }
  }

  private repairLoadedPolyArrows(): void {
    if (!this.canvas) {
      return;
    }
    for (const obj of [...this.canvas.getObjects()]) {
      if (this.isPolyArrowHandle(obj)) {
        this.canvas.remove(obj);
      }
    }
    for (const group of [...this.getLegacyPolyArrowGroups()]) {
      this.migratePolyArrowGroupToParts(group);
    }
    const polyArrowIds = this.getPolyArrowIds();
    for (const polyArrowId of polyArrowIds) {
      this.repairPolyArrowPartMarkers(polyArrowId);
      this.migrateLegacyPolyArrowSegmentsToShaft(polyArrowId);
      this.normalizePolyArrowLinksById(polyArrowId);
      const scenePoints = this.reconstructPolyArrowScenePoints(polyArrowId);
      if (scenePoints.length < 2) {
        continue;
      }
      const meta = this.getPolyArrowMeta(polyArrowId);
      const fromId = meta?.get('terraFromId') as string | undefined;
      const toId = meta?.get('terraToId') as string | undefined;
      const resolved = this.resolvePolyArrowPoints(scenePoints, fromId, toId);
      this.rebuildPolyArrow(polyArrowId, resolved);
    }
  }

  private getPolyArrowStoredPointsFromGroup(group: Group): Point[] {
    const raw = JSON.parse(String(group.get('terraPoints') ?? '[]')) as {
      x: number;
      y: number;
    }[];
    return raw.map((point) => new Point(point.x, point.y));
  }

  private getPolyArrowMeta(polyArrowId: string): FabricObject | null {
    return this.getPolyArrowParts(polyArrowId).meta;
  }

  private updatePolyArrowById(polyArrowId: string): void {
    if (!this.canvas) {
      return;
    }
    const meta = this.getPolyArrowMeta(polyArrowId);
    if (!meta) {
      return;
    }
    const fromId = meta.get('terraFromId') as string | undefined;
    const toId = meta.get('terraToId') as string | undefined;
    if (!fromId && !toId) {
      return;
    }
    const rawPoints = this.getPolyArrowStoredPointsById(polyArrowId);
    if (rawPoints.length < 2) {
      return;
    }
    const resolvedPoints = this.resolvePolyArrowPoints(rawPoints, fromId, toId);
    this.applyScenePointsToPolyArrow(polyArrowId, resolvedPoints);
    if (this.polyArrowEditTarget === polyArrowId) {
      this.refreshPolyArrowEditHandlePositions(polyArrowId);
    }
    this.canvas.requestRenderAll();
  }

  private onCanvasSelectionChange(): void {
    if (!this.canvas || this.polyArrowModeActive) {
      return;
    }
    const target = this.canvas.getActiveObject();
    if (!target) {
      this.clearPolyArrowEditHandles();
      this.syncLabelFontSizeFromSelection();
      return;
    }
    if (this.isPolyArrowHandle(target)) {
      this.syncLabelFontSizeFromSelection();
      return;
    }
    if (this.isPolyArrowPart(target)) {
      const polyArrowId = target.get('terraPolyArrowId') as string;
      this.showPolyArrowEditHandles(polyArrowId);
      this.syncLabelFontSizeFromSelection();
      return;
    }
    this.clearPolyArrowEditHandles();
    this.syncLabelFontSizeFromSelection();
  }

  private showPolyArrowEditHandles(polyArrowId: string): void {
    if (!this.canvas) {
      return;
    }
    this.clearPolyArrowEditHandles();
    this.polyArrowEditTarget = polyArrowId;
    const meta = this.getPolyArrowMeta(polyArrowId);
    if (!meta) {
      return;
    }
    const fromId = meta.get('terraFromId') as string | undefined;
    const toId = meta.get('terraToId') as string | undefined;
    const points = this.getPolyArrowScenePoints(polyArrowId);
    if (points.length < 2) {
      return;
    }
    this.persistPolyArrowStoredPoints(polyArrowId, points);

    points.forEach((point, index) => {
      if (index === 0 && fromId) {
        return;
      }
      if (index === points.length - 1 && toId) {
        return;
      }
      const handle = new Circle({
        left: point.x,
        top: point.y,
        radius: POLY_ARROW_HANDLE_RADIUS,
        fill: '#ffffff',
        stroke: '#1565c0',
        strokeWidth: 2,
        originX: 'center',
        originY: 'center',
        hasControls: false,
        hasBorders: false,
        selectable: true,
        evented: true,
        terraKind: 'polyArrowHandle',
        terraPolyArrowId: polyArrowId,
        terraHandleIndex: index,
      } as Record<string, unknown>);
      this.canvas!.add(handle);
      this.canvas!.bringObjectToFront(handle);
      this.polyArrowEditHandles.push(handle);
    });
    this.canvas.requestRenderAll();
  }

  private applyPolyArrowScenePoints(polyArrowId: string, scenePoints: Point[]): void {
    const meta = this.getPolyArrowMeta(polyArrowId);
    const fromId = meta?.get('terraFromId') as string | undefined;
    const toId = meta?.get('terraToId') as string | undefined;
    const resolvedPoints = this.resolvePolyArrowPoints(scenePoints, fromId, toId);
    this.applyScenePointsToPolyArrow(polyArrowId, resolvedPoints);
    if (this.polyArrowEditTarget === polyArrowId) {
      this.refreshPolyArrowEditHandlePositions(polyArrowId);
    }
    this.canvas?.requestRenderAll();
  }

  private onPolyArrowHandleMoving(handle: Circle): void {
    this.applyPolyArrowHandlePosition(handle);
  }

  private onPolyArrowHandleModified(handle: Circle): void {
    this.applyPolyArrowHandlePosition(handle);
  }

  private applyPolyArrowHandlePosition(handle: Circle): void {
    if (!this.canvas) {
      return;
    }
    const polyArrowId = handle.get('terraPolyArrowId') as string | undefined;
    const index = handle.get('terraHandleIndex') as number | undefined;
    if (!polyArrowId || index === undefined) {
      return;
    }
    if (!this.getPolyArrowMeta(polyArrowId)) {
      this.clearPolyArrowEditHandles();
      return;
    }
    const points = this.getPolyArrowScenePoints(polyArrowId);
    const center = handle.getCenterPoint();
    points[index] = new Point(center.x, center.y);
    this.applyPolyArrowScenePoints(polyArrowId, points);
    const activeHandle = this.polyArrowEditHandles.find(
      (candidate) => (candidate.get('terraHandleIndex') as number) === index
    );
    if (activeHandle) {
      this.canvas.setActiveObject(activeHandle);
    } else {
      handle.setCoords();
    }
    this.canvas.requestRenderAll();
  }

  private refreshPolyArrowEditHandlePositions(polyArrowId: string): void {
    if (this.polyArrowEditTarget !== polyArrowId) {
      return;
    }
    const points = this.getPolyArrowScenePoints(polyArrowId);
    for (const handle of this.polyArrowEditHandles) {
      const index = handle.get('terraHandleIndex') as number;
      const point = points[index];
      if (!point) {
        continue;
      }
      handle.set({ left: point.x, top: point.y });
      handle.setCoords();
    }
  }

  private clearPolyArrowEditHandles(): void {
    if (this.canvas) {
      this.polyArrowEditHandles.forEach((handle) => this.canvas!.remove(handle));
    }
    this.polyArrowEditHandles = [];
    this.polyArrowEditTarget = null;
  }

  private getPolyArrowIds(): string[] {
    const ids = new Set<string>();
    for (const obj of this.canvas?.getObjects() ?? []) {
      if (obj.get('terraKind') !== 'polyArrow') {
        continue;
      }
      const polyArrowId = obj.get('terraPolyArrowId') as string | undefined;
      if (polyArrowId) {
        ids.add(polyArrowId);
        continue;
      }
      if (obj instanceof Group) {
        const groupId = this.getTerraId(obj);
        if (groupId) {
          ids.add(groupId);
        }
      }
    }
    return [...ids];
  }

  private getLegacyPolyArrowGroups(): Group[] {
    return (this.canvas?.getObjects() ?? []).filter(
      (obj): obj is Group => obj instanceof Group && obj.get('terraKind') === 'polyArrow'
    );
  }

  private migratePolyArrowGroupToParts(group: Group): void {
    if (!this.canvas) {
      return;
    }
    const points = this.getPolyArrowStoredPointsFromGroup(group);
    if (points.length < 2) {
      this.canvas.remove(group);
      return;
    }
    const fromId = group.get('terraFromId') as string | undefined;
    const toId = group.get('terraToId') as string | undefined;
    const existingId = this.getTerraId(group);
    const index = this.canvas.getObjects().indexOf(group);
    this.canvas.remove(group);
    const polyArrowId = this.createPolyArrowFromScenePoints(
      points,
      { terraFromId: fromId, terraToId: toId },
      existingId
    );
    const parts = this.getPolyArrowParts(polyArrowId);
    let insertAt = index;
    for (const part of [parts.shaft, parts.head]) {
      if (!part) {
        continue;
      }
      this.canvas.moveObjectTo(part, insertAt);
      insertAt += 1;
    }
  }

  private isPolyArrow(obj: FabricObject): boolean {
    return obj.get('terraKind') === 'polyArrow';
  }

  private isPolyArrowPart(obj: FabricObject): boolean {
    return this.isPolyArrow(obj) && !!obj.get('terraPolyArrowPart');
  }

  private isPolyArrowHandle(obj: FabricObject): boolean {
    return obj.get('terraKind') === 'polyArrowHandle';
  }

  private onCanvasDoubleClick(opt: {
    target?: FabricObject;
    subTargets?: FabricObject[];
    e?: Event;
    scenePoint?: Point;
  }): void {
    if (this.polyArrowModeActive && this.canvas) {
      const pointer =
        opt.scenePoint ??
        (opt.e ? this.canvas.getScenePoint(opt.e as TPointerEvent) : null);
      this.finishPolyArrowDraft(pointer ?? undefined, opt.target);
      return;
    }
    const text = this.findEditableText(opt.target, opt.subTargets);
    if (text && this.canvas) {
      this.canvas.setActiveObject(text);
      text.enterEditing(opt.e as MouseEvent | undefined);
      this.canvas.requestRenderAll();
      return;
    }

    const target = opt.target;
    if (!target || !this.canvas || target instanceof IText || this.isConnector(target) || this.isPolyArrow(target)) {
      return;
    }
    const existingCaption = this.findCaptionForShape(target);
    if (existingCaption) {
      this.canvas.setActiveObject(existingCaption);
      existingCaption.enterEditing(opt.e as MouseEvent | undefined);
      this.canvas.requestRenderAll();
      return;
    }
    const shapeId = this.ensureTerraId(target);
    const center = target.getCenterPoint();
    const offsetY = -28;
    const label = this.createEditableText(
      this.translate.instant('drawing.defaultLabel'),
      {
        left: center.x,
        top: center.y + offsetY,
        fontSize: LABEL_FONT_SIZE_DEFAULT,
        fill: '#1a1a1a',
        originX: 'center',
        originY: 'bottom',
        terraKind: 'caption',
        terraCaptionOfId: shapeId,
        terraCaptionOffsetX: 0,
        terraCaptionOffsetY: offsetY,
      }
    );
    this.canvas.add(label);
    this.canvas.setActiveObject(label);
    label.enterEditing();
    this.canvas.requestRenderAll();
  }

  private createEditableText(
    content: string,
    options: Record<string, unknown>
  ): IText {
    return new IText(content, {
      editable: true,
      ...options,
    } as Record<string, unknown>);
  }

  private findEditableText(
    target?: FabricObject,
    subTargets?: FabricObject[]
  ): IText | null {
    for (const obj of subTargets ?? []) {
      if (obj instanceof IText) {
        return obj;
      }
    }
    if (target instanceof IText) {
      return target;
    }
    return null;
  }

  private normalizeLoadedCanvas(): void {
    if (!this.canvas) {
      return;
    }
    this.normalizeLoadedTexts();
    for (const obj of this.canvas.getObjects()) {
      if (this.isLinkableShape(obj)) {
        this.ensureTerraId(obj);
        this.applyLinkControls(obj);
      }
    }
    for (const connector of this.getLegacyConnectorGroups()) {
      this.updateLegacyConnectorGroup(connector);
    }
    for (const linkId of this.getConnectorLinkIds()) {
      this.updateConnectorLink(linkId);
    }
    this.repairLoadedPolyArrows();
    for (const obj of this.canvas.getObjects()) {
      if (this.isLinkableShape(obj)) {
        this.updateCaptionsForShape(obj);
      }
    }
  }

  private onCanvasMouseUp(opt: {
    target?: FabricObject;
    e?: TPointerEvent;
    scenePoint?: Point;
  }): void {
    if (this.polyArrowDraft && this.polyArrowDraft.draggingHandleIndex !== null) {
      this.polyArrowDraft.draggingHandleIndex = null;
      return;
    }
    if (!this.connectorDraft || !this.canvas) {
      return;
    }
    const pointer = opt.scenePoint ?? (opt.e ? this.canvas.getScenePoint(opt.e) : null);
    if (!pointer) {
      this.finishConnectorDraft(null);
      return;
    }
    const target = this.findLinkableShapeAtPoint(pointer, this.connectorDraft.source);
    this.finishConnectorDraft(target);
  }

  private readonly connectorMouseUpHandler: ControlActionHandler = (
    _eventData,
    transform,
    x,
    y
  ) => {
    if (!this.connectorDraft) {
      return;
    }
    const target = this.findLinkableShapeAtPoint(
      new Point(x, y),
      transform.target
    );
    this.finishConnectorDraft(target);
  };

  private findLinkableShapeAtPoint(
    pointer: Point | { x: number; y: number },
    exclude: FabricObject | null
  ): FabricObject | null {
    if (!this.canvas) {
      return null;
    }
    const point = pointer instanceof Point ? pointer : new Point(pointer.x, pointer.y);
    const objects = this.canvas.getObjects();
    for (let i = objects.length - 1; i >= 0; i--) {
      const obj = objects[i];
      if (obj === exclude || obj === this.connectorDraft?.preview || this.isConnector(obj)) {
        continue;
      }
      if (this.isPolyArrow(obj)) {
        continue;
      }
      if (this.isPolyArrowHandle(obj)) {
        continue;
      }
      if (!this.isLinkableShape(obj)) {
        continue;
      }
      if (obj.containsPoint(point)) {
        return obj;
      }
    }
    return null;
  }

  private findLinkableShapeNearPoint(
    pointer: Point | { x: number; y: number },
    exclude: FabricObject | null,
    snapDistance = POLY_ARROW_SHAPE_SNAP_DISTANCE
  ): FabricObject | null {
    const inside = this.findLinkableShapeAtPoint(pointer, exclude);
    if (inside) {
      return inside;
    }
    if (!this.canvas) {
      return null;
    }
    const point = pointer instanceof Point ? pointer : new Point(pointer.x, pointer.y);
    let best: FabricObject | null = null;
    let bestDistance = snapDistance;
    for (const obj of this.canvas.getObjects()) {
      if (obj === exclude || !this.isLinkableShape(obj)) {
        continue;
      }
      const distance = this.distancePointToShape(point, obj);
      if (distance <= bestDistance) {
        bestDistance = distance;
        best = obj;
      }
    }
    return best;
  }

  private resolveLinkableShapeForPoint(
    pointer: Point | { x: number; y: number },
    eventTarget?: FabricObject | null,
    exclude: FabricObject | null = null
  ): FabricObject | null {
    if (
      eventTarget &&
      eventTarget !== exclude &&
      this.isLinkableShape(eventTarget)
    ) {
      return eventTarget;
    }
    return this.findLinkableShapeNearPoint(pointer, exclude);
  }

  private distancePointToShape(point: Point, shape: FabricObject): number {
    if (shape.containsPoint(point)) {
      return 0;
    }
    const rect = shape.getBoundingRect();
    const dx = Math.max(rect.left - point.x, 0, point.x - (rect.left + rect.width));
    const dy = Math.max(rect.top - point.y, 0, point.y - (rect.top + rect.height));
    return Math.hypot(dx, dy);
  }

  private normalizePolyArrowLinksById(polyArrowId: string): void {
    const meta = this.getPolyArrowMeta(polyArrowId);
    if (!meta) {
      return;
    }
    const points = this.getPolyArrowStoredPointsById(polyArrowId);
    if (points.length < 2) {
      return;
    }
    let fromId = meta.get('terraFromId') as string | undefined;
    let toId = meta.get('terraToId') as string | undefined;
    if (!fromId) {
      const fromShape = this.findLinkableShapeNearPoint(points[0], null);
      if (fromShape) {
        fromId = this.ensureTerraId(fromShape);
        meta.set('terraFromId', fromId);
      }
    }
    if (!toId) {
      const toShape = this.findLinkableShapeNearPoint(
        points[points.length - 1],
        fromId ? this.findObjectByTerraId(fromId) : null
      );
      if (toShape) {
        toId = this.ensureTerraId(toShape);
        meta.set('terraToId', toId);
      }
    }
  }

  private isPolyArrowLinkedToShape(polyArrowId: string, shapeId: string): boolean {
    const meta = this.getPolyArrowMeta(polyArrowId);
    if (!meta) {
      return false;
    }
    return meta.get('terraFromId') === shapeId || meta.get('terraToId') === shapeId;
  }

  private isPolyArrowGroupLinkedToShape(group: Group, shapeId: string): boolean {
    return group.get('terraFromId') === shapeId || group.get('terraToId') === shapeId;
  }

  private readonly connectorDragHandler: TransformActionHandler = (
    _eventData,
    transform,
    x,
    y
  ) => {
    if (!this.canvas) {
      return false;
    }
    const source = transform.target;
    if (!this.connectorDraft) {
      const anchor = this.getControlAnchorPoint(source, transform.corner);
      const preview = new Line([anchor.x, anchor.y, anchor.x, anchor.y], {
        stroke: '#455a64',
        strokeWidth: 2,
        strokeDashArray: [6, 4],
        selectable: false,
        evented: false,
      });
      this.connectorDraft = { source, preview };
      this.canvas.add(preview);
      this.canvas.sendObjectToBack(preview);
    }
    this.connectorDraft.preview.set({ x2: x, y2: y });
    this.connectorDraft.preview.setCoords();
    this.canvas.requestRenderAll();
    return true;
  };

  private finishConnectorDraft(target: FabricObject | null): void {
    if (!this.connectorDraft || !this.canvas) {
      return;
    }
    const { source, preview } = this.connectorDraft;
    this.canvas.remove(preview);
    this.connectorDraft = null;
    if (target && target !== source) {
      this.createConnector(source, target);
    }
    this.canvas.requestRenderAll();
  }

  private applyLinkControls(obj: FabricObject): void {
    if (!this.isLinkableShape(obj)) {
      return;
    }
    const controls = controlsUtils.createObjectDefaultControls();
    for (const key of CONNECTOR_EDGE_CONTROLS) {
      const control = controls[key];
      control.actionHandler = this.connectorDragHandler;
      control.mouseUpHandler = this.connectorMouseUpHandler;
      control.cursorStyle = 'crosshair';
    }
    for (const key of CONNECTOR_CORNER_CONTROLS) {
      const control = controls[key];
      const defaultHandler = control.actionHandler;
      const defaultMouseUpHandler = control.mouseUpHandler;
      control.actionHandler = (eventData, transform, x, y) => {
        if ((eventData as MouseEvent).altKey) {
          return this.connectorDragHandler(eventData, transform, x, y);
        }
        return defaultHandler(eventData, transform, x, y);
      };
      control.mouseUpHandler = (eventData, transform, x, y) => {
        if (this.connectorDraft) {
          this.connectorMouseUpHandler(eventData, transform, x, y);
          return;
        }
        defaultMouseUpHandler?.(eventData, transform, x, y);
      };
    }
    obj.controls = controls;
    obj.setCoords();
  }

  private onObjectTransform(target?: FabricObject): void {
    if (!target || this.isConnector(target) || this.isPolyArrow(target)) {
      return;
    }
    if (this.isLinkableShape(target)) {
      this.updateConnectorsForShape(target);
      this.updateCaptionsForShape(target);
    }
  }

  private createConnector(from: FabricObject, to: FabricObject): void {
    const linkId = crypto.randomUUID();
    const shared = {
      terraKind: 'connector',
      terraLinkId: linkId,
      terraFromId: this.ensureTerraId(from),
      terraToId: this.ensureTerraId(to),
      selectable: false,
      evented: false,
    };
    const line = new Line([0, 0, 1, 1], {
      ...shared,
      terraConnectorPart: 'line',
      stroke: '#455a64',
      strokeWidth: 2,
    } as Record<string, unknown>);
    const head = new Polygon(
      [
        { x: 0, y: 0 },
        { x: -CONNECTOR_HEAD_SIZE, y: -CONNECTOR_HEAD_SIZE * 0.5 },
        { x: -CONNECTOR_HEAD_SIZE, y: CONNECTOR_HEAD_SIZE * 0.5 },
      ],
      {
        ...shared,
        terraConnectorPart: 'head',
        fill: '#455a64',
        stroke: '#37474f',
        strokeWidth: 1,
        originX: 'left',
        originY: 'top',
      } as Record<string, unknown>
    );
    this.canvas!.add(line);
    this.canvas!.add(head);
    this.sendConnectorLinkToBack(linkId);
    this.updateConnectorLink(linkId);
  }

  private sendConnectorLinkToBack(linkId: string): void {
    for (const part of this.getConnectorParts(linkId)) {
      this.canvas!.sendObjectToBack(part);
    }
  }

  private getConnectorParts(linkId: string): FabricObject[] {
    return (this.canvas?.getObjects() ?? []).filter(
      (obj) => obj.get('terraLinkId') === linkId && this.isConnector(obj)
    );
  }

  private getConnectorLinkIds(): string[] {
    const ids = new Set<string>();
    for (const obj of this.canvas?.getObjects() ?? []) {
      if (this.isConnector(obj) && obj.get('terraConnectorPart') === 'line') {
        const linkId = obj.get('terraLinkId') as string | undefined;
        if (linkId) {
          ids.add(linkId);
        }
      }
    }
    return [...ids];
  }

  private getLegacyConnectorGroups(): Group[] {
    return (this.canvas?.getObjects() ?? []).filter(
      (obj): obj is Group => obj instanceof Group && this.isConnector(obj)
    );
  }

  private updateConnectorsForShape(shape: FabricObject): void {
    const id = this.getTerraId(shape);
    if (!id) {
      return;
    }
    const linkIds = new Set<string>();
    for (const obj of this.canvas!.getObjects()) {
      if (!this.isConnector(obj)) {
        continue;
      }
      if (obj.get('terraFromId') === id || obj.get('terraToId') === id) {
        const linkId = obj.get('terraLinkId') as string | undefined;
        if (linkId) {
          linkIds.add(linkId);
        }
      }
    }
    for (const group of this.getLegacyConnectorGroups()) {
      if (group.get('terraFromId') === id || group.get('terraToId') === id) {
        this.updateLegacyConnectorGroup(group);
      }
    }
    linkIds.forEach((linkId) => this.updateConnectorLink(linkId));
    for (const polyArrowId of this.getPolyArrowIds()) {
      if (this.isPolyArrowLinkedToShape(polyArrowId, id)) {
        this.updatePolyArrowById(polyArrowId);
      }
    }
    this.canvas?.requestRenderAll();
  }

  private updateConnectorLink(linkId: string): void {
    const parts = this.getConnectorParts(linkId);
    const line = parts.find((obj) => obj.get('terraConnectorPart') === 'line') as
      | Line
      | undefined;
    const head = parts.find((obj) => obj.get('terraConnectorPart') === 'head') as
      | Polygon
      | undefined;
    if (!line || !head) {
      return;
    }
    const geometry = this.computeConnectorGeometry(
      String(line.get('terraFromId') ?? ''),
      String(line.get('terraToId') ?? '')
    );
    if (!geometry) {
      return;
    }
    const { start, base, tip, angleDeg } = geometry;
    line.set({ x1: start.x, y1: start.y, x2: base.x, y2: base.y });
    line.setCoords();
    this.positionArrowHead(head, tip, angleDeg);
  }

  private positionArrowHead(head: Polygon, tip: Point, angleDeg: number): void {
    const len = CONNECTOR_HEAD_SIZE;
    const halfW = len * 0.5;
    const angleRad = (angleDeg * Math.PI) / 180;
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    // Tip du polygone en (0, 0) local ; coin bbox en (-len, -halfW)
    const offsetX = len * cos - halfW * sin;
    const offsetY = len * sin + halfW * cos;
    head.set({
      left: tip.x - offsetX,
      top: tip.y - offsetY,
      angle: angleDeg,
    });
    head.setCoords();
  }

  private updateLegacyConnectorGroup(connector: Group): void {
    const geometry = this.computeConnectorGeometry(
      String(connector.get('terraFromId') ?? ''),
      String(connector.get('terraToId') ?? '')
    );
    if (!geometry) {
      return;
    }
    const { start, tip, length, angleDeg } = geometry;
    const headLen = CONNECTOR_HEAD_SIZE;
    const objects = connector.getObjects();
    const line = objects[0] as Line;
    const head = objects[1] as Triangle;
    line.set({ x1: 0, y1: 0, x2: Math.max(length - headLen, 0), y2: 0 });
    head.set({
      left: Math.max(length - headLen / 2, 0),
      top: 0,
      angle: 90,
      originX: 'center',
      originY: 'center',
    });
    connector.set({
      left: start.x,
      top: start.y,
      angle: angleDeg,
    });
    connector.setCoords();
    connector.triggerLayout();
  }

  private computeConnectorGeometry(
    fromId: string,
    toId: string
  ): {
    start: Point;
    base: Point;
    tip: Point;
    length: number;
    angleDeg: number;
  } | null {
    const from = this.findObjectByTerraId(fromId);
    const to = this.findObjectByTerraId(toId);
    if (!from || !to) {
      return null;
    }
    const fromCenter = from.getCenterPoint();
    const toCenter = to.getCenterPoint();
    const start = this.getBorderPoint(from, toCenter);
    const tip = this.getBorderPoint(to, fromCenter);
    const dx = tip.x - start.x;
    const dy = tip.y - start.y;
    const length = Math.hypot(dx, dy);
    if (length < 6) {
      return null;
    }
    const ux = dx / length;
    const uy = dy / length;
    const headLen = CONNECTOR_HEAD_SIZE;
    const base = new Point(tip.x - ux * headLen, tip.y - uy * headLen);
    const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
    return { start, base, tip, length, angleDeg };
  }

  private removeConnectorLink(linkId: string): void {
    if (!this.canvas) {
      return;
    }
    for (const part of this.getConnectorParts(linkId)) {
      this.canvas.remove(part);
    }
  }

  private getControlAnchorPoint(
    shape: FabricObject,
    corner: string
  ): { x: number; y: number } {
    shape.setCoords();
    const coords = shape.oCoords;
    const point = coords?.[corner as keyof typeof coords];
    if (point && typeof point.x === 'number' && typeof point.y === 'number') {
      return { x: point.x, y: point.y };
    }
    return shape.getCenterPoint();
  }

  private getBorderPoint(shape: FabricObject, toward: Point): Point {
    const center = shape.getCenterPoint();
    const dx = toward.x - center.x;
    const dy = toward.y - center.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-6) {
      return center;
    }
    const dir = { x: dx / dist, y: dy / dist };
    shape.setCoords();
    const corners = shape.aCoords;
    if (corners) {
      const pts = [corners.tl, corners.tr, corners.br, corners.bl];
      let bestT = 0;
      for (let i = 0; i < 4; i++) {
        const hit = this.raySegmentHit(center, dir, pts[i], pts[(i + 1) % 4]);
        if (hit !== null && hit > bestT) {
          bestT = hit;
        }
      }
      if (bestT > 0) {
        return new Point(center.x + dir.x * bestT, center.y + dir.y * bestT);
      }
    }
    const rect = shape.getBoundingRect();
    const halfW = Math.max(rect.width / 2, 1);
    const halfH = Math.max(rect.height / 2, 1);
    const t = Math.min(halfW / Math.abs(dir.x), halfH / Math.abs(dir.y));
    return new Point(center.x + dir.x * t, center.y + dir.y * t);
  }

  private raySegmentHit(
    origin: Point,
    dir: { x: number; y: number },
    a: Point,
    b: Point
  ): number | null {
    const sx = b.x - a.x;
    const sy = b.y - a.y;
    const denom = dir.x * sy - dir.y * sx;
    if (Math.abs(denom) < 1e-9) {
      return null;
    }
    const ox = a.x - origin.x;
    const oy = a.y - origin.y;
    const t = (ox * sy - oy * sx) / denom;
    const u = (ox * dir.y - oy * dir.x) / denom;
    if (t >= 0 && u >= 0 && u <= 1) {
      return t;
    }
    return null;
  }

  private getConnectors(): FabricObject[] {
    return (this.canvas?.getObjects() ?? []).filter(
      (obj) => this.isConnector(obj) && obj.get('terraConnectorPart') === 'line'
    );
  }

  private isConnector(obj: FabricObject): boolean {
    return obj.get('terraKind') === 'connector';
  }

  private isLinkableShape(obj?: FabricObject | null): obj is FabricObject {
    if (!obj) {
      return false;
    }
    return LINKABLE_KINDS.has(String(obj.get('terraKind') ?? ''));
  }

  private ensureTerraId(obj: FabricObject): string {
    let id = obj.get('terraId') as string | undefined;
    if (!id) {
      id = crypto.randomUUID();
      obj.set('terraId', id);
    }
    return id;
  }

  private getTerraId(obj: FabricObject): string | undefined {
    return obj.get('terraId') as string | undefined;
  }

  private findObjectByTerraId(id: string): FabricObject | null {
    if (!id || !this.canvas) {
      return null;
    }
    return (
      this.canvas.getObjects().find((obj) => this.getTerraId(obj) === id) ?? null
    );
  }

  private removeConnectorsForShape(shape: FabricObject): void {
    const id = this.ensureTerraId(shape);
    if (!this.canvas) {
      return;
    }
    const linkIds = new Set<string>();
    for (const obj of this.canvas.getObjects()) {
      if (!this.isConnector(obj)) {
        continue;
      }
      if (obj.get('terraFromId') === id || obj.get('terraToId') === id) {
        const linkId = obj.get('terraLinkId') as string | undefined;
        if (linkId) {
          linkIds.add(linkId);
        }
      }
    }
    linkIds.forEach((linkId) => this.removeConnectorLink(linkId));
    for (const group of this.getLegacyConnectorGroups()) {
      if (group.get('terraFromId') === id || group.get('terraToId') === id) {
        this.canvas.remove(group);
      }
    }
    for (const polyArrowId of [...this.getPolyArrowIds()]) {
      if (this.isPolyArrowLinkedToShape(polyArrowId, id)) {
        this.removePolyArrow(polyArrowId);
      }
    }
    for (const group of [...this.getLegacyPolyArrowGroups()]) {
      if (this.isPolyArrowGroupLinkedToShape(group, id)) {
        if (this.polyArrowEditTarget === this.getTerraId(group)) {
          this.clearPolyArrowEditHandles();
        }
        this.canvas.remove(group);
      }
    }
    this.removeCaptionsForShape(id);
  }

  private isShapeCaption(obj: FabricObject): boolean {
    return (
      obj instanceof IText &&
      obj.get('terraKind') === 'caption' &&
      !!obj.get('terraCaptionOfId')
    );
  }

  private findCaptionForShape(shape: FabricObject): IText | null {
    const id = this.getTerraId(shape);
    if (!id || !this.canvas) {
      return null;
    }
    for (const obj of this.canvas.getObjects()) {
      if (obj instanceof IText && obj.get('terraCaptionOfId') === id) {
        return obj;
      }
    }
    return null;
  }

  private updateCaptionsForShape(shape: FabricObject): void {
    const id = this.getTerraId(shape);
    if (!id || !this.canvas) {
      return;
    }
    const center = shape.getCenterPoint();
    for (const obj of this.canvas.getObjects()) {
      if (!this.isShapeCaption(obj) || obj.get('terraCaptionOfId') !== id) {
        continue;
      }
      const offsetX = Number(obj.get('terraCaptionOffsetX') ?? 0);
      const offsetY = Number(obj.get('terraCaptionOffsetY') ?? -28);
      obj.set({
        left: center.x + offsetX,
        top: center.y + offsetY,
      });
      obj.setCoords();
    }
    this.canvas.requestRenderAll();
  }

  private syncCaptionOffsetFromShape(caption: IText): void {
    const shapeId = caption.get('terraCaptionOfId') as string | undefined;
    if (!shapeId) {
      return;
    }
    const shape = this.findObjectByTerraId(shapeId);
    if (!shape) {
      return;
    }
    const center = shape.getCenterPoint();
    const captionCenter = caption.getCenterPoint();
    caption.set({
      terraCaptionOffsetX: captionCenter.x - center.x,
      terraCaptionOffsetY: captionCenter.y - center.y,
    });
  }

  private removeCaptionsForShape(shapeId: string): void {
    if (!this.canvas) {
      return;
    }
    for (const obj of [...this.canvas.getObjects()]) {
      if (obj instanceof IText && obj.get('terraCaptionOfId') === shapeId) {
        this.canvas.remove(obj);
      }
    }
  }

  private normalizeLoadedTexts(): void {
    if (!this.canvas) {
      return;
    }
    for (const obj of this.canvas.getObjects()) {
      this.normalizeTextInObject(obj, this.canvas);
    }
  }

  private normalizeTextInObject(
    obj: FabricObject,
    canvas: Canvas,
    group?: Group
  ): void {
    if (obj instanceof Group) {
      if (obj.get('terraKind') === 'arrow' || obj.subTargetCheck) {
        obj.set({ interactive: true, subTargetCheck: true });
      }
      for (const child of [...obj.getObjects()]) {
        this.normalizeTextInObject(child, canvas, obj);
      }
      return;
    }
    if (obj instanceof FabricText && !(obj instanceof IText)) {
      const kind = obj.get('terraKind');
      if (kind === 'text' || kind === 'caption' || kind === 'arrowLabel') {
        this.upgradeToIText(obj, group ?? canvas);
      }
    }
  }

  private upgradeToIText(obj: FabricText, container: Canvas | Group): void {
    const text = this.createEditableText(obj.text ?? '', {
      left: obj.left,
      top: obj.top,
      fontSize: obj.fontSize,
      fill: obj.fill,
      originX: obj.originX,
      originY: obj.originY,
      angle: obj.angle,
      scaleX: obj.scaleX,
      scaleY: obj.scaleY,
      terraKind: obj.get('terraKind'),
      terraCaptionOfId: obj.get('terraCaptionOfId'),
      terraCaptionOffsetX: obj.get('terraCaptionOffsetX'),
      terraCaptionOffsetY: obj.get('terraCaptionOffsetY'),
    });
    const index = container.getObjects().indexOf(obj);
    container.remove(obj);
    container.insertAt(index, text);
  }

  private addShape(kind: DrawingToolKind, x: number, y: number): void {
    if (!this.canvas) {
      return;
    }
    let obj: FabricObject;
    switch (kind) {
      case 'rect':
        obj = new Rect({
          left: x - 50,
          top: y - 32,
          width: 100,
          height: 64,
          fill: '#e3f2fd',
          stroke: '#1565c0',
          strokeWidth: 2,
          rx: 4,
          ry: 4,
          terraKind: 'rect',
        } as Record<string, unknown>);
        break;
      case 'circle':
        obj = new Circle({
          left: x - 40,
          top: y - 40,
          radius: 40,
          fill: '#e8f5e9',
          stroke: '#2e7d32',
          strokeWidth: 2,
          terraKind: 'circle',
        } as Record<string, unknown>);
        break;
      case 'triangle':
        obj = new Triangle({
          left: x - 40,
          top: y - 36,
          width: 80,
          height: 72,
          fill: '#fff3e0',
          stroke: '#ef6c00',
          strokeWidth: 2,
          terraKind: 'triangle',
        } as Record<string, unknown>);
        break;
      case 'diamond':
        obj = new Polygon(
          [
            { x: 0, y: -40 },
            { x: 40, y: 0 },
            { x: 0, y: 40 },
            { x: -40, y: 0 },
          ],
          {
            left: x,
            top: y,
            fill: '#fce4ec',
            stroke: '#c2185b',
            strokeWidth: 2,
            originX: 'center',
            originY: 'center',
            terraKind: 'diamond',
          } as Record<string, unknown>
        );
        break;
      case 'trapezoid':
        obj = new Polygon(
          [
            { x: -55, y: -28 },
            { x: 55, y: -28 },
            { x: 35, y: 28 },
            { x: -35, y: 28 },
          ],
          {
            left: x,
            top: y,
            fill: '#f3e5f5',
            stroke: '#7b1fa2',
            strokeWidth: 2,
            originX: 'center',
            originY: 'center',
            terraKind: 'trapezoid',
          } as Record<string, unknown>
        );
        break;
      case 'arrow':
        obj = this.createArrowGroup(x, y);
        break;
      case 'text': {
        const text = this.createEditableText(
          this.translate.instant('drawing.defaultText'),
          {
            left: x,
            top: y,
            fontSize: LABEL_FONT_SIZE_DEFAULT,
            fill: '#212121',
            terraKind: 'text',
          }
        );
        this.canvas.add(text);
        this.canvas.setActiveObject(text);
        text.enterEditing();
        this.canvas.requestRenderAll();
        return;
      }
      default:
        return;
    }
    this.canvas.add(obj);
    this.ensureTerraId(obj);
    this.applyLinkControls(obj);
    this.canvas.setActiveObject(obj);
    this.canvas.requestRenderAll();
  }

  private createArrowGroup(x: number, y: number): Group {
    const line = new Line([-60, 0, 60, 0], {
      stroke: '#37474f',
      strokeWidth: 2,
      originX: 'center',
      originY: 'center',
    });
    const head = new Triangle({
      width: 14,
      height: 14,
      fill: '#37474f',
      left: 60,
      top: 0,
      angle: 90,
      originX: 'center',
      originY: 'center',
    });
    const label = this.createEditableText('', {
      left: 0,
      top: -18,
      fontSize: LABEL_FONT_SIZE_DEFAULT,
      fill: '#37474f',
      originX: 'center',
      originY: 'bottom',
      terraKind: 'arrowLabel',
    });
    return new Group([line, head, label], {
      left: x,
      top: y,
      subTargetCheck: true,
      interactive: true,
      terraKind: 'arrow',
    } as Record<string, unknown>);
  }
}
