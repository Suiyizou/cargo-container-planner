const REPORT_COLORS = ["#2a9d8f", "#3b82f6", "#8b5cf6", "#f97316", "#e11d48", "#65a30d", "#0891b2", "#c026d3", "#ca8a04", "#475569"];
const PAGE_WIDTH = 1800;
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
  const legendHeight = Math.max(86, 54 + Math.ceil(catalog.length / 4) * 46);
  const layerCardHeight = 520;
  const height = 150 + 112 + legendHeight + 590 + layers.length * (layerCardHeight + 24) + 70;
  const canvas = document.createElement("canvas");
  canvas.width = PAGE_WIDTH;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#f4f7fb";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  let y = 0;
  drawHeader(ctx, options, catalog, layers);
  y += 150;
  drawSummary(ctx, 48, y, PAGE_WIDTH - 96, 88, options, placements, layers);
  y += 112;
  drawLegend(ctx, 48, y, PAGE_WIDTH - 96, legendHeight, catalog);
  y += legendHeight + 24;
  drawOverview(ctx, 48, y, PAGE_WIDTH - 96, 566, container, placements, options);
  y += 590;

  layers.forEach((layer, index) => {
    drawLayerBreakdown(ctx, 48, y, PAGE_WIDTH - 96, layerCardHeight, container, layer, index, layers.length);
    y += layerCardHeight + 24;
  });

  drawFooter(ctx, height - 38);
  return canvas;
}

function drawHeader(ctx, options, catalog, layers) {
  const gradient = ctx.createLinearGradient(0, 0, PAGE_WIDTH, 0);
  gradient.addColorStop(0, "#ffffff");
  gradient.addColorStop(1, "#eaf4ff");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, PAGE_WIDTH, 150);

  ctx.fillStyle = "#1f6fbe";
  roundRect(ctx, 48, 42, 62, 62, 15);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 26px Microsoft YaHei, Arial";
  ctx.fillText("CP", 64, 82);

  ctx.fillStyle = "#122033";
  ctx.font = "800 40px Microsoft YaHei, Arial";
  ctx.fillText("装箱分层剖析图", 132, 68);
  ctx.fillStyle = "#52657b";
  ctx.font = "400 18px Microsoft YaHei, Arial";
  ctx.fillText("整体俯视 + 分层俯视 + 分层 45° 斜视，颜色和编号对应当前录入货物顺序", 134, 104);

  const rightX = 1240;
  ctx.fillStyle = "#174a7f";
  ctx.font = "800 22px Microsoft YaHei, Arial";
  ctx.fillText(`${options.container?.name || "-"} · 第 ${options.boxIndex || 1} 货舱`, rightX, 58);
  ctx.fillStyle = "#52657b";
  ctx.font = "400 17px Microsoft YaHei, Arial";
  ctx.fillText(`生成时间：${new Date().toLocaleString("zh-CN")}`, rightX, 92);
  ctx.fillText(`货物类别：${catalog.length} 类 · 分层数量：${layers.length} 层`, rightX, 122);
}

function drawSummary(ctx, x, y, width, height, options, placements, layers) {
  drawCard(ctx, x, y, width, height);
  const evaluation = options.evaluation || {};
  const values = [
    ["箱型尺寸", `${options.container.lengthCm} × ${options.container.widthCm} × ${options.container.heightCm} cm`],
    ["预计箱数", `${evaluation.estimatedBoxes ? "约 " : ""}${evaluation.boxes || "-"} 箱`],
    ["首箱空间占用", `${formatNum(evaluation.firstBoxFillPercent)}%`],
    ["货物总体积", `${formatNum(evaluation.totalRawVolumeM3, 2)} m³`],
    ["货物总重量", `${formatNum((evaluation.totalWeightKg || 0) / 1000, 2)} t`],
    ["当前货舱", `${placements.length} 件 / ${layers.length} 层`]
  ];
  values.forEach((item, index) => {
    const cellWidth = width / values.length;
    const cx = x + index * cellWidth + 24;
    ctx.fillStyle = "#64748b";
    ctx.font = "400 16px Microsoft YaHei, Arial";
    ctx.fillText(item[0], cx, y + 30);
    ctx.fillStyle = "#132033";
    ctx.font = "800 23px Microsoft YaHei, Arial";
    ctx.fillText(item[1], cx, y + 62);
  });
}

