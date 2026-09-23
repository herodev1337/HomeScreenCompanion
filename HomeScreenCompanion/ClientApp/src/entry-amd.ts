// AMD entry spike. Phase 1 verifies Rollup AMD output + externals + default-export shape.
//
// Final design (Phase 2+): index.ts returns a (view: HTMLElement) => void factory.
//
// Jellyfin's plugin loader invokes this module as `__plugin/HomeScreenCompanionJS`
// and the body requires the custom-element modules as side-effects so they
// register globally before the factory runs. Rollup's AMD output keeps them
// in the define() deps array because we import them here.

import 'emby-input';
import 'emby-button';
import 'emby-select';
import 'emby-checkbox';

export default function hscSpike(view: HTMLElement): void {
    view.setAttribute('data-hsc-amd-spike', 'loaded');
    // external sanity check: each eby-* require resolves to the loaded custom
    // element module by the time this factory runs in Jellyfin.
    (view as any).__hscReady = true;
}
