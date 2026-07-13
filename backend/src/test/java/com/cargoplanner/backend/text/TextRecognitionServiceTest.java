package com.cargoplanner.backend.text;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;

import com.cargoplanner.backend.admin.LlmSettingsService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.util.ReflectionTestUtils;

class TextRecognitionServiceTest {
  private TextRecognitionService service;

  @BeforeEach
  void setUp() {
    service = new TextRecognitionService(
        mock(JdbcTemplate.class),
        new ObjectMapper(),
        mock(LlmSettingsService.class),
        3
    );
  }

  @AfterEach
  void tearDown() {
    service.shutdownRecognitionExecutor();
  }

  @Test
  void rejectsCartonDimensionsAsLoadedPalletDimensions() {
    String input = String.join("\n",
        "EXCEL_AGENT_BATCH",
        "SHEET 1: 货代装箱清单",
        "DETECTED_HEADER_ROW: 2",
        "R2: A=\"序号\" | B=\"托盘号\" | C=\"托内箱数\" | D=\"货物名称\" | F=\"单箱尺寸(长×宽×高cm)\"",
        "R3: A=\"1\" | B=\"PAL01\" | C=\"14\" | D=\"膨胀管\" | F=\"79×78×54\""
    );
    Map<String, Object> cargo = palletCargo(79, 78, 54);

    Boolean onlyInnerDimensions = ReflectionTestUtils.invokeMethod(
        service,
        "palletDimensionsAreOnlyInnerPackageSource",
        input,
        3,
        cargo
    );

    assertTrue(Boolean.TRUE.equals(onlyInnerDimensions));
  }

  @Test
  void acceptsExplicitLoadedPalletDimensionHeaders() {
    String input = String.join("\n",
        "EXCEL_AGENT_BATCH",
        "SHEET 1: 40托盘装箱明细",
        "DETECTED_HEADER_ROW: 4",
        "R4: A=\"托盘编号\" | E=\"装货后托盘外廓长(cm)\" | F=\"装货后托盘外廓宽(cm)\" | G=\"装货后托盘外廓高(cm)\" | I=\"单箱毛重(kg)\"",
        "R5: A=\"PLT-001\" | E=\"120\" | F=\"100\" | G=\"138\""
    );
    Map<String, Object> cargo = palletCargo(120, 100, 138);

    Boolean onlyInnerDimensions = ReflectionTestUtils.invokeMethod(
        service,
        "palletDimensionsAreOnlyInnerPackageSource",
        input,
        5,
        cargo
    );

    assertFalse(Boolean.TRUE.equals(onlyInnerDimensions));
    Object explicitDimensions = ReflectionTestUtils.invokeMethod(
        service,
        "explicitPalletDimensionsFromSource",
        input,
        5
    );
    assertNotNull(explicitDimensions);
    assertEquals(120.0, ReflectionTestUtils.invokeMethod(explicitDimensions, "lengthCm"));
    assertEquals(100.0, ReflectionTestUtils.invokeMethod(explicitDimensions, "widthCm"));
    assertEquals(138.0, ReflectionTestUtils.invokeMethod(explicitDimensions, "heightCm"));
  }

  @Test
  void rejectsCartonDimensionsWhenPalletColumnsExistButCurrentRowIsBlank() {
    String input = String.join("\n",
        "EXCEL_AGENT_BATCH",
        "SHEET 1: mixed dimensions",
        "DETECTED_HEADER_ROW: 2",
        "R2: A=\"货物名称\" | B=\"单箱尺寸(cm)\" | C=\"托盘长(cm)\" | D=\"托盘宽(cm)\" | E=\"托盘高(cm)\"",
        "R3: A=\"膨胀管\" | B=\"79×78×54\" | C=\"-\" | D=\"待定\" | E=\"\""
    );

    Boolean onlyInnerDimensions = ReflectionTestUtils.invokeMethod(
        service,
        "palletDimensionsAreOnlyInnerPackageSource",
        input,
        3,
        palletCargo(79, 78, 54)
    );

    assertTrue(Boolean.TRUE.equals(onlyInnerDimensions));
  }

