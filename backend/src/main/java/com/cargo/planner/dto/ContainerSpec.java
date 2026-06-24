package com.cargo.planner.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record ContainerSpec(
    @NotBlank String id,
    @NotBlank String name,
    @NotNull @Min(1) Double lengthCm,
    @NotNull @Min(1) Double widthCm,
    @NotNull @Min(1) Double heightCm,
    @NotNull @Min(1) Double payloadKg
) {
  public double volumeM3() {
    return lengthCm * widthCm * heightCm / 1_000_000.0;
  }
}
