package com.cargo.planner.dto;

import java.util.List;

public record ContainerEvaluationDto(
    ContainerSpec container,
    boolean feasible,
    boolean fatalOversize,
    int boxes,
    int totalUnits,
    double usableVolumeM3,
    double totalRawVolumeM3,
    double totalWeightKg,
    double firstBoxFillPercent,
    double firstBoxRemainingVolumeM3,
    List<BoxResultDto> packedBoxes
) {
}
