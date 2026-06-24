package com.cargo.planner.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import java.util.List;

public record PackingRequest(
    @NotEmpty @Valid List<CargoItem> cargos,
    @NotEmpty @Valid List<ContainerSpec> containers,
    Double utilizationPercent,
    Double globalGapCm
) {
  public double safeUtilizationPercent() {
    if (utilizationPercent == null) return 90.0;
    return Math.max(1.0, Math.min(100.0, utilizationPercent));
  }

  public double safeGlobalGapCm() {
    if (globalGapCm == null) return 1.0;
    return Math.max(0.0, globalGapCm);
  }
}
