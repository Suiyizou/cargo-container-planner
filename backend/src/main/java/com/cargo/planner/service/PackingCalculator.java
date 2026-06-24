package com.cargo.planner.service;

import com.cargo.planner.dto.BoxResultDto;
import com.cargo.planner.dto.CargoItem;
import com.cargo.planner.dto.ContainerEvaluationDto;
import com.cargo.planner.dto.ContainerSpec;
import com.cargo.planner.dto.PackingRequest;
import com.cargo.planner.dto.PackingResultDto;
import com.cargo.planner.dto.PlacementDto;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import org.springframework.stereotype.Service;

@Service
public class PackingCalculator {
  private static final Map<String, TypeRule> TYPE_RULES = Map.of(
      "normal", new TypeRule(true, false, 0),
      "upright", new TypeRule(false, false, 1),
      "nonstack", new TypeRule(true, true, 2),
      "pallet", new TypeRule(false, false, 3)
  );
  private static final List<String> COLORS = List.of(
      "#ef7c2a", "#4e8fd0", "#8b62c8", "#25a389", "#d25f74", "#f2b13e", "#6da847", "#c96b36", "#5e77d6"
  );

  public PackingResultDto calculate(PackingRequest request) {
    List<Unit> units = expandUnits(request.cargos(), request.safeGlobalGapCm());
    Totals totals = totals(request.cargos());
    List<ContainerEvaluationDto> evaluations = request.containers().stream()
        .map(container -> evaluateContainer(container, units, totals, request.safeUtilizationPercent()))
        .sorted(this::compareEvaluation)
        .toList();
    String bestContainerId = evaluations.isEmpty() ? null : evaluations.get(0).container().id();
    return new PackingResultDto(bestContainerId, evaluations);
  }

  private ContainerEvaluationDto evaluateContainer(ContainerSpec container, List<Unit> units, Totals totals, double utilizationPercent) {
    MultiPack multi = packMultiple(container, units);
    double usableVolume = container.volumeM3() * utilizationPercent / 100.0;
    double firstPackedVolume = multi.firstBox.placed.stream().mapToDouble(unit -> unit.volumeM3).sum();
    double fillPercent = usableVolume > 0 ? firstPackedVolume / usableVolume * 100.0 : 0.0;
    double remainingVolume = usableVolume - firstPackedVolume;
    int weightBoxes = container.payloadKg() > 0 ? (int) Math.ceil(totals.totalWeightKg / container.payloadKg()) : 0;
    int boxes = multi.fatalOversize ? -1 : Math.max(multi.boxes, weightBoxes);
    boolean feasible = !multi.fatalOversize && boxes > 0;

    List<BoxResultDto> packedBoxes = new ArrayList<>();
    for (int i = 0; i < multi.packedBoxes.size(); i += 1) {
      SinglePack box = multi.packedBoxes.get(i);
      packedBoxes.add(new BoxResultDto(
          i + 1,
          box.placed.stream().map(this::toPlacementDto).toList(),
          box.unplaced.stream().map(unit -> unit.unitKey).toList()
      ));
    }

    return new ContainerEvaluationDto(
        container,
        feasible,
        multi.fatalOversize,
        boxes,
        units.size(),
        round(usableVolume),
        round(totals.totalRawVolumeM3),
        round(totals.totalWeightKg),
        round(fillPercent),
        round(Math.max(0, remainingVolume)),
        packedBoxes
    );
  }

  private MultiPack packMultiple(ContainerSpec container, List<Unit> allUnits) {
    List<Unit> remaining = new ArrayList<>(allUnits);
    List<SinglePack> packedBoxes = new ArrayList<>();
    SinglePack firstBox = new SinglePack(List.of(), remaining);
    boolean fatalOversize = false;
    int boxes = 0;
    int maxBoxes = 30;

    while (!remaining.isEmpty() && boxes < maxBoxes) {
      SinglePack packed = packSingle(container, remaining);
      if (boxes == 0) firstBox = packed;
      if (packed.placed.isEmpty()) {
        fatalOversize = true;
        break;
      }
      packedBoxes.add(packed);
      Set<String> placedIds = new HashSet<>();
      packed.placed.forEach(unit -> placedIds.add(unit.unitKey));
      remaining = remaining.stream().filter(unit -> !placedIds.contains(unit.unitKey)).toList();
      boxes += 1;
    }

    return new MultiPack(remaining.isEmpty() ? boxes : -1, firstBox, packedBoxes, fatalOversize || !remaining.isEmpty());
  }