  @Test
  void parsesInlineUnitsInSeparatePalletDimensionColumns() {
    String input = String.join("\n",
        "EXCEL_AGENT_BATCH",
        "SHEET 1: inline units",
        "DETECTED_HEADER_ROW: 2",
        "R2: A=\"货物名称\" | C=\"托盘长(cm)\" | D=\"托盘宽(cm)\" | E=\"托盘高(cm)\"",
        "R3: A=\"膨胀管\" | C=\"120 cm\" | D=\"100cm\" | E=\"1380mm\""
    );

    Object dimensions = ReflectionTestUtils.invokeMethod(
        service,
        "explicitPalletDimensionsFromSource",
        input,
        3
    );

    assertNotNull(dimensions);
    assertEquals(120.0, ReflectionTestUtils.invokeMethod(dimensions, "lengthCm"));
    assertEquals(100.0, ReflectionTestUtils.invokeMethod(dimensions, "widthCm"));
    assertEquals(138.0, ReflectionTestUtils.invokeMethod(dimensions, "heightCm"));
  }

  @Test
  void parsesThreeDecimalMetreValuesAsDecimalsInCombinedColumn() {
    String input = String.join("\n",
        "EXCEL_AGENT_BATCH",
        "SHEET 1: metre combined",
        "DETECTED_HEADER_ROW: 2",
        "R2: A=\"货物名称\" | B=\"托盘尺寸(m)\"",
        "R3: A=\"膨胀管\" | B=\"1.200m×0.800m×1.380m\""
    );

    assertDimensions(input, 3, 120.0, 80.0, 138.0);
  }

  @Test
  void parsesThreeDecimalMetreValuesAsDecimalsInSeparateColumns() {
    String input = String.join("\n",
        "EXCEL_AGENT_BATCH",
        "SHEET 1: metre separate",
        "DETECTED_HEADER_ROW: 2",
        "R2: A=\"货物名称\" | C=\"托盘长(m)\" | D=\"托盘宽(m)\" | E=\"托盘高(m)\"",
        "R3: A=\"膨胀管\" | C=\"1.200\" | D=\"0.800\" | E=\"1.380\""
    );

    assertDimensions(input, 3, 120.0, 80.0, 138.0);
  }

  @Test
  void honorsMixedInlineUnitsInCombinedPalletDimensions() {
    String input = String.join("\n",
        "EXCEL_AGENT_BATCH",
        "SHEET 1: mixed units",
        "DETECTED_HEADER_ROW: 2",
        "R2: A=\"货物名称\" | B=\"托盘尺寸\"",
        "R3: A=\"膨胀管\" | B=\"1.20m×100cm×1380mm\""
    );

    assertDimensions(input, 3, 120.0, 100.0, 138.0);
  }

  @Test
  void appliesDimensionUnitDeclaredInCartonHeader() {
    String input = String.join("\n",
        "EXCEL_AGENT_BATCH",
        "SHEET 1: millimetres",
        "DETECTED_HEADER_ROW: 2",
        "R2: A=\"货物名称\" | B=\"单箱尺寸(mm)\"",
        "R3: A=\"膨胀管\" | B=\"790×780×540\""
    );

    Boolean onlyInnerDimensions = ReflectionTestUtils.invokeMethod(
        service,
        "palletDimensionsAreOnlyInnerPackageSource",
        input,
        3,
        palletCargo(79, 78, 54)
    );

    assertTrue(Boolean.TRUE.equals(onlyInnerDimensions));
    Object innerDimensions = ReflectionTestUtils.invokeMethod(
        service,
        "innerPackageDimensionsFromSource",
        input,
        3
    );
    assertNotNull(innerDimensions);
    Map<String, Object> modelRow = new LinkedHashMap<>(palletCargo(79, 78, 54));
    ReflectionTestUtils.invokeMethod(service, "markPalletDimensionsMissing", modelRow, innerDimensions);
    @SuppressWarnings("unchecked")
    Map<String, Object> packageInfo = (Map<String, Object>) modelRow.get("packageInfo");
    @SuppressWarnings("unchecked")
    Map<String, Object> innerCargo = (Map<String, Object>) packageInfo.get("innerCargo");
    assertEquals(79.0, innerCargo.get("lengthCm"));
    assertEquals(78.0, innerCargo.get("widthCm"));
    assertEquals(54.0, innerCargo.get("heightCm"));
  }

