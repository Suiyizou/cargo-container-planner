export function calculateMassBalance(container, placements = []) {
  if (!container || !placements.length) return emptyBalance(container);

  let totalWeightKg = 0;
  let weightedX = 0;
  let weightedY = 0;
  let weightedZ = 0;
  const quadrants = {
    frontLeftKg: 0,
    frontRightKg: 0,
    rearLeftKg: 0,
    rearRightKg: 0
  };
  const centerX = Number(container.lengthCm || 0) / 2;
  const centerY = Number(container.widthCm || 0) / 2;
  const centerZ = Number(container.heightCm || 0) / 2;

  placements.forEach((item) => {
    const weightKg = Math.max(0, Number(item.weightKg || 0));
    if (!weightKg) return;
    const itemX = Number(item.xCm || 0) + Number(item.lengthCm || 0) / 2;
    const itemY = Number(item.yCm || 0) + Number(item.widthCm || 0) / 2;
    const itemZ = Number(item.zCm || 0) + Number(item.heightCm || 0) / 2;
    totalWeightKg += weightKg;
    weightedX += itemX * weightKg;
    weightedY += itemY * weightKg;
    weightedZ += itemZ * weightKg;

    if (itemY <= centerY && itemX <= centerX) quadrants.frontLeftKg += weightKg;
    else if (itemY <= centerY && itemX > centerX) quadrants.frontRightKg += weightKg;
    else if (itemY > centerY && itemX <= centerX) quadrants.rearLeftKg += weightKg;
    else quadrants.rearRightKg += weightKg;
  });

  if (!totalWeightKg) return emptyBalance(container);

  const xCm = weightedX / totalWeightKg;
  const yCm = weightedY / totalWeightKg;
  const zCm = weightedZ / totalWeightKg;
  const offsetXCm = xCm - centerX;
  const offsetYCm = yCm - centerY;
  const offsetZCm = zCm - centerZ;
  const leftKg = quadrants.frontLeftKg + quadrants.rearLeftKg;
  const rightKg = quadrants.frontRightKg + quadrants.rearRightKg;
  const frontKg = quadrants.frontLeftKg + quadrants.frontRightKg;
  const rearKg = quadrants.rearLeftKg + quadrants.rearRightKg;
  const horizontalOffsetCm = Math.hypot(offsetXCm, offsetYCm);
  const normalizedX = Math.abs(offsetXCm) / Math.max(1, centerX);
  const normalizedY = Math.abs(offsetYCm) / Math.max(1, centerY);
  const horizontalOffsetPercent = Math.min(999, Math.hypot(normalizedX, normalizedY) * 100);

  return {
    valid: true,
    totalWeightKg,
    center: { xCm, yCm, zCm },
    geometricCenter: { xCm: centerX, yCm: centerY, zCm: centerZ },
    offset: {
      xCm: offsetXCm,
      yCm: offsetYCm,
      zCm: offsetZCm,
      horizontalCm: horizontalOffsetCm,
      horizontalPercent: horizontalOffsetPercent,
      xPercent: centerX ? offsetXCm / centerX * 100 : 0,
      yPercent: centerY ? offsetYCm / centerY * 100 : 0,
      zPercent: centerZ ? offsetZCm / centerZ * 100 : 0
    },
    loads: {
      leftKg,
      rightKg,
      frontKg,
      rearKg,
      leftPercent: leftKg / totalWeightKg * 100,
      rightPercent: rightKg / totalWeightKg * 100,
      frontPercent: frontKg / totalWeightKg * 100,
      rearPercent: rearKg / totalWeightKg * 100,
      ...quadrants,
      frontLeftPercent: quadrants.frontLeftKg / totalWeightKg * 100,
      frontRightPercent: quadrants.frontRightKg / totalWeightKg * 100,
      rearLeftPercent: quadrants.rearLeftKg / totalWeightKg * 100,
      rearRightPercent: quadrants.rearRightKg / totalWeightKg * 100
    }
  };
}

function emptyBalance(container) {
  const centerX = Number(container?.lengthCm || 0) / 2;
  const centerY = Number(container?.widthCm || 0) / 2;
  const centerZ = Number(container?.heightCm || 0) / 2;
  return {
    valid: false,
    totalWeightKg: 0,
    center: { xCm: centerX, yCm: centerY, zCm: centerZ },
    geometricCenter: { xCm: centerX, yCm: centerY, zCm: centerZ },
    offset: {
      xCm: 0,
      yCm: 0,
      zCm: 0,
      horizontalCm: 0,
      horizontalPercent: 0,
      xPercent: 0,
      yPercent: 0,
      zPercent: 0
    },
    loads: {
      leftKg: 0,
      rightKg: 0,
      frontKg: 0,
      rearKg: 0,
      leftPercent: 0,
      rightPercent: 0,
      frontPercent: 0,
      rearPercent: 0,
      frontLeftKg: 0,
      frontRightKg: 0,
      rearLeftKg: 0,
      rearRightKg: 0,
      frontLeftPercent: 0,
      frontRightPercent: 0,
      rearLeftPercent: 0,
      rearRightPercent: 0
    }
  };
}