  private SinglePack packSingle(ContainerSpec container, List<Unit> units) {
    List<Unit> placed = new ArrayList<>();
    List<Unit> unplaced = new ArrayList<>();

    for (Unit unit : units) {
      Placement placement = findPlacement(unit, placed, container);
      if (placement == null) {
        unplaced.add(unit);
        continue;
      }
      Unit packed = unit.copy();
      packed.x = placement.x;
      packed.y = placement.y;
      packed.z = placement.z;
      packed.lengthCm = placement.lengthCm;
      packed.widthCm = placement.widthCm;
      packed.heightCm = placement.heightCm;
      placed.add(packed);
    }

    return new SinglePack(placed, unplaced);
  }

  private Placement findPlacement(Unit unit, List<Unit> placed, ContainerSpec container) {
    Placement best = null;
    for (Dimensions dims : orientations(unit)) {
      if (dims.lengthCm > container.lengthCm() || dims.widthCm > container.widthCm() || dims.heightCm > container.heightCm()) {
        continue;
      }
      for (Point position : candidatePositions(placed, container, dims)) {
        if (!fitsAt(position, dims, placed, container)) continue;
        if (!hasSupport(position, dims, placed)) continue;
        double score = placementScore(position, dims, container);
        if (best == null || score < best.score) {
          best = new Placement(position.x, position.y, position.z, dims.lengthCm, dims.widthCm, dims.heightCm, score);
        }
      }
    }
    return best;
  }

  private List<Point> candidatePositions(List<Unit> placed, ContainerSpec container, Dimensions dims) {
    List<Double> xs = uniqueSorted(placed.stream().map(unit -> unit.x + unit.lengthCm).toList(), 0.0);
    List<Double> ys = uniqueSorted(placed.stream().map(unit -> unit.y + unit.widthCm).toList(), 0.0);
    List<Double> zs = uniqueSorted(placed.stream().map(unit -> unit.z + unit.heightCm).toList(), 0.0);
    List<Point> points = new ArrayList<>();
    for (double z : zs) {
      if (z + dims.heightCm > container.heightCm() + 0.0001) continue;
      for (double y : ys) {
        if (y + dims.widthCm > container.widthCm() + 0.0001) continue;
        for (double x : xs) {
          if (x + dims.lengthCm <= container.lengthCm() + 0.0001) points.add(new Point(x, y, z));
        }
      }
    }
    return points;
  }

  private List<Double> uniqueSorted(List<Double> values, double first) {
    Set<Double> set = new HashSet<>();
    set.add(first);
    values.forEach(value -> set.add(Math.round(value * 1000.0) / 1000.0));
    return set.stream().sorted().toList();
  }

  private boolean fitsAt(Point position, Dimensions dims, List<Unit> placed, ContainerSpec container) {
    if (position.x < 0 || position.y < 0 || position.z < 0) return false;
    if (position.x + dims.lengthCm > container.lengthCm() + 0.0001) return false;
    if (position.y + dims.widthCm > container.widthCm() + 0.0001) return false;
    if (position.z + dims.heightCm > container.heightCm() + 0.0001) return false;
    Unit candidate = new Unit();
    candidate.x = position.x;
    candidate.y = position.y;
    candidate.z = position.z;
    candidate.lengthCm = dims.lengthCm;
    candidate.widthCm = dims.widthCm;
    candidate.heightCm = dims.heightCm;
    return placed.stream().noneMatch(box -> intersects(candidate, box));
  }

  private boolean intersects(Unit a, Unit b) {
    return a.x < b.x + b.lengthCm - 0.0001 && a.x + a.lengthCm > b.x + 0.0001
        && a.y < b.y + b.widthCm - 0.0001 && a.y + a.widthCm > b.y + 0.0001
        && a.z < b.z + b.heightCm - 0.0001 && a.z + a.heightCm > b.z + 0.0001;
  }