  @Test
  @SuppressWarnings("unchecked")
  void preservesSourceCartonDimensionsWhenPalletDimensionsAreCleared() {
    Map<String, Object> modelRow = new LinkedHashMap<>(palletCargo(79, 78, 54));

    ReflectionTestUtils.invokeMethod(
        service,
        "markPalletDimensionsMissing",
        modelRow,
        "R3: F=\"79×78×54\""
    );

    assertEquals(0, modelRow.get("lengthCm"));
    assertEquals(0, modelRow.get("widthCm"));
    assertEquals(0, modelRow.get("heightCm"));
    assertEquals(true, modelRow.get("palletDimensionsMissing"));
    Map<String, Object> packageInfo = (Map<String, Object>) modelRow.get("packageInfo");
    Map<String, Object> innerCargo = (Map<String, Object>) packageInfo.get("innerCargo");
    assertEquals(79.0, innerCargo.get("lengthCm"));
    assertEquals(78.0, innerCargo.get("widthCm"));
    assertEquals(54.0, innerCargo.get("heightCm"));
  }

  @Test
  void retriesOnlyTransientProviderStatuses() {
    assertTrue(Boolean.TRUE.equals(ReflectionTestUtils.invokeMethod(service, "isTransientProviderStatus", 429)));
    assertTrue(Boolean.TRUE.equals(ReflectionTestUtils.invokeMethod(service, "isTransientProviderStatus", 503)));
    assertFalse(Boolean.TRUE.equals(ReflectionTestUtils.invokeMethod(service, "isTransientProviderStatus", 400)));
    assertFalse(Boolean.TRUE.equals(ReflectionTestUtils.invokeMethod(service, "isTransientProviderStatus", 401)));
  }

  @Test
  void keepsPalletTypeWhileApplyingBothIndependentConstraints() {
    Map<String, Object> cargo = new LinkedHashMap<>();
    cargo.put("type", "pallet");
    cargo.put("remark", "\u4e0d\u53ef\u91cd\u538b \u4fdd\u6301\u671d\u4e0a");

    ReflectionTestUtils.invokeMethod(
        service,
        "applyIndependentConstraints",
        cargo,
        new Object[] { null, null, null, null }
    );

    assertEquals("pallet", cargo.get("type"));
    assertTrue(Boolean.TRUE.equals(cargo.get("nonStack")));
    assertTrue(Boolean.TRUE.equals(cargo.get("keepUpright")));
  }

  @Test
  void explicitFalseOverridesPositiveConstraintText() {
    Map<String, Object> cargo = new LinkedHashMap<>();
    cargo.put("type", "normal");
    cargo.put("remark", "\u4e0d\u53ef\u91cd\u538b \u4fdd\u6301\u671d\u4e0a");

    ReflectionTestUtils.invokeMethod(
        service,
        "applyIndependentConstraints",
        cargo,
        new Object[] { false, null, false, null }
    );

    assertFalse(Boolean.TRUE.equals(cargo.get("nonStack")));
    assertFalse(Boolean.TRUE.equals(cargo.get("keepUpright")));
  }