function drawLegend(ctx, x, y, width, height, catalog) {
  drawCard(ctx, x, y, width, height);
  ctx.fillStyle = "#132033";
  ctx.font = "800 23px Microsoft YaHei, Arial";
  ctx.fillText("货物编号与颜色图例", x + 24, y + 32);
  ctx.fillStyle = "#64748b";
  ctx.font = "400 15px Microsoft YaHei, Arial";
  ctx.fillText("图中 #编号 对应货物；X向/Y向表示货物原始哪条边落在箱体长/宽方向。", x + 250, y + 32);

  const columns = 4;
  const cellWidth = (width - 48) / columns;
  catalog.forEach((cargo, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const cellX = x + 24 + col * cellWidth;
    const cellY = y + 58 + row * 46;
    ctx.fillStyle = cargo.color;
    roundRect(ctx, cellX, cellY - 2, 34, 30, 8);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 14px Microsoft YaHei, Arial";
    centerText(ctx, `#${cargo.no}`, cellX + 17, cellY + 18);
    ctx.fillStyle = "#132033";
    ctx.font = "800 16px Microsoft YaHei, Arial";
    ctx.fillText(`#${cargo.no} ${cargo.name}`, cellX + 46, cellY + 10);
    ctx.fillStyle = "#52657b";
    ctx.font = "400 13px Microsoft YaHei, Arial";
    ctx.fillText(`${cargo.lengthCm} × ${cargo.widthCm} × ${cargo.heightCm} cm / ${cargo.quantity || 0} 件`, cellX + 46, cellY + 30);
  });
}

function drawOverview(ctx, x, y, width, height, container, placements, options) {
  drawSectionCard(ctx, x, y, width, height, "整体视图", `当前箱型：${container.name} / 第 ${options.boxIndex || 1} 货舱。左侧看铺底关系，右侧看整体堆叠层次。`);
  const gap = 24;
  const plotY = y + 82;
  const plotHeight = height - 112;
  const leftWidth = Math.round(width * 0.52);
  const rightWidth = width - leftWidth - gap - 48;
  drawTopProjection(ctx, { x: x + 24, y: plotY, width: leftWidth, height: plotHeight }, container, placements, {
    title: "整体俯视图",
    note: "X=长，Y=宽；重叠区域按高度由低到高覆盖"
  });
  drawIsoProjection(ctx, { x: x + 24 + leftWidth + gap, y: plotY, width: rightWidth, height: plotHeight }, container, placements, {
    title: "整体 45° 斜视图",
    note: "用于识别堆叠高度、层间关系和旋转方向"
  });
}

function drawLayerBreakdown(ctx, x, y, width, height, container, layer, index, totalLayers) {
  const title = `第 ${index + 1} 层 / 共 ${totalLayers} 层：z=${formatNum(layer.z)} cm`;
  const subtitle = `高度范围 ${formatNum(layer.z)}-${formatNum(layer.top)} cm；本行将该层像魔方切片一样单独展开。`;
  drawSectionCard(ctx, x, y, width, height, title, subtitle);

  const gap = 24;
  const statsWidth = 330;
  const plotY = y + 82;
  const plotHeight = height - 112;
  const topWidth = Math.round((width - 48 - gap * 2 - statsWidth) * 0.48);
  const isoWidth = width - 48 - gap * 2 - statsWidth - topWidth;
  const topPlot = { x: x + 24, y: plotY, width: topWidth, height: plotHeight };
  const isoPlot = { x: topPlot.x + topWidth + gap, y: plotY, width: isoWidth, height: plotHeight };
  drawTopProjection(ctx, topPlot, container, layer.items, {
    title: "分层俯视图",
    note: "仅显示本层货物底面"
  });
  drawIsoProjection(ctx, isoPlot, container, layer.items, {
    title: "分层 45° 斜视图",
    note: "本层单独抬出展示",
    normalizeZ: true,
    layerZ: layer.z
  });
  drawLayerStats(ctx, isoPlot.x + isoWidth + gap, plotY, statsWidth, plotHeight, layer.items);
}

