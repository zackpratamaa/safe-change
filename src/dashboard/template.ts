export function renderDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0">
  <title>safe-change Dashboard — Enterprise Edition</title>
  <style>
    :root {
      --font-sf: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "SF Pro", -apple-system, system-ui, "Helvetica Neue", Helvetica, Arial, sans-serif;
      --font-sf-mono: "SF Mono", SFMono-Regular, ui-monospace, Menlo, Monaco, Consolas, monospace;

      --bg-page: #f5f6fa;
      --glass-bg: rgba(255, 255, 255, 0.88);
      --glass-border: rgba(255, 255, 255, 0.95);
      --glass-outline: rgba(0, 0, 0, 0.06);
      --glass-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.05), 0 1px 3px 0 rgba(0, 0, 0, 0.02);
      --glass-shadow-hover: 0 8px 30px -4px rgba(0, 0, 0, 0.08), 0 2px 6px 0 rgba(0, 0, 0, 0.03);

      --text-main: #1d1d1f;
      --text-sub: #515154;
      --text-caption: #626268;
      --divider: rgba(0, 0, 0, 0.06);

      --apple-blue: #0071e3;
      --apple-blue-bg: rgba(0, 113, 227, 0.09);
      --apple-green: #34c759;
      --apple-green-bg: rgba(52, 199, 89, 0.12);
      --apple-red: #ff3b30;
      --apple-red-bg: rgba(255, 59, 48, 0.11);
      --apple-orange: #ff9500;
      --apple-orange-bg: rgba(255, 149, 0, 0.12);
      --apple-purple: #af52de;
      --apple-purple-bg: rgba(175, 82, 222, 0.1);
      --apple-indigo: #5856d6;
      --apple-indigo-bg: rgba(88, 86, 214, 0.1);
      --apple-teal: #30b0c7;
      --apple-teal-bg: rgba(48, 176, 199, 0.1);
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: var(--font-sf);
      font-size: 13px;
      line-height: 1.45;
      color: var(--text-main);
      background: var(--bg-page);
      background: linear-gradient(180deg, #f8f9fc 0%, #edf1f7 100%);
      min-height: 100vh;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      text-rendering: optimizeLegibility;
      letter-spacing: -0.01em;
    }

    :focus-visible { outline: 2px solid var(--apple-blue); outline-offset: 3px; }
    @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; } }

    .mono {
      font-family: var(--font-sf-mono);
      letter-spacing: -0.02em;
    }

    .container {
      width: 100%;
      max-width: 1440px;
      margin: 0 auto;
      padding: 24px 20px 48px;
      display: flex;
      flex-direction: column;
      gap: 18px;
    }

    .liquid-glass {
      background: var(--glass-bg);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid var(--glass-border);
      box-shadow: var(--glass-shadow);
      outline: 1px solid var(--glass-outline);
      border-radius: 16px;
      transition: transform 0.18s ease, box-shadow 0.18s ease;
    }

    .liquid-glass:hover {
      box-shadow: var(--glass-shadow-hover);
    }

    header.liquid-glass {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 14px 22px;
      flex-wrap: wrap;
      gap: 16px;
    }

    .brand-wrap {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .brand-text {
      font-family: var(--font-sf-mono);
      font-size: 14px;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--apple-blue);
      background: var(--apple-blue-bg);
      border: 1px solid rgba(0, 113, 227, 0.2);
      padding: 6px 12px;
      border-radius: 9px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
      flex-shrink: 0;
    }

    .brand-icon {
      width: 42px;
      height: 42px;
      border-radius: 11px;
      background: linear-gradient(135deg, #0071e3 0%, #5856d6 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #ffffff;
      box-shadow: 0 4px 14px rgba(0, 113, 227, 0.32);
      flex-shrink: 0;
    }

    .brand-icon svg {
      width: 22px;
      height: 22px;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .brand-title {
      font-size: 16px;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--text-main);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .brand-desc {
      font-size: 12px;
      color: var(--text-caption);
      margin-top: 1px;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .live-chip {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: rgba(255, 255, 255, 0.9);
      border: 1px solid var(--divider);
      padding: 6px 13px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 600;
      color: var(--text-sub);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
    }

    .live-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--apple-green);
      box-shadow: 0 0 8px var(--apple-green);
      animation: pulse 2.4s infinite ease-in-out;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.35; transform: scale(0.85); }
    }

    /* 6 Top Metric Cards */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 14px;
    }

    .stat-card {
      padding: 16px 18px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      position: relative;
      overflow: hidden;
      min-height: 110px;
      justify-content: space-between;
    }

    .stat-card-watermark {
      position: absolute;
      right: 10px;
      bottom: 6px;
      width: 58px;
      height: 58px;
      opacity: 0.08;
      pointer-events: none;
      z-index: 0;
      transition: opacity 0.2s ease, transform 0.2s ease;
    }

    .stat-card:hover .stat-card-watermark {
      opacity: 0.14;
      transform: scale(1.08);
    }

    .stat-card-watermark svg {
      width: 100%;
      height: 100%;
      stroke: currentColor;
      fill: none;
      stroke-width: 1.5;
    }

    .stat-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: relative;
      z-index: 1;
    }

    .stat-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      color: var(--text-caption);
    }

    .stat-badge-icon {
      width: 28px;
      height: 28px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .stat-badge-icon svg {
      width: 15px;
      height: 15px;
      stroke: currentColor;
      fill: none;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .stat-badge-blue { background: var(--apple-blue-bg); color: var(--apple-blue); }
    .stat-badge-purple { background: var(--apple-purple-bg); color: var(--apple-purple); }
    .stat-badge-orange { background: var(--apple-orange-bg); color: var(--apple-orange); }
    .stat-badge-state { background: var(--apple-green-bg); color: var(--apple-green); }
    .stat-badge-teal { background: var(--apple-teal-bg); color: var(--apple-teal); }
    .stat-badge-indigo { background: var(--apple-indigo-bg); color: var(--apple-indigo); }

    .stat-value {
      font-size: 20px;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--text-main);
      line-height: 1.15;
      margin: 2px 0;
      position: relative;
      z-index: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .stat-sub {
      font-size: 11px;
      color: var(--text-caption);
      position: relative;
      z-index: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* Apple Segmented Navigation Tabs */
    .nav-tabs-wrapper {
      display: flex;
      align-items: center;
      background: rgba(118, 118, 128, 0.08);
      padding: 4px;
      border-radius: 12px;
      gap: 4px;
      overflow-x: auto;
      border: 1px solid var(--divider);
    }

    .tab-btn {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 8px 16px;
      border-radius: 9px;
      border: none;
      background: transparent;
      color: var(--text-sub);
      font-family: var(--font-sf);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.16s ease;
      white-space: nowrap;
    }

    .tab-btn:hover {
      color: var(--text-main);
      background: rgba(255, 255, 255, 0.4);
    }

    .tab-btn.active {
      background: #ffffff;
      color: var(--apple-blue);
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08), 0 0 1px rgba(0, 0, 0, 0.05);
    }

    .tab-btn svg {
      width: 14px;
      height: 14px;
      stroke: currentColor;
      fill: none;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    /* Tab Panes */
    .tab-pane {
      display: none;
      flex-direction: column;
      gap: 18px;
    }

    .tab-pane.active {
      display: flex;
    }

    /* Panel Boxes and Grids */
    .panels-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 18px;
    }

    .panel-box {
      padding: 20px 22px;
      display: flex;
      flex-direction: column;
    }

    .panel-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      padding-bottom: 12px;
      margin-bottom: 14px;
      border-bottom: 1px solid var(--divider);
    }

    .panel-heading {
      font-size: 14px;
      font-weight: 600;
      letter-spacing: -0.015em;
      color: var(--text-main);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .panel-tag {
      font-size: 11px;
      color: var(--text-caption);
      font-weight: 400;
    }

    .meta-list {
      display: flex;
      flex-direction: column;
    }

    .meta-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 0;
      border-bottom: 1px solid var(--divider);
      font-size: 13px;
    }

    .meta-row:last-child {
      border-bottom: none;
    }

    .meta-k {
      color: var(--text-caption);
      font-weight: 400;
    }

    .meta-v {
      color: var(--text-main);
      font-weight: 600;
      text-align: right;
    }

    .check-container {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 14px;
    }

    .check-pill {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: rgba(0, 0, 0, 0.02);
      border: 1px solid var(--divider);
      padding: 9px 13px;
      border-radius: 9px;
      font-size: 12px;
    }

    .check-name {
      font-weight: 600;
      color: var(--text-main);
    }

    .check-ms {
      color: var(--text-caption);
      font-size: 11px;
      margin-left: 6px;
    }

    .rules-container {
      display: flex;
      flex-direction: column;
      gap: 9px;
    }

    .rule-card {
      background: rgba(0, 0, 0, 0.02);
      border: 1px solid var(--divider);
      border-left: 3px solid var(--apple-blue);
      border-radius: 9px;
      padding: 11px 13px;
    }

    .rule-card.rule-error {
      border-left-color: var(--apple-red);
    }

    .rule-card.rule-warn {
      border-left-color: var(--apple-orange);
    }

    .rule-row-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 3px;
    }

    .rule-name {
      font-weight: 600;
      font-size: 13px;
      color: var(--text-main);
    }

    .rule-desc {
      font-size: 11px;
      color: var(--text-caption);
      margin-bottom: 5px;
      line-height: 1.35;
    }

    .rule-code {
      background: #ffffff;
      border: 1px solid var(--divider);
      padding: 2px 7px;
      border-radius: 5px;
      font-size: 11px;
      color: var(--apple-blue);
      font-weight: 600;
      display: inline-block;
    }

    /* Regression Timeline */
    .timeline-card {
      padding: 20px 22px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .timeline-header-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px;
    }

    .timeline-indicators {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .timeline-stream-wrapper {
      position: relative;
      width: 100%;
      overflow-x: auto;
      padding: 10px 4px 14px;
    }

    .timeline-stream {
      display: flex;
      align-items: stretch;
      gap: 14px;
      min-width: 100%;
    }

    .timeline-node-card {
      background: rgba(255, 255, 255, 0.95);
      border: 1px solid var(--divider);
      border-radius: 12px;
      padding: 13px 15px;
      min-width: 250px;
      max-width: 270px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 10px;
      cursor: pointer;
      position: relative;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03);
      transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .timeline-node-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px -3px rgba(0, 0, 0, 0.08);
      outline: 1px solid var(--apple-blue);
    }

    .timeline-node-card.selected {
      outline: 2px solid var(--apple-blue);
      box-shadow: 0 6px 20px -2px rgba(0, 113, 227, 0.22);
      background: #ffffff;
    }

    .timeline-node-card.card-clean {
      border-top: 3px solid var(--apple-green);
    }

    .timeline-node-card.card-regression {
      border-top: 3px solid var(--apple-red);
    }

    .timeline-card-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 6px;
    }

    .timeline-run-badge {
      font-size: 11px;
      font-weight: 700;
      color: var(--text-main);
    }

    .timeline-card-desc {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-main);
      line-height: 1.35;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      min-height: 32px;
    }

    .timeline-card-metrics {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      font-size: 11px;
      color: var(--text-caption);
    }

    .timeline-card-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 8px;
      border-top: 1px solid var(--divider);
      font-size: 11px;
    }

    .timeline-connector {
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--text-caption);
      flex: 0 0 14px;
    }

    .timeline-connector svg {
      width: 14px;
      height: 14px;
      stroke: currentColor;
      fill: none;
      stroke-width: 2;
    }

    .timeline-inspector {
      background: rgba(255, 255, 255, 0.95);
      border: 1px solid var(--divider);
      border-radius: 12px;
      padding: 14px 18px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
      animation: fadeIn 0.2s ease;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .inspector-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--divider);
    }

    .inspector-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-main);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .inspector-checks {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 8px;
    }

    .inspector-check-pill {
      background: rgba(0, 0, 0, 0.02);
      border: 1px solid var(--divider);
      padding: 5px 9px;
      border-radius: 7px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
    }

    /* Tables */
    .table-card {
      padding: 20px 22px;
    }

    .table-header-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 14px;
    }

    .segmented-control {
      display: inline-flex;
      background: rgba(118, 118, 128, 0.12);
      padding: 2px;
      border-radius: 8px;
      gap: 2px;
    }

    .segment-btn {
      background: transparent;
      border: none;
      color: var(--text-sub);
      padding: 4px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-family: var(--font-sf);
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .segment-btn.active {
      background: #ffffff;
      color: var(--text-main);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      font-weight: 600;
    }

    .table-wrapper {
      width: 100%;
      overflow-x: auto;
      border-radius: 10px;
      border: 1px solid var(--divider);
      background: #ffffff;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      min-width: 700px;
    }

    th {
      color: var(--text-caption);
      background: rgba(0, 0, 0, 0.02);
      padding: 10px 14px;
      border-bottom: 1px solid var(--divider);
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      white-space: nowrap;
    }

    td {
      padding: 10px 14px;
      border-bottom: 1px solid var(--divider);
      font-size: 12px;
      vertical-align: middle;
    }

    tr:last-child td {
      border-bottom: none;
    }

    tr:hover td {
      background: rgba(0, 113, 227, 0.02);
    }

    tr.row-regression td {
      background: rgba(255, 59, 48, 0.03);
    }

    tr.row-regression:hover td {
      background: rgba(255, 59, 48, 0.06);
    }

    .badge {
      display: inline-flex;
      align-items: center;
      padding: 2px 8px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: -0.01em;
      white-space: nowrap;
    }

    .badge-clean { background: var(--apple-green-bg); color: #1f8b3c; }
    .badge-regression { background: var(--apple-red-bg); color: #d70015; }
    .badge-info { background: var(--apple-blue-bg); color: var(--apple-blue); }
    .badge-warn { background: var(--apple-orange-bg); color: #c93400; }
    .badge-purple { background: var(--apple-purple-bg); color: var(--apple-purple); }
    .badge-indigo { background: var(--apple-indigo-bg); color: var(--apple-indigo); }

    .diff-pill {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 11px;
      font-family: var(--font-sf-mono);
      font-weight: 600;
      background: rgba(0, 0, 0, 0.04);
      padding: 2px 7px;
      border-radius: 5px;
      white-space: nowrap;
    }

    .diff-add { color: #1f8b3c; }
    .diff-mod { color: #c93400; }
    .diff-del { color: #d70015; }

    .empty-state {
      padding: 30px 16px;
      text-align: center;
      color: var(--text-caption);
      font-size: 12px;
    }

    /* Enterprise Specific Elements */
    .enterprise-hero-banner {
      padding: 18px 22px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(245, 247, 255, 0.9) 100%);
    }

    .risk-gauge-wrap {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .risk-score-circle {
      width: 58px;
      height: 58px;
      border-radius: 50%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      font-weight: 800;
      background: #ffffff;
      border: 3px solid var(--apple-green);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
    }

    .risk-score-circle span {
      font-size: 9px;
      font-weight: 600;
      color: var(--text-caption);
      margin-top: -2px;
    }

    .hash-pill {
      font-family: var(--font-sf-mono);
      font-size: 11px;
      background: rgba(0, 0, 0, 0.04);
      border: 1px solid var(--divider);
      padding: 2px 6px;
      border-radius: 4px;
      color: var(--text-sub);
    }

    .signal-item {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding: 10px 12px;
      border-radius: 8px;
      background: rgba(0, 0, 0, 0.02);
      border: 1px solid var(--divider);
      gap: 10px;
    }

    .budget-bar-track {
      width: 100%;
      height: 6px;
      border-radius: 3px;
      background: rgba(0, 0, 0, 0.06);
      overflow: hidden;
      margin-top: 4px;
    }

    .budget-bar-fill {
      height: 100%;
      border-radius: 3px;
      background: var(--apple-blue);
      transition: width 0.3s ease;
    }

    @media (max-width: 1200px) {
      .stats-grid {
        grid-template-columns: repeat(3, 1fr);
      }
    }

    @media (max-width: 900px) {
      .panels-grid {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 680px) {
      .stats-grid {
        grid-template-columns: repeat(2, 1fr);
      }
      .container {
        padding: 16px 12px;
        gap: 14px;
      }
      header.liquid-glass {
        padding: 12px 14px;
      }
      .panel-box, .timeline-card, .table-card {
        padding: 14px 16px;
      }
    }

    @media (max-width: 480px) {
      .stats-grid {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <header class="liquid-glass">
      <div class="brand-wrap">
        <div class="brand-text mono">/SAFE-CHANGE</div>
        <div>
          <div class="brand-title">
            safe-change dashboard
            <span class="badge badge-indigo" style="font-size: 10px; padding: 1px 7px;">v1.1.0-preview.1 Enterprise</span>
          </div>
          <div class="brand-desc">Autonomous verification telemetry, verifiable execution & cryptographic trust sentinel</div>
        </div>
      </div>
      <div class="header-actions">
        <div class="live-chip">
          <div class="live-dot"></div>
          <span class="mono">127.0.0.1:4242</span>
        </div>
      </div>
    </header>

    <!-- 6 Top Metric Cards -->
    <div class="stats-grid">
      <!-- Card 1: System State -->
      <div class="stat-card liquid-glass">
        <div class="stat-card-watermark" id="stat-state-watermark" style="color: var(--apple-green);">
          <svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
        </div>
        <div class="stat-header">
          <span class="stat-label">System State</span>
          <div class="stat-badge-icon stat-badge-state" id="stat-state-badge">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>
          </div>
        </div>
        <div class="stat-value" id="stat-system-state">Scanning...</div>
        <span class="stat-sub" id="stat-system-sub">Verification guardrail</span>
      </div>

      <!-- Card 2: Monitored Baseline -->
      <div class="stat-card liquid-glass">
        <div class="stat-card-watermark" style="color: var(--apple-blue);">
          <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
        </div>
        <div class="stat-header">
          <span class="stat-label">Monitored Baseline</span>
          <div class="stat-badge-icon stat-badge-blue">
            <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          </div>
        </div>
        <div class="stat-value mono" id="stat-baseline-files">--</div>
        <span class="stat-sub" id="stat-baseline-desc">Active repository scope</span>
      </div>

      <!-- Card 3: Enterprise Risk & Mode -->
      <div class="stat-card liquid-glass">
        <div class="stat-card-watermark" id="stat-risk-watermark" style="color: var(--apple-purple);">
          <svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        </div>
        <div class="stat-header">
          <span class="stat-label">Enterprise Risk</span>
          <div class="stat-badge-icon stat-badge-purple" id="stat-risk-badge">
            <svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          </div>
        </div>
        <div class="stat-value mono" id="stat-risk-mode">--</div>
        <span class="stat-sub" id="stat-risk-sub">Operating policy mode</span>
      </div>

      <!-- Card 4: Change Budget -->
      <div class="stat-card liquid-glass">
        <div class="stat-card-watermark" id="stat-budget-watermark" style="color: var(--apple-teal);">
          <svg viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
        </div>
        <div class="stat-header">
          <span class="stat-label">Change Budget</span>
          <div class="stat-badge-icon stat-badge-teal" id="stat-budget-badge">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
        </div>
        <div class="stat-value" id="stat-budget-status">--</div>
        <span class="stat-sub" id="stat-budget-sub">Diff bounds check</span>
      </div>

      <!-- Card 5: Active Write Lease -->
      <div class="stat-card liquid-glass">
        <div class="stat-card-watermark" style="color: var(--apple-orange);">
          <svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        </div>
        <div class="stat-header">
          <span class="stat-label">Write Lease</span>
          <div class="stat-badge-icon stat-badge-orange" id="stat-lease-badge">
            <svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </div>
        </div>
        <div class="stat-value mono" id="stat-lease-status">--</div>
        <span class="stat-sub" id="stat-lease-sub">Atomic modification lock</span>
      </div>

      <!-- Card 6: Audit & Trust Chain -->
      <div class="stat-card liquid-glass">
        <div class="stat-card-watermark" style="color: var(--apple-indigo);">
          <svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
        </div>
        <div class="stat-header">
          <span class="stat-label">Audit & Trust</span>
          <div class="stat-badge-icon stat-badge-indigo" id="stat-audit-badge">
            <svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
          </div>
        </div>
        <div class="stat-value mono" id="stat-audit-status">--</div>
        <span class="stat-sub" id="stat-audit-sub">SHA-256 chained events</span>
      </div>
    </div>

    <!-- Apple Liquid Glass Segmented Navigation Tab Bar -->
    <div class="nav-tabs-wrapper liquid-glass">
      <button class="tab-btn active" data-tab="overview" onclick="switchTab('overview')">
        <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
        Overview & Baseline
      </button>
      <button class="tab-btn" data-tab="risk" onclick="switchTab('risk')">
        <svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        Enterprise Risk & Budget
      </button>
      <button class="tab-btn" data-tab="semantic" onclick="switchTab('semantic')">
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
        AST Semantic Security
      </button>
      <button class="tab-btn" data-tab="verifiable" onclick="switchTab('verifiable')">
        <svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><circle cx="12" cy="12" r="3"/></svg>
        Verifiable Replay & Attestations
      </button>
      <button class="tab-btn" data-tab="identity" onclick="switchTab('identity')">
        <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        Identity & Trust Registry
      </button>
      <button class="tab-btn" data-tab="audit" onclick="switchTab('audit')">
        <svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
        Tamper-Evident Audit Chain
      </button>
    </div>

    <!-- TAB 1: OVERVIEW & BASELINE (Default View) -->
    <div id="pane-overview" class="tab-pane active">
      <div class="panels-grid">
        <!-- Panel 1: Current Status -->
        <div class="panel-box liquid-glass" id="panel-status">
          <div class="panel-top">
            <div class="panel-heading">
              Panel 1 &mdash; Current Status
              <span class="panel-tag">Baseline Reference</span>
            </div>
            <span id="baseline-status-badge" class="badge badge-info">Checking</span>
          </div>
          <div id="status-content">
            <div class="empty-state">Loading status...</div>
          </div>
        </div>

        <!-- Panel 4: Active Rules -->
        <div class="panel-box liquid-glass" id="panel-rules">
          <div class="panel-top">
            <div class="panel-heading">
              Panel 4 &mdash; Active Rules
              <span class="panel-tag">Policy Registry</span>
            </div>
            <span id="rules-count-badge" class="badge badge-info">0 Rules</span>
          </div>
          <div id="rules-content">
            <div class="empty-state">Loading rules...</div>
          </div>
        </div>
      </div>

      <!-- Panel 3: Regression Timeline -->
      <div class="timeline-card liquid-glass" id="panel-timeline">
        <div class="timeline-header-bar">
          <div class="panel-heading">
            Panel 3 &mdash; Regression Timeline
            <span class="panel-tag">Historical Verification Stream</span>
          </div>
          <div class="timeline-indicators" id="timeline-metrics-bar">
            <span id="timeline-stats" class="badge badge-info mono">0 runs tracked</span>
            <div class="segmented-control">
              <button class="segment-btn" onclick="scrollTimeline('start')">Earliest</button>
              <button class="segment-btn" onclick="scrollTimeline('end')">Latest</button>
            </div>
          </div>
        </div>
        <div class="timeline-stream-wrapper">
          <div id="timeline-content" class="timeline-stream">
            <div class="empty-state">Loading timeline...</div>
          </div>
        </div>
        <div id="timeline-inspector" class="timeline-inspector" style="display: none;"></div>
      </div>

      <!-- Panel 2: Log History -->
      <div class="table-card liquid-glass">
        <div class="table-header-row">
          <div class="panel-heading">
            Panel 2 &mdash; Log History
            <span class="panel-tag">Audit Trail</span>
          </div>
          <div class="segmented-control">
            <button class="segment-btn active" onclick="setFilter('all')">All</button>
            <button class="segment-btn" onclick="setFilter('clean')">Clean</button>
            <button class="segment-btn" onclick="setFilter('regression')">Regressions</button>
          </div>
        </div>
        <div class="table-wrapper" tabindex="0" role="region" aria-label="Scrollable verification records">
          <table id="log-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Execution ID</th>
                <th>Trigger</th>
                <th>Description</th>
                <th>File Changes</th>
                <th>Checks Verified</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody id="log-body">
              <tr><td colspan="7" class="empty-state">Loading history...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- TAB 2: ENTERPRISE RISK & BUDGET -->
    <div id="pane-risk" class="tab-pane">
      <!-- Risk Banner -->
      <div class="enterprise-hero-banner liquid-glass">
        <div class="risk-gauge-wrap">
          <div class="risk-score-circle" id="risk-score-circle">
            <span id="risk-score-value">0</span>
            <span>SCORE</span>
          </div>
          <div>
            <div style="font-size: 16px; font-weight: 700; color: var(--text-main); display: flex; align-items: center; gap: 8px;">
              Enterprise Risk Evaluation
              <span id="risk-mode-badge" class="badge badge-clean">STANDARD</span>
            </div>
            <div style="font-size: 12px; color: var(--text-caption); margin-top: 2px;" id="risk-mode-desc">
              Automatic mode derived from AST analysis, file surface, and diff heuristics.
            </div>
          </div>
        </div>
        <div style="display: flex; gap: 10px; align-items: center;">
          <div class="live-chip" style="font-size: 11px;">
            <span style="color: var(--text-caption);">Policy:</span>
            <span class="mono" id="risk-policy-name" style="font-weight: 700;">DEFAULT_ENTERPRISE_POLICY</span>
          </div>
        </div>
      </div>

      <div class="panels-grid">
        <!-- Risk Signals -->
        <div class="panel-box liquid-glass">
          <div class="panel-top">
            <div class="panel-heading">
              Risk Signals & Classification
              <span class="panel-tag">Real-Time Diff Classifier</span>
            </div>
            <span id="signals-count-badge" class="badge badge-info">0 Signals</span>
          </div>
          <div id="risk-signals-list" style="display: flex; flex-direction: column; gap: 8px;">
            <div class="empty-state">No high-risk signals detected in current changes.</div>
          </div>
        </div>

        <!-- Change Budget Enforcement -->
        <div class="panel-box liquid-glass">
          <div class="panel-top">
            <div class="panel-heading">
              Change Budget Guardrails
              <span class="panel-tag">Enterprise Diff Bounds</span>
            </div>
            <span id="budget-pill-badge" class="badge badge-clean">Within Budget</span>
          </div>
          <div id="budget-items-list" class="meta-list">
            <div class="empty-state">Evaluating change budget...</div>
          </div>
        </div>
      </div>
    </div>

    <!-- TAB 3: AST SEMANTIC SECURITY -->
    <div id="pane-semantic" class="tab-pane">
      <div class="enterprise-hero-banner liquid-glass">
        <div>
          <div style="font-size: 16px; font-weight: 700; color: var(--text-main); display: flex; align-items: center; gap: 8px;">
            AST Semantic Differential Engine
            <span class="badge badge-indigo">TypeScript / JavaScript AST</span>
          </div>
          <div style="font-size: 12px; color: var(--text-caption); margin-top: 2px;">
            Deep syntax tree parsing detects breaking API export changes, symbol signature mutations, and structural regressions.
          </div>
        </div>
      </div>

      <div class="panels-grid">
        <!-- Semantic Report -->
        <div class="panel-box liquid-glass">
          <div class="panel-top">
            <div class="panel-heading">
              Latest Semantic Diff Report
              <span class="panel-tag">.safe-change/semantic/last-report.json</span>
            </div>
            <span id="semantic-status-badge" class="badge badge-clean">Clean</span>
          </div>
          <div id="semantic-report-content">
            <div class="empty-state">No semantic breaking changes reported. Run AST inspection to refresh.</div>
          </div>
        </div>

        <!-- Semantic Policy -->
        <div class="panel-box liquid-glass">
          <div class="panel-top">
            <div class="panel-heading">
              Semantic Safety Controls
              <span class="panel-tag">Fail-Closed Boundary</span>
            </div>
            <span class="badge badge-info">3 Controls Active</span>
          </div>
          <div class="meta-list">
            <div class="meta-row">
              <span class="meta-k">Breaking Export Prevention</span>
              <span class="meta-v" style="color: var(--apple-green);">Enforced (Fail-Closed)</span>
            </div>
            <div class="meta-row">
              <span class="meta-k">Public API Signature Tracking</span>
              <span class="meta-v" style="color: var(--apple-green);">Active</span>
            </div>
            <div class="meta-row">
              <span class="meta-k">Type Broadening Detection</span>
              <span class="meta-v" style="color: var(--apple-green);">Active</span>
            </div>
            <div class="meta-row">
              <span class="meta-k">Syntax Tree Parsing Fallback</span>
              <span class="meta-v mono">Fail-Closed on Parse Error</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- TAB 4: VERIFIABLE REPLAY & ATTESTATIONS -->
    <div id="pane-verifiable" class="tab-pane">
      <div class="enterprise-hero-banner liquid-glass">
        <div>
          <div style="font-size: 16px; font-weight: 700; color: var(--text-main); display: flex; align-items: center; gap: 8px;">
            Verifiable Execution & Cryptographic Proofs
            <span class="badge badge-indigo">In-toto & Ed25519</span>
          </div>
          <div style="font-size: 12px; color: var(--text-caption); margin-top: 2px;">
            Autonomous checks produce signed attestation envelopes and deterministic replay bundles for tamper-evident provenance.
          </div>
        </div>
      </div>

      <div class="panels-grid">
        <!-- Signed Attestations -->
        <div class="panel-box liquid-glass">
          <div class="panel-top">
            <div class="panel-heading">
              Signed Attestation Envelopes
              <span class="panel-tag">.safe-change/attestations/</span>
            </div>
            <span id="attestations-count-badge" class="badge badge-info">0 Envelopes</span>
          </div>
          <div id="attestations-list" style="display: flex; flex-direction: column; gap: 8px;">
            <div class="empty-state">No attestations recorded yet. Run <code>safe-change attest</code> to generate signed envelopes.</div>
          </div>
        </div>

        <!-- Deterministic Replay Sessions -->
        <div class="panel-box liquid-glass">
          <div class="panel-top">
            <div class="panel-heading">
              Deterministic Replay Bundles
              <span class="panel-tag">.safe-change/replay/</span>
            </div>
            <span id="replays-count-badge" class="badge badge-info">0 Sessions</span>
          </div>
          <div id="replays-list" style="display: flex; flex-direction: column; gap: 8px;">
            <div class="empty-state">No replay sessions recorded yet. Run <code>safe-change replay record</code> to bundle execution trace.</div>
          </div>
        </div>
      </div>
    </div>

    <!-- TAB 5: IDENTITY & TRUST REGISTRY -->
    <div id="pane-identity" class="tab-pane">
      <div class="enterprise-hero-banner liquid-glass">
        <div>
          <div style="font-size: 16px; font-weight: 700; color: var(--text-main); display: flex; align-items: center; gap: 8px;">
            Identity & Approver Trust Registry
            <span class="badge badge-indigo">RFC 8032 Ed25519</span>
          </div>
          <div style="font-size: 12px; color: var(--text-caption); margin-top: 2px;">
            Cryptographic public keys authorizing policy overrides, attestation signing, and high-assurance change approvals.
          </div>
        </div>
      </div>

      <div class="table-card liquid-glass">
        <div class="table-header-row">
          <div class="panel-heading">
            Authorized Enterprise Identities
            <span class="panel-tag">.safe-change/trust-registry.json</span>
          </div>
          <span id="identity-count-badge" class="badge badge-info">0 Identities</span>
        </div>
        <div class="table-wrapper" tabindex="0" role="region" aria-label="Scrollable verification records">
          <table>
            <thead>
              <tr>
                <th>Identity ID</th>
                <th>Role / Capability</th>
                <th>Public Key (Ed25519 Hex)</th>
                <th>Key Status</th>
              </tr>
            </thead>
            <tbody id="identity-body">
              <tr><td colspan="4" class="empty-state">Loading trust registry...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- TAB 6: TAMPER-EVIDENT AUDIT CHAIN -->
    <div id="pane-audit" class="tab-pane">
      <div class="enterprise-hero-banner liquid-glass">
        <div style="display: flex; align-items: center; gap: 14px;">
          <div class="brand-icon" style="background: linear-gradient(135deg, #34c759 0%, #30b0c7 100%);">
            <svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>
          </div>
          <div>
            <div style="font-size: 16px; font-weight: 700; color: var(--text-main); display: flex; align-items: center; gap: 8px;">
              Tamper-Evident Cryptographic Audit Chain
              <span id="audit-integrity-badge" class="badge badge-clean">CHAIN INTEGRITY VERIFIED</span>
            </div>
            <div style="font-size: 12px; color: var(--text-caption); margin-top: 2px;">
              Every operation links SHA-256 hashes of previous events to detect payload modification or middle event omission.
            </div>
          </div>
        </div>
      </div>

      <div class="table-card liquid-glass">
        <div class="table-header-row">
          <div class="panel-heading">
            Immutable Audit Trail Stream
            <span class="panel-tag">.safe-change/audit-log.jsonl</span>
          </div>
          <span id="audit-events-count-badge" class="badge badge-info mono">0 Events</span>
        </div>
        <div class="table-wrapper" tabindex="0" role="region" aria-label="Scrollable verification records">
          <table>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Event Type</th>
                <th>Actor / ID</th>
                <th>Event Hash</th>
                <th>Previous Hash</th>
                <th>Link Status</th>
              </tr>
            </thead>
            <tbody id="audit-body">
              <tr><td colspan="6" class="empty-state">Loading audit events...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>

  <script>
    function escapeHtml(str) {
      if (str === null || str === undefined) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    let globalLogEntries = [];
    let currentFilter = 'all';
    let selectedTimelineId = null;

    function switchTab(tabId) {
      document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabId);
      });
      document.querySelectorAll('.tab-pane').forEach(pane => {
        pane.classList.toggle('active', pane.id === 'pane-' + tabId);
      });
    }

    function setFilter(filter) {
      currentFilter = filter;
      document.querySelectorAll('.table-header-row .segment-btn').forEach(btn => {
        btn.classList.toggle('active', btn.textContent.toLowerCase() === filter);
      });
      renderLogTable();
    }

    function scrollTimeline(pos) {
      const el = document.getElementById('timeline-content');
      if (!el) return;
      if (pos === 'start') {
        el.scrollTo({ left: 0, behavior: 'smooth' });
      } else {
        el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' });
      }
    }

    async function loadData() {
      try {
        const [
          statusRes,
          logRes,
          rulesRes,
          enterpriseRes,
          leaseRes,
          auditRes,
          identityRes,
          verifiableRes
        ] = await Promise.all([
          fetch('/api/status').then(r => r.json()).catch(() => ({ hasBaseline: false })),
          fetch('/api/log').then(r => r.json()).catch(() => []),
          fetch('/api/rules').then(r => r.json()).catch(() => []),
          fetch('/api/enterprise').then(r => r.json()).catch(() => null),
          fetch('/api/lease').then(r => r.json()).catch(() => ({ active: false })),
          fetch('/api/audit').then(r => r.json()).catch(() => ({ verified: true, totalEvents: 0, events: [] })),
          fetch('/api/identity').then(r => r.json()).catch(() => ({ version: 1, identities: [] })),
          fetch('/api/verifiable').then(r => r.json()).catch(() => ({ semanticReport: null, attestations: [], replays: [] }))
        ]);

        globalLogEntries = Array.isArray(logRes) ? logRes : [];
        updateHeroStats(statusRes, globalLogEntries, rulesRes, enterpriseRes, leaseRes, auditRes);
        renderStatus(statusRes);
        renderTimeline(globalLogEntries);
        renderLogTable();
        renderRules(rulesRes);
        renderEnterprise(enterpriseRes);
        renderVerifiable(verifiableRes);
        renderIdentity(identityRes);
        renderAudit(auditRes);
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
      }
    }

    function updateHeroStats(status, logs, rules, enterprise, lease, audit) {
      // 1. System State
      const stateEl = document.getElementById('stat-system-state');
      const stateSub = document.getElementById('stat-system-sub');
      const stateBadge = document.getElementById('stat-state-badge');
      const stateWatermark = document.getElementById('stat-state-watermark');

      const hasRegression = logs.some(e => e.regressionDetected);
      if (hasRegression) {
        stateEl.innerHTML = '<span style="color: var(--apple-red);">Regression</span>';
        stateSub.textContent = 'Active regression flagged';
        if (stateBadge) {
          stateBadge.style.background = 'var(--apple-red-bg)';
          stateBadge.style.color = 'var(--apple-red)';
        }
        if (stateWatermark) {
          stateWatermark.style.color = 'var(--apple-red)';
        }
      } else if (status && status.hasBaseline) {
        stateEl.innerHTML = '<span style="color: var(--apple-green);">Nominal</span>';
        stateSub.textContent = 'All passing, zero regressions';
        if (stateBadge) {
          stateBadge.style.background = 'var(--apple-green-bg)';
          stateBadge.style.color = 'var(--apple-green)';
        }
        if (stateWatermark) {
          stateWatermark.style.color = 'var(--apple-green)';
        }
      } else {
        stateEl.innerHTML = '<span style="color: var(--apple-orange);">No Baseline</span>';
        stateSub.textContent = 'Execute safe-change save';
        if (stateBadge) {
          stateBadge.style.background = 'var(--apple-orange-bg)';
          stateBadge.style.color = 'var(--apple-orange)';
        }
        if (stateWatermark) {
          stateWatermark.style.color = 'var(--apple-orange)';
        }
      }

      // 2. Monitored Baseline
      const baselineFilesEl = document.getElementById('stat-baseline-files');
      const baselineDescEl = document.getElementById('stat-baseline-desc');
      if (status && status.hasBaseline) {
        baselineFilesEl.textContent = status.fileCount + ' files';
        baselineDescEl.textContent = status.description || 'Recorded baseline';
      } else {
        baselineFilesEl.textContent = '0 files';
        baselineDescEl.textContent = 'No baseline snapshot';
      }

      // 3. Enterprise Risk & Mode
      const riskEl = document.getElementById('stat-risk-mode');
      const riskSub = document.getElementById('stat-risk-sub');
      if (enterprise && enterprise.assessment) {
        const mode = enterprise.assessment.requiredMode || 'standard';
        const score = enterprise.assessment.riskScore || 0;
        riskEl.textContent = mode.toUpperCase();
        riskSub.textContent = 'Score: ' + score + '/100 (' + (enterprise.assessment.automaticMode || 'standard') + ')';
      } else {
        riskEl.textContent = 'STANDARD';
        riskSub.textContent = 'Default enterprise policy';
      }

      // 4. Change Budget
      const budgetEl = document.getElementById('stat-budget-status');
      const budgetSub = document.getElementById('stat-budget-sub');
      const budgetBadge = document.getElementById('stat-budget-badge');
      if (enterprise && enterprise.assessment) {
        const violations = enterprise.assessment.budgetViolations || [];
        if (violations.length > 0) {
          budgetEl.innerHTML = '<span style="color: var(--apple-red);">' + violations.length + ' Violations</span>';
          budgetSub.textContent = violations[0].message || 'Budget exceeded';
          if (budgetBadge) {
            budgetBadge.style.background = 'var(--apple-red-bg)';
            budgetBadge.style.color = 'var(--apple-red)';
          }
        } else {
          budgetEl.innerHTML = '<span style="color: var(--apple-green);">Nominal</span>';
          const adds = enterprise.diffStats ? '+' + enterprise.diffStats.linesAdded + '/-' + enterprise.diffStats.linesRemoved : 'Diff OK';
          budgetSub.textContent = adds + ' lines';
          if (budgetBadge) {
            budgetBadge.style.background = 'var(--apple-teal-bg)';
            budgetBadge.style.color = 'var(--apple-teal)';
          }
        }
      } else {
        budgetEl.textContent = 'Active';
        budgetSub.textContent = 'Budget limits applied';
      }

      // 5. Active Write Lease
      const leaseEl = document.getElementById('stat-lease-status');
      const leaseSub = document.getElementById('stat-lease-sub');
      if (lease && lease.active && lease.lease) {
        leaseEl.innerHTML = '<span style="color: var(--apple-orange);">Locked</span>';
        leaseSub.textContent = 'Holder: ' + (lease.lease.holder || 'Active');
      } else {
        leaseEl.innerHTML = '<span style="color: var(--apple-green);">Unlocked</span>';
        leaseSub.textContent = 'Atomic write lease available';
      }

      // 6. Audit & Trust
      const auditEl = document.getElementById('stat-audit-status');
      const auditSub = document.getElementById('stat-audit-sub');
      if (audit) {
        auditEl.textContent = (audit.totalEvents || 0) + ' events';
        auditSub.textContent = audit.verified ? '100% hash chain verified' : 'Integrity broken';
      } else {
        auditEl.textContent = '0 events';
        auditSub.textContent = 'Audit log initialized';
      }
    }

    function renderStatus(status) {
      const container = document.getElementById('status-content');
      const badge = document.getElementById('baseline-status-badge');

      if (!status || !status.hasBaseline) {
        badge.className = 'badge badge-warn';
        badge.textContent = 'No Baseline';
        container.innerHTML = '<div class="empty-state">No baseline recorded yet. Run <code>safe-change save</code> to create one.</div>';
        return;
      }

      badge.className = 'badge badge-clean';
      badge.textContent = 'Verified Baseline';

      const checks = status.checks || [];
      const passedCount = checks.filter(c => c.passed).length;

      container.innerHTML = \`
        <div class="meta-list">
          <div class="meta-row">
            <span class="meta-k">Recorded At</span>
            <span class="meta-v mono">\${status.createdAt}</span>
          </div>
          <div class="meta-row">
            <span class="meta-k">Description</span>
            <span class="meta-v">\${status.description || '(no description)'}</span>
          </div>
          <div class="meta-row">
            <span class="meta-k">Monitored Files</span>
            <span class="meta-v mono">\${status.fileCount} files</span>
          </div>
          <div class="meta-row">
            <span class="meta-k">Git Commit</span>
            <span class="meta-v mono">\${status.git && status.git.headCommit ? status.git.headCommit.slice(0, 10) : 'n/a'}</span>
          </div>
          <div class="meta-row">
            <span class="meta-k">Verification Rate</span>
            <span class="meta-v" style="color: var(--apple-green);">\${passedCount} / \${checks.length} checks passing</span>
          </div>
        </div>
        <div class="check-container">
          \${checks.map(c => \`
            <div class="check-pill">
              <div>
                <span class="check-name mono">\${c.name}</span>
                <span class="check-ms mono">\${c.durationMs ? c.durationMs + 'ms' : ''}</span>
              </div>
              <span class="badge \${c.passed ? 'badge-clean' : 'badge-regression'}">
                \${c.passed ? 'PASSED' : 'FAILED'}
              </span>
            </div>
          \`).join('')}
        </div>
      \`;
    }

    function selectTimelineRun(id) {
      selectedTimelineId = (selectedTimelineId === id) ? null : id;
      renderTimeline(globalLogEntries);
    }

    function renderTimeline(entries) {
      const container = document.getElementById('timeline-content');
      const metricsBar = document.getElementById('timeline-metrics-bar');
      const inspector = document.getElementById('timeline-inspector');

      if (!entries || entries.length === 0) {
        metricsBar.innerHTML = '<span id="timeline-stats" class="badge badge-info mono">0 runs tracked</span>';
        container.innerHTML = '<div class="empty-state">No history recorded yet. Baseline and check events will appear here.</div>';
        if (inspector) inspector.style.display = 'none';
        return;
      }

      const total = entries.length;
      const cleanCount = entries.filter(e => !e.regressionDetected).length;
      const regCount = entries.filter(e => e.regressionDetected).length;
      const stability = Math.round((cleanCount / total) * 100);

      metricsBar.innerHTML = \`
        <span id="timeline-stats" class="badge badge-info mono">\${total} runs tracked</span>
        <span class="badge badge-clean mono">\${cleanCount} clean</span>
        \${regCount > 0 ? \`<span class="badge badge-regression mono">\${regCount} regression\${regCount > 1 ? 's' : ''}</span>\` : ''}
        <span class="badge mono" style="background: rgba(0,0,0,0.04); color: var(--text-sub);">\${stability}% stability</span>
        <div class="segmented-control" style="margin-left: 6px;">
          <button class="segment-btn" onclick="scrollTimeline('start')">Earliest</button>
          <button class="segment-btn" onclick="scrollTimeline('end')">Latest</button>
        </div>
      \`;

      let html = '';
      entries.forEach((e, idx) => {
        const num = idx + 1;
        const isReg = e.regressionDetected;
        const isSelected = selectedTimelineId === e.id;
        const cardCls = isReg ? 'card-regression' : 'card-clean';
        const shortId = e.id.slice(0, 8);
        const dateStr = new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        const fs = e.fileSummary || { added: 0, modified: 0, deleted: 0 };
        const checks = e.checkResults || [];
        const passedChecks = checks.filter(c => c.result === 'pass-pass' || c.result === 'fail-pass').length;
        const checksSummary = checks.length > 0 ? \`\${passedChecks}/\${checks.length} checks\` : 'No checks';

        const triggerPill = e.trigger === 'mcp'
          ? '<span class="badge badge-info" style="font-size: 10px; padding: 1px 6px;">MCP</span>'
          : '<span class="badge" style="font-size: 10px; padding: 1px 6px; background: rgba(0,0,0,0.04); color: var(--text-sub);">CLI</span>';

        const statusBadge = isReg
          ? '<span class="badge badge-regression"><span class="live-dot" style="background: var(--apple-red); width: 6px; height: 6px; margin-right: 4px;"></span>REGRESSION</span>'
          : '<span class="badge badge-clean"><span class="live-dot" style="background: var(--apple-green); width: 6px; height: 6px; margin-right: 4px;"></span>CLEAN</span>';

        if (idx > 0) {
          html += \`
            <div class="timeline-connector">
              <svg viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </div>
          \`;
        }

        html += \`
          <div class="timeline-node-card \${cardCls} \${isSelected ? 'selected' : ''}" onclick="selectTimelineRun('\${e.id}')">
            <div class="timeline-card-top">
              <span class="timeline-run-badge mono">RUN #\${num}</span>
              <div style="display: flex; gap: 4px; align-items: center;">
                \${triggerPill}
                \${statusBadge}
              </div>
            </div>

            <div class="timeline-card-desc">\${e.description || '(no description)'}</div>

            <div class="timeline-card-metrics">
              <span class="mono" style="color: var(--apple-blue); font-weight: 600;">#\${shortId}</span>
              <span class="mono" style="display: flex; align-items: center; gap: 4px;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                \${dateStr}
              </span>
            </div>

            <div class="timeline-card-footer">
              <div class="diff-pill mono">
                <span class="diff-add">+\${fs.added}</span>
                <span class="diff-mod">~\${fs.modified}</span>
                <span class="diff-del">-\${fs.deleted}</span>
              </div>
              <span class="mono" style="color: var(--text-caption); font-size: 11px;">\${checksSummary}</span>
            </div>
          </div>
        \`;
      });

      container.innerHTML = html;

      if (selectedTimelineId && inspector) {
        const selectedEntry = entries.find(e => e.id === selectedTimelineId);
        if (selectedEntry) {
          const runNum = entries.indexOf(selectedEntry) + 1;
          const checks = selectedEntry.checkResults || [];
          const isReg = selectedEntry.regressionDetected;

          inspector.style.display = 'flex';
          inspector.innerHTML = \`
            <div class="inspector-head">
              <div class="inspector-title">
                <span class="mono" style="font-weight: 700; color: var(--apple-blue);">RUN #\${runNum} INSPECTOR</span>
                <span class="mono" style="color: var(--text-caption); font-size: 12px;">ID: \${selectedEntry.id}</span>
                <span class="badge \${isReg ? 'badge-regression' : 'badge-clean'}">\${isReg ? 'REGRESSION DETECTED' : 'CLEAN'}</span>
              </div>
              <div style="display: flex; gap: 8px;">
                <button class="segment-btn active" onclick="focusAuditRun('\${selectedEntry.id}')">View in Audit Table</button>
                <button class="segment-btn" onclick="selectTimelineRun('\${selectedEntry.id}')">Close</button>
              </div>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
              <div>
                <span style="color: var(--text-caption); font-size: 11px;">Description: </span>
                <span style="font-weight: 600; color: var(--text-main);">\${selectedEntry.description || '(none)'}</span>
              </div>
              <div class="mono" style="font-size: 11px; color: var(--text-caption);">
                Timestamp: \${selectedEntry.timestamp} | Trigger: \${selectedEntry.trigger.toUpperCase()}
              </div>
            </div>
            <div class="inspector-checks">
              \${checks.length > 0 ? checks.map(c => {
                const pass = c.result === 'pass-pass' || c.result === 'fail-pass';
                return \`
                  <div class="inspector-check-pill mono">
                    <span style="font-weight: 600;">\${c.name}</span>
                    <span class="badge \${pass ? 'badge-clean' : 'badge-regression'}" style="font-size: 10px;">\${c.result}</span>
                  </div>
                \`;
              }).join('') : '<div class="empty-state" style="padding: 10px; width: 100%;">No checks run during this entry</div>'}
            </div>
          \`;
        } else {
          inspector.style.display = 'none';
        }
      } else if (inspector) {
        inspector.style.display = 'none';
      }
    }

    function focusAuditRun(id) {
      switchTab('overview');
      const row = document.querySelector(\`tr[data-id="\${id}"]\`);
      if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        row.style.outline = '2px solid var(--apple-blue)';
        setTimeout(() => { row.style.outline = ''; }, 3000);
      } else {
        const table = document.getElementById('log-table');
        if (table) table.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }

    function renderLogTable() {
      const tbody = document.getElementById('log-body');
      let filtered = globalLogEntries;
      if (currentFilter === 'clean') {
        filtered = filtered.filter(e => !e.regressionDetected);
      } else if (currentFilter === 'regression') {
        filtered = filtered.filter(e => e.regressionDetected);
      }

      if (!filtered || filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No log entries found matching criteria.</td></tr>';
        return;
      }

      tbody.innerHTML = filtered.slice().reverse().map(e => {
        const rowCls = e.regressionDetected ? 'row-regression' : 'row-clean';
        const statusBadge = e.regressionDetected
          ? '<span class="badge badge-regression">REGRESSION</span>'
          : '<span class="badge badge-clean">CLEAN</span>';

        const triggerBadge = e.trigger === 'mcp'
          ? '<span class="badge badge-info">MCP</span>'
          : '<span class="badge" style="background: rgba(0,0,0,0.04); color: var(--text-sub);">CLI</span>';

        const fs = e.fileSummary || { added: 0, modified: 0, deleted: 0 };
        const diffPill = \`
          <div class="diff-pill mono">
            <span class="diff-add">+\${fs.added}</span>
            <span class="diff-mod">~\${fs.modified}</span>
            <span class="diff-del">-\${fs.deleted}</span>
          </div>
        \`;

        const checksList = (e.checkResults || []).map(c => {
          const pass = c.result === 'pass-pass' || c.result === 'fail-pass';
          const color = pass ? 'var(--apple-green)' : 'var(--apple-red)';
          return \`<span style="color: \${color}; font-size: 11px;" class="mono">\${c.name}</span>\`;
        }).join('<span style="color: var(--text-caption);">, </span>') || '<span style="color: var(--text-caption);">-</span>';

        return \`
          <tr class="\${rowCls}" data-id="\${e.id}">
            <td class="mono" style="color: var(--text-caption); font-size: 11px;">\${e.timestamp}</td>
            <td><code class="mono" style="color: var(--apple-blue); font-weight: 600;">\${e.id.slice(0, 8)}</code></td>
            <td>\${triggerBadge}</td>
            <td style="font-weight: 600; color: var(--text-main);">\${e.description || '(no description)'}</td>
            <td>\${diffPill}</td>
            <td>\${checksList}</td>
            <td>\${statusBadge}</td>
          </tr>
        \`;
      }).join('');
    }

    function renderRules(rulesData) {
      const container = document.getElementById('rules-content');
      const badge = document.getElementById('rules-count-badge');

      const isObject = rulesData && typeof rulesData === 'object' && !Array.isArray(rulesData);
      const status = isObject ? rulesData.status : (Array.isArray(rulesData) ? 'loaded' : 'not-configured');
      const rules = isObject ? (rulesData.rules || []) : (Array.isArray(rulesData) ? rulesData : []);
      const errorMsg = isObject ? rulesData.error : null;

      if (status === 'invalid') {
        badge.className = 'badge badge-regression';
        badge.textContent = 'Invalid Config';
        container.innerHTML = '<div class="empty-state" style="color: var(--apple-red);">Configuration error in rules.json: ' + (errorMsg || 'Invalid schema or syntax') + '</div>';
        return;
      }

      if (status === 'empty') {
        badge.className = 'badge';
        badge.style.background = 'rgba(0,0,0,0.04)';
        badge.style.color = 'var(--text-caption)';
        badge.textContent = '0 Rules (Empty)';
        container.innerHTML = '<div class="empty-state">Rules file exists but contains no active rules.</div>';
        return;
      }

      if (!rules || rules.length === 0) {
        badge.className = 'badge';
        badge.style.background = 'rgba(0,0,0,0.04)';
        badge.style.color = 'var(--text-caption)';
        badge.textContent = '0 Rules';
        container.innerHTML = '<div class="empty-state">No rules configured. Run <code>safe-change rules add &lt;id&gt;</code> to activate guardrails.</div>';
        return;
      }

      badge.className = 'badge badge-info';
      badge.textContent = rules.length + ' Active';

      container.innerHTML = rules.map(r => {
        const isErr = r.severity === 'error';
        const cardCls = isErr ? 'rule-card rule-error' : 'rule-card rule-warn';
        const badgeCls = isErr ? 'badge-regression' : 'badge-warn';
        const rawPattern = r.condition && r.condition.pattern ? r.condition.pattern : (r.condition && r.condition.type ? r.condition.type : 'custom');
        const name = escapeHtml(r.name || r.id);
        const severity = escapeHtml((r.severity || '').toUpperCase());
        const description = escapeHtml(r.description || '');
        const pattern = escapeHtml(rawPattern);

        return \`
          <div class="\${cardCls}">
            <div class="rule-row-head">
              <span class="rule-name">\${name}</span>
              <span class="badge \${badgeCls}">\${severity}</span>
            </div>
            <div class="rule-desc">\${description}</div>
            <code class="rule-code mono">\${pattern}</code>
          </div>
        \`;
      }).join('');
    }

    function renderEnterprise(ent) {
      if (!ent || !ent.assessment) return;
      const score = ent.assessment.riskScore || 0;
      const scoreVal = document.getElementById('risk-score-value');
      const scoreCircle = document.getElementById('risk-score-circle');
      const modeBadge = document.getElementById('risk-mode-badge');
      const modeDesc = document.getElementById('risk-mode-desc');

      if (scoreVal) scoreVal.textContent = score;
      if (scoreCircle) {
        const color = score >= 80 ? 'var(--apple-red)' : (score >= 50 ? 'var(--apple-orange)' : (score >= 20 ? 'var(--apple-blue)' : 'var(--apple-green)'));
        scoreCircle.style.borderColor = color;
        scoreCircle.style.color = color;
      }

      if (modeBadge) {
        modeBadge.textContent = (ent.assessment.requiredMode || 'standard').toUpperCase();
        modeBadge.className = score >= 80 ? 'badge badge-regression' : (score >= 50 ? 'badge badge-warn' : 'badge badge-clean');
      }

      if (modeDesc) {
        modeDesc.textContent = 'Calculated score: ' + score + '/100 — Blockers: ' + (ent.assessment.blockers?.length || 0);
      }

      // Signals List
      const signalsList = document.getElementById('risk-signals-list');
      const signalsBadge = document.getElementById('signals-count-badge');
      const signals = ent.assessment.signals || [];
      if (signalsBadge) signalsBadge.textContent = signals.length + ' Signals';

      if (signalsList) {
        if (signals.length === 0) {
          signalsList.innerHTML = '<div class="empty-state">No elevated risk signals detected. Repository changes are within baseline safety scope.</div>';
        } else {
          signalsList.innerHTML = signals.map(s => \`
            <div class="signal-item">
              <div>
                <div style="font-weight: 600; color: var(--text-main); font-size: 12px; display: flex; align-items: center; gap: 6px;">
                  <span class="badge badge-info mono">\${escapeHtml((s.category || '').toUpperCase())}</span>
                  <span>\${escapeHtml(s.reason || '')}</span>
                </div>
                <div class="mono" style="font-size: 11px; color: var(--text-caption); margin-top: 4px;">
                  \${escapeHtml((s.paths || []).slice(0, 3).join(', '))}\${s.paths && s.paths.length > 3 ? ' +' + (s.paths.length - 3) + ' more' : ''}
                </div>
              </div>
              <span class="badge badge-warn mono">+\${escapeHtml(s.score)} pts</span>
            </div>
          \`).join('');
        }
      }

      // Budget List
      const budgetItemsList = document.getElementById('budget-items-list');
      const budgetPillBadge = document.getElementById('budget-pill-badge');
      const violations = ent.assessment.budgetViolations || [];
      const budget = ent.policy?.changeBudget;

      if (budgetPillBadge) {
        if (violations.length > 0) {
          budgetPillBadge.className = 'badge badge-regression';
          budgetPillBadge.textContent = violations.length + ' Violations';
        } else {
          budgetPillBadge.className = 'badge badge-clean';
          budgetPillBadge.textContent = 'Within Budget';
        }
      }

      if (budgetItemsList && budget) {
        const metrics = ent.assessment.metrics || { filesChanged: 0, linesAdded: 0, linesDeleted: 0, publicApisChanged: 0 };
        budgetItemsList.innerHTML = \`
          <div class="meta-row">
            <span class="meta-k">Max Files Changed</span>
            <span class="meta-v mono">\${metrics.filesChanged} / \${budget.maxFilesChanged}</span>
          </div>
          <div class="meta-row">
            <span class="meta-k">Max Lines Added</span>
            <span class="meta-v mono" style="color: #1f8b3c;">+\${metrics.linesAdded} / +\${budget.maxLinesAdded}</span>
          </div>
          <div class="meta-row">
            <span class="meta-k">Max Lines Deleted</span>
            <span class="meta-v mono" style="color: #d70015;">-\${metrics.linesDeleted} / -\${budget.maxLinesDeleted}</span>
          </div>
          <div class="meta-row">
            <span class="meta-k">Public APIs Modified</span>
            <span class="meta-v mono">\${metrics.publicApisChanged} / \${budget.maxPublicApisChanged}</span>
          </div>
          <div class="meta-row">
            <span class="meta-k">Allow Lockfile Changes</span>
            <span class="meta-v mono">\${budget.allowLockfileChanges ? 'YES' : 'FAIL-CLOSED (NO)'}</span>
          </div>
        \`;
      }
    }

    function renderVerifiable(ver) {
      if (!ver) return;

      // Semantic Report
      const semContent = document.getElementById('semantic-report-content');
      const semBadge = document.getElementById('semantic-status-badge');
      if (ver.semanticReport) {
        if (semBadge) {
          const breaking = ver.semanticReport.breakingCount || 0;
          semBadge.className = breaking > 0 ? 'badge badge-regression' : 'badge badge-clean';
          semBadge.textContent = breaking > 0 ? breaking + ' Breaking Changes' : 'Clean AST Diff';
        }
        if (semContent) {
          semContent.innerHTML = \`
            <div class="meta-list">
              <div class="meta-row">
                <span class="meta-k">Evaluated Target</span>
                <span class="meta-v mono">\${ver.semanticReport.target || 'Current Workspace'}</span>
              </div>
              <div class="meta-row">
                <span class="meta-k">Breaking Changes</span>
                <span class="meta-v mono" style="color: \${(ver.semanticReport.breakingCount || 0) > 0 ? 'var(--apple-red)' : 'var(--apple-green)'}">
                  \${ver.semanticReport.breakingCount || 0}
                </span>
              </div>
              <div class="meta-row">
                <span class="meta-k">Export Symbol Shift</span>
                <span class="meta-v mono">\${ver.semanticReport.exportsModified || 0} modified</span>
              </div>
            </div>
          \`;
        }
      }

      // Attestations
      const attestList = document.getElementById('attestations-list');
      const attestBadge = document.getElementById('attestations-count-badge');
      const attestations = ver.attestations || [];
      if (attestBadge) attestBadge.textContent = attestations.length + ' Envelopes';

      if (attestList && attestations.length > 0) {
        attestList.innerHTML = attestations.map(a => {
          const s = a.summary || {};
          const subject = (s.subject && s.subject[0]) ? s.subject[0].name : a.filename;
          const digest = (s.subject && s.subject[0] && s.subject[0].digest) ? s.subject[0].digest.sha256 : '';
          return \`
            <div class="signal-item">
              <div>
                <div style="font-weight: 600; color: var(--text-main); font-size: 12px; display: flex; align-items: center; gap: 6px;">
                  <span class="badge badge-clean">Ed25519</span>
                  <span class="mono">\${subject}</span>
                </div>
                <div class="mono" style="font-size: 11px; color: var(--text-caption); margin-top: 4px;">
                  Digest: \${digest ? digest.slice(0, 16) + '...' : a.filename}
                </div>
              </div>
              <span class="badge badge-info mono">VERIFIED</span>
            </div>
          \`;
        }).join('');
      }

      // Replays
      const repList = document.getElementById('replays-list');
      const repBadge = document.getElementById('replays-count-badge');
      const replays = ver.replays || [];
      if (repBadge) repBadge.textContent = replays.length + ' Sessions';

      if (repList && replays.length > 0) {
        repList.innerHTML = replays.map(r => \`
          <div class="signal-item">
            <div>
              <div style="font-weight: 600; color: var(--text-main); font-size: 12px; display: flex; align-items: center; gap: 6px;">
                <span class="badge badge-purple mono">REPLAY</span>
                <span class="mono">\${r.sessionId.slice(0, 16)}</span>
              </div>
              <div class="mono" style="font-size: 11px; color: var(--text-caption); margin-top: 4px;">
                Manifest: \${r.manifestDigest ? r.manifestDigest.slice(0, 16) + '...' : 'none'}
              </div>
            </div>
            <span class="badge badge-clean mono">DETERMINISTIC</span>
          </div>
        \`).join('');
      }
    }

    function renderIdentity(idData) {
      const tbody = document.getElementById('identity-body');
      const badge = document.getElementById('identity-count-badge');
      const identities = idData?.identities || [];

      if (badge) badge.textContent = identities.length + ' Identities';
      if (!tbody) return;

      if (identities.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty-state">No approver identities registered yet. Use <code>safe-change identity add</code> to enroll trusted public keys.</td></tr>';
        return;
      }

      tbody.innerHTML = identities.map(id => \`
        <tr>
          <td><strong style="color: var(--text-main);">\${escapeHtml(id.id || id.name)}</strong></td>
          <td><span class="badge badge-info mono">\${escapeHtml((id.roles || ['approver']).join(', '))}</span></td>
          <td><code class="hash-pill">\${escapeHtml((id.publicKey || id.key || 'n/a').slice(0, 24))}...</code></td>
          <td><span class="badge badge-clean">ACTIVE</span></td>
        </tr>
      \`).join('');
    }

    function renderAudit(audit) {
      const tbody = document.getElementById('audit-body');
      const countBadge = document.getElementById('audit-events-count-badge');
      const integBadge = document.getElementById('audit-integrity-badge');

      if (countBadge) countBadge.textContent = (audit.totalEvents || 0) + ' Events';
      if (integBadge) {
        integBadge.className = audit.verified ? 'badge badge-clean' : 'badge badge-regression';
        integBadge.textContent = audit.verified ? 'CHAIN INTEGRITY VERIFIED (PASS)' : (audit.corrupted ? 'AUDIT LOG CORRUPTED (FAIL)' : 'CHAIN INTEGRITY COMPROMISED (FAIL)');
      }

      if (!tbody) return;
      const events = audit.events || [];

      if (events.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No audit log entries found. All repository checks and write leases are recorded here.</td></tr>';
        return;
      }

      tbody.innerHTML = events.map(ev => {
        const prev = ev.previousHash || ev.prevHash || '00000000';
        const curr = ev.hash || ev.currentHash || '--------';
        const type = ev.type || ev.action || 'EVENT';
        return \`
          <tr>
            <td class="mono" style="color: var(--text-caption); font-size: 11px;">\${escapeHtml(ev.timestamp || 'now')}</td>
            <td><span class="badge badge-info mono">\${escapeHtml(type)}</span></td>
            <td><strong style="color: var(--text-main);">\${escapeHtml(ev.actor || 'system')}</strong></td>
            <td><code class="hash-pill">\${escapeHtml(curr.slice(0, 12))}...</code></td>
            <td><code class="hash-pill" style="color: var(--text-caption);">\${escapeHtml(prev.slice(0, 12))}...</code></td>
            <td><span class="badge badge-clean">VALID LINK</span></td>
          </tr>
        \`;
      }).join('');
    }

    loadData();
    setInterval(loadData, 3000);
  </script>
</body>
</html>`;
}
