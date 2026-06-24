package com.cargo.planner.dto;

import java.time.Instant;

public record PackingJobResponse(
    String id,
    String status,
    int progress,
    String message,
    PackingResultDto result,
    Instant createdAt,
    Instant updatedAt
) {
}
