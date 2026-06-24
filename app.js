import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const defaultContainers = [
  { id: "20gp", name: "20GP 普柜", l: 590, w: 235, h: 239, payload: 28200 },
  { id: "20hq", name: "20HQ 高柜", l: 590, w: 235, h: 270, payload: 27800 },
  { id: "40gp", name: "40GP 普柜", l: 1203, w: 235, h: 239, payload: 26700 },
  { id: "40hq", name: "40HQ 高柜", l: 1203, w: 235, h: 270, payload: 26500 },
  { id: "45hq", name: "45HQ 高柜", l: 1356, w: 235, h: 270, payload: 28600 },
  { id: "20rf", name: "20RF 冷藏柜", l: 545, w: 229, h: 226, payload: 27000 },
  { id: "40rf", name: "40RF 冷藏高柜", l: 1156, w: 229, h: 250, payload: 29000 }
].map(withVolume);

const typeRules = {
  normal: { label: "普通纸箱", rotatable: true, nonStack: false, extraGap: 0 },
  upright: { label: "保持朝上", rotatable: false, nonStack: false, extraGap: 1 },
  nonstack: { label: "不可重压", rotatable: true, nonStack: true, extraGap: 2 },
  pallet: { label: "托盘/异形", rotatable: false, nonStack: false, extraGap: 3 }
};

const colors = ["#ef7c2a", "#4e8fd0", "#8b62c8", "#25a389", "#d25f74", "#f2b13e", "#6da847", "#c96b36", "#5e77d6"];
const cargoMap = new Map();
let containers = [...defaultContainers];
let selectedCargoId = null;
let activeView = "packed";
let latestResult = null;
let latestBest = null;
let activeBoxIndex = 0;
let lastContainerId = null;
let loadingTimer = null;
let renderToken = 0;
const sharedBoxGeometry = new THREE.BoxGeometry(1, 1, 1);
sharedBoxGeometry.userData.shared = true;
const sharedEdgeGeometry = new THREE.EdgesGeometry(sharedBoxGeometry);
sharedEdgeGeometry.userData.shared = true;
const mainView = { yaw: -0.72, pitch: 0.72, zoom: 1, panX: 0, panY: 0 };
const projectionViews = {
  top: { zoom: 1, panX: 0, panY: 0 },
  front: { zoom: 1, panX: 0, panY: 0 },
  side: { zoom: 1, panX: 0, panY: 0 }
};
const threeState = {
  initialized: false,
  scene: null,
  container: null,
  renderers: {},
  cameras: {},
  controls: {},
  hoverObjects: [],
  raycaster: new THREE.Raycaster(),
  pointer: new THREE.Vector2(),
  hoveredObject: null,
  needsRender: true,
  dimensionSprites: [],
  animationId: null
};

const els = {
  containerSelect: document.querySelector("#containerSelect"),
  openCargoBtn: document.querySelector("#openCargoBtn"),
  cargoDialog: document.querySelector("#cargoDialog"),
  cargoDialogTitle: document.querySelector("#cargoDialogTitle"),
  cancelCargoBtn: document.querySelector("#cancelCargoBtn"),
  algorithmBtn: document.querySelector("#algorithmBtn"),
  closeAlgorithmBtn: document.querySelector("#closeAlgorithmBtn"),
  plannerPage: document.querySelector("#plannerPage"),
  algorithmPage: document.querySelector("#algorithmPage"),
  addContainerBtn: document.querySelector("#addContainerBtn"),
  resetContainersBtn: document.querySelector("#resetContainersBtn"),
  containerDialog: document.querySelector("#containerDialog"),
  containerName: document.querySelector("#containerName"),
  containerLength: document.querySelector("#containerLength"),
  containerWidth: document.querySelector("#containerWidth"),
  containerHeight: document.querySelector("#containerHeight"),
  containerPayload: document.querySelector("#containerPayload"),
  saveContainerBtn: document.querySelector("#saveContainerBtn"),
  cancelContainerBtn: document.querySelector("#cancelContainerBtn"),
  utilization: document.querySelector("#utilization"),
  utilText: document.querySelector("#utilText"),
  globalGap: document.querySelector("#globalGap"),
  gapText: document.querySelector("#gapText"),
  cargoName: document.querySelector("#cargoName"),
  cargoLength: document.querySelector("#cargoLength"),
  cargoWidth: document.querySelector("#cargoWidth"),
  cargoHeight: document.querySelector("#cargoHeight"),
  cargoQty: document.querySelector("#cargoQty"),
  cargoWeight: document.querySelector("#cargoWeight"),
  cargoType: document.querySelector("#cargoType"),
  addCargoBtn: document.querySelector("#addCargoBtn"),
  updateCargoBtn: document.querySelector("#updateCargoBtn"),
  deleteCargoBtn: document.querySelector("#deleteCargoBtn"),
  sampleBtn: document.querySelector("#sampleBtn"),
  clearBtn: document.querySelector("#clearBtn"),
  exportBtn: document.querySelector("#exportBtn"),
  importInput: document.querySelector("#importInput"),
  cargoTable: document.querySelector("#cargoTable"),
  containerCards: document.querySelector("#containerCards"),
  compareList: document.querySelector("#compareList"),
  mainCanvas: document.querySelector("#boxCanvas"),
  topCanvas: document.querySelector("#topCanvas"),
  frontCanvas: document.querySelector("#frontCanvas"),
  sideCanvas: document.querySelector("#sideCanvas"),
  topViewMeta: document.querySelector("#topViewMeta"),
  frontViewMeta: document.querySelector("#frontViewMeta"),
  sideViewMeta: document.querySelector("#sideViewMeta"),
  mainLegend: document.querySelector("#mainLegend"),
  dimensionBadge: document.querySelector("#dimensionBadge"),
  hoverTooltip: document.querySelector("#hoverTooltip"),
  legend: document.querySelector("#legend"),
  packedCount: document.querySelector("#packedCount"),
  boxTabs: document.querySelector("#boxTabs"),
  boxHint: document.querySelector("#boxHint"),
  volumeUsage: document.querySelector("#volumeUsage"),
  freeVolume: document.querySelector("#freeVolume"),
  totalWeight: document.querySelector("#totalWeight"),
  boxCount: document.querySelector("#boxCount"),
  statusBox: document.querySelector("#statusBox"),
  recommendText: document.querySelector("#recommendText"),
  headerAdvice: document.querySelector("#headerAdvice"),
  storageStatus: document.querySelector("#storageStatus"),
  viewPacked: document.querySelector("#viewPacked"),
  viewFree: document.querySelector("#viewFree"),
  resetViewBtn: document.querySelector("#resetViewBtn"),
  toast: document.querySelector("#toast"),
  loadingOverlay: document.querySelector("#loadingOverlay")
};

init();

function init() {
  loadLocal();
  if (!cargoMap.size) loadSampleData(false);
  renderContainerOptions();
  bindEvents();
  render();
}

function bindEvents() {
  [els.containerSelect, els.utilization, els.globalGap].forEach((el) => el.addEventListener("input", render));
  els.openCargoBtn.addEventListener("click", openCargoDialogForCreate);
  els.cancelCargoBtn.addEventListener("click", () => closeDialog(els.cargoDialog));
  els.algorithmBtn.addEventListener("click", openAlgorithmPage);
  els.closeAlgorithmBtn.addEventListener("click", closeAlgorithmPage);
  els.addCargoBtn.addEventListener("click", addCargoFromForm);
  els.updateCargoBtn.addEventListener("click", updateCargoFromForm);
  els.deleteCargoBtn.addEventListener("click", deleteSelectedCargo);
  els.sampleBtn.addEventListener("click", () => loadSampleData(true));
  els.clearBtn.addEventListener("click", clearCargos);
  els.exportBtn.addEventListener("click", exportCsv);
  els.importInput.addEventListener("change", importCsv);
  els.viewPacked.addEventListener("click", () => setView("packed"));
  els.viewFree.addEventListener("click", () => setView("free"));
  els.resetViewBtn.addEventListener("click", resetView);
  els.addContainerBtn.addEventListener("click", openContainerDialog);
  els.cancelContainerBtn.addEventListener("click", () => closeDialog(els.containerDialog));
  els.saveContainerBtn.addEventListener("click", addContainerFromDialog);
  els.resetContainersBtn.addEventListener("click", resetContainers);
  bindCanvasInteraction();
  window.addEventListener("resize", () => drawAllViews(latestResult));
}

function renderContainerOptions(selectedId = els.containerSelect.value) {
  els.containerSelect.innerHTML = containers.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
  const nextId = containers.some((c) => c.id === selectedId) ? selectedId : containers[0].id;
  els.containerSelect.value = nextId;
}

function setView(view) {
  activeView = view;
  els.viewPacked.classList.toggle("active", view === "packed");
  els.viewFree.classList.toggle("active", view === "free");
  runWithLoading(() => drawAllViews(latestResult));
}

function resetView() {
  Object.assign(mainView, { yaw: -0.72, pitch: 0.72, zoom: 1, panX: 0, panY: 0 });
  Object.values(projectionViews).forEach((view) => Object.assign(view, { zoom: 1, panX: 0, panY: 0 }));
  resetThreeViews();
  runWithLoading(() => drawAllViews(latestResult));
}

function bindCanvasInteraction() {
  initThreeViews();
}

