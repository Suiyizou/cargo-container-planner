const REPORT_COLORS = ["#2a9d8f", "#3b82f6", "#8b5cf6", "#f97316", "#e11d48", "#65a30d", "#0891b2", "#c026d3", "#ca8a04", "#475569"];
const PAGE_WIDTH = 1600;
const CARD_RADIUS = 18;

export async function exportPackingReport(options) {
  if (!options?.container || !options?.placements?.length) {
    throw new Error("当前货舱没有可导出的摆放结果。");
  }
  if (document.fonts?.ready) await document.fonts.ready;
  const canvas = renderReportCanvas(options);
  const fileBase = `装箱剖析-${safeFileName(options.container.name)}-第${options.boxIndex || 1}货舱`;
  if (options.format === "pdf") {
    const pdfBlob = await createPdfFromCanvas(canvas);
    downloadBlob(pdfBlob, `${fileBase}.pdf`);
    return;
  }
  const imageBlob = await canvasToBlob(canvas, "image/png", 1);
  downloadBlob(imageBlob, `${fileBase}.png`);
}

function renderReportCanvas(options) {
  const container = options.container;
  const catalog = buildCargoCatalog(options.cargos || [], options.placements || []);
  const placements = enrichPlacements(options.placements || [], catalog);
  const layers = buildLayers(placements);
  const legendRows = Math.max(1, Math.ceil(catalog.length / 2));
  const layerRows = Math.max(1, Math.ceil(layers.length / 2));
  const height = 220 + 132 + legendRows * 56 + 580 + layerRows * 500 + 96;
  const canvas = document.createElement("canvas");
  canvas.width = PAGE_WIDTH;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#f1f5f9";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawHeader(ctx, options, catalog);

  let y = 202;
  drawSummary(ctx, 48, y, PAGE_WIDTH - 96, 112, options, placements, layers);
  y += 140;
  drawLegend(ctx, 48, y, PAGE_WIDTH - 96, legendRows * 56 + 38, catalog);
  y += legendRows * 56 + 62;
  drawPlanCard(ctx, 48, y, PAGE_WIDTH - 96, 540, {
    title: "整体俯视图",
    subtitle: `当前箱型：${container.name} / 第 ${options.boxIndex || 1} 货舱，矩形内编号对应左侧录入货物顺序`,
    container,
    items: placements,
    showLayerList: true
  });
  y += 580;

  const cardGap = 24;
  const cardWidth = (PAGE_WIDTH - 96 - cardGap) / 2;
  const cardHeight = 470;
  layers.forEach((layer, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    drawPlanCard(ctx, 48 + col * (cardWidth + cardGap), y + row * (cardHeight + 30), cardWidth, cardHeight, {
      title: `第 ${index + 1} 层：z=${formatNum(layer.z)} cm`,
      subtitle: `高度范围 ${formatNum(layer.z)}-${formatNum(layer.top)} cm，单独展示本层底面起始货物`,
      container,
      items: layer.items,
      compact: true
    });
  });

  drawFooter(ctx, height - 48);
  return canvas;
}

function drawHeader(ctx, options, catalog) {
  const gradient = ctx.createLinearGradient(0, 0, PAGE_WIDTH, 0);
  gradient.addColorStop(0, "#ffffff");
  gradient.addColorStop(1, "#eaf3ff");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, PAGE_WIDTH, 178);
  ctx.fillStyle = "#1f6fbe";
  roundRect(ctx, 48, 44, 68, 68, 16);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 28px Microsoft YaHei, Arial";
  ctx.fillText("CP", 64, 88);
  ctx.fillStyle = "#132033";
  ctx.font = "800 42px Microsoft YaHei, Arial";
  ctx.fillText("装箱剖析报告", 140, 75);
  ctx.font = "400 20px Microsoft YaHei, Arial";
  ctx.fillStyle = "#52657b";
  ctx.fillText("按货物底面高度分层展示，颜色和编号对应当前录入货物顺序", 140, 114);
  ctx.fillStyle = "#174a7f";
  ctx.font = "700 22px Microsoft YaHei, Arial";
  ctx.fillText(`${options.container?.name || "-"} · 第 ${options.boxIndex || 1} 货舱`, 1120, 70);
  ctx.fillStyle = "#52657b";
  ctx.font = "400 18px Microsoft YaHei, Arial";
  ctx.fillText(`货物类别：${catalog.length} 类`, 1120, 106);
  ctx.fillText(`生成时间：${new Date().toLocaleString("zh-CN")}`, 1120, 136);
}