  private boolean hasSupport(Point position, Dimensions dims, List<Unit> placed) {
    if (position.z <= 0.0001) return true;
    List<Rect> supports = placed.stream()
        .filter(box -> !box.nonStack && Math.abs(box.z + box.heightCm - position.z) < 0.0001)
        .map(box -> overlapRect(new Rect(position.x, position.y, dims.lengthCm, dims.widthCm), new Rect(box.x, box.y, box.lengthCm, box.widthCm)))
        .filter(Objects::nonNull)
        .toList();
    if (supports.isEmpty()) return false;
    return unionArea(supports) >= dims.lengthCm * dims.widthCm * 0.985;
  }

  private Rect overlapRect(Rect a, Rect b) {
    double x1 = Math.max(a.x, b.x);
    double y1 = Math.max(a.y, b.y);
    double x2 = Math.min(a.x + a.lengthCm, b.x + b.lengthCm);
    double y2 = Math.min(a.y + a.widthCm, b.y + b.widthCm);
    if (x2 <= x1 || y2 <= y1) return null;
    return new Rect(x1, y1, x2 - x1, y2 - y1);
  }

  private double unionArea(List<Rect> rects) {
    List<Double> xs = uniqueSorted(rects.stream().flatMap(rect -> List.of(rect.x, rect.x + rect.lengthCm).stream()).toList(), Double.NaN)
        .stream().filter(value -> !value.isNaN()).toList();
    double area = 0;
    for (int i = 0; i < xs.size() - 1; i += 1) {
      double x1 = xs.get(i);
      double x2 = xs.get(i + 1);
      double width = x2 - x1;
      if (width <= 0) continue;
      List<double[]> spans = rects.stream()
          .filter(rect -> rect.x < x2 && rect.x + rect.lengthCm > x1)
          .map(rect -> new double[] { rect.y, rect.y + rect.widthCm })
          .sorted(Comparator.comparingDouble(span -> span[0]))
          .toList();
      double covered = 0;
      Double start = null;
      double end = 0;
      for (double[] span : spans) {
        if (start == null) {
          start = span[0];
          end = span[1];
        } else if (span[0] <= end) {
          end = Math.max(end, span[1]);
        } else {
          covered += end - start;
          start = span[0];
          end = span[1];
        }
      }
      if (start != null) covered += end - start;
      area += width * covered;
    }
    return area;
  }

  private double placementScore(Point position, Dimensions dims, ContainerSpec container) {
    double top = position.z + dims.heightCm;
    double front = position.y + dims.widthCm;
    double right = position.x + dims.lengthCm;
    return top * 1_000_000 + front * 1_000 + right + (container.lengthCm() - right) * 0.01;
  }

  private List<Dimensions> orientations(Unit unit) {
    List<Dimensions> result = new ArrayList<>();
    result.add(new Dimensions(unit.lengthCm, unit.widthCm, unit.heightCm));
    if (unit.rotatable) {
      result.add(new Dimensions(unit.widthCm, unit.lengthCm, unit.heightCm));
      result.add(new Dimensions(unit.lengthCm, unit.heightCm, unit.widthCm));
      result.add(new Dimensions(unit.heightCm, unit.lengthCm, unit.widthCm));
      result.add(new Dimensions(unit.widthCm, unit.heightCm, unit.lengthCm));
      result.add(new Dimensions(unit.heightCm, unit.widthCm, unit.lengthCm));
    }
    return result.stream().distinct().toList();
  }

  private List<Unit> expandUnits(List<CargoItem> cargos, double globalGapCm) {
    List<Unit> units = new ArrayList<>();
    for (int cargoIndex = 0; cargoIndex < cargos.size(); cargoIndex += 1) {
      CargoItem cargo = cargos.get(cargoIndex);
      TypeRule rule = TYPE_RULES.getOrDefault(cargo.type(), TYPE_RULES.get("normal"));
      double gap = globalGapCm + rule.extraGapCm;
      String cargoId = cargo.id() == null || cargo.id().isBlank() ? "cargo-" + cargoIndex : cargo.id();
      for (int i = 0; i < cargo.quantity(); i += 1) {
        Unit unit = new Unit();
        unit.unitKey = cargoId + "-" + i;
        unit.cargoId = cargoId;
        unit.name = cargo.name();
        unit.color = cargo.color() == null || cargo.color().isBlank() ? COLORS.get(cargoIndex % COLORS.size()) : cargo.color();
        unit.type = cargo.type() == null || cargo.type().isBlank() ? "normal" : cargo.type();
        unit.baseLengthCm = cargo.lengthCm();
        unit.baseWidthCm = cargo.widthCm();
        unit.baseHeightCm = cargo.heightCm();
        unit.lengthCm = cargo.lengthCm() + gap;
        unit.widthCm = cargo.widthCm() + gap;
        unit.heightCm = cargo.heightCm() + gap;
        unit.weightKg = cargo.weightKg();
        unit.rotatable = rule.rotatable;
        unit.nonStack = rule.nonStack;
        unit.volumeM3 = cargo.lengthCm() * cargo.widthCm() * cargo.heightCm() / 1_000_000.0;
        units.add(unit);
      }
    }
    units.sort(Comparator.comparingDouble((Unit unit) -> unit.lengthCm * unit.widthCm * unit.heightCm).reversed());
    return units;
  }