function bindMainCanvasInteraction() {
  let dragging = false;
  let dragMode = "rotate";
  let lastX = 0;
  let lastY = 0;

  els.mainCanvas.addEventListener("pointerdown", (event) => {
    dragging = true;
    dragMode = event.shiftKey || event.button === 1 ? "pan" : "rotate";
    lastX = event.clientX;
    lastY = event.clientY;
    els.mainCanvas.setPointerCapture(event.pointerId);
    els.mainCanvas.classList.add("dragging");
  });

  els.mainCanvas.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    if (dragMode === "pan") {
      mainView.panX += dx;
      mainView.panY += dy;
    } else {
      mainView.yaw += dx * 0.008;
      mainView.pitch = clamp(mainView.pitch + dy * 0.006, 0.22, 1.18);
    }
    drawAllViews(latestResult);
  });

  const endDrag = (event) => {
    dragging = false;
    els.mainCanvas.classList.remove("dragging");
    if (event.pointerId !== undefined) {
      try { els.mainCanvas.releasePointerCapture(event.pointerId); } catch {}
    }
  };
  els.mainCanvas.addEventListener("pointerup", endDrag);
  els.mainCanvas.addEventListener("pointercancel", endDrag);
  els.mainCanvas.addEventListener("mouseleave", () => {
    dragging = false;
    els.mainCanvas.classList.remove("dragging");
  });

  els.mainCanvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    mainView.zoom = clamp(mainView.zoom * Math.exp(-event.deltaY * 0.001), 0.45, 2.8);
    drawAllViews(latestResult);
  }, { passive: false });

  els.mainCanvas.addEventListener("dblclick", resetView);
  els.mainCanvas.addEventListener("contextmenu", (event) => event.preventDefault());
}

function bindProjectionCanvasInteraction(canvas, mode) {
  const view = projectionViews[mode];
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  canvas.addEventListener("pointerdown", (event) => {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add("dragging");
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    view.panX += dx;
    view.panY += dy;
    drawAllViews(latestResult);
  });

  const endDrag = (event) => {
    dragging = false;
    canvas.classList.remove("dragging");
    if (event.pointerId !== undefined) {
      try { canvas.releasePointerCapture(event.pointerId); } catch {}
    }
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  canvas.addEventListener("mouseleave", () => {
    dragging = false;
    canvas.classList.remove("dragging");
  });

  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    view.zoom = clamp(view.zoom * Math.exp(-event.deltaY * 0.001), 0.55, 5);
    drawAllViews(latestResult);
  }, { passive: false });

  canvas.addEventListener("dblclick", () => {
    Object.assign(view, { zoom: 1, panX: 0, panY: 0 });
    drawAllViews(latestResult);
  });
}

function openContainerDialog() {
  els.containerName.value = "";
  els.containerLength.value = 1203;
  els.containerWidth.value = 235;
  els.containerHeight.value = 270;
  els.containerPayload.value = 26500;
  openDialog(els.containerDialog);
}

function addContainerFromDialog() {
  const name = els.containerName.value.trim() || "自定义箱型";
  const l = positiveNumber(els.containerLength.value);
  const w = positiveNumber(els.containerWidth.value);
  const h = positiveNumber(els.containerHeight.value);
  const payload = positiveNumber(els.containerPayload.value);
  if (!l || !w || !h || !payload) {
    showToast("请填写有效的箱型尺寸和载重。");
    return;
  }
  const id = `custom-${Date.now()}`;
  containers.push(withVolume({ id, name, l, w, h, payload }));
  renderContainerOptions(id);
  closeDialog(els.containerDialog);
  saveLocal();
  render();
  showToast("箱型已添加。");
}

function resetContainers() {
  if (!confirm("恢复默认箱型会删除自定义箱型，确定继续吗？")) return;
  containers = [...defaultContainers];
  renderContainerOptions("20gp");
  saveLocal();
  render();
}

function closeDialog(dialog) {
  if (dialog.close) dialog.close();
}

function openCargoDialogForCreate() {
  selectedCargoId = null;
  clearForm();
  renderCargoTable();
  els.cargoDialogTitle.textContent = "录入货物";
  openDialog(els.cargoDialog);
}

function openCargoDialogForEdit(cargo) {
  fillForm(cargo);
  els.cargoDialogTitle.textContent = "编辑货物";
  openDialog(els.cargoDialog);
}

function openDialog(dialog) {
  if (dialog.showModal) {
    dialog.showModal();
  } else {
    alert("当前浏览器不支持 dialog，请使用新版 Chrome。");
  }
}

function openAlgorithmPage() {
  els.plannerPage.hidden = true;
  els.algorithmPage.hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function closeAlgorithmPage() {
  els.algorithmPage.hidden = true;
  els.plannerPage.hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
  drawAllViews(latestResult);
}

function addCargoFromForm() {
  const cargo = readForm();
  if (!cargo) return;
  cargo.id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
  cargo.color = colors[cargoMap.size % colors.length];
  cargoMap.set(cargo.id, cargo);
  selectedCargoId = cargo.id;
  clearForm();
  saveLocal();
  closeDialog(els.cargoDialog);
  render();
}

function updateCargoFromForm() {
  if (!selectedCargoId || !cargoMap.has(selectedCargoId)) return;
  const cargo = readForm();
  if (!cargo) return;
  cargo.id = selectedCargoId;
  cargo.color = cargoMap.get(selectedCargoId).color;
  cargoMap.set(selectedCargoId, cargo);
  saveLocal();
  closeDialog(els.cargoDialog);
  render();
}

function deleteSelectedCargo() {
  if (!selectedCargoId) return;
  cargoMap.delete(selectedCargoId);
  selectedCargoId = null;
  clearForm();
  saveLocal();
  render();
}

function clearCargos() {
  if (!confirm("确定清空当前货物吗？")) return;
  cargoMap.clear();
  selectedCargoId = null;
  clearForm();
  saveLocal();
  render();
}

function readForm() {
  const name = els.cargoName.value.trim() || "未命名货物";
  const l = Number(els.cargoLength.value);
  const w = Number(els.cargoWidth.value);
  const h = Number(els.cargoHeight.value);
  const qty = Math.max(1, Math.round(Number(els.cargoQty.value)));
  const weight = Math.max(0, Number(els.cargoWeight.value));
  if (!l || !w || !h || l <= 0 || w <= 0 || h <= 0) {
    showToast("请填写有效的长、宽、高。");
    return null;
  }
  return { name, l, w, h, qty, weight, type: els.cargoType.value };
}

function fillForm(cargo) {
  els.cargoName.value = cargo.name;
  els.cargoLength.value = cargo.l;
  els.cargoWidth.value = cargo.w;
  els.cargoHeight.value = cargo.h;
  els.cargoQty.value = cargo.qty;
  els.cargoWeight.value = cargo.weight;
  els.cargoType.value = cargo.type;
  els.addCargoBtn.disabled = true;
  els.updateCargoBtn.disabled = false;
  els.deleteCargoBtn.disabled = false;
}

function clearForm() {
  els.cargoName.value = "";
  els.cargoLength.value = 60;
  els.cargoWidth.value = 40;
  els.cargoHeight.value = 35;
  els.cargoQty.value = 30;
  els.cargoWeight.value = 12;
  els.cargoType.value = "normal";
  els.addCargoBtn.disabled = false;
  els.updateCargoBtn.disabled = true;
  els.deleteCargoBtn.disabled = true;
}

function render() {
  const token = ++renderToken;
  showLoading();
  els.utilText.textContent = `${els.utilization.value}%`;
  els.gapText.textContent = els.globalGap.value;

  requestAnimationFrame(() => {
    if (token !== renderToken) return;
    renderNow();
  });
}

function renderNow() {
  const selectedContainer = getContainer(els.containerSelect.value);
  if (lastContainerId !== selectedContainer.id) {
    activeBoxIndex = 0;
    lastContainerId = selectedContainer.id;
  }
  const cargoList = [...cargoMap.values()];
  const units = expandUnits(cargoList);
  const totals = getCargoTotals(cargoList);
  const evaluations = containers.map((container) => evaluateContainer(container, units, totals));
  const current = evaluations.find((item) => item.container.id === selectedContainer.id) || evaluations[0];
  const best = pickBest(evaluations);
  latestResult = current;
  latestBest = best;
  clampActiveBoxIndex(current);
  const sortedEvaluations = sortEvaluations(evaluations);

  renderCargoTable();
  renderContainerCards(sortedEvaluations, best, current);
  renderCompare(sortedEvaluations, best, current);
  renderMetrics(current, best);
  renderBoxTabs(current);
  renderLegend(cargoList);
  renderDimensionBadge(current.container);
  renderViewMetas(current.container);
  drawAllViews(current);
  hideLoadingSoon();
}

function renderMetrics(current, best) {
  const totalUnits = current.totalUnits;
  const activeBox = getActiveBox(current);
  const packedUnits = activeBox.placed.length;
  els.packedCount.textContent = `${packedUnits} / ${totalUnits}`;
  els.volumeUsage.textContent = `${format1(current.fillPercent)}%`;
  els.freeVolume.textContent = `${format1(Math.max(0, current.remainingVolume))} m³`;
  els.totalWeight.textContent = formatKg(current.totalWeight);
  els.boxCount.textContent = current.fatalOversize ? "无法装入" : `${current.boxes} 个`;
  els.storageStatus.textContent = `Map 货物：${cargoMap.size}，箱型：${containers.length}`;

  els.statusBox.className = "status-box";
  if (current.fatalOversize) {
    els.statusBox.classList.add("danger");
    els.statusBox.textContent = "有单件货物尺寸超过当前箱型，无法按物理尺寸装入。";
  } else if (current.boxes > 1) {
    els.statusBox.classList.add("warning");
    const unplacedText = summarizeUnits(current.firstBox.unplaced);
    els.statusBox.textContent = `当前箱型预计需要 ${current.boxes} 个箱。当前显示第 ${activeBoxIndex + 1} 箱。${unplacedText ? `第 1 箱未放入：${unplacedText}。` : ""}`;
  } else {
    els.statusBox.textContent = "当前箱型可装下所有货物。三视图可查看底面铺放和垂直堆叠层数。";
  }

  els.recommendText.textContent = best.fatalOversize
    ? "所有箱型都存在尺寸限制，请调整货物或添加特殊箱型。"
    : `建议选择 ${best.container.name}，预计 ${best.boxes} 个箱，单箱占用约 ${format1(best.fillPercent)}%。`;
  els.headerAdvice.textContent = els.recommendText.textContent;
}

function renderBoxTabs(current) {
  const boxes = getPackedBoxes(current);
  els.boxTabs.innerHTML = boxes.map((box, index) => `
    <button class="box-tab ${index === activeBoxIndex ? "active" : ""}" type="button" data-box-index="${index}">
      第 ${index + 1} 箱
    </button>
  `).join("");
  els.boxTabs.querySelectorAll("[data-box-index]").forEach((button) => {
    button.addEventListener("click", () => {
      switchBoxView(Number(button.dataset.boxIndex));
    });
  });
  const activeBox = getActiveBox(current);
  els.boxHint.textContent = boxes.length > 1
    ? `共 ${boxes.length} 箱，当前箱内 ${activeBox.placed.length} 件。建议逐箱查看，避免一次展示过多导致视图拥挤。`
    : "当前箱型可用一个货舱展示全部货物。";
}

function clampActiveBoxIndex(result) {
  const boxes = getPackedBoxes(result);
  activeBoxIndex = Math.max(0, Math.min(activeBoxIndex, boxes.length - 1));
}

function getPackedBoxes(result) {
  return result?.packedBoxes?.length ? result.packedBoxes : [result.firstBox];
}

function getActiveBox(result) {
  const boxes = getPackedBoxes(result);
  return boxes[activeBoxIndex] || boxes[0] || { placed: [], unplaced: [], free: [] };
}

function switchBoxView(index) {
  if (!latestResult) return;
  const boxes = getPackedBoxes(latestResult);
  activeBoxIndex = Math.max(0, Math.min(index, boxes.length - 1));
  runWithLoading(() => {
    renderMetrics(latestResult, latestBest || latestResult);
    renderBoxTabs(latestResult);
    drawAllViews(latestResult);
  });
}

function runWithLoading(work) {
  showLoading();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      work();
      hideLoadingSoon();
    });
  });
}