function drawSummary(ctx, x, y, width, height, options, placements, layers) {
  drawCard(ctx, x, y, width, height);
  const evaluation = options.evaluation || {};
  const values = [
    ["箱型尺寸", `${options.container.lengthCm} × ${options.container.widthCm} × ${options.container.heightCm} cm`],
    ["预计箱数", `${evaluation.estimatedBoxes ? "约 " : ""}${evaluation.boxes || "-"} 箱`],
    ["首箱空间占用", `${formatNum(evaluation.firstBoxFillPercent)}%`],
    ["总体积", `${formatNum(evaluation.totalRawVolumeM3, 2)} m³`],
    ["总重量", `${formatNum((evaluation.totalWeightKg || 0) / 1000, 2)} t`],
    ["当前货舱件数", `${placements.length} 件 / ${layers.length} 层`]
  ];
  values.forEach((item, index) => {
    const cellWidth = width / values.length;
    const cx = x + index * cellWidth + 24;
    ctx.fillStyle = "#64748b";
    ctx.font = "400 17px Microsoft YaHei, Arial";
    ctx.fillText(item[0], cx, y + 38);
    ctx.fillStyle = "#132033";
    ctx.font = "800 23px Microsoft YaHei, Arial";
    ctx.fillText(item[1], cx, y + 76);
  });
}

function drawLegend(ctx, x, y, width, height, catalog) {
  drawCard(ctx, x, y, width, height);
  ctx.fillStyle = "#132033";
  ctx.font = "800 24px Microsoft YaHei, Arial";
  ctx.fillText("货物编号与颜色图例", x + 24, y + 34);
  ctx.fillStyle = "#64748b";
  ctx.font = "400 16px Microsoft YaHei, Arial";
  ctx.fillText("导出图中矩形内的 #编号 对应下列货物，底面标注说明当前旋转摆放方向", x + 270, y + 34);

  catalog.forEach((cargo, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const cellX = x + 24 + col * (width / 2);
    const cellY = y + 66 + row * 56;
    ctx.fillStyle = cargo.color;
    roundRect(ctx, cellX, cellY, 34, 34, 8);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 15px Microsoft YaHei, Arial";
    centerText(ctx, `#${cargo.no}`, cellX + 17, cellY + 22);
    ctx.fillStyle = "#132033";
    ctx.font = "800 18px Microsoft YaHei, Arial";
    ctx.fillText(`#${cargo.no} ${cargo.name}`, cellX + 48, cellY + 15);
    ctx.fillStyle = "#52657b";
    ctx.font = "400 15px Microsoft YaHei, Arial";
    ctx.fillText(`${cargo.lengthCm} × ${cargo.widthCm} × ${cargo.heightCm} cm / ${cargo.quantity || 0} 件`, cellX + 48, cellY + 38);
  });
}

function drawPlanCard(ctx, x, y, width, height, config) {
  drawCard(ctx, x, y, width, height);
  ctx.fillStyle = "#132033";
  ctx.font = `800 ${config.compact ? 22 : 26}px Microsoft YaHei, Arial`;
  ctx.fillText(config.title, x + 24, y + 36);
  ctx.fillStyle = "#64748b";
  ctx.font = `400 ${config.compact ? 14 : 16}px Microsoft YaHei, Arial`;
  ctx.fillText(config.subtitle, x + 24, y + 64);

  const topOffset = config.compact ? 82 : 92;
  const rightPanel = config.compact ? 0 : 280;
  const plot = {
    x: x + 26,
    y: y + topOffset,
    width: width - 52 - rightPanel,
    height: height - topOffset - 28
  };
  drawTopProjection(ctx, plot, config.container, config.items);
  if (rightPanel) drawLayerMiniList(ctx, x + width - rightPanel + 20, y + topOffset, rightPanel - 44, plot.height, config.items);
}