function drawTopProjection(ctx, plot, container, items, config = {}) {
  drawPlotFrame(ctx, plot, config.title, config.note);
  const inner = inset(plot, 36, 52, 26, 34);
  const scale = Math.min(inner.width / container.lengthCm, inner.height / container.widthCm);
  const w = container.lengthCm * scale;
  const h = container.widthCm * scale;
  const ox = inner.x + (inner.width - w) / 2;
  const oy = inner.y + (inner.height - h) / 2;

  drawGrid(ctx, ox, oy, w, h);
  [...items]
    .sort((a, b) => a.zCm - b.zCm || a.yCm - b.yCm || a.xCm - b.xCm)
    .forEach((item) => {
      const rx = ox + item.xCm * scale;
      const ry = oy + item.yCm * scale;
      const rw = Math.max(2, item.lengthCm * scale);
      const rh = Math.max(2, item.widthCm * scale);
      ctx.fillStyle = hexToRgba(item.color, 0.78);
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeStyle = hexToRgba("#12263f", 0.45);
      ctx.lineWidth = 1.4;
      ctx.strokeRect(rx, ry, rw, rh);
      drawCargoLabel(ctx, item, rx, ry, rw, rh, { compact: rw < 76 || rh < 48 });
    });

  ctx.strokeStyle = "#1f6fbe";
  ctx.lineWidth = 2;
  ctx.strokeRect(ox, oy, w, h);
  drawDimensionLabels(ctx, ox, oy, w, h, container);
}

function drawIsoProjection(ctx, plot, container, items, config = {}) {
  drawPlotFrame(ctx, plot, config.title, config.note);
  const inner = inset(plot, 28, 52, 28, 30);
  const zOffset = config.normalizeZ ? Math.min(...items.map((item) => Number(item.zCm || 0)), 0) : 0;
  const bounds = isoBounds(container, items, zOffset);
  const scale = Math.min(inner.width / Math.max(1, bounds.width), inner.height / Math.max(1, bounds.height)) * 0.86;
  const origin = {
    x: inner.x + inner.width / 2 - ((bounds.minX + bounds.maxX) / 2) * scale,
    y: inner.y + inner.height / 2 - ((bounds.minY + bounds.maxY) / 2) * scale + 12
  };

  drawIsoContainer(ctx, container, origin, scale);
  [...items]
    .sort((a, b) => (a.xCm + a.yCm + a.zCm) - (b.xCm + b.yCm + b.zCm))
    .forEach((item) => drawIsoBox(ctx, item, origin, scale, zOffset));

  if (config.normalizeZ) {
    ctx.fillStyle = "#64748b";
    ctx.font = "400 13px Microsoft YaHei, Arial";
    ctx.fillText(`原始 z=${formatNum(config.layerZ || 0)} cm，本视图已单独抬出`, plot.x + 22, plot.y + plot.height - 16);
  }
}

function drawLayerStats(ctx, x, y, width, height, items) {
  drawPlotFrame(ctx, { x, y, width, height }, "本层统计", "X向=箱体长方向，Y向=箱体宽方向");
  const stats = countByCargo(items);
  let rowY = y + 72;
  stats.forEach((item) => {
    if (rowY > y + height - 46) return;
    ctx.fillStyle = item.color;
    roundRect(ctx, x + 18, rowY - 20, 28, 28, 7);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 12px Microsoft YaHei, Arial";
    centerText(ctx, `#${item.cargoNo}`, x + 32, rowY - 2);
    ctx.fillStyle = "#132033";
    ctx.font = "800 15px Microsoft YaHei, Arial";
    ctx.fillText(item.name, x + 58, rowY - 7);
    ctx.fillStyle = "#52657b";
    ctx.font = "400 13px Microsoft YaHei, Arial";
    ctx.fillText(`${item.count} 件`, x + 58, rowY + 14);
    const details = item.orientationDetails.slice(0, 2);
    details.forEach((detail, detailIndex) => {
      wrapText(ctx, detail, x + 18, rowY + 38 + detailIndex * 18, width - 36, 16, 1);
    });
    if (item.orientationDetails.length > 2) {
      ctx.fillText(`另有 ${item.orientationDetails.length - 2} 种方向`, x + 18, rowY + 38 + details.length * 18);
    }
    rowY += 98;
  });
}