function showLoading() {
  if (!els.loadingOverlay) return;
  clearTimeout(loadingTimer);
  els.loadingOverlay.classList.add("visible");
}

function hideLoadingSoon() {
  if (!els.loadingOverlay) return;
  clearTimeout(loadingTimer);
  loadingTimer = setTimeout(() => {
    els.loadingOverlay.classList.remove("visible");
  }, 160);
}

function summarizeUnits(units) {
  if (!units.length) return "";
  const counts = new Map();
  units.forEach((unit) => counts.set(unit.name, (counts.get(unit.name) || 0) + 1));
  return [...counts.entries()].map(([name, count]) => `${name} ${count} 件`).join("、");
}

function renderCargoTable() {
  const rows = [...cargoMap.values()];
  if (!rows.length) {
    els.cargoTable.innerHTML = `<tr><td colspan="6">暂无货物。</td></tr>`;
    return;
  }
  els.cargoTable.innerHTML = rows.map((cargo) => `
    <tr data-id="${cargo.id}" class="${cargo.id === selectedCargoId ? "selected" : ""}">
      <td><span class="swatch" style="background:${cargo.color}"></span> ${escapeHtml(cargo.name)}</td>
      <td>${cargo.l} x ${cargo.w} x ${cargo.h}</td>
      <td>${cargo.qty}</td>
      <td>${formatKg(cargo.weight)}</td>
      <td>${typeRules[cargo.type].label}</td>
      <td>${format2(rawCargoVolume(cargo))} m³</td>
    </tr>
  `).join("");
  els.cargoTable.querySelectorAll("tr[data-id]").forEach((row) => {
    row.addEventListener("click", () => {
      selectedCargoId = row.dataset.id;
      openCargoDialogForEdit(cargoMap.get(selectedCargoId));
      renderCargoTable();
    });
  });
}

function renderContainerCards(evaluations, best, current) {
  els.containerCards.innerHTML = evaluations.map((item, index) => `
    <button class="container-card ${item.container.id === best.container.id ? "best" : ""} ${item.container.id === current.container.id ? "selected" : ""}" type="button" data-container-id="${item.container.id}">
      <span class="container-icon">${containerIcon(item.container)}</span>
      <span>
        <strong><span class="rank">#${index + 1}</span> ${escapeHtml(item.container.name)}</strong>
        <span>${item.fatalOversize ? "单件超尺寸" : `${item.boxes} 个箱 · 利用率 ${format1(item.fillPercent)}%`}<br>
        内部 ${item.container.l} x ${item.container.w} x ${item.container.h} cm<br>
        可用 ${format1(item.usableVolume)} m³ · 载重 ${formatKg(item.container.payload)}</span>
      </span>
    </button>
  `).join("");
  els.containerCards.querySelectorAll("[data-container-id]").forEach((card) => {
    card.addEventListener("click", () => {
      els.containerSelect.value = card.dataset.containerId;
      render();
    });
  });
}

function renderCompare(evaluations, best, current) {
  els.compareList.innerHTML = evaluations.map((item, index) => {
    const width = Math.min(100, item.fillPercent);
    return `
      <div class="compare-row ${item.container.id === current.container.id ? "selected" : ""}">
        <strong>#${index + 1}</strong>
        <span>${escapeHtml(item.container.name)}</span>
        <div class="bar"><span style="width:${width}%"></span></div>
        <span>${item.fatalOversize ? "超尺寸" : `${item.boxes} 箱 / ${format1(item.fillPercent)}%`}</span>
      </div>
    `;
  }).join("");
}

function containerIcon(container) {
  if (container.id.includes("rf") || container.name.includes("冷")) return "RF";
  if (container.id.includes("45") || container.name.includes("45")) return "45";
  if (container.id.includes("40") || container.name.includes("40")) return "40";
  if (container.id.includes("20") || container.name.includes("20")) return "20";
  return "箱";
}

function renderLegend(cargoList) {
  const items = cargoList.map((cargo) => `
    <span class="legend-item"><span class="swatch" style="background:${cargo.color}"></span>${escapeHtml(cargo.name)}</span>
  `);
  items.push(`<span class="legend-item"><span class="swatch" style="background:#6da847"></span>剩余/可用空间</span>`);
  els.legend.innerHTML = items.join("");
  els.mainLegend.innerHTML = items.join("");
}

function renderDimensionBadge(container) {
  els.dimensionBadge.innerHTML = `
    <strong>${escapeHtml(container.name)}</strong>
    长 ${container.l} cm · 宽 ${container.w} cm · 高 ${container.h} cm<br>
    载重 ${formatKg(container.payload)}
  `;
}

function renderViewMetas(container) {
  els.topViewMeta.textContent = `长 ${container.l} cm x 宽 ${container.w} cm`;
  els.frontViewMeta.textContent = `长 ${container.l} cm x 高 ${container.h} cm`;
  els.sideViewMeta.textContent = `宽 ${container.w} cm x 高 ${container.h} cm`;
}

function getCargoTotals(cargos) {
  return {
    totalRawVolume: cargos.reduce((sum, cargo) => sum + rawCargoVolume(cargo), 0),
    totalWeight: cargos.reduce((sum, cargo) => sum + cargo.qty * cargo.weight, 0)
  };
}

function evaluateContainer(container, units, totals) {
  const multi = packMultiple(container, units);
  const usableVolume = container.volume * Number(els.utilization.value) / 100;
  const firstPackedVolume = multi.firstBox.placed.reduce((sum, box) => sum + box.volumeM3, 0);
  const fillPercent = usableVolume ? (firstPackedVolume / usableVolume) * 100 : 0;
  const remainingVolume = usableVolume - firstPackedVolume;
  const weightBoxes = container.payload ? Math.ceil(totals.totalWeight / container.payload) : 0;
  const boxes = multi.fatalOversize ? Infinity : Math.max(multi.boxes, weightBoxes, 0);
  return {
    container,
    usableVolume,
    totalUnits: units.length,
    totalRawVolume: totals.totalRawVolume,
    totalWeight: totals.totalWeight,
    firstBox: multi.firstBox,
    packedBoxes: multi.packedBoxes,
    boxes,
    fatalOversize: multi.fatalOversize,
    fillPercent,
    remainingVolume
  };
}

function pickBest(evaluations) {
  return sortEvaluations(evaluations)[0];
}

function sortEvaluations(evaluations) {
  return [...evaluations].sort((a, b) => {
    if (a.fatalOversize !== b.fatalOversize) return a.fatalOversize ? 1 : -1;
    if (a.boxes !== b.boxes) return a.boxes - b.boxes;
    if (Math.abs(a.fillPercent - b.fillPercent) > 0.001) return b.fillPercent - a.fillPercent;
    return a.container.volume - b.container.volume;
  });
}