function drawTopProjection(ctx, plot, container, items) {
  const pad = 28;
  const scale = Math.min((plot.width - pad * 2) / container.lengthCm, (plot.height - pad * 2) / container.widthCm);
  const w = container.lengthCm * scale;
  const h = container.widthCm * scale;
  const ox = plot.x + (plot.width - w) / 2;
  const oy = plot.y + (plot.height - h) / 2;

  ctx.fillStyle = "#f8fbff";
  roundRect(ctx, plot.x, plot.y, plot.width, plot.height, 12);
  ctx.fill();
  ctx.strokeStyle = "#d3deea";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.strokeStyle = "#d8e6f4";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 10; i += 1) {
    const gx = ox + (w * i) / 10;
    const gy = oy + (h * i) / 10;
    ctx.beginPath();
    ctx.moveTo(gx, oy);
    ctx.lineTo(gx, oy + h);
    ctx.moveTo(ox, gy);
    ctx.lineTo(ox + w, gy);
    ctx.stroke();
  }

  const sorted = [...items].sort((a, b) => a.zCm - b.zCm || a.yCm - b.yCm || a.xCm - b.xCm);
  sorted.forEach((item) => {
    const rx = ox + item.xCm * scale;
    const ry = oy + item.yCm * scale;
    const rw = Math.max(1, item.lengthCm * scale);
    const rh = Math.max(1, item.widthCm * scale);
    ctx.fillStyle = hexToRgba(item.color, 0.78);
    ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeStyle = hexToRgba("#12263f", 0.44);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(rx, ry, rw, rh);
    drawCargoNo(ctx, item, rx, ry, rw, rh);
  });

  ctx.strokeStyle = "#1f6fbe";
  ctx.lineWidth = 2;
  ctx.strokeRect(ox, oy, w, h);
  drawDimensionLabels(ctx, ox, oy, w, h, container);
}

function drawCargoNo(ctx, item, x, y, width, height) {
  const label = `#${item.cargoNo}`;
  const size = Math.max(12, Math.min(20, Math.floor(Math.min(width, height) * 0.32)));
  ctx.font = `800 ${size}px Microsoft YaHei, Arial`;
  const labelWidth = ctx.measureText(label).width + 12;
  const pillWidth = Math.min(Math.max(labelWidth, 28), Math.max(width - 4, 28));
  const pillHeight = Math.min(size + 10, Math.max(height - 4, size + 6));
  const px = x + width / 2 - pillWidth / 2;
  const py = y + height / 2 - pillHeight / 2;
  ctx.fillStyle = "rgba(255,255,255,0.86)";
  roundRect(ctx, px, py, pillWidth, pillHeight, Math.min(10, pillHeight / 2));
  ctx.fill();
  ctx.fillStyle = "#132033";
  centerText(ctx, label, x + width / 2, py + pillHeight / 2 + size * 0.36);

  if (width > 68 && height > 44) {
    const bottomLabel = `底:${item.bottomFace || "长×宽"}`;
    ctx.font = `700 ${Math.max(10, Math.min(13, Math.floor(width / 8)))}px Microsoft YaHei, Arial`;
    const textY = py + pillHeight + 15;
    if (textY < y + height - 4) {
      ctx.fillStyle = "rgba(255,255,255,0.78)";
      const bottomWidth = Math.min(ctx.measureText(bottomLabel).width + 10, width - 6);
      roundRect(ctx, x + width / 2 - bottomWidth / 2, textY - 13, bottomWidth, 18, 7);
      ctx.fill();
      ctx.fillStyle = "#1f3148";
      centerText(ctx, bottomLabel, x + width / 2, textY);
    }
  }
}

