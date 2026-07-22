<script lang="ts">
  import { workspace, type DocStore } from '../core/store.svelte';

  type Props = { doc?: DocStore };
  let { doc: docProp }: Props = $props();
  let doc = $derived(docProp ?? workspace.active);

  type ChartType = 'bar' | 'line' | 'pie' | 'doughnut';

  let chartType = $state<ChartType>('bar');
  let selectedLabelKey = $state<string>('');
  let selectedValueKey = $state<string>('');

  // 1. Locate array dataset inside JSON payload
  let rawArray = $derived.by<Record<string, any>[]>(() => {
    const val = doc.parse.value;
    if (!val) return [];
    if (Array.isArray(val)) {
      return (val as any[]).filter((item) => item && typeof item === 'object' && !Array.isArray(item)) as Record<string, any>[];
    }
    if (typeof val === 'object' && val !== null) {
      for (const propVal of Object.values(val)) {
        if (Array.isArray(propVal) && propVal.length > 0) {
          const valid = (propVal as any[]).filter((item) => item && typeof item === 'object' && !Array.isArray(item)) as Record<string, any>[];
          if (valid.length > 0) return valid;
        }
      }
    }
    return [];
  });

  // 2. Extract Available Keys
  let availableKeys = $derived.by(() => {
    if (rawArray.length === 0) return { labelKeys: [], valueKeys: [] };
    const labelSet = new Set<string>();
    const valueSet = new Set<string>();

    rawArray.forEach((item) => {
      Object.entries(item).forEach(([k, v]) => {
        if (typeof v === 'number' && Number.isFinite(v)) {
          valueSet.add(k);
        } else if (typeof v === 'string' || typeof v === 'boolean') {
          labelSet.add(k);
        }
      });
    });

    return {
      labelKeys: Array.from(labelSet),
      valueKeys: Array.from(valueSet),
    };
  });

  // Auto-select initial keys when dataset updates
  $effect(() => {
    const { labelKeys, valueKeys } = availableKeys;
    if (labelKeys.length > 0 && !labelKeys.includes(selectedLabelKey)) {
      selectedLabelKey = labelKeys[0];
    }
    if (valueKeys.length > 0 && !valueKeys.includes(selectedValueKey)) {
      selectedValueKey = valueKeys[0];
    }
  });

  // 3. Processed Chart Data
  let chartData = $derived.by(() => {
    if (!selectedValueKey || rawArray.length === 0) return [];
    return rawArray.slice(0, 50).map((item, idx) => {
      const label = selectedLabelKey && item[selectedLabelKey] !== undefined ? String(item[selectedLabelKey]) : `Item ${idx + 1}`;
      const value = typeof item[selectedValueKey] === 'number' ? item[selectedValueKey] : 0;
      return { label, value };
    });
  });

  // 4. Statistics Calculation
  let stats = $derived.by(() => {
    if (chartData.length === 0) return { sum: 0, avg: 0, min: 0, max: 0, count: 0 };
    const values = chartData.map((d) => d.value);
    const sum = values.reduce((a, b) => a + b, 0);
    const count = values.length;
    const avg = count > 0 ? sum / count : 0;
    const min = Math.min(...values);
    const max = Math.max(...values);
    return { sum, avg, min, max, count };
  });

  // Color Palette
  const PALETTE = [
    '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
    '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
  ];

  // Calculated Pie Slices
  let pieSlices = $derived.by(() => {
    if (chartData.length === 0) return [];
    const total = Math.max(1, stats.sum);
    let startAngle = 0;

    return chartData.map((d, idx) => {
      const sliceAngle = (d.value / total) * 360;
      const start = startAngle;
      const end = startAngle + sliceAngle;
      startAngle = end;
      return {
        ...d,
        startAngle: start,
        endAngle: end,
        percent: ((d.value / total) * 100).toFixed(1),
        color: PALETTE[idx % PALETTE.length],
      };
    });
  });

  let hoveredPoint = $state<{ label: string; value: number; x: number; y: number } | null>(null);
  let svgRef: SVGSVGElement | undefined = $state();

  function downloadSvg() {
    if (!svgRef) return;
    const svgData = new XMLSerializer().serializeToString(svgRef);
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chart-${selectedValueKey || 'data'}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Trigonometry helpers for Pie / Doughnut arcs
  function getArcPath(cx: number, cy: number, rInner: number, rOuter: number, startAngle: number, endAngle: number): string {
    const radStart = (startAngle - 90) * (Math.PI / 180);
    const radEnd = (endAngle - 90) * (Math.PI / 180);

    const x1Outer = cx + rOuter * Math.cos(radStart);
    const y1Outer = cy + rOuter * Math.sin(radStart);
    const x2Outer = cx + rOuter * Math.cos(radEnd);
    const y2Outer = cy + rOuter * Math.sin(radEnd);

    const x1Inner = cx + rInner * Math.cos(radEnd);
    const y1Inner = cy + rInner * Math.sin(radEnd);
    const x2Inner = cx + rInner * Math.cos(radStart);
    const y2Inner = cy + rInner * Math.sin(radStart);

    const largeArc = endAngle - startAngle > 180 ? 1 : 0;

    if (rInner === 0) {
      return `M ${cx} ${cy} L ${x1Outer} ${y1Outer} A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${x2Outer} ${y2Outer} Z`;
    }

    return `M ${x1Outer} ${y1Outer} A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${x2Outer} ${y2Outer} L ${x1Inner} ${y1Inner} A ${rInner} ${rInner} 0 ${largeArc} 0 ${x2Inner} ${y2Inner} Z`;
  }
</script>

<div class="chart-view">
  {#if rawArray.length === 0}
    <div class="empty-state">
      <div class="empty-icon">📊</div>
      <div class="empty-title">No Numerical Data Found</div>
      <div class="empty-sub">Load a JSON payload containing an array of objects with numerical properties to render charts.</div>
    </div>
  {:else}
    <!-- Controls Header -->
    <div class="controls-bar">
      <div class="control-group">
        <span class="ctrl-label">Chart Type</span>
        <div class="type-buttons">
          <button class:active={chartType === 'bar'} onclick={() => (chartType = 'bar')}>📊 Bar</button>
          <button class:active={chartType === 'line'} onclick={() => (chartType = 'line')}>📈 Line</button>
          <button class:active={chartType === 'pie'} onclick={() => (chartType = 'pie')}>🥧 Pie</button>
          <button class:active={chartType === 'doughnut'} onclick={() => (chartType = 'doughnut')}>🍩 Doughnut</button>
        </div>
      </div>

      <div class="control-group">
        <span class="ctrl-label">X-Axis Label</span>
        <select bind:value={selectedLabelKey} class="ctrl-select">
          {#each availableKeys.labelKeys as k}
            <option value={k}>{k}</option>
          {/each}
        </select>
      </div>

      <div class="control-group">
        <span class="ctrl-label">Y-Axis Metric</span>
        <select bind:value={selectedValueKey} class="ctrl-select">
          {#each availableKeys.valueKeys as k}
            <option value={k}>{k}</option>
          {/each}
        </select>
      </div>

      <div class="spacer"></div>
      <button class="export-btn" onclick={downloadSvg}>↧ Export SVG</button>
    </div>

    <!-- Summary Stats Bar -->
    <div class="stats-bar">
      <div class="stat-pill">
        <span class="stat-name">COUNT</span>
        <span class="stat-val">{stats.count}</span>
      </div>
      <div class="stat-pill">
        <span class="stat-name">SUM</span>
        <span class="stat-val">{stats.sum.toLocaleString()}</span>
      </div>
      <div class="stat-pill">
        <span class="stat-name">AVG</span>
        <span class="stat-val">{stats.avg.toFixed(2)}</span>
      </div>
      <div class="stat-pill">
        <span class="stat-name">MIN</span>
        <span class="stat-val">{stats.min.toLocaleString()}</span>
      </div>
      <div class="stat-pill">
        <span class="stat-name">MAX</span>
        <span class="stat-val">{stats.max.toLocaleString()}</span>
      </div>
    </div>

    <!-- Chart Canvas / SVG Container -->
    <div class="chart-container">
      <svg bind:this={svgRef} viewBox="0 0 800 400" preserveAspectRatio="xMidYMid meet" class="chart-svg">
        <!-- Background Grid Lines -->
        {#if chartType === 'bar' || chartType === 'line'}
          {#each [0, 1, 2, 3, 4] as i}
            {@const y = 50 + i * 70}
            {@const gridVal = stats.max - (i * (stats.max - Math.min(0, stats.min))) / 4}
            <line x1="60" y1={y} x2="760" y2={y} stroke="var(--border)" stroke-dasharray="4 4" stroke-opacity="0.6" />
            <text x="50" y={y + 4} fill="var(--muted)" font-size="11" text-anchor="end">{Math.round(gridVal)}</text>
          {/each}
          <line x1="60" y1="330" x2="760" y2="330" stroke="var(--border)" stroke-width="1.5" />
        {/if}

        <!-- BAR CHART RENDERING -->
        {#if chartType === 'bar'}
          {@const barWidth = Math.max(8, Math.min(40, 680 / (chartData.length || 1) - 6))}
          {@const maxVal = Math.max(1, stats.max)}
          {#each chartData as d, idx}
            {@const x = 60 + idx * (700 / chartData.length) + (700 / chartData.length - barWidth) / 2}
            {@const barH = (d.value / maxVal) * 270}
            {@const y = 330 - barH}
            {@const color = PALETTE[idx % PALETTE.length]}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <rect
              {x}
              {y}
              width={barWidth}
              height={Math.max(2, barH)}
              fill={color}
              rx="4"
              class="bar-rect"
              onpointerenter={(e) => (hoveredPoint = { label: d.label, value: d.value, x: e.clientX, y: e.clientY })}
              onpointerleave={() => (hoveredPoint = null)}
            />
            {#if chartData.length <= 25}
              <text x={x + barWidth / 2} y="348" fill="var(--muted)" font-size="10" text-anchor="middle" class="axis-label">{d.label.slice(0, 10)}</text>
            {/if}
          {/each}

        <!-- LINE CHART RENDERING -->
        {:else if chartType === 'line'}
          {@const maxVal = Math.max(1, stats.max)}
          {@const points = chartData.map((d, idx) => {
            const x = 60 + idx * (700 / Math.max(1, chartData.length - 1));
            const y = 330 - (d.value / maxVal) * 270;
            return { x, y, label: d.label, value: d.value };
          })}
          {@const polylineStr = points.map((p) => `${p.x},${p.y}`).join(' ')}
          {@const areaStr = `60,330 ${polylineStr} ${points[points.length - 1]?.x || 760},330`}

          <!-- Gradient Area Fill -->
          <polygon points={areaStr} fill="var(--accent)" fill-opacity="0.15" />
          <polyline points={polylineStr} fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />

          {#each points as p, idx}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <circle
              cx={p.x}
              cy={p.y}
              r="5"
              fill="var(--accent)"
              stroke="var(--surface)"
              stroke-width="2"
              class="node-circle"
              onpointerenter={(e) => (hoveredPoint = { label: p.label, value: p.value, x: e.clientX, y: e.clientY })}
              onpointerleave={() => (hoveredPoint = null)}
            />
            {#if chartData.length <= 25}
              <text x={p.x} y="348" fill="var(--muted)" font-size="10" text-anchor="middle" class="axis-label">{p.label.slice(0, 10)}</text>
            {/if}
          {/each}

        <!-- PIE / DOUGHNUT CHART RENDERING -->
        {:else if chartType === 'pie' || chartType === 'doughnut'}
          {@const cx = 400}
          {@const cy = 180}
          {@const rOuter = 130}
          {@const rInner = chartType === 'doughnut' ? 70 : 0}

          {#each pieSlices as s, idx}
            {@const pathStr = getArcPath(cx, cy, rInner, rOuter, s.startAngle, s.endAngle)}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <path
              d={pathStr}
              fill={s.color}
              stroke="var(--surface)"
              stroke-width="2"
              class="pie-slice"
              onpointerenter={(e) => (hoveredPoint = { label: s.label, value: s.value, x: e.clientX, y: e.clientY })}
              onpointerleave={() => (hoveredPoint = null)}
            />
          {/each}

          <!-- Legend -->
          <g transform="translate(60, 335)">
            {#each pieSlices.slice(0, 8) as s, idx}
              {@const col = idx % 4}
              {@const row = Math.floor(idx / 4)}
              {@const lx = col * 170}
              {@const ly = row * 20}
              <rect x={lx} y={ly} width="10" height="10" rx="2" fill={s.color} />
              <text x={lx + 15} y={ly + 9} fill="var(--fg)" font-size="11">{s.label.slice(0, 15)} ({s.percent}%)</text>
            {/each}
          </g>
        {/if}
      </svg>

      <!-- Hover Tooltip -->
      {#if hoveredPoint}
        <div class="chart-tooltip" style:left="{hoveredPoint.x + 10}px" style:top="{hoveredPoint.y - 30}px">
          <strong>{hoveredPoint.label}</strong>: {hoveredPoint.value.toLocaleString()}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .chart-view {
    height: 100%;
    width: 100%;
    display: flex;
    flex-direction: column;
    background: var(--surface);
    color: var(--fg);
    overflow: hidden;
  }

  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 32px;
    text-align: center;
    color: var(--muted);
  }
  .empty-icon { font-size: 48px; margin-bottom: 12px; }
  .empty-title { font-size: 16px; font-weight: 600; color: var(--fg); margin-bottom: 6px; }
  .empty-sub { font-size: 13px; max-width: 420px; line-height: 1.5; }

  .controls-bar {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 8px 14px;
    background: var(--surface-2);
    border-bottom: 1px solid var(--border);
    flex-wrap: wrap;
  }
  .control-group {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .ctrl-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--muted);
    text-transform: uppercase;
  }
  .type-buttons {
    display: flex;
    gap: 4px;
  }
  .type-buttons button {
    background: var(--surface);
    color: var(--muted);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 4px 8px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: background 80ms, color 80ms;
  }
  .type-buttons button:hover { color: var(--fg); }
  .type-buttons button.active {
    background: var(--accent);
    color: var(--accent-fg);
    border-color: var(--accent);
  }

  .ctrl-select {
    background: var(--surface);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 4px 8px;
    font-size: 12px;
    outline: none;
  }

  .spacer { flex: 1; }
  .export-btn {
    background: var(--surface);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 4px 10px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
  }
  .export-btn:hover { background: var(--row-hover-strong); }

  .stats-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 14px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    overflow-x: auto;
  }
  .stat-pill {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 2px 8px;
  }
  .stat-name { color: var(--muted); font-weight: 600; font-size: 10px; }
  .stat-val { color: var(--fg); font-weight: 700; font-family: ui-monospace, monospace; }

  .chart-container {
    flex: 1;
    position: relative;
    padding: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .chart-svg {
    width: 100%;
    height: 100%;
    max-height: 480px;
  }

  .bar-rect { transition: opacity 80ms, transform 80ms; cursor: pointer; }
  .bar-rect:hover { opacity: 0.85; }

  .node-circle { transition: r 80ms, fill 80ms; cursor: pointer; }
  .node-circle:hover { r: 7; fill: var(--fg); }

  .pie-slice { transition: opacity 80ms, transform 80ms; cursor: pointer; }
  .pie-slice:hover { opacity: 0.85; }

  .axis-label { user-select: none; }

  .chart-tooltip {
    position: fixed;
    pointer-events: none;
    background: var(--surface-hi, #1e293b);
    color: #fff;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 11px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    z-index: 1000;
    white-space: nowrap;
  }
</style>