function expandUnits(cargos) {
  const units = [];
  const globalGap = Number(els.globalGap.value);
  for (const cargo of cargos) {
    const rule = typeRules[cargo.type];
    const gap = globalGap + rule.extraGap;
    for (let i = 0; i < cargo.qty; i += 1) {
      units.push({
        unitKey: `${cargo.id}-${i}`,
        cargoId: cargo.id,
        name: cargo.name,
        color: cargo.color,
        baseL: cargo.l,
        baseW: cargo.w,
        baseH: cargo.h,
        type: cargo.type,
        l: cargo.l + gap,
        w: cargo.w + gap,
        h: cargo.h + gap,
        weight: cargo.weight,
        rotatable: rule.rotatable,
        nonStack: rule.nonStack,
        volumeM3: (cargo.l * cargo.w * cargo.h) / 1000000
      });
    }
  }
  return units.sort((a, b) => b.l * b.w * b.h - a.l * a.w * a.h);
}

function packMultiple(container, allUnits) {
  let remaining = [...allUnits];
  let boxes = 0;
  let firstBox = { placed: [], unplaced: remaining, free: [] };
  const packedBoxes = [];
  let fatalOversize = false;
  const maxBoxes = 30;

  while (remaining.length && boxes < maxBoxes) {
    const packed = packSingle(container, remaining);
    if (boxes === 0) firstBox = packed;
    if (!packed.placed.length) {
      fatalOversize = true;
      break;
    }
    packedBoxes.push(packed);
    const placedIds = new Set(packed.placed.map((p) => p.unitKey));
    remaining = remaining.filter((unit) => !placedIds.has(unit.unitKey));
    boxes += 1;
  }

  return { boxes: remaining.length ? Infinity : boxes, firstBox, packedBoxes, fatalOversize: fatalOversize || Boolean(remaining.length) };
}

function packSingle(container, units) {
  const placed = [];
  const unplaced = [];

  for (const unit of units) {
    const placement = findPlacement(unit, placed, container);
    if (!placement) {
      unplaced.push(unit);
      continue;
    }
    const { x, y, z, dims } = placement;
    const box = {
      ...unit,
      x,
      y,
      z,
      l: dims.l,
      w: dims.w,
      h: dims.h
    };
    placed.push(box);
  }

  const free = computeFreeCells(container, placed);
  return { placed, unplaced, free };
}

function findPlacement(unit, placed, container) {
  let best = null;
  const orientations = getOrientations(unit);
  orientations.forEach((dims) => {
    if (dims.l > container.l || dims.w > container.w || dims.h > container.h) return;
    const candidates = candidatePositions(placed, container, dims);
    for (const position of candidates) {
      if (!fitsAt(position, dims, placed, container)) continue;
      if (!hasSupport(position, dims, placed)) continue;
      const score = placementScore(position, dims, container);
      if (!best || score < best.score) {
        best = { ...position, dims, score };
      }
    }
  });
  return best;
}

function candidatePositions(placed, container, dims) {
  const xs = uniqueSorted([0, ...placed.map((box) => box.x + box.l)]).filter((x) => x + dims.l <= container.l + 0.0001);
  const ys = uniqueSorted([0, ...placed.map((box) => box.y + box.w)]).filter((y) => y + dims.w <= container.w + 0.0001);
  const zs = uniqueSorted([0, ...placed.map((box) => box.z + box.h)]).filter((z) => z + dims.h <= container.h + 0.0001);
  const positions = [];
  zs.forEach((z) => {
    ys.forEach((y) => {
      xs.forEach((x) => positions.push({ x, y, z }));
    });
  });
  return positions;
}

function uniqueSorted(values) {
  return [...new Set(values.map((value) => Math.round(value * 1000) / 1000))].sort((a, b) => a - b);
}

function fitsAt(position, dims, placed, container) {
  if (position.x < 0 || position.y < 0 || position.z < 0) return false;
  if (position.x + dims.l > container.l + 0.0001) return false;
  if (position.y + dims.w > container.w + 0.0001) return false;
  if (position.z + dims.h > container.h + 0.0001) return false;
  const candidate = { x: position.x, y: position.y, z: position.z, l: dims.l, w: dims.w, h: dims.h };
  return placed.every((box) => !intersects3d(candidate, box));
}

function intersects3d(a, b) {
  return a.x < b.x + b.l - 0.0001 && a.x + a.l > b.x + 0.0001
    && a.y < b.y + b.w - 0.0001 && a.y + a.w > b.y + 0.0001
    && a.z < b.z + b.h - 0.0001 && a.z + a.h > b.z + 0.0001;
}

function hasSupport(position, dims, placed) {
  if (position.z <= 0.0001) return true;
  const supports = placed
    .filter((box) => !box.nonStack && Math.abs(box.z + box.h - position.z) < 0.0001)
    .map((box) => overlapRect(
      { x: position.x, y: position.y, l: dims.l, w: dims.w },
      { x: box.x, y: box.y, l: box.l, w: box.w }
    ))
    .filter(Boolean);
  if (!supports.length) return false;
  const requiredArea = dims.l * dims.w;
  return unionArea2d(supports) >= requiredArea * 0.985;
}

function overlapRect(a, b) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.l, b.x + b.l);
  const y2 = Math.min(a.y + a.w, b.y + b.w);
  if (x2 <= x1 || y2 <= y1) return null;
  return { x: x1, y: y1, l: x2 - x1, w: y2 - y1 };
}

function unionArea2d(rects) {
  const xs = uniqueSorted(rects.flatMap((rect) => [rect.x, rect.x + rect.l]));
  let area = 0;
  for (let i = 0; i < xs.length - 1; i += 1) {
    const x1 = xs[i];
    const x2 = xs[i + 1];
    const width = x2 - x1;
    if (width <= 0) continue;
    const spans = rects
      .filter((rect) => rect.x < x2 && rect.x + rect.l > x1)
      .map((rect) => [rect.y, rect.y + rect.w])
      .sort((a, b) => a[0] - b[0]);
    let covered = 0;
    let start = null;
    let end = null;
    spans.forEach(([spanStart, spanEnd]) => {
      if (start === null) {
        start = spanStart;
        end = spanEnd;
      } else if (spanStart <= end) {
        end = Math.max(end, spanEnd);
      } else {
        covered += end - start;
        start = spanStart;
        end = spanEnd;
      }
    });
    if (start !== null) covered += end - start;
    area += width * covered;
  }
  return area;
}

function placementScore(position, dims, container) {
  const top = position.z + dims.h;
  const farY = position.y + dims.w;
  const farX = position.x + dims.l;
  return position.z * 1000000000
    + position.y * 1000000
    + position.x * 1000
    + top * 20
    + farY * 2
    + farX / Math.max(1, container.l);
}

function computeFreeCells(container, placed) {
  if (!placed.length) return [{ x: 0, y: 0, z: 0, l: container.l, w: container.w, h: container.h }];
  const xs = uniqueSorted([0, container.l, ...placed.flatMap((box) => [box.x, box.x + box.l])]);
  const ys = uniqueSorted([0, container.w, ...placed.flatMap((box) => [box.y, box.y + box.w])]);
  const zs = uniqueSorted([0, container.h, ...placed.flatMap((box) => [box.z, box.z + box.h])]);
  if (xs.length * ys.length * zs.length > 180000) {
    return coarseFreeCells(container, placed);
  }

  const free = [];
  for (let ix = 0; ix < xs.length - 1; ix += 1) {
    for (let iy = 0; iy < ys.length - 1; iy += 1) {
      for (let iz = 0; iz < zs.length - 1; iz += 1) {
        const cell = {
          x: xs[ix],
          y: ys[iy],
          z: zs[iz],
          l: xs[ix + 1] - xs[ix],
          w: ys[iy + 1] - ys[iy],
          h: zs[iz + 1] - zs[iz]
        };
        if (cell.l <= 0 || cell.w <= 0 || cell.h <= 0) continue;
        if (!placed.some((box) => intersects3d(cell, box))) free.push(cell);
      }
    }
  }
  return free.sort((a, b) => b.l * b.w * b.h - a.l * a.w * a.h).slice(0, 180);
}

function coarseFreeCells(container, placed) {
  const free = [];
  const candidates = [
    { x: 0, y: 0, z: 0 },
    ...placed.flatMap((box) => [
      { x: box.x + box.l, y: box.y, z: box.z },
      { x: box.x, y: box.y + box.w, z: box.z },
      { x: box.x, y: box.y, z: box.z + box.h }
    ])
  ];
  candidates.forEach((point) => {
    const cell = {
      x: point.x,
      y: point.y,
      z: point.z,
      l: container.l - point.x,
      w: container.w - point.y,
      h: container.h - point.z
    };
    if (cell.l <= 0 || cell.w <= 0 || cell.h <= 0) return;
    if (!placed.some((box) => intersects3d(cell, box))) free.push(cell);
  });
  return free.sort((a, b) => b.l * b.w * b.h - a.l * a.w * a.h).slice(0, 80);
}

