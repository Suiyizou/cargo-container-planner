package com.cargo.planner.dto;

public record PlacementDto(
    String unitKey,
    String cargoId,
    String name,
    String color,
    String type,
    double baseLengthCm,
    double baseWidthCm,
    double baseHeightCm,
    double lengthCm,
    double widthCm,
    double heightCm,
    double xCm,
    double yCm,
    double zCm,
    double weightKg,
    boolean nonStack
) {
}