function drawDimensionLabels(ctx, ox, oy, width, height, container) {
  ctx.fillStyle = "#2d5f93";
  ctx.font = "700 15px Microsoft YaHei, Arial";
  centerText(ctx, `长 ${container.lengthCm} cm`, ox + width / 2, oy - 12);
  ctx.save();
  ctx.translate(ox - 14, oy + height / 2);
  ctx.rotate(-Math.PI / 2);
  centerText(ctx, `宽 ${container.widthCm} cm`, 0, 0);
  ctx.restore();
}

function drawLayerMiniList(ctx, x, y, width, height, items) {
  const stats = countByCargo(items);
  ctx.fillStyle = "#132033";
  ctx.font = "800 19px Microsoft YaHei, Arial";
  ctx.fillText("本图货物统计", x, y + 20);
  let rowY = y + 54;
  stats.forEach((item) => {
    if (rowY > y + height - 44) return;
    ctx.fillStyle = item.color;
    roundRect(ctx, x, rowY - 18, 22, 22, 5);
    ctx.fill();
    ctx.fillStyle = "#132033";
    ctx.font = "700 16px Microsoft YaHei, Arial";
    ctx.fillText(`#${item.cargoNo} ${item.name}`, x + 34, rowY);
    ctx.fillStyle = "#64748b";
    ctx.font = "400 15px Microsoft YaHei, Arial";
    ctx.fillText(`${item.count} 件`, x + width - 56, rowY);
    ctx.fillText(`底面: ${item.bottomFaces.join("、")}`, x + 34, rowY + 22);
    rowY += 56;
  });
}

function drawFooter(ctx, y) {
  ctx.strokeStyle = "#d3deea";
  ctx.beginPath();
  ctx.moveTo(48, y - 28);
  ctx.lineTo(PAGE_WIDTH - 48, y - 28);
  ctx.stroke();
  ctx.fillStyle = "#64748b";
  ctx.font = "400 15px Microsoft YaHei, Arial";
  ctx.fillText("说明：分层图按货物底面 z 坐标分组，矩形外廓包含计算间隙；编号对应当前录入货物顺序。", 48, y);
}

function buildCargoCatalog(cargos, placements) {
  const placementColors = new Map();
  placements.forEach((item) => {
    if (item.cargoId && item.color && !placementColors.has(item.cargoId)) placementColors.set(item.cargoId, item.color);
  });
  return cargos.map((cargo, index) => ({
    ...cargo,
    no: index + 1,
    color: cargo.color || placementColors.get(cargo.id) || REPORT_COLORS[index % REPORT_COLORS.length]
  }));
}

function enrichPlacements(placements, catalog) {
  const byId = new Map(catalog.map((cargo) => [cargo.id, cargo]));
  const byName = new Map(catalog.map((cargo) => [cargo.name, cargo]));
  return placements.map((item, index) => {
    const cargo = byId.get(item.cargoId) || byName.get(item.name);
    return {
      ...item,
      cargoNo: cargo?.no || index + 1,
      color: item.color || cargo?.color || REPORT_COLORS[index % REPORT_COLORS.length]
    };
  });
}

function buildLayers(placements) {
  const map = new Map();
  placements.forEach((item) => {
    const z = roundLayer(item.zCm);
    if (!map.has(z)) map.set(z, []);
    map.get(z).push(item);
  });
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([z, items]) => ({
      z,
      top: Math.max(...items.map((item) => Number(item.zCm || 0) + Number(item.heightCm || 0))),
      items
    }));
}

function countByCargo(items) {
  const map = new Map();
  items.forEach((item) => {
    const key = item.cargoNo;
    if (!map.has(key)) {
      map.set(key, { cargoNo: item.cargoNo, name: item.name, color: item.color, count: 0, bottomFaces: new Set() });
    }
    const current = map.get(key);
    current.count += 1;
    current.bottomFaces.add(item.bottomFace || "长×宽");
  });
  return [...map.values()]
    .map((item) => ({ ...item, bottomFaces: [...item.bottomFaces] }))
    .sort((a, b) => a.cargoNo - b.cargoNo);
}