function getOrientations(unit) {
  if (!unit.rotatable) return [{ l: unit.l, w: unit.w, h: unit.h }];
  const values = [unit.l, unit.w, unit.h];
  const perms = [
    [values[0], values[1], values[2]], [values[0], values[2], values[1]],
    [values[1], values[0], values[2]], [values[1], values[2], values[0]],
    [values[2], values[0], values[1]], [values[2], values[1], values[0]]
  ];
  const seen = new Set();
  return perms.filter((p) => {
    const key = p.join("x");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map(([l, w, h]) => ({ l, w, h }));
}

function splitSpace(space, dims, nonStack) {
  const result = [];
  const right = { x: space.x + dims.l, y: space.y, z: space.z, l: space.l - dims.l, w: space.w, h: space.h };
  const front = { x: space.x, y: space.y + dims.w, z: space.z, l: dims.l, w: space.w - dims.w, h: space.h };
  const above = { x: space.x, y: space.y, z: space.z + dims.h, l: dims.l, w: dims.w, h: space.h - dims.h };
  [right, front].forEach((s) => { if (s.l > 0 && s.w > 0 && s.h > 0) result.push(s); });
  if (!nonStack && above.l > 0 && above.w > 0 && above.h > 0) result.push(above);
  return result;
}

function pruneFreeSpaces(free) {
  free.sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x || a.l * a.w * a.h - b.l * b.w * b.h);
  for (let i = free.length - 1; i >= 0; i -= 1) {
    for (let j = 0; j < free.length; j += 1) {
      if (i !== j && containsSpace(free[j], free[i])) {
        free.splice(i, 1);
        break;
      }
    }
  }
}

function containsSpace(a, b) {
  return b.x >= a.x && b.y >= a.y && b.z >= a.z
    && b.x + b.l <= a.x + a.l
    && b.y + b.w <= a.y + a.w
    && b.z + b.h <= a.z + a.h;
}

function drawAllViews(result) {
  if (!result) return;
  renderThreeViews(result);
}

function initThreeViews() {
  if (threeState.initialized) return;
  const viewConfigs = [
    { key: "main", canvas: els.mainCanvas },
    { key: "top", canvas: els.topCanvas },
    { key: "front", canvas: els.frontCanvas },
    { key: "side", canvas: els.sideCanvas }
  ];

  viewConfigs.forEach(({ key, canvas }) => {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0xfbfdff, 1);
    threeState.renderers[key] = renderer;

    const camera = key === "main"
      ? new THREE.PerspectiveCamera(42, 1, 1, 10000)
      : new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 10000);
    threeState.cameras[key] = camera;

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enableZoom = false;
    controls.zoomSpeed = key === "main" ? 0.85 : 1;
    controls.panSpeed = 0.8;
    controls.target.set(0, 0, 0);
    if (key === "main") {
      controls.minPolarAngle = 0.04;
      controls.maxPolarAngle = Math.PI * 0.49;
      controls.screenSpacePanning = false;
    } else {
      controls.enableRotate = false;
      controls.screenSpacePanning = true;
    }
    threeState.controls[key] = controls;
  });

  els.mainCanvas.addEventListener("pointermove", handleMainCanvasHover);
  els.mainCanvas.addEventListener("pointerleave", clearHoverState);
  threeState.initialized = true;
  animateThreeViews();
}

function renderThreeViews(result) {
  initThreeViews();
  const containerKey = `${result.container.id}:${result.container.l}:${result.container.w}:${result.container.h}`;
  const shouldResetCamera = threeState.containerKey !== containerKey;
  threeState.containerKey = containerKey;

  if (threeState.scene) disposeThreeScene(threeState.scene);
  threeState.scene = buildThreeScene(result);
  fitThreeCameras(result.container, shouldResetCamera);
  threeState.needsRender = true;
  renderThreeFrame();
}

function animateThreeViews() {
  threeState.animationId = requestAnimationFrame(animateThreeViews);
  const controlsChanged = Object.values(threeState.controls).some((control) => control.update());
  if (controlsChanged || threeState.needsRender) {
    renderThreeFrame();
    threeState.needsRender = false;
  }
}

function renderThreeFrame() {
  if (!threeState.scene) return;
  Object.entries(threeState.renderers).forEach(([key, renderer]) => {
    resizeThreeRenderer(key, renderer);
    renderer.render(threeState.scene, threeState.cameras[key]);
  });
}

function handleMainCanvasHover(event) {
  if (!threeState.scene || !threeState.hoverObjects.length) {
    clearHoverState();
    return;
  }
  const rect = els.mainCanvas.getBoundingClientRect();
  threeState.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  threeState.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  threeState.raycaster.setFromCamera(threeState.pointer, threeState.cameras.main);
  const hit = threeState.raycaster.intersectObjects(threeState.hoverObjects, false)[0];
  if (!hit) {
    clearHoverState();
    return;
  }
  if (threeState.hoveredObject !== hit.object) {
    clearHoverHighlight();
    threeState.hoveredObject = hit.object;
    if (hit.object.material?.emissive) hit.object.material.emissive.set(0x1b4e85);
    threeState.needsRender = true;
  }
  showCargoTooltip(hit.object.userData.cargoInfo, event.clientX - rect.left, event.clientY - rect.top, rect);
}

function showCargoTooltip(info, x, y, rect) {
  if (!info) return;
  const cargo = cargoMap.get(info.cargoId);
  els.hoverTooltip.innerHTML = `
    <strong>${escapeHtml(info.name)}</strong>
    原始尺寸：${info.baseL} x ${info.baseW} x ${info.baseH} cm<br>
    占用尺寸：${format1(info.l)} x ${format1(info.w)} x ${format1(info.h)} cm<br>
    数量：${cargo ? cargo.qty : 1} 件 · 单重 ${formatKg(info.weight)}<br>
    规则：${typeRules[info.type]?.label || "普通"}<br>
    位置：L ${format1(info.x)} / W ${format1(info.y)} / H ${format1(info.z)} cm
  `;
  const tooltipWidth = 240;
  const left = Math.min(rect.width - tooltipWidth - 12, x + 16);
  const top = Math.max(12, Math.min(rect.height - 138, y + 16));
  els.hoverTooltip.style.left = `${Math.max(12, left)}px`;
  els.hoverTooltip.style.top = `${top}px`;
  els.hoverTooltip.classList.add("visible");
}

function clearHoverState() {
  clearHoverHighlight();
  if (els.hoverTooltip) els.hoverTooltip.classList.remove("visible");
}

function clearHoverHighlight() {
  if (threeState.hoveredObject?.material?.emissive) {
    threeState.hoveredObject.material.emissive.set(0x000000);
    threeState.needsRender = true;
  }
  threeState.hoveredObject = null;
}

function resizeThreeRenderer(key, renderer) {
  const canvas = renderer.domElement;
  const width = Math.max(2, Math.floor(canvas.clientWidth));
  const height = Math.max(2, Math.floor(canvas.clientHeight));
  const drawing = renderer.getSize(new THREE.Vector2());
  if (drawing.x !== width || drawing.y !== height) {
    renderer.setSize(width, height, false);
    const camera = threeState.cameras[key];
    if (camera.isPerspectiveCamera) {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    } else if (threeState.container) {
      fitOrthoCamera(camera, threeState.container, key, width, height);
    }
  }
}

function buildThreeScene(result) {
  const scene = new THREE.Scene();
  threeState.hoverObjects = [];
  clearHoverState();
  scene.background = new THREE.Color(0xfbfdff);
  scene.fog = new THREE.Fog(0xfbfdff, Math.max(result.container.l, result.container.w) * 1.8, Math.max(result.container.l, result.container.w) * 4.8);

  const ambient = new THREE.HemisphereLight(0xffffff, 0xc9d6e3, 1.35);
  scene.add(ambient);
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.9);
  keyLight.position.set(result.container.l * 0.7, result.container.h * 1.7, result.container.w * 1.5);
  scene.add(keyLight);
  const fillLight = new THREE.DirectionalLight(0x8eb6ff, 0.65);
  fillLight.position.set(-result.container.l * 0.5, result.container.h * 0.8, -result.container.w * 1.2);
  scene.add(fillLight);

  addContainerModel(scene, result.container);
  const activeBox = getActiveBox(result);
  const boxes = activeView === "free" ? activeBox.free.slice(0, 80) : activeBox.placed;
  boxes.forEach((box) => addCargoModel(scene, box, result.container, activeView === "free"));
  addDimensionMarkers(scene, result.container);
  threeState.container = result.container;
  return scene;
}

function addContainerModel(scene, c) {
  const bottomY = -c.h / 2;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(c.l, c.w),
    new THREE.MeshBasicMaterial({ color: 0xe9f1f8, transparent: true, opacity: 0.96, side: THREE.DoubleSide })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = bottomY;
  scene.add(floor);
  addFloorGrid(scene, c);

  const shell = new THREE.Mesh(
    sharedBoxGeometry,
    new THREE.MeshBasicMaterial({ color: 0x4e72a2, transparent: true, opacity: 0.055, depthWrite: false })
  );
  shell.scale.set(c.l, c.h, c.w);
  scene.add(shell);
  addBoxEdges(scene, shell, 0x2f5f91, 0.86);
}

function addFloorGrid(scene, c) {
  const positions = [];
  const bottomY = -c.h / 2 + 0.4;
  for (let i = 0; i <= 12; i += 1) {
    const x = -c.l / 2 + c.l * i / 12;
    positions.push(x, bottomY, -c.w / 2, x, bottomY, c.w / 2);
  }
  for (let i = 0; i <= 5; i += 1) {
    const z = -c.w / 2 + c.w * i / 5;
    positions.push(-c.l / 2, bottomY, z, c.l / 2, bottomY, z);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const lines = new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({ color: 0x9eb0c4, transparent: true, opacity: 0.38 })
  );
  scene.add(lines);
}

