<template>
  <section class="algorithm-page">
    <div class="page-title">
      <p>计算说明</p>
      <h2>当前装箱算法思路</h2>
    </div>
    <div class="algorithm-grid">
      <article>
        <strong>1. 货物展开</strong>
        <p>系统先把每一类货物按数量展开成单件货物，并附加全局间隙和货物规则带来的额外间隙。</p>
      </article>
      <article>
        <strong>2. 物理约束</strong>
        <p>每件货物不能超出箱体边界，不能与已摆放货物相交；有高度堆叠时，下方必须有足够支撑面。</p>
      </article>
      <article>
        <strong>3. 摆放顺序</strong>
        <p>按体积从大到小尝试摆放，大件先占位，减少后续出现大件无处可放的情况。</p>
      </article>
      <article>
        <strong>4. 旋转规则</strong>
        <p>普通货物允许旋转；保持朝上、托盘货默认不旋转；不可重压货物不会作为上层货物的支撑。</p>
      </article>
      <article>
        <strong>5. 候选位置</strong>
        <p>每次尝试放到箱底、已有货物右侧、前侧和上方形成的候选点，选择更低、更靠前、更靠左的位置。</p>
      </article>
      <article>
        <strong>6. 箱型推荐</strong>
        <p>每个箱型分别试算。排序优先考虑需要箱数更少，其次看首箱利用率，最后选择体积更小的箱型。</p>
      </article>
    </div>
    <div class="algorithm-note">
      <strong>业务定位</strong>
      <p>这是用于货代报价和箱型选择的启发式计算工具，能快速给出可解释的摆放方案；它不是数学意义上的全局最优装箱求解器。</p>
    </div>
  </section>
</template>
