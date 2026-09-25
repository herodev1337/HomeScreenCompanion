/**
 * The 466-line CSS literal previously inlined in `modules/index.ts:103-568`.
 *
 * Kept as a separate JS module (instead of `styles/config.css?raw`) so the
 * `index.lifecycle.test.ts` happy-dom / esbuild bundler (which lacks the
 * Rollup `rawTextPlugin`) can include it without an `?raw` loader. The
 * literal contents are byte-for-byte identical to the legacy `customCss`
 * template string — including the `<style id="homeScreenCompanionCustomCss">`
 * wrapper that the show-scoped check in `wireViewShow` keys off of.
 *
 * Migration to a `?raw`-imported `.css` asset is possible once the
 * lifecycle test bundler is taught about the loader plugin (out of
 * scope for D1 — file set is `modules/index.ts` + `modules/app/*` +
 * `styles/*`, and this file is the intended destination in both shapes).
 */

export const CUSTOM_CSS = `
    <style id="homeScreenCompanionCustomCss">
        .day-toggle {
            background: rgba(128,128,128,0.08);
            color: var(--theme-text-secondary);
            border: 1px solid var(--line-color);
            border-radius: 4px;
            padding: 8px 12px;
            cursor: pointer;
            font-size: 0.9em;
            transition: all 0.2s;
            text-transform: uppercase;
            font-weight: bold;
            flex-grow: 1;
            text-align: center;
        }
        .day-toggle:hover {
            background: var(--theme-background-level2);
            color: var(--theme-text-primary);
            border-color: var(--theme-primary-color);
        }
        .day-toggle.active {
            background: #52B54B;
            color: #fff;
            border-color: #52B54B;
            box-shadow: 0 2px 5px rgba(0,0,0,0.3);
        }

        .date-row-container {
            background: rgba(128,128,128,0.06);
            border: 1px solid var(--line-color);
            border-radius: 6px;
            padding: 15px;
            margin-bottom: 10px;
        }

        .selectLabel {
            font-size: 0.9em;
            color: var(--theme-text-secondary);
            margin-bottom: 5px;
            font-weight: 500;
            display: block;
        }

        .tag-indicator {
            margin-left: 10px;
            font-size: 0.75em;
            padding: 2px 8px;
            border-radius: 4px;
            display: flex;
            align-items: center;
            gap: 4px;
            font-weight: 500;
            position: relative;
        }

        .tag-indicator.schedule {
            color: #00a4dc;
            background: rgba(0,164,220,0.15);
            border: 1px solid rgba(0,164,220,0.35);
        }

        .tag-indicator.collection {
            color: #8459ca;
            background: rgba(126, 77, 172, 0.15);
            border: 1px solid rgba(126, 77, 172, 0.35);
        }

        .tag-indicator.homescreen {
            color: #4CAF50;
            background: rgba(76,175,80,0.15);
            border: 1px solid rgba(76,175,80,0.35);
        }

        .tag-indicator.schedule::after {
            content: '';
            position: absolute;
            top: -3px;
            right: -3px;
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: #f59e0b;
            box-shadow: 0 0 0 1.5px var(--theme-background, #101010);
        }

        .tag-indicator.schedule.schedule-active::after {
            background: #52B54B;
        }

        .tag-indicator.tag {
            color: #909090;
            background: rgba(80,80,80,0.18);
            border: 1px solid rgba(80,80,80,0.35);
        }

        .tag-indicator.playlist {
            color: #2db396;
            background: rgba(45, 184, 154, 0.15);
            border: 1px solid rgba(43, 190, 154, 0.35);
        }

        .tag-indicator.toplist {
            color: #c9a84c;
            background: rgba(180,140,50,0.15);
            border: 1px solid rgba(180,140,50,0.4);
        }

        .tag-indicator.source {
            color: #78909c;
            background: rgba(120,144,156,0.15);
            border: 1px solid rgba(120,144,156,0.35);
            padding: 2px 5px;
            margin-left: 0;
            margin-right: 8px;
        }

        .badge-container {
            display: flex;
            align-items: center;
        }

        .sort-hidden .drag-handle {
            display: none !important;
        }

        .dry-run-warning {
            background-color: #E67E22;
            color: #000000;
            padding: 15px;
            border-radius: 5px;
            margin-bottom: 20px;
            text-align: center;
            font-weight: bold;
            font-size: 1.1em;
            box-shadow: 0 4px 8px rgba(0,0,0,0.3);
            display: none;
            align-items: center;
            justify-content: center;
            gap: 10px;
            position: sticky;
            top: 60px;
            z-index: 10000;
        }

        .drag-handle {
            cursor: grab;
            margin-right: 15px;
            color: var(--theme-text-secondary);
            display: flex;
            align-items: center;
        }

        .drag-handle:active {
            cursor: grabbing;
        }

        .tag-row {
            position: relative;
            background: var(--theme-background-level2);
            margin-bottom: 15px;
            border-radius: 6px;
            border: 1px solid var(--line-color);
            border-left: 5px solid #52B54B;
            transition: all 0.2s ease;
            box-shadow: 0 2px 6px rgba(0,0,0,0.12);
            overflow: hidden;
        }

        .tag-row.inactive {
            border-left-color: rgba(128,128,128,0.5);
        }

        .tag-row.dragging {
            opacity: 0.4 !important;
            border: 2px dashed #999 !important;
            background: var(--theme-background-level1) !important;
        }

        .sort-placeholder {
            height: 40px;
            background-color: transparent;
            margin-bottom: 15px;
            border-radius: 6px;
            border: 2px dashed var(--line-color);
            transition: height 0.2s;
        }

        .tag-row.just-moved {
            animation: moveHighlight 2s ease-out forwards;
        }

        .tag-row.just-added {
            animation: addHighlight 2s ease-out forwards;
        }

        @keyframes moveHighlight {
            0% {
                border-top: 1px solid #00a4dc;
                border-right: 1px solid #00a4dc;
                border-bottom: 1px solid #00a4dc;
                box-shadow: 0 0 15px rgba(0,164,220,0.5);
            }
            100% {
                border-top: 1px solid var(--line-color);
                border-right: 1px solid var(--line-color);
                border-bottom: 1px solid var(--line-color);
                box-shadow: 0 2px 6px rgba(0,0,0,0.12);
            }
        }

        @keyframes tcDotBounce {
            0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
            40%            { transform: translateY(-5px); opacity: 1; }
        }
        .tc-dot-loader { display:inline-flex; align-items:center; gap:5px; }
        .tc-dot-loader span { display:inline-block; width:7px; height:7px; border-radius:50%; background:currentColor; animation:tcDotBounce 1.2s ease-in-out infinite; }
        .tc-dot-loader span:nth-child(2) { animation-delay:0.2s; }
        .tc-dot-loader span:nth-child(3) { animation-delay:0.4s; }

        @keyframes addHighlight {
            0% {
                border-top: 1px solid #52B54B;
                border-right: 1px solid #52B54B;
                border-bottom: 1px solid #52B54B;
                box-shadow: 0 0 15px rgba(82,181,75,0.5);
            }
            100% {
                border-top: 1px solid var(--line-color);
                border-right: 1px solid var(--line-color);
                border-bottom: 1px solid var(--line-color);
                box-shadow: 0 2px 6px rgba(0,0,0,0.12);
            }
        }

        .control-row {
            background: rgba(128,128,128,0.06);
            padding: 12px;
            border-radius: 6px;
            margin-bottom: 20px;
            border: 1px solid var(--line-color);
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .control-sub-row {
            display: flex;
            align-items: center;
            gap: 20px;
        }

        .control-group {
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .control-label {
            font-size: 0.85em;
            opacity: 0.5;
            text-transform: uppercase;
            font-weight: bold;
            letter-spacing: 0.5px;
        }

        .search-input-wrapper {
            position: relative;
            display: flex;
            align-items: center;
            flex-grow: 1;
            max-width: 250px;
        }

        .search-input-wrapper .search-icon {
            position: absolute;
            left: 10px;
            font-size: 1em;
            opacity: 0.5;
            pointer-events: none;
        }

        #btnClearSearch {
            position: absolute;
            right: 8px;
            cursor: pointer;
            opacity: 0.5;
            display: none;
        }

        #btnClearSearch:hover {
            opacity: 1;
            color: #cc3333;
        }

        #txtSearchTags {
            width: 100%;
            background: rgba(128,128,128,0.06) !important;
            border: 1px solid var(--line-color) !important;
            border-radius: 4px !important;
            padding: 6px 30px 6px 35px !important;
            color: inherit;
            font-size: 0.95em;
        }

        #txtSearchTags:focus {
            border-color: var(--theme-primary-color) !important;
            background: rgba(128,128,128,0.1) !important;
        }

        .filter-dropdown-wrapper {
            position: relative;
            flex-shrink: 0;
        }

        .filter-dropdown-btn {
            display: flex;
            align-items: center;
            gap: 5px;
            padding: 5px 10px;
            background: var(--plugin-input-bg, rgba(128,128,128,0.08));
            border: 1px solid var(--plugin-input-border, var(--line-color));
            border-radius: 4px;
            font-size: 0.9em;
            cursor: pointer;
            color: var(--plugin-popup-color, inherit);
            white-space: nowrap;
            user-select: none;
        }

        .filter-dropdown-btn:hover {
            background: var(--plugin-popup-hover, rgba(128,128,128,0.15));
        }

        html[data-plugin-theme="dark"] select,
        html[data-plugin-theme="dark"] input[type="text"],
        html[data-plugin-theme="dark"] input[type="number"] {
            color-scheme: dark;
        }

        html[data-plugin-theme="light"] select,
        html[data-plugin-theme="light"] input[type="text"],
        html[data-plugin-theme="light"] input[type="number"] {
            color-scheme: light;
        }

        .filter-dropdown-btn.active {
            border-color: #52B54B;
            color: #52B54B;
        }

        .filter-dropdown-panel {
            display: none;
            position: absolute;
            top: calc(100% + 6px);
            left: 0;
            z-index: 9999;
            background: var(--plugin-popup-bg, #2a2a2a);
            color: var(--plugin-popup-color, #e8e8e8);
            border: 1px solid var(--plugin-popup-border, rgba(255,255,255,0.12));
            border-radius: 6px;
            box-shadow: 0 6px 20px rgba(0,0,0,0.4);
            padding: 10px 14px;
            min-width: 200px;
        }

        .filter-dropdown-panel.open {
            display: block;
        }

        .hsc-user-dropdown .filter-dropdown-panel {
            max-height: 260px;
            overflow-y: auto;
        }

        .filter-dropdown-section {
            margin-bottom: 10px;
        }

        .filter-dropdown-section:last-child {
            margin-bottom: 0;
        }

        .filter-dropdown-divider {
            height: 1px;
            background: var(--line-color);
            margin: 8px 0;
        }

        .filter-dropdown-label {
            font-size: 0.75em;
            opacity: 0.5;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 6px;
        }

        .filter-chk-row {
            display: flex;
            align-items: center;
            gap: 7px;
            padding: 3px 0;
            cursor: pointer;
            font-size: 0.9em;
        }

        .filter-chk-row input[type=checkbox] {
            cursor: pointer;
        }

        .btn-row-remove {
            background: transparent !important;
            min-width: 40px;
            width: 40px;
            padding: 0;
            color: #cc3333;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: none;
            margin-top: 12px;
        }

        .btn-neutral {
            background: var(--theme-background-level2) !important;
            border: 1px solid rgba(128,128,128,0.4) !important;
            color: var(--theme-text-primary) !important;
        }
        .plugin-footer {
            position: fixed;
            bottom: 0;
            left: var(--plugin-footer-left, 0);
            right: 0;
            z-index: 200;
            background: var(--plugin-footer-bg);
            color: var(--plugin-popup-muted);
            height: 50px;
            padding: 0 28px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 0.9em;
            border-top: 1px solid var(--line-color);
            box-sizing: border-box;
        }
        .plugin-footer .footer-version {
            color: var(--theme-text-secondary);
        }
        .plugin-footer .footer-sep {
            margin: 0 12px;
            opacity: 0.35;
        }
        .plugin-footer .footer-update-link {
            color: #E67E22;
            text-decoration: none;
            font-weight: bold;
        }
        .plugin-footer .simple-link {
            font-size: 1em;
            transition: none;
            transform: none;
        }
        .plugin-footer .simple-link:hover {
            transform: none;
        }
    </style>`;