function addCargoModel(scene, box, c, isFreeSpace) {
  const size = { x: box.l, y: box.h, z: box.w };
  const position = toThreePosition(box, c);
  const color = new THREE.Color(isFreeSpace ? "#6da847" : box.color);
  const material = isFreeSpace
    ? new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, depthWrite: false })
    : new THREE.MeshStandardMaterial({ color, roughness: 0.58, metalness: 0.05, transparent: true, opacity: 0.94 });
  const mesh = new THREE.Mesh(sharedBoxGeometry, material);
  mesh.position.set(position.x, position.y, position.z);
  mesh.scale.set(size.x, size.y, size.z);
  mesh.userData.cargoInfo = isFreeSpace ? null : {
    name: box.name,
    cargoId: box.cargoId,
    baseL: box.baseL,
    baseW: box.baseW,
    baseH: box.baseH,
    l: box.l,
    w: box.w,
    h: box.h,
    weight: box.weight,
    type: box.type,
    x: box.x,
    y: box.y,
    z: box.z
  };
  scene.add(mesh);
  if (!isFreeSpace) threeState.hoverObjects.push(mesh);
  addBoxEdges(scene, mesh, isFreeSpace ? 0x3f7e34 : 0x183044, isFreeSpace ? 0.58 : 0.42);
}

function addBoxEdges(scene, mesh, color, opacity) {
  const edges = new THREE.LineSegments(
    sharedEdgeGeometry,
    new THREE.LineBasicMaterial({ color, transparent: true, opacity })
  );
  edges.position.copy(mesh.position);
  edges.rotation.copy(mesh.rotation);
  edges.scale.copy(mesh.scale);
  scene.add(edges);
}

function toThreePosition(box, c) {
  return {
    x: box.x + box.l / 2 - c.l / 2,
    y: box.z + box.h / 2 - c.h / 2,
    z: box.y + box.w / 2 - c.w / 2
  };
}

function addDimensionMarkers(scene, c) {
  const offset = Math.max(26, Math.min(90, Math.max(c.w, c.h) * 0.22));
  const y = -c.h / 2 - 14;
  addDimensionLine(scene, new THREE.Vector3(-c.l / 2, y, -c.w / 2 - offset), new THREE.Vector3(c.l / 2, y, -c.w / 2 - offset), `长 ${c.l} cm`, 0x1f5c96);
  addDimensionLine(scene, new THREE.Vector3(-c.l / 2 - offset, y, -c.w / 2), new THREE.Vector3(-c.l / 2 - offset, y, c.w / 2), `宽 ${c.w} cm`, 0x1f5c96);
  addDimensionLine(scene, new THREE.Vector3(c.l / 2 + offset, -c.h / 2, -c.w / 2 - offset * 0.35), new THREE.Vector3(c.l / 2 + offset, c.h / 2, -c.w / 2 - offset * 0.35), `高 ${c.h} cm`, 0x1f5c96);
}

function addDimensionLine(scene, start, end, label, color) {
  const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
  const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.92 }));
  scene.add(line);

  const dir = new THREE.Vector3().subVectors(end, start).normalize();
  const tick = new THREE.Vector3(-dir.z, 0, dir.x).normalize().multiplyScalar(8);
  if (Math.abs(dir.y) > 0.8) tick.set(10, 0, 0);
  [start, end].forEach((point) => {
    const tickGeometry = new THREE.BufferGeometry().setFromPoints([
      point.clone().sub(tick),
      point.clone().add(tick)
    ]);
    scene.add(new THREE.Line(tickGeometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.92 })));
  });

  const sprite = makeTextSprite(label, color);
  sprite.position.copy(start).add(end).multiplyScalar(0.5);
  if (Math.abs(dir.y) > 0.8) sprite.position.x += 38;
  else sprite.position.y += 20;
  scene.add(sprite);
}

function makeTextSprite(text, color) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  ctx.font = "700 44px Microsoft YaHei, Arial";
  const metrics = ctx.measureText(text);
  canvas.width = Math.ceil(metrics.width + 42);
  canvas.height = 72;
  ctx.font = "700 44px Microsoft YaHei, Arial";
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.strokeStyle = "rgba(78,114,162,0.42)";
  ctx.lineWidth = 3;
  roundRect(ctx, 2, 2, canvas.width - 4, canvas.height - 4, 12);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = `#${color.toString(16).padStart(6, "0")}`;
  ctx.fillText(text, 21, 50);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(material);
  const height = 30;
  sprite.scale.set(height * canvas.width / canvas.height, height, 1);
  return sprite;
}

function fitThreeCameras(c, resetCamera) {
  const maxDim = Math.max(c.l, c.w, c.h);
  Object.entries(threeState.renderers).forEach(([key, renderer]) => {
    resizeThreeRenderer(key, renderer);
  });

  const mainCamera = threeState.cameras.main;
  mainCamera.near = 1;
  mainCamera.far = maxDim * 8;
  mainCamera.updateProjectionMatrix();
  if (resetCamera) {
    mainCamera.position.set(c.l * 0.78, c.h * 1.05, c.w * 2.2 + c.l * 0.18);
    resetControlTarget("main");
  }

  setupOrthoView("top", c, resetCamera);
  setupOrthoView("front", c, resetCamera);
  setupOrthoView("side", c, resetCamera);
}

function setupOrthoView(key, c, resetCamera) {
  const maxDim = Math.max(c.l, c.w, c.h);
  const camera = threeState.cameras[key];
  camera.near = 1;
  camera.far = maxDim * 8;
  if (key === "top") {
    camera.position.set(0, maxDim * 2.1, 0);
    camera.up.set(0, 0, -1);
  } else if (key === "front") {
    camera.position.set(0, 0, maxDim * 2.1);
    camera.up.set(0, 1, 0);
  } else {
    camera.position.set(maxDim * 2.1, 0, 0);
    camera.up.set(0, 1, 0);
  }
  camera.lookAt(0, 0, 0);
  const renderer = threeState.renderers[key];
  fitOrthoCamera(camera, c, key, renderer.domElement.clientWidth, renderer.domElement.clientHeight);
  if (resetCamera) resetControlTarget(key);
}

function fitOrthoCamera(camera, c, key, width, height) {
  const aspect = Math.max(width, 1) / Math.max(height, 1);
  const dims = key === "top"
    ? { x: c.l, y: c.w }
    : key === "front"
      ? { x: c.l, y: c.h }
      : { x: c.w, y: c.h };
  const margin = 1.22;
  let halfW = dims.x * margin / 2;
  let halfH = dims.y * margin / 2;
  if (halfW / halfH < aspect) halfW = halfH * aspect;
  else halfH = halfW / aspect;
  camera.left = -halfW;
  camera.right = halfW;
  camera.top = halfH;
  camera.bottom = -halfH;
  camera.updateProjectionMatrix();
}

function resetThreeViews() {
  if (!latestResult || !threeState.initialized) return;
  fitThreeCameras(latestResult.container, true);
}

function resetControlTarget(key) {
  const control = threeState.controls[key];
  control.target.set(0, 0, 0);
  control.update();
}

function disposeThreeScene(scene) {
  scene.traverse((object) => {
    if (object.geometry && !object.geometry.userData.shared) object.geometry.dispose();
    if (object.material) {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => {
        if (material.map) material.map.dispose();
        material.dispose();
      });
    }
  });
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function prepareCanvas(canvas, cssHeight) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(320, rect.width || canvas.clientWidth || 320);
  const height = cssHeight || rect.height || canvas.clientHeight || 220;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#fbfdff";
  ctx.fillRect(0, 0, width, height);
  return { ctx, width, height };
}

function drawMainView(result) {
  const { ctx, width, height } = prepareCanvas(els.mainCanvas, 430);
  const c = result.container;
  const baseScale = Math.min((width - 170) / Math.max(c.l, c.w), (height - 125) / (c.h * 0.95 + Math.max(c.l, c.w) * 0.42));
  const scale = baseScale * mainView.zoom;
  const project = createMainProjector(c, width, height, scale);
  const placedBoxes = sortForPaint(result.firstBox.placed, project);

  drawMainTitle(ctx, result);
  drawSceneFloor(ctx, c, project);
  placedBoxes.forEach((box) => drawCargoShadow(ctx, box, project));
  if (activeView === "free") {
    result.firstBox.free.slice(0, 18).forEach((space) => drawIsoCuboid(ctx, space, project, "#6da847", 0.18, true));
  }
  placedBoxes.forEach((box) => drawIsoCuboid(ctx, box, project, box.color, 0.94, false));
  drawContainer(ctx, c, project);
  drawLayerGuide(ctx, result, width);
  drawAxisWidget(ctx, width, height);
}

function createMainProjector(container, width, height, scale) {
  const cx = container.l / 2;
  const cy = container.w / 2;
  const cz = container.h / 2;
  const centerX = width / 2 + mainView.panX;
  const centerY = height * 0.62 + mainView.panY;
  const yaw = mainView.yaw;
  const pitch = mainView.pitch;
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const cosP = Math.cos(pitch);
  const sinP = Math.sin(pitch);
  const distance = Math.max(container.l, container.w, container.h) * 3.2;

  const project = (x, y, z) => {
    const px = x - cx;
    const py = y - cy;
    const pz = z - cz;
    const rx = px * cosY - py * sinY;
    const ry = px * sinY + py * cosY;
    const screenY = ry * sinP - pz * cosP;
    const depth = ry * cosP + pz * sinP;
    const perspective = clamp(distance / (distance + depth), 0.76, 1.28);
    return {
      x: centerX + rx * scale * perspective,
      y: centerY + screenY * scale * perspective,
      depth
    };
  };
  project.scale = scale;
  return project;
}

