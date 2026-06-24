package com.cargo.planner.dto;

import java.util.List;

public record BoxResultDto(
    int index,
    List<PlacementDto> placed,
    List<String> unplacedUnitKeys
) {
}