async function createPdfFromCanvas(sourceCanvas) {
  const pageWidthPt = 595.28;
  const pageHeightPt = 841.89;
  const sliceHeight = Math.floor(sourceCanvas.width * (pageHeightPt / pageWidthPt));
  const pages = [];
  for (let y = 0; y < sourceCanvas.height; y += sliceHeight) {
    const sliceCanvas = document.createElement("canvas");
    sliceCanvas.width = sourceCanvas.width;
    sliceCanvas.height = sliceHeight;
    const ctx = sliceCanvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
    ctx.drawImage(sourceCanvas, 0, y, sourceCanvas.width, Math.min(sliceHeight, sourceCanvas.height - y), 0, 0, sourceCanvas.width, Math.min(sliceHeight, sourceCanvas.height - y));
    pages.push(base64ToBytes(sliceCanvas.toDataURL("image/jpeg", 0.92).split(",")[1]));
  }
  return buildPdf(pages, sourceCanvas.width, sliceHeight, pageWidthPt, pageHeightPt);
}

function buildPdf(images, imageWidth, imageHeight, pageWidthPt, pageHeightPt) {
  const encoder = new TextEncoder();
  const parts = [];
  const offsets = [0];
  let length = 0;
  const addText = (text) => addBytes(encoder.encode(text));
  const addBytes = (bytes) => {
    parts.push(bytes);
    length += bytes.length;
  };
  const objectCount = 2 + images.length * 3;
  const pageObjectIds = images.map((_, index) => 3 + index * 3);
  const imageObjectIds = images.map((_, index) => 4 + index * 3);
  const contentObjectIds = images.map((_, index) => 5 + index * 3);

  addText("%PDF-1.4\n");
  writeObject(1, `<< /Type /Catalog /Pages 2 0 R >>`);
  writeObject(2, `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${images.length} >>`);

  images.forEach((imageBytes, index) => {
    const pageId = pageObjectIds[index];
    const imageId = imageObjectIds[index];
    const contentId = contentObjectIds[index];
    writeObject(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidthPt} ${pageHeightPt}] /Resources << /XObject << /Im${index + 1} ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    writeStreamObject(imageId, `<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.length} >>`, imageBytes);
    const content = `q ${pageWidthPt} 0 0 ${pageHeightPt} 0 0 cm /Im${index + 1} Do Q`;
    writeObject(contentId, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });

  const xrefStart = length;
  addText(`xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`);
  for (let id = 1; id <= objectCount; id += 1) {
    addText(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  }
  addText(`trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

  return new Blob(parts, { type: "application/pdf" });

  function writeObject(id, body) {
    offsets[id] = length;
    addText(`${id} 0 obj\n${body}\nendobj\n`);
  }

  function writeStreamObject(id, dictionary, streamBytes) {
    offsets[id] = length;
    addText(`${id} 0 obj\n${dictionary}\nstream\n`);
    addBytes(streamBytes);
    addText("\nendstream\nendobj\n");
  }
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("导出图片失败。"));
    }, type, quality);
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function drawCard(ctx, x, y, width, height) {
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, x, y, width, height, CARD_RADIUS);
  ctx.fill();
  ctx.strokeStyle = "#d3deea";
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function centerText(ctx, text, x, y) {
  ctx.textAlign = "center";
  ctx.fillText(text, x, y);
  ctx.textAlign = "left";
}

function hexToRgba(hex, alpha) {
  const raw = String(hex || "#4e8fd0").replace("#", "");
  const full = raw.length === 3 ? raw.split("").map((x) => x + x).join("") : raw.padEnd(6, "0").slice(0, 6);
  const num = parseInt(full, 16);
  return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`;
}

function formatNum(value, digits = 1) {
  return Number(value || 0).toLocaleString("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function roundLayer(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function safeFileName(value) {
  return String(value || "箱型").replace(/[\\/:*?"<>|]/g, "_");
}