function sortForPaint(boxes, project) {
  return [...boxes].sort((a, b) => boxDepth(b, project) - boxDepth(a, project));
}

function boxDepth(box, project) {
  return project(box.x + box.l / 2, box.y + box.w / 2, box.z + box.h / 2).depth;
}

function drawSceneFloor(ctx, c, project) {
  const floor = [
    project(0, 0, 0),
    project(c.l, 0, 0),
    project(c.l, c.w, 0),
    project(0, c.w, 0)
  ];
  ctx.save();
  ctx.fillStyle = "#edf3f9";
  ctx.strokeStyle = "rgba(78,114,162,0.34)";
  ctx.lineWidth = 1;
  polygon(ctx, floor, true);

  ctx.strokeStyle = "rgba(96,112,134,0.2)";
  ctx.lineWidth = 0.7;
  for (let i = 1; i < 12; i += 1) {
    const x = c.l * i / 12;
    line(ctx, project(x, 0, 0), project(x, c.w, 0));
  }
  for (let i = 1; i < 5; i += 1) {
    const y = c.w * i / 5;
    line(ctx, project(0, y, 0), project(c.l, y, 0));
  }
  ctx.restore();
}

function drawCargoShadow(ctx, box, project) {
  const lift = Math.min(8, Math.max(2, box.z * 0.03));
  const points = [
    project(box.x + lift, box.y + lift, box.z),
    project(box.x + box.l + lift, box.y + lift, box.z),
    project(box.x + box.l + lift, box.y + box.w + lift, box.z),
    project(box.x + lift, box.y + box.w + lift, box.z)
  ];
  ctx.save();
  ctx.fillStyle = box.z > 0 ? "rgba(20,34,52,0.16)" : "rgba(20,34,52,0.08)";
  ctx.strokeStyle = "transparent";
  polygon(ctx, points, true);
  ctx.restore();
}

function drawContainer(ctx, c, project) {
  drawIsoCuboid(ctx, { x: 0, y: 0, z: 0, l: c.l, w: c.w, h: c.h }, project, "#4e72a2", 0.08, true);
}

function drawIsoCuboid(ctx, box, project, color, alpha, wireOnly) {
  const p = cuboidPoints(box, project);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = wireOnly ? "rgba(45,84,130,0.46)" : "rgba(24,36,54,0.18)";
  ctx.lineWidth = wireOnly ? 1.1 : 0.7;
  const faces = [
    { pts: [p.p000, p.p100, p.p110, p.p010], fill: shade(color, 0.58) },
    { pts: [p.p001, p.p101, p.p111, p.p011], fill: shade(color, 1.2) },
    { pts: [p.p000, p.p100, p.p101, p.p001], fill: shade(color, 1.02) },
    { pts: [p.p100, p.p110, p.p111, p.p101], fill: shade(color, 0.74) },
    { pts: [p.p010, p.p110, p.p111, p.p011], fill: shade(color, 0.88) },
    { pts: [p.p000, p.p010, p.p011, p.p001], fill: shade(color, 1.08) }
  ].sort((a, b) => avgDepth(b.pts) - avgDepth(a.pts));
  faces.forEach((face) => {
    ctx.fillStyle = wireOnly ? color : face.fill;
    polygon(ctx, face.pts, true);
  });
  ctx.restore();

  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = wireOnly ? "rgba(45,84,130,0.78)" : "rgba(8,22,38,0.34)";
  ctx.lineWidth = wireOnly ? 1.4 : 0.85;
  strokeCuboid(ctx, p);
  if (!wireOnly) {
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 0.7;
    [[p.p001, p.p101], [p.p101, p.p111], [p.p111, p.p011], [p.p011, p.p001]].forEach(([a, b]) => line(ctx, a, b));
    drawTinyCargoLabel(ctx, box, p);
  }
  ctx.restore();
}

function avgDepth(points) {
  return points.reduce((sum, point) => sum + point.depth, 0) / points.length;
}

function drawTinyCargoLabel(ctx, box, p) {
  const topWidth = Math.hypot(p.p101.x - p.p001.x, p.p101.y - p.p001.y);
  const topDepth = Math.hypot(p.p011.x - p.p001.x, p.p011.y - p.p001.y);
  if (topWidth < 54 || topDepth < 22) return;
  const cx = (p.p001.x + p.p101.x + p.p111.x + p.p011.x) / 4;
  const cy = (p.p001.y + p.p101.y + p.p111.y + p.p011.y) / 4;
  const label = box.name.length > 7 ? `${box.name.slice(0, 7)}...` : box.name;
  ctx.save();
  ctx.font = "11px Microsoft YaHei";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const textWidth = ctx.measureText(label).width + 10;
  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.fillRect(cx - textWidth / 2, cy - 9, textWidth, 18);
  ctx.fillStyle = "rgba(23,33,47,0.82)";
  ctx.fillText(label, cx, cy);
  ctx.restore();
}

function cuboidPoints(box, project) {
  return {
    p000: project(box.x, box.y, box.z),
    p100: project(box.x + box.l, box.y, box.z),
    p010: project(box.x, box.y + box.w, box.z),
    p110: project(box.x + box.l, box.y + box.w, box.z),
    p001: project(box.x, box.y, box.z + box.h),
    p101: project(box.x + box.l, box.y, box.z + box.h),
    p011: project(box.x, box.y + box.w, box.z + box.h),
    p111: project(box.x + box.l, box.y + box.w, box.z + box.h)
  };
}

function strokeCuboid(ctx, p) {
  [[p.p000, p.p100], [p.p100, p.p110], [p.p110, p.p010], [p.p010, p.p000],
   [p.p001, p.p101], [p.p101, p.p111], [p.p111, p.p011], [p.p011, p.p001],
   [p.p000, p.p001], [p.p100, p.p101], [p.p110, p.p111], [p.p010, p.p011]].forEach(([a, b]) => line(ctx, a, b));
}

function drawLayerGuide(ctx, result, width) {
  const levels = [...new Set(result.firstBox.placed.map((b) => Math.round(b.z)))].sort((a, b) => a - b).slice(0, 8);
  if (!levels.length) return;
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.76)";
  ctx.strokeStyle = "rgba(185,199,216,0.9)";
  ctx.lineWidth = 1;
  ctx.fillRect(width - 128, 65, 108, 28 + levels.length * 18);
  ctx.strokeRect(width - 128, 65, 108, 28 + levels.length * 18);
  ctx.font = "12px Microsoft YaHei";
  ctx.fillStyle = "#607086";
  ctx.fillText("层高参考", width - 114, 84);
  levels.forEach((z, index) => {
    ctx.fillText(`层 ${index + 1}: z=${z}cm`, width - 114, 104 + index * 18);
  });
  ctx.restore();
}

function drawAxisWidget(ctx, width, height) {
  const ox = width - 74;
  const oy = height - 44;
  const yaw = mainView.yaw;
  const vectors = [
    { label: "L", color: "#ef7c2a", x: Math.cos(yaw) * 34, y: Math.sin(yaw) * 13 },
    { label: "W", color: "#4e8fd0", x: -Math.sin(yaw) * 28, y: Math.cos(yaw) * 13 },
    { label: "H", color: "#25a389", x: 0, y: -34 }
  ];
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.strokeStyle = "rgba(185,199,216,0.85)";
  ctx.lineWidth = 1;
  ctx.fillRect(width - 126, height - 95, 108, 75);
  ctx.strokeRect(width - 126, height - 95, 108, 75);
  vectors.forEach((axis) => drawAxisArrow(ctx, ox, oy, ox + axis.x, oy + axis.y, axis.color, axis.label));
  ctx.restore();
}

function drawAxisArrow(ctx, x1, y1, x2, y2, color, label) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - Math.cos(angle - 0.55) * 8, y2 - Math.sin(angle - 0.55) * 8);
  ctx.lineTo(x2 - Math.cos(angle + 0.55) * 8, y2 - Math.sin(angle + 0.55) * 8);
  ctx.closePath();
  ctx.fill();
  ctx.font = "700 11px Arial";
  ctx.fillText(label, x2 + 5, y2 + 4);
}

function drawProjection(canvas, result, mode) {
  const { ctx, width, height } = prepareCanvas(canvas, 150);
  const c = result.container;
  const view = projectionViews[mode];
  const margin = 24;
  const dims = projectionDims(c, mode);
  const scale = Math.min((width - margin * 2) / dims.a, (height - margin * 2) / dims.b) * view.zoom;
  const ox = (width - dims.a * scale) / 2 + view.panX;
  const oy = (height - dims.b * scale) / 2 + view.panY;

  ctx.fillStyle = "#f6f9fc";
  ctx.fillRect(ox, oy, dims.a * scale, dims.b * scale);
  ctx.strokeStyle = "#4e72a2";
  ctx.lineWidth = 1.3;
  ctx.strokeRect(ox, oy, dims.a * scale, dims.b * scale);
  drawProjectionGrid(ctx, ox, oy, dims.a, dims.b, scale);

  const boxes = activeView === "free" ? result.firstBox.free : result.firstBox.placed;
  const limited = activeView === "free" ? boxes.slice(0, 60) : boxes;
  sortForProjection(limited, mode).forEach((box) => drawProjectionBox(ctx, box, mode, c, ox, oy, scale));

  ctx.strokeStyle = "#4e72a2";
  ctx.lineWidth = 1.3;
  ctx.strokeRect(ox, oy, dims.a * scale, dims.b * scale);

  ctx.fillStyle = "#607086";
  ctx.font = "12px Microsoft YaHei";
  const label = mode === "top" ? "顶视：看底面铺放" : mode === "front" ? "正视：看长度方向堆叠" : "侧视：看宽度方向堆叠";
  ctx.fillText(label, 12, 18);
  ctx.fillStyle = "#8290a4";
  ctx.fillText(`${Math.round(view.zoom * 100)}%`, width - 42, 18);
}