  @Test
  void negativePhrasesDoNotCreateConstraints() {
    Map<String, Object> cargo = new LinkedHashMap<>();
    cargo.put("type", "normal");
    cargo.put("remark", "\u975e\u6613\u788e\u54c1 \u53ef\u4ee5\u91cd\u538b \u53ef\u5806\u53e0 \u65e0\u9700\u4fdd\u6301\u671d\u4e0a stackable");

    ReflectionTestUtils.invokeMethod(
        service,
        "applyIndependentConstraints",
        cargo,
        new Object[] { null, null, null, null }
    );

    assertFalse(Boolean.TRUE.equals(cargo.get("nonStack")));
    assertFalse(Boolean.TRUE.equals(cargo.get("keepUpright")));
  }

  @Test
  void recognizesNonstackableWithoutTreatingStackableSubstringAsNegative() {
    Map<String, Object> cargo = new LinkedHashMap<>();
    cargo.put("type", "normal");
    cargo.put("remark", "nonstackable");

    ReflectionTestUtils.invokeMethod(
        service,
        "applyIndependentConstraints",
        cargo,
        new Object[] { null, null, null, null }
    );

    assertTrue(Boolean.TRUE.equals(cargo.get("nonStack")));
  }

  @Test
  @SuppressWarnings("unchecked")
  void normalizesLegacyConstraintTypesBeforeAggregation() {
    Map<String, Object> legacyRow = recognitionCargoRow("nonstackable");
    Map<String, Object> standardRow = recognitionCargoRow("normal");
    standardRow.put("nonStack", true);

    Object legacyParsed = ReflectionTestUtils.invokeMethod(service, "normalizeCargo", legacyRow, 1, "");
    Object standardParsed = ReflectionTestUtils.invokeMethod(service, "normalizeCargo", standardRow, 2, "");
    Map<String, Object> legacyCargo = (Map<String, Object>) ReflectionTestUtils.invokeMethod(legacyParsed, "cargo");
    Map<String, Object> standardCargo = (Map<String, Object>) ReflectionTestUtils.invokeMethod(standardParsed, "cargo");
    List<Map<String, Object>> aggregated = (List<Map<String, Object>>) ReflectionTestUtils.invokeMethod(
        service,
        "aggregateCargos",
        List.of(legacyCargo, standardCargo)
    );

    assertEquals("normal", legacyCargo.get("type"));
    assertTrue(Boolean.TRUE.equals(legacyCargo.get("nonStack")));
    assertEquals(1, aggregated.size());
    assertEquals(2, aggregated.get(0).get("quantity"));
  }

  @Test
  @SuppressWarnings("unchecked")
  void preservesPalletIdentityWhenLegacyTypeCarriesUprightConstraint() {
    Map<String, Object> row = recognitionCargoRow("upright");
    row.put("packageInfo", new LinkedHashMap<>(Map.of(
        "handlingUnitType", "pallet",
        "packageUnit", "pallet",
        "dimensionSource", "explicit",
        "handlingUnitDimensionsExplicit", true
    )));

    Object parsed = ReflectionTestUtils.invokeMethod(service, "normalizeCargo", row, 1, "");
    Map<String, Object> cargo = (Map<String, Object>) ReflectionTestUtils.invokeMethod(parsed, "cargo");

    assertEquals("pallet", cargo.get("type"));
    assertTrue(Boolean.TRUE.equals(cargo.get("keepUpright")));
    assertFalse(Boolean.TRUE.equals(cargo.get("nonStack")));
  }

