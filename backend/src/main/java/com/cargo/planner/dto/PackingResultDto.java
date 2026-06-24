package com.cargo.planner.dto;

import java.util.List;

public record PackingResultDto(
    String bestContainerId,
    List<ContainerEvaluationDto> evaluations
) {
}