function drawIsoBox(ctx, item, origin, scale, zOffset = 0) {
  const x = Number(item.xCm || 0);
  const y = Number(item.yCm || 0);
  const z = Number(item.zCm || 0) - zOffset;
  const l = Number(item.lengthCm || 0);
  const w = Number(item.widthCm || 0);
  const h = Number(item.heightCm || 0);
  const points = {
    a: isoPoint(x, y, z, origin, scale),
    b: isoPoint(x + l, y, z, origin, scale),
    c: isoPoint(x + l, y + w, z, origin, scale),
    d: isoPoint(x, y + w, z, origin, scale),
    e: isoPoint(x, y, z + h, origin, scale),
    f: isoPoint(x + l, y, z + h, origin, scale),
    g: isoPoint(x + l, y + w, z + h, origin, scale),
    hh: isoPoint(x, y + w, z + h, origin, scale)
  };
  const color = item.color || "#4e8fd0";
  drawPolygon(ctx, [points.d, points.c, points.g, points.hh], shadeColor(color, -0.14), "#1f314855");
  drawPolygon(ctx, [points.b, points.c, points.g, points.f], shadeColor(color, -0.06), "#1f314855");
  drawPolygon(ctx, [points.e, points.f, points.g, points.hh], shadeColor(color, 0.12), "#1f314866");

  const labelPoint = centroid([points.e, points.f, points.g, points.hh]);
  drawIsoLabel(ctx, item, labelPoint.x, labelPoint.y);
}

function drawIsoContainer(ctx, container, origin, scale) {
  const l = container.lengthCm;
  const w = container.widthCm;
  const h = container.heightCm;
  const vertices = [
    [0, 0, 0], [l, 0, 0], [l, w, 0], [0, w, 0],
    [0, 0, h], [l, 0, h], [l, w, h], [0, w, h]
  ].map(([x, y, z]) => isoPoint(x, y, z, origin, scale));
  const edges = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
  ctx.save();
  ctx.strokeStyle = "#1f6fbe";
  ctx.lineWidth = 1.6;
  edges.forEach(([a, b]) => {
    ctx.beginPath();
    ctx.moveTo(vertices[a].x, vertices[a].y);
    ctx.lineTo(vertices[b].x, vertices[b].y);
    ctx.stroke();
  });
  ctx.restore();
}

function isoBounds(container, items, zOffset = 0) {
  const points = [];
  const pushBox = (x, y, z, l, w, h) => {
    [[0, 0, 0], [l, 0, 0], [l, w, 0], [0, w, 0], [0, 0, h], [l, 0, h], [l, w, h], [0, w, h]]
      .forEach(([dx, dy, dz]) => points.push(isoRaw(x + dx, y + dy, z + dz - zOffset)));
  };
  pushBox(0, 0, 0, container.lengthCm, container.widthCm, container.heightCm);
  items.forEach((item) => pushBox(item.xCm, item.yCm, item.zCm, item.lengthCm, item.widthCm, item.heightCm));
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
}

function isoPoint(x, y, z, origin, scale) {
  const raw = isoRaw(x, y, z);
  return { x: origin.x + raw.x * scale, y: origin.y + raw.y * scale };
}

function isoRaw(x, y, z) {
  const angleX = Math.cos(Math.PI / 6);
  const angleY = Math.sin(Math.PI / 6);
  return {
    x: (Number(x || 0) - Number(y || 0)) * angleX,
    y: (Number(x || 0) + Number(y || 0)) * angleY - Number(z || 0) * 0.82
  };
}