function sortForProjection(boxes, mode) {
  return [...boxes].sort((a, b) => {
    if (mode === "top") return (a.z + a.h) - (b.z + b.h);
    if (mode === "front") return (b.y + b.w) - (a.y + a.w);
    return (b.x + b.l) - (a.x + a.l);
  });
}

function drawProjectionBox(ctx, box, mode, c, ox, oy, scale) {
  const rect = projectRect(box, mode, c);
  const x = ox + rect.x * scale;
  const y = oy + rect.y * scale;
  const w = rect.w * scale;
  const h = rect.h * scale;
  if (w <= 0 || h <= 0) return;
  const zRatio = clamp((box.z || 0) / Math.max(1, c.h), 0, 1);
  const depthRatio = projectionDepthRatio(box, mode, c);
  const inset = activeView === "free" ? 0 : Math.min(3, Math.max(0.4, Math.min(w, h) * 0.035));

  ctx.save();
  ctx.globalAlpha = activeView === "free" ? 0.24 : 0.58 + zRatio * 0.22;
  ctx.fillStyle = activeView === "free" ? "#6da847" : shade(box.color, 0.78 + zRatio * 0.34 + depthRatio * 0.08);
  ctx.fillRect(x + inset, y + inset, Math.max(1, w - inset * 2), Math.max(1, h - inset * 2));
  ctx.globalAlpha = 1;
  ctx.strokeStyle = activeView === "free" ? "rgba(59,110,49,0.5)" : "rgba(8,22,38,0.38)";
  ctx.lineWidth = activeView === "free" ? 0.7 : 0.8;
  ctx.strokeRect(x + inset, y + inset, Math.max(1, w - inset * 2), Math.max(1, h - inset * 2));

  if (activeView !== "free" && mode === "top" && box.z > 0) {
    drawHatch(ctx, x + inset, y + inset, Math.max(1, w - inset * 2), Math.max(1, h - inset * 2));
  }
  if (activeView !== "free" && w > 34 && h > 22 && box.z > 0) {
    const layer = Math.max(2, Math.round(box.z / Math.max(1, box.baseH || box.h)) + 1);
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.fillRect(x + 4, y + 4, 22, 16);
    ctx.fillStyle = "rgba(23,33,47,0.82)";
    ctx.font = "10px Arial";
    ctx.fillText(`L${layer}`, x + 8, y + 16);
  }
  ctx.restore();
}

function projectionDepthRatio(box, mode, c) {
  if (mode === "top") return clamp((box.z || 0) / Math.max(1, c.h), 0, 1);
  if (mode === "front") return clamp((box.y || 0) / Math.max(1, c.w), 0, 1);
  return clamp((box.x || 0) / Math.max(1, c.l), 0, 1);
}

function drawHatch(ctx, x, y, w, h) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.strokeStyle = "rgba(255,255,255,0.45)";
  ctx.lineWidth = 0.7;
  for (let i = -h; i < w; i += 10) {
    ctx.beginPath();
    ctx.moveTo(x + i, y + h);
    ctx.lineTo(x + i + h, y);
    ctx.stroke();
  }
  ctx.restore();
}

function projectionDims(c, mode) {
  if (mode === "top") return { a: c.l, b: c.w };
  if (mode === "front") return { a: c.l, b: c.h };
  return { a: c.w, b: c.h };
}

function projectRect(box, mode, c) {
  if (mode === "top") return { x: box.x, y: box.y, w: box.l, h: box.w };
  if (mode === "front") return { x: box.x, y: c.h - box.z - box.h, w: box.l, h: box.h };
  return { x: box.y, y: c.h - box.z - box.h, w: box.w, h: box.h };
}

function drawProjectionGrid(ctx, ox, oy, a, b, scale) {
  ctx.strokeStyle = "rgba(111,132,158,0.22)";
  ctx.lineWidth = 0.5;
  for (let i = 1; i < 8; i += 1) {
    const x = ox + a * scale * i / 8;
    ctx.beginPath();
    ctx.moveTo(x, oy);
    ctx.lineTo(x, oy + b * scale);
    ctx.stroke();
  }
  for (let i = 1; i < 4; i += 1) {
    const y = oy + b * scale * i / 4;
    ctx.beginPath();
    ctx.moveTo(ox, y);
    ctx.lineTo(ox + a * scale, y);
    ctx.stroke();
  }
}

function drawMainTitle(ctx, result) {
  ctx.fillStyle = "#17212f";
  ctx.font = "700 18px Microsoft YaHei";
  ctx.fillText(`${result.container.name} 第 1 箱摆放示意`, 24, 34);
  ctx.fillStyle = "#607086";
  ctx.font = "13px Microsoft YaHei";
  ctx.fillText("颜色代表不同货物；主视图看整体，三视图用于确认铺放、层数和高度占用。", 24, 58);
}

function polygon(ctx, points, fill) {
  ctx.beginPath();
  points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
  ctx.closePath();
  if (fill) ctx.fill();
  ctx.stroke();
}

function line(ctx, a, b) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

function shade(hex, factor) {
  const value = hex.replace("#", "");
  const r = Math.min(255, Math.max(0, parseInt(value.slice(0, 2), 16) * factor));
  const g = Math.min(255, Math.max(0, parseInt(value.slice(2, 4), 16) * factor));
  const b = Math.min(255, Math.max(0, parseInt(value.slice(4, 6), 16) * factor));
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

function loadSampleData(showMessage) {
  cargoMap.clear();
  [
    { name: "纸箱 A", l: 60, w: 40, h: 35, qty: 80, weight: 12, type: "normal" },
    { name: "托盘货 B", l: 110, w: 100, h: 120, qty: 6, weight: 180, type: "pallet" },
    { name: "易碎品 C", l: 55, w: 45, h: 50, qty: 12, weight: 18, type: "nonstack" }
  ].forEach((cargo, index) => {
    const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + index);
    cargoMap.set(id, { ...cargo, id, color: colors[index % colors.length] });
  });
  selectedCargoId = null;
  saveLocal();
  if (els.containerSelect.options.length) render();
  if (showMessage) showToast("已套用示例货物。");
}

function loadLocal() {
  try {
    const saved = JSON.parse(localStorage.getItem("cargo-bs-planner") || "{}");
    const savedCargo = Array.isArray(saved) ? saved : saved.cargos;
    const savedContainers = Array.isArray(saved.containers) ? saved.containers.map(withVolume) : null;
    if (savedContainers?.length) containers = savedContainers;
    if (Array.isArray(savedCargo)) {
      savedCargo.forEach((cargo, index) => cargoMap.set(cargo.id, { ...cargo, color: cargo.color || colors[index % colors.length] }));
    }
  } catch {
    localStorage.removeItem("cargo-bs-planner");
  }
}

function saveLocal() {
  localStorage.setItem("cargo-bs-planner", JSON.stringify({
    containers,
    cargos: [...cargoMap.values()]
  }));
}

function exportCsv() {
  const header = ["name", "length_cm", "width_cm", "height_cm", "qty", "weight_kg", "type"];
  const rows = [...cargoMap.values()].map((c) => [c.name, c.l, c.w, c.h, c.qty, c.weight, c.type]);
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "cargo-plan.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function importCsv(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const rows = parseCsv(String(reader.result || ""));
    const data = rows[0]?.[0] === "name" ? rows.slice(1) : rows;
    cargoMap.clear();
    data.filter((row) => row.length >= 6).forEach((row, index) => {
      const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + index);
      cargoMap.set(id, {
        id,
        name: row[0] || "导入货物",
        l: Number(row[1]),
        w: Number(row[2]),
        h: Number(row[3]),
        qty: Math.max(1, Math.round(Number(row[4]))),
        weight: Number(row[5]),
        type: typeRules[row[6]] ? row[6] : "normal",
        color: colors[index % colors.length]
      });
    });
    selectedCargoId = null;
    saveLocal();
    render();
    event.target.value = "";
  };
  reader.readAsText(file, "utf-8");
}

function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i], next = text[i + 1];
    if (ch === '"' && quoted && next === '"') {
      cell += '"';
      i += 1;
    } else if (ch === '"') {
      quoted = !quoted;
    } else if (ch === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && next === "\n") i += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function withVolume(container) {
  return { ...container, volume: (container.l * container.w * container.h) / 1000000 };
}

function getContainer(id) {
  return containers.find((c) => c.id === id) || containers[0];
}

function rawCargoVolume(cargo) {
  return (cargo.l * cargo.w * cargo.h * cargo.qty) / 1000000;
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function format1(value) {
  return Number.isFinite(value) ? Number(value).toFixed(1) : "-";
}

function format2(value) {
  return Number.isFinite(value) ? Number(value).toFixed(2) : "-";
}

function formatKg(value) {
  return value >= 1000 ? `${format2(value / 1000)} t` : `${format1(value)} kg`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.remove("show"), 2200);
}
