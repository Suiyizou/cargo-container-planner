<template>
  <section class="algorithm-page excel-template-page">
    <div class="page-title">
      <p>Excel Import Template</p>
      <h2>Excel 样板与字段规范</h2>
    </div>

    <div class="algorithm-note">
      <strong>推荐导入原则</strong>
      <p>
        Excel 导入先按固定字段做规则解析，字段缺失、单位不清、表头不标准时再进入人工确认或智能清洗。
        所有尺寸默认使用 cm，重量默认使用 kg，数量必须是正整数。
      </p>
    </div>

    <div class="template-grid">
      <article class="algorithm-note">
        <strong>必填字段</strong>
        <div class="template-table-wrap">
          <table class="template-table">
            <thead>
              <tr>
                <th>字段名</th>
                <th>含义</th>
                <th>示例</th>
                <th>校验规则</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="field in requiredFields" :key="field.key">
                <td><code>{{ field.key }}</code></td>
                <td>{{ field.label }}</td>
                <td>{{ field.example }}</td>
                <td>{{ field.rule }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>

      <article class="algorithm-note">
        <strong>可选字段</strong>
        <div class="template-table-wrap">
          <table class="template-table">
            <thead>
              <tr>
                <th>字段名</th>
                <th>含义</th>
                <th>示例</th>
                <th>默认值</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="field in optionalFields" :key="field.key">
                <td><code>{{ field.key }}</code></td>
                <td>{{ field.label }}</td>
                <td>{{ field.example }}</td>
                <td>{{ field.defaultValue }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>
    </div>

    <div class="template-grid compact">
      <article class="algorithm-note">
        <strong>货物类型 type</strong>
        <ul class="formula-list">
          <li><code>normal</code>：普通货物，可旋转，可承重。</li>
          <li><code>upright</code>：保持朝上货物，不允许随意翻转。</li>
          <li><code>nonstack</code>：不可重压货物，可放在可承重货物上方，但自身不作为上层支撑面。</li>
          <li><code>pallet</code>：托盘/木箱类，默认保持底面方向，预留额外间隙。</li>
        </ul>
      </article>

      <article class="algorithm-note">
        <strong>字段映射建议</strong>
        <ul class="formula-list">
          <li>常见中文表头可映射：货名/品名/SKU -> <code>name</code>，长/长度 -> <code>lengthCm</code>。</li>
          <li>如果表头写的是 mm、毫米，需要除以 10 转为 cm；如果是 m，需要乘以 100。</li>
          <li>导入前要显示预览表，标出失败行和不确定字段，不建议静默写入。</li>
          <li>大量重复 SKU 应先聚合为数量，不要在导入阶段展开成几千行单件。</li>
        </ul>
      </article>
    </div>

    <div class="algorithm-note">
      <strong>标准 Excel 示例</strong>
      <div class="template-table-wrap">
        <table class="template-table sample">
          <thead>
            <tr>
              <th v-for="header in sampleHeaders" :key="header">{{ header }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in sampleRows" :key="row.id">
              <td v-for="header in sampleHeaders" :key="header">{{ row[header] }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="algorithm-note">
      <strong>是否需要 Agent</strong>
      <p>
        建议需要，但不要让 Agent 直接替代导入逻辑。表格基础解析、类型校验、单位换算应该由确定性代码完成；
        Agent 更适合处理非标准业务语义，比如多行表头、合并单元格、备注里的“易碎/不可重压/托盘”、客户自定义列名等。
      </p>
      <div class="template-agent-flow">
        <span>Excel 文件</span>
        <b>规则解析</b>
        <b>Agent 辅助识别</b>
        <b>用户确认</b>
        <span>标准货物数据</span>
      </div>
      <p>
        换句话说，Agent 做“清洗建议”和“异常解释”很合适；真正落库/写入当前系统前，必须经过预览和用户确认。
      </p>
    </div>
  </section>
</template>

<script setup>
const requiredFields = [
  { key: "name", label: "货物名称", example: "纸箱 B", rule: "不能为空" },
  { key: "lengthCm", label: "长度 cm", example: "60", rule: "大于 0 的数字" },
  { key: "widthCm", label: "宽度 cm", example: "40", rule: "大于 0 的数字" },
  { key: "heightCm", label: "高度 cm", example: "35", rule: "大于 0 的数字" },
  { key: "quantity", label: "数量", example: "30", rule: "正整数" },
  { key: "weightKg", label: "单件重量 kg", example: "12", rule: "大于等于 0 的数字" }
];

const optionalFields = [
  { key: "type", label: "货物类型", example: "normal", defaultValue: "normal" },
  { key: "color", label: "显示颜色", example: "#3b82f6", defaultValue: "系统自动分配" },
  { key: "id", label: "货物 ID/SKU", example: "SKU-001", defaultValue: "系统自动生成" },
  { key: "remark", label: "备注", example: "易碎，不可重压", defaultValue: "空" }
];

const sampleHeaders = ["name", "lengthCm", "widthCm", "heightCm", "quantity", "weightKg", "type", "color", "remark"];
const sampleRows = [
  { id: 1, name: "蝶阀木箱 A", lengthCm: 110, widthCm: 45, heightCm: 82, quantity: 8, weightKg: 180, type: "pallet", color: "#2a9d8f", remark: "木箱/托盘类" },
  { id: 2, name: "纸箱 B", lengthCm: 60, widthCm: 40, heightCm: 35, quantity: 30, weightKg: 12, type: "normal", color: "#3b82f6", remark: "普通可堆叠" },
  { id: 3, name: "易碎品 C", lengthCm: 55, widthCm: 45, heightCm: 30, quantity: 12, weightKg: 18, type: "nonstack", color: "#8b5cf6", remark: "不可重压" }
];
</script>