function drawCargoLabel(ctx, item, x, y, width, height, options = {}) {
  const label = `#${item.cargoNo}`;
  const size = options.compact ? 13 : Math.max(13, Math.min(20, Math.floor(Math.min(width, height) * 0.32)));
  ctx.font = `800 ${size}px Microsoft YaHei, Arial`;
  const labelWidth = ctx.measureText(label).width + 14;
  const pillWidth = Math.min(Math.max(labelWidth, 34), Math.max(width - 6, 34));
  const pillHeight = Math.min(size + 12, Math.max(height - 6, size + 8));
  const px = x + width / 2 - pillWidth / 2;
  const py = y + height / 2 - pillHeight / 2;
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  roundRect(ctx, px, py, pillWidth, pillHeight, Math.min(10, pillHeight / 2));
  ctx.fill();
  ctx.fillStyle = "#132033";
  centerText(ctx, label, x + width / 2, py + pillHeight / 2 + size * 0.36);

  if (!options.compact && width > 92 && height > 60) {
    const lines = [
      `X:${item.xAxis || "长"}${formatNum(item.xAxisBaseCm, 0)}`,
      `Y:${item.yAxis || "宽"}${formatNum(item.yAxisBaseCm, 0)}`
    ];
    ctx.font = "700 11px Microsoft YaHei, Arial";
    const textY = py + pillHeight + 14;
    if (textY + 16 < y + height - 5) {
      const labelWidth = Math.min(Math.max(...lines.map((line) => ctx.measureText(line).width)) + 12, width - 8);
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      roundRect(ctx, x + width / 2 - labelWidth / 2, textY - 12, labelWidth, 34, 7);
      ctx.fill();
      ctx.fillStyle = "#1f3148";
      centerText(ctx, lines[0], x + width / 2, textY);
      centerText(ctx, lines[1], x + width / 2, textY + 15);
    }
  }
}

function drawIsoLabel(ctx, item, x, y) {
  const label = `#${item.cargoNo}`;
  ctx.font = "800 13px Microsoft YaHei, Arial";
  const width = ctx.measureText(label).width + 14;
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  roundRect(ctx, x - width / 2, y - 22, width, 22, 8);
  ctx.fill();
  ctx.fillStyle = "#132033";
  centerText(ctx, label, x, y - 7);
}

function drawSectionCard(ctx, x, y, width, height, title, subtitle) {
  drawCard(ctx, x, y, width, height);
  ctx.fillStyle = "#132033";
  ctx.font = "800 25px Microsoft YaHei, Arial";
  ctx.fillText(title, x + 24, y + 38);
  ctx.fillStyle = "#64748b";
  ctx.font = "400 15px Microsoft YaHei, Arial";
  ctx.fillText(subtitle, x + 24, y + 66);
}

function drawPlotFrame(ctx, plot, title, note) {
  ctx.fillStyle = "#f8fbff";
  roundRect(ctx, plot.x, plot.y, plot.width, plot.height, 12);
  ctx.fill();
  ctx.strokeStyle = "#d3deea";
  ctx.lineWidth = 1.3;
  ctx.stroke();
  ctx.fillStyle = "#132033";
  ctx.font = "800 17px Microsoft YaHei, Arial";
  ctx.fillText(title, plot.x + 18, plot.y + 28);
  if (note) {
    ctx.fillStyle = "#64748b";
    ctx.font = "400 13px Microsoft YaHei, Arial";
    ctx.fillText(note, plot.x + 18, plot.y + 48);
  }
}

function drawGrid(ctx, x, y, width, height) {
  ctx.strokeStyle = "#d9e6f3";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 10; i += 1) {
    const gx = x + (width * i) / 10;
    const gy = y + (height * i) / 10;
    ctx.beginPath();
    ctx.moveTo(gx, y);
    ctx.lineTo(gx, y + height);
    ctx.moveTo(x, gy);
    ctx.lineTo(x + width, gy);
    ctx.stroke();
  }
}

