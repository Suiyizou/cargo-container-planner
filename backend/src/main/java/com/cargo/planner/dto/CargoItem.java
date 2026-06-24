package com.cargo.planner.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record CargoItem(
    String id,
    @NotBlank String name,
    @NotNull @Min(1) Double lengthCm,
    @NotNull @Min(1) Double widthCm,
    @NotNull @Min(1) Double heightCm,
    @NotNull @Min(1) Integer quantity,
    @NotNull @Min(0) Double weightKg,
    String type,
    String color
) {
}
