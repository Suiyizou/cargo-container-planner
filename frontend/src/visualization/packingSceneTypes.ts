import type * as THREE from "three";

export type BalanceSeverity = "green" | "yellow" | "red" | "exempt";
export type SceneViewPreset = "iso" | "top" | "front" | "side";
export type SceneViewMode = "3d" | "2d";
export type SliceAxis = "none" | "x" | "y" | "z";

export interface ContainerLike {
  id?: string;
  name?: string;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  payloadKg?: number;
}

export interface PlacementLike {
  id?: string;
  unitKey?: string;
  cargoId?: string;
  sku?: string;
  model?: string;
  name: string;
  color?: string;
  type?: string;
  xCm: number;
  yCm: number;
  zCm: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  weightKg?: number;
  groupQuantity?: number;
  bottomFaceDetail?: string;
  orientationLabel?: string;
  xAxis?: string;
  yAxis?: string;
  zAxis?: string;
  xAxisBaseCm?: number;
  yAxisBaseCm?: number;
  zAxisBaseCm?: number;
}

export interface SceneCargo extends PlacementLike {
  key: string;
  skuKey: string;
  skuLabel: string;
  displayNo: string;
  color: string;
  quantity: number;
  center: { xCm: number; yCm: number; zCm: number };
  volumeM3: number;
}

export interface SceneLegendItem {
  key: string;
  label: string;
  name: string;
  color: string;
  quantity: number;
  weightKg: number;
}

export interface SceneStats {
  totalPieces: number;
  totalVolumeM3: number;
  totalWeightKg: number;
  utilizationPercent: number;
  cargoCount: number;
  performanceMode: boolean;
}

export interface SceneData {
  container: ContainerLike | null;
  cargos: SceneCargo[];
  legend: SceneLegendItem[];
  stats: SceneStats;
  scale: number;
}

export interface BalanceState {
  valid: boolean;
  severity: BalanceSeverity;
  tagType: "success" | "warning" | "danger" | "info";
  label: string;
  description: string;
  color: string;
  sphereColor: string;
  totalWeightKg: number;
  center: { xCm: number; yCm: number; zCm: number };
  geometricCenter: { xCm: number; yCm: number; zCm: number };
  offset: Record<string, number>;
  loads: Record<string, number>;
  checks: Record<string, number | boolean | null>;
  limits: Record<string, number | null>;
  hotZones: string[];
}

export interface SceneRenderOptions {
  showLabels: boolean;
  showGrid: boolean;
  showCenter: boolean;
  showShell: boolean;
  translucentCargo: boolean;
  showHeatmap: boolean;
  showRemaining: boolean;
  showMassBalance: boolean;
  sliceAxis: SliceAxis;
  slicePercent: number;
  hiddenSkuKeys: Set<string>;
  viewMode: SceneViewMode;
}

export interface SceneHoverPayload {
  item: SceneCargo;
  clientX: number;
  clientY: number;
}

export interface SceneControllerCallbacks {
  onHover?: (payload: SceneHoverPayload | null) => void;
}

export interface RenderContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: unknown;
  root: THREE.Group;
}