function drawDimensionLabels(ctx, ox, oy, width, height, container) {
  ctx.fillStyle = "#2d5f93";
  ctx.font = "700 14px Microsoft YaHei, Arial";
  centerText(ctx, `长 ${container.lengthCm} cm`, ox + width / 2, oy - 10);
  ctx.save();
  ctx.translate(ox - 14, oy + height / 2);
  ctx.rotate(-Math.PI / 2);
  centerText(ctx, `宽 ${container.widthCm} cm`, 0, 0);
  ctx.restore();
}

function drawFooter(ctx, y) {
  ctx.strokeStyle = "#d3deea";
  ctx.beginPath();
  ctx.moveTo(48, y - 22);
  ctx.lineTo(PAGE_WIDTH - 48, y - 22);
  ctx.stroke();
  ctx.fillStyle = "#64748b";
  ctx.font = "400 14px Microsoft YaHei, Arial";
  ctx.fillText("说明：分层按货物底面 z 坐标分组；矩形和立方体外廓包含计算间隙；编号、颜色与当前录入货物顺序保持一致。", 48, y);
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
      map.set(key, { cargoNo: item.cargoNo, name: item.name, color: item.color, count: 0, bottomFaces: new Set(), orientationDetails: new Set() });
    }
    const current = map.get(key);
    current.count += 1;
    current.bottomFaces.add(item.bottomFace || "长×宽");
    current.orientationDetails.add(orientationDetail(item));
  });
  return [...map.values()]
    .map((item) => ({ ...item, bottomFaces: [...item.bottomFaces], orientationDetails: [...item.orientationDetails] }))
    .sort((a, b) => a.cargoNo - b.cargoNo);
}

function orientationDetail(item) {
  return [
    `X向=${item.xAxis || "长"}${formatNum(item.xAxisBaseCm, 0)}cm`,
    `Y向=${item.yAxis || "宽"}${formatNum(item.yAxisBaseCm, 0)}cm`,
    `Z向=${item.zAxis || item.heightAxis || "高"}${formatNum(item.zAxisBaseCm, 0)}cm`
  ].join(" / ");
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 2) {
  const chars = String(text || "").split("");
  let line = "";
  let lines = 0;
  for (const char of chars) {
    const testLine = line + char;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      ctx.fillText(lines === maxLines - 1 ? `${line}...` : line, x, y + lines * lineHeight);
      lines += 1;
      line = char;
      if (lines >= maxLines) return;
    } else {
      line = testLine;
    }
  }
  if (line && lines < maxLines) ctx.fillText(line, x, y + lines * lineHeight);
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
  writeObject(1, "<< /Type /Catalog /Pages 2 0 R >>");
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
  ctx.lineWidth = 1.4;
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

function inset(rect, left, top, right, bottom) {
  return {
    x: rect.x + left,
    y: rect.y + top,
    width: rect.width - left - right,
    height: rect.height - top - bottom
  };
}

function drawPolygon(ctx, points, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.1;
  ctx.stroke();
}

function centroid(points) {
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length
  };
}

function centerText(ctx, text, x, y) {
  ctx.textAlign = "center";
  ctx.fillText(text, x, y);
  ctx.textAlign = "left";
}

function hexToRgb(hex) {
  const raw = String(hex || "#4e8fd0").replace("#", "");
  const full = raw.length === 3 ? raw.split("").map((x) => x + x).join("") : raw.padEnd(6, "0").slice(0, 6);
  const num = parseInt(full, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function hexToRgba(hex, alpha) {
  const rgb = hexToRgb(hex);
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function shadeColor(hex, amount) {
  const rgb = hexToRgb(hex);
  const shade = (value) => Math.max(0, Math.min(255, Math.round(value + (amount >= 0 ? (255 - value) * amount : value * amount))));
  return `rgb(${shade(rgb.r)}, ${shade(rgb.g)}, ${shade(rgb.b)})`;
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
