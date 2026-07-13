package com.cargoplanner.backend.text;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;

import com.cargoplanner.backend.admin.LlmSettingsService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.LinkedHashMap;
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