  private Totals totals(List<CargoItem> cargos) {
    double volume = cargos.stream().mapToDouble(cargo -> cargo.lengthCm() * cargo.widthCm() * cargo.heightCm() * cargo.quantity() / 1_000_000.0).sum();
    double weight = cargos.stream().mapToDouble(cargo -> cargo.weightKg() * cargo.quantity()).sum();
    return new Totals(volume, weight);
  }

  private int compareEvaluation(ContainerEvaluationDto a, ContainerEvaluationDto b) {
    if (a.fatalOversize() != b.fatalOversize()) return a.fatalOversize() ? 1 : -1;
    if (a.boxes() != b.boxes()) return Integer.compare(a.boxes(), b.boxes());
    int fill = Double.compare(b.firstBoxFillPercent(), a.firstBoxFillPercent());
    if (fill != 0) return fill;
    return Double.compare(a.container().volumeM3(), b.container().volumeM3());
  }

  private PlacementDto toPlacementDto(Unit unit) {
    return new PlacementDto(
        unit.unitKey,
        unit.cargoId,
        unit.name,
        unit.color,
        unit.type,
        round(unit.baseLengthCm),
        round(unit.baseWidthCm),
        round(unit.baseHeightCm),
        round(unit.lengthCm),
        round(unit.widthCm),
        round(unit.heightCm),
        round(unit.x),
        round(unit.y),
        round(unit.z),
        round(unit.weightKg),
        unit.nonStack
    );
  }

  private double round(double value) {
    return Math.round(value * 100.0) / 100.0;
  }

  private record TypeRule(boolean rotatable, boolean nonStack, double extraGapCm) {}
  private record Totals(double totalRawVolumeM3, double totalWeightKg) {}
  private record Dimensions(double lengthCm, double widthCm, double heightCm) {}
  private record Point(double x, double y, double z) {}
  private record Placement(double x, double y, double z, double lengthCm, double widthCm, double heightCm, double score) {}
  private record Rect(double x, double y, double lengthCm, double widthCm) {}
  private record SinglePack(List<Unit> placed, List<Unit> unplaced) {}
  private record MultiPack(int boxes, SinglePack firstBox, List<SinglePack> packedBoxes, boolean fatalOversize) {}

  private static class Unit {
    String unitKey;
    String cargoId;
    String name;
    String color;
    String type;
    double baseLengthCm;
    double baseWidthCm;
    double baseHeightCm;
    double lengthCm;
    double widthCm;
    double heightCm;
    double x;
    double y;
    double z;
    double weightKg;
    boolean rotatable;
    boolean nonStack;
    double volumeM3;

    Unit copy() {
      Unit copy = new Unit();
      copy.unitKey = unitKey;
      copy.cargoId = cargoId;
      copy.name = name;
      copy.color = color;
      copy.type = type;
      copy.baseLengthCm = baseLengthCm;
      copy.baseWidthCm = baseWidthCm;
      copy.baseHeightCm = baseHeightCm;
      copy.lengthCm = lengthCm;
      copy.widthCm = widthCm;
      copy.heightCm = heightCm;
      copy.x = x;
      copy.y = y;
      copy.z = z;
      copy.weightKg = weightKg;
      copy.rotatable = rotatable;
      copy.nonStack = nonStack;
      copy.volumeM3 = volumeM3;
      return copy;
    }
  }
}