  @Test
  @SuppressWarnings("unchecked")
  void normalizesCrateAndWoodenCrateWithoutTreatingBareCaseAsPallet() {
    Map<String, Object> cratePackageRow = recognitionCargoRow("normal");
    cratePackageRow.put("packageInfo", new LinkedHashMap<>(Map.of(
        "handlingUnitType", "crate",
        "packageUnit", "crate",
        "dimensionSource", "explicit",
        "handlingUnitDimensionsExplicit", true
    )));
    Object crateParsed = ReflectionTestUtils.invokeMethod(service, "normalizeCargo", cratePackageRow, 1, "");
    Map<String, Object> crateCargo = (Map<String, Object>) ReflectionTestUtils.invokeMethod(crateParsed, "cargo");

    Object woodenParsed = ReflectionTestUtils.invokeMethod(
        service,
        "normalizeCargo",
        recognitionCargoRow("wooden crate"),
        2,
        ""
    );
    Map<String, Object> woodenCargo = (Map<String, Object>) ReflectionTestUtils.invokeMethod(woodenParsed, "cargo");

    Object bareCaseParsed = ReflectionTestUtils.invokeMethod(
        service,
        "normalizeCargo",
        recognitionCargoRow("display case"),
        3,
        ""
    );
    Map<String, Object> bareCaseCargo = (Map<String, Object>) ReflectionTestUtils.invokeMethod(bareCaseParsed, "cargo");

    assertEquals("pallet", crateCargo.get("type"));
    assertEquals("pallet", woodenCargo.get("type"));
    assertEquals("normal", bareCaseCargo.get("type"));
  }

  @Test
  @SuppressWarnings("unchecked")
  void preservesBothConstraintsInDimensionLineFallback() {
    Object parsed = ReflectionTestUtils.invokeMethod(
        service,
        "parseLine",
        "\u4e0d\u53ef\u91cd\u538b \u4fdd\u6301\u671d\u4e0a precision-device 80x40x30cm 1pcs 10kg",
        "",
        1
    );
    Map<String, Object> cargo = (Map<String, Object>) ReflectionTestUtils.invokeMethod(parsed, "cargo");

    assertTrue(Boolean.TRUE.equals(cargo.get("nonStack")));
    assertTrue(Boolean.TRUE.equals(cargo.get("keepUpright")));
  }

  @Test
  @SuppressWarnings("unchecked")
  void preservesBothConstraintsInPackingListFallback() {
    Object parsed = ReflectionTestUtils.invokeMethod(
        service,
        "parsePackingListTableLine",
        "PLITEM 10 2 20 1 2 10 20 60 40 30 1 1 1 2 3 \u4e0d\u53ef\u91cd\u538b \u4fdd\u6301\u671d\u4e0a",
        1
    );
    Map<String, Object> cargo = (Map<String, Object>) ReflectionTestUtils.invokeMethod(parsed, "cargo");

    assertTrue(Boolean.TRUE.equals(cargo.get("nonStack")));
    assertTrue(Boolean.TRUE.equals(cargo.get("keepUpright")));
  }

  private Map<String, Object> recognitionCargoRow(String type) {
    Map<String, Object> row = new LinkedHashMap<>();
    row.put("name", "precision-device");
    row.put("lengthCm", 100);
    row.put("widthCm", 80);
    row.put("heightCm", 60);
    row.put("quantity", 1);
    row.put("weightKg", 120);
    row.put("type", type);
    return row;
  }

  private Map<String, Object> palletCargo(double length, double width, double height) {
    Map<String, Object> cargo = new LinkedHashMap<>();
    cargo.put("type", "pallet");
    cargo.put("lengthCm", length);
    cargo.put("widthCm", width);
    cargo.put("heightCm", height);
    cargo.put("packageInfo", new LinkedHashMap<>(Map.of(
        "handlingUnitType", "pallet",
        "dimensionSource", "explicit",
        "handlingUnitDimensionsExplicit", true
    )));
    return cargo;
  }

  private void assertDimensions(
      String input,
      int rowNumber,
      double expectedLength,
      double expectedWidth,
      double expectedHeight
  ) {
    Object dimensions = ReflectionTestUtils.invokeMethod(
        service,
        "explicitPalletDimensionsFromSource",
        input,
        rowNumber
    );
    assertNotNull(dimensions);
    assertEquals(expectedLength, ReflectionTestUtils.invokeMethod(dimensions, "lengthCm"));
    assertEquals(expectedWidth, ReflectionTestUtils.invokeMethod(dimensions, "widthCm"));
    assertEquals(expectedHeight, ReflectionTestUtils.invokeMethod(dimensions, "heightCm"));
  }
}
