/* GENERATED from HomeScreenCompanion/ClientApp/src by rollup - do not edit */
define(['emby-input', 'emby-button', 'emby-select', 'emby-checkbox'], (function (embyInput, embyButton, embySelect, embyCheckbox) { 'use strict';

    const PLUGIN_ID = "7c10708f-43e4-4d69-923c-77d01802315b";
    const DEFAULT_AI_SYSTEM_PROMPT = 'You are a movie and TV show recommendation assistant. Respond ONLY with a valid JSON array. No explanation, no markdown, no code fences. Each item must have these fields: "title" (string, required), "year" (integer or null), "imdb_id" (string starting with "tt" if known, otherwise null), "type" ("movie" or "show"). Return exactly the items requested. Do not add any commentary. Example: [{"title":"Inception","year":2010,"imdb_id":"tt1375666","type":"movie"}]';
    function createHscState() {
      return { config: {} };
    }
    function createManageState() {
      return { sections: [] };
    }
    function createSavedFiltersState() {
      return { filters: [] };
    }
    function createTopListsState() {
      return { tagNames: /* @__PURE__ */ new Set() };
    }
    function createLibraryCacheState() {
      return { collections: [], playlists: [], tags: [] };
    }
    function createMiUsersState() {
      return { users: null };
    }
    function createHseUserCacheState() {
      return { users: null, libraryPromise: null };
    }
    function createOriginalConfigStateRef() {
      let current = null;
      return {
        getOriginalConfigState: () => current,
        setOriginalConfigState: (value) => {
          current = value;
        }
      };
    }
    function createLogStatusState() {
      return { lastStatus: { sync: null, hsc: null, tl: null }, logTab: null, statusRequestId: 0 };
    }
    function createViewShowEphemeralState() {
      return { formAc: null, statusInterval: null };
    }
    function createAppState() {
      return {
        hsc: createHscState(),
        manage: createManageState(),
        savedFilters: createSavedFiltersState(),
        topLists: createTopListsState(),
        libraryCache: createLibraryCacheState(),
        miUsers: createMiUsersState(),
        hseUserCache: createHseUserCacheState(),
        originalConfigState: createOriginalConfigStateRef(),
        logStatus: createLogStatusState(),
        viewShow: createViewShowEphemeralState()
      };
    }

    const MI_CRITERION_MAP = {
      "4K": { prop: "Resolution", val: "4K" },
      "8K": { prop: "Resolution", val: "8K" },
      "1080p": { prop: "Resolution", val: "1080p" },
      "720p": { prop: "Resolution", val: "720p" },
      "SD": { prop: "Resolution", val: "SD" },
      "HEVC": { prop: "VideoCodec", val: "HEVC" },
      "AV1": { prop: "VideoCodec", val: "AV1" },
      "H264": { prop: "VideoCodec", val: "H264" },
      "HDR": { prop: "HDR", val: "HDR" },
      "DolbyVision": { prop: "HDR", val: "DolbyVision" },
      "HDR10": { prop: "HDR", val: "HDR10" },
      "Atmos": { prop: "AudioFormat", val: "Atmos" },
      "TrueHD": { prop: "AudioFormat", val: "TrueHD" },
      "DtsHdMa": { prop: "AudioFormat", val: "DtsHdMa" },
      "DTS": { prop: "AudioFormat", val: "DTS" },
      "AC3": { prop: "AudioFormat", val: "AC3" },
      "AAC": { prop: "AudioFormat", val: "AAC" },
      "7.1": { prop: "AudioChannels", val: "7.1" },
      "5.1": { prop: "AudioChannels", val: "5.1" },
      "Stereo": { prop: "AudioChannels", val: "Stereo" },
      "Mono": { prop: "AudioChannels", val: "Mono" },
      "InProgress": { prop: "InProgress", val: "InProgress" }
    };
    const MI_REVERSE_MAP = (() => {
      const out = {};
      for (const k of Object.keys(MI_CRITERION_MAP)) {
        const m = MI_CRITERION_MAP[k];
        out[`${m.prop}:${m.val}`] = k;
      }
      return out;
    })();
    function parseCriterion(crit) {
      if (!crit) return { prop: "Resolution", op: "", val: "", userId: "", not: false };
      const not = crit.charAt(0) === "!";
      const body = not ? crit.slice(1) : crit;
      const lcrit = body.toLowerCase();
      if (lcrit.startsWith("collection:") || lcrit.startsWith("playlist:")) {
        const ci = body.indexOf(":");
        return { prop: body.substring(0, ci), op: "", val: body.substring(ci + 1), userId: "", not };
      }
      const parts = body.split(":");
      if (parts.length === 1) {
        const mapped = MI_CRITERION_MAP[body];
        return mapped ? { prop: mapped.prop, op: "", val: mapped.val, userId: "", not } : { prop: "", op: "", val: body, userId: "", not };
      }
      if (parts.length === 2) return { prop: parts[0], op: "", val: parts[1], userId: "", not };
      if (parts.length === 3) return { prop: parts[0], op: parts[1], val: parts[2], userId: "", not };
      if (parts.length === 4) return { prop: parts[0], userId: parts[1], op: parts[2], val: parts[3], not };
      return { prop: "Resolution", op: "", val: "", userId: "", not: false };
    }
    function buildCriterion(prop, op, val, userId) {
      if (!prop || val === "") return "";
      if (userId) return `${prop}:${userId}:${op}:${val}`;
      if (op) return `${prop}:${op}:${val}`;
      const key = `${prop}:${val}`;
      return MI_REVERSE_MAP[key] ?? `${prop}:${val}`;
    }
    function migrateCommaSeparated(val) {
      if (!val || val.indexOf("\n") >= 0) return val;
      if (val.indexOf(",") < 0) return val;
      return val.split(",").map((s) => s.trim()).filter((s) => s.length > 0).join("\n");
    }

    function groupConfigTags(tags) {
      const grouped = {};
      (tags ?? []).forEach((t) => {
        const key = t.Name ? t.Name + "" + t.Tag : t.Tag;
        if (!grouped[key]) {
          grouped[key] = {
            Tag: t.Tag,
            Name: t.Name || "",
            Urls: [],
            LocalSources: [],
            Active: t.Active !== false,
            Blacklist: t.Blacklist,
            ActiveIntervals: t.ActiveIntervals,
            EnableTag: t.EnableTag !== false,
            EnableCollection: t.EnableCollection,
            CollectionName: t.CollectionName,
            CollectionDescription: t.CollectionDescription || "",
            CollectionPosterPath: t.CollectionPosterPath || "",
            OnlyCollection: t.OnlyCollection,
            OverrideWhenActive: t.OverrideWhenActive || false,
            LastModified: t.LastModified,
            SourceType: t.SourceType || "External",
            MediaInfoConditions: t.MediaInfoConditions || [],
            MediaInfoFilters: t.MediaInfoFilters || [],
            Limit: t.Limit || 0,
            EnableHomeSection: t.EnableHomeSection || false,
            HomeSectionLibraryId: t.HomeSectionLibraryId || "auto",
            HomeSectionUserIds: t.HomeSectionUserIds || [],
            HomeSectionSettings: t.HomeSectionSettings || "{}",
            HomeSectionTracked: t.HomeSectionTracked || [],
            AiProvider: t.AiProvider || "OpenAI",
            AiPrompt: t.AiPrompt || "",
            AiIncludeRecentlyWatched: t.AiIncludeRecentlyWatched || false,
            AiRecentlyWatchedUserId: t.AiRecentlyWatchedUserId || "",
            AiRecentlyWatchedCount: t.AiRecentlyWatchedCount || 20,
            TagTargetEpisode: t.TagTargetEpisode || false,
            TagTargetSeason: t.TagTargetSeason || false,
            TagTargetSeries: t.TagTargetSeries || false,
            CollectionTargetEpisode: t.CollectionTargetEpisode || false,
            CollectionTargetSeason: t.CollectionTargetSeason || false,
            CollectionTargetSeries: t.CollectionTargetSeries || false,
            EnablePlaylist: t.EnablePlaylist || false,
            PlaylistName: t.PlaylistName || "",
            PlaylistUserIds: t.PlaylistUserIds || [],
            PlaylistMappings: t.PlaylistMappings || []
          };
        }
        if (t.SourceType === "External" && t.Url) {
          grouped[key].Urls.push({ url: t.Url, limit: t.Limit ?? 0 });
        }
        if ((t.SourceType === "LocalCollection" || t.SourceType === "LocalPlaylist") && t.LocalSourceId) {
          grouped[key].LocalSources.push({ id: t.LocalSourceId, limit: t.Limit ?? 0 });
        }
        if (t.SourceType === "MediaInfo") grouped[key].Limit = t.Limit ?? 0;
        if (t.SourceType === "AI") grouped[key].Limit = t.Limit ?? 0;
      });
      return grouped;
    }
    function updateDryRunWarning(originalConfigState) {
      const view = document.querySelector("#HomeScreenCompanionConfigPage");
      if (!view || !originalConfigState) return;
      const warn = view.querySelector(".dry-run-warning");
      if (warn) {
        try {
          const savedConfig = JSON.parse(originalConfigState);
          warn.style.display = savedConfig.DryRunMode ? "flex" : "none";
        } catch {
          warn.style.display = "none";
        }
      }
    }
    function getUiConfig(view, forComparison, deps) {
      const flatTags = [];
      view.querySelectorAll(".tag-row").forEach((row) => {
        const rowEl = row;
        if (!rowEl.querySelector(".txtEntryLabel")) return;
        const entryLabel = rowEl.querySelector(".txtEntryLabel").value;
        const name = rowEl.querySelector(".txtTagName").value || entryLabel;
        const active = rowEl.querySelector(".chkTagActive").checked;
        const blInput = rowEl.querySelector(".txtTagBlacklist");
        const bl = blInput ? blInput.value.split(/[\n\r]+/).map((s) => s.trim()).filter((s) => s.length > 0) : [];
        const enableTagChk = rowEl.querySelector(".chkEnableTag").checked;
        const enableColl = rowEl.querySelector(".chkEnableCollection").checked;
        const overrideWhenActive = !!rowEl.querySelector(".chkOverrideWhenActive")?.checked;
        const collName = rowEl.querySelector(".txtCollectionName").value;
        const collDescription = rowEl.querySelector(".txtCollectionDescription") ? rowEl.querySelector(".txtCollectionDescription").value : "";
        const collPoster = rowEl.querySelector(".hiddenPosterPath") ? rowEl.querySelector(".hiddenPosterPath").value : "";
        const intervals = [];
        rowEl.querySelectorAll(".date-row").forEach((dr) => {
          const type = dr.querySelector(".selDateType").value;
          let s = null;
          let e = null;
          let days = "";
          if (type === "SpecificDate") {
            s = dr.querySelector(".txtFullStartDate").value;
            e = dr.querySelector(".txtFullEndDate").value;
          } else if (type === "EveryYear") {
            const sM = dr.querySelector(".selStartMonth").value;
            const sD = dr.querySelector(".selStartDay").value;
            const eM = dr.querySelector(".selEndMonth").value;
            const eD = dr.querySelector(".selEndDay").value;
            s = `2000-${sM.padStart(2, "0")}-${sD.padStart(2, "0")}`;
            e = `2000-${eM.padStart(2, "0")}-${eD.padStart(2, "0")}`;
          } else if (type === "Weekly") {
            const activeBtns = Array.from(dr.querySelectorAll(".day-toggle.active")).map((b) => b.dataset.day);
            days = activeBtns.join(",");
          }
          intervals.push({ Type: type, Start: s || null, End: e || null, DayOfWeek: days });
        });
        const currentLastMod = rowEl.dataset.lastModified || (/* @__PURE__ */ new Date()).toISOString();
        const st = rowEl.querySelector(".selSourceType").value;
        const miFilters = [];
        rowEl.querySelectorAll(".mediainfo-filter-group").forEach((group, gi) => {
          const operator = group.dataset.op || "AND";
          const groupOp = gi === 0 ? "AND" : group.dataset.groupOp || "AND";
          const criteria = [];
          group.querySelectorAll(".mi-rule").forEach((rule) => {
            const prop = rule.querySelector(".selMiProperty")?.value || "";
            const selVal = rule.querySelector(".selMiValue");
            const txtVal = rule.querySelector(".txtMiValue");
            const selOp = rule.querySelector(".selMiOp");
            const txtNum = rule.querySelector(".txtMiNum");
            const selUser = rule.querySelector(".selMiUser");
            const selTextOp = rule.querySelector(".selMiTextOp");
            let val = selVal ? selVal.value : txtVal ? txtVal.value.replace(/\r?\n/g, "\n").trim() : "";
            if (prop === "MediaType" && val === "Episode") {
              const incParentChk = rule.querySelector(".chkIncludeParentSeries");
              if (incParentChk && incParentChk.checked) val = "EpisodeIncludeSeries";
            }
            const op2 = selOp ? selOp.value : "";
            const textMatchOp = selTextOp ? selTextOp.value : "";
            const num = txtNum ? txtNum.value.trim() : "";
            const userId = selUser ? selUser.value : "";
            const finalOp = op2 || textMatchOp;
            const finalVal = op2 ? num : val;
            const notBtn = rule.querySelector(".btnNotToggle");
            const isNot = notBtn && notBtn.dataset.not === "1";
            const crit = buildCriterion(prop, finalOp, finalVal, userId);
            if (crit) criteria.push(isNot ? "!" + crit : crit);
          });
          if (criteria.length > 0) miFilters.push({ Operator: operator, Criteria: criteria, GroupOperator: groupOp });
        });
        const plTab2 = rowEl.querySelector(".playlist-tab");
        let plUserIds2;
        if (plTab2 && plTab2.dataset.plLoaded === "1") {
          plUserIds2 = Array.from(plTab2.querySelectorAll(".chkPlaylistUser:checked")).map((c) => c.value);
        } else {
          try {
            plUserIds2 = JSON.parse(decodeURIComponent(plTab2 && plTab2.dataset.plUserids || "%5B%5D"));
          } catch {
            plUserIds2 = [];
          }
        }
        const hseTab = rowEl.querySelector(".homescreen-tab");
        const enableHse = hseTab ? !!hseTab.querySelector(".chkEnableHomeSection")?.checked : false;
        let hseLibraryId;
        if (hseTab && hseTab.dataset.hseLoaded === "1") {
          hseLibraryId = hseTab.querySelector(".selHseLibrary")?.value || "auto";
        } else {
          hseLibraryId = decodeURIComponent(hseTab && hseTab.dataset.hseLibraryid || "auto");
        }
        let hseUserIds;
        if (hseTab && hseTab.dataset.hseLoaded === "1") {
          hseUserIds = Array.from(hseTab.querySelectorAll(".chkHseUser:checked")).map((c) => c.value);
        } else {
          try {
            hseUserIds = JSON.parse(decodeURIComponent(hseTab && hseTab.dataset.hseUserids || "%5B%5D"));
          } catch {
            hseUserIds = [];
          }
        }
        let hseSettings = {};
        if (hseTab && hseTab.dataset.hseLoaded === "1") {
          hseTab.querySelectorAll("[data-field]").forEach((el) => {
            const f = el.dataset.field;
            if (!f) return;
            const inputEl = el;
            const v = inputEl.type === "checkbox" ? String(inputEl.checked) : inputEl.value;
            hseSettings[f] = v;
          });
          const itemTypesVal = hseTab.querySelector(".selHseItemTypes")?.value || "Movie,Series";
          hseSettings["ItemTypes"] = JSON.stringify(itemTypesVal.split(","));
          const excludedLibIds = Array.from(hseTab.querySelectorAll(".chkHseLibrary:not(:checked)")).map((c) => c.value);
          if (excludedLibIds.length > 0) {
            hseSettings["_queryExcludeViewIds"] = excludedLibIds.join(",");
            hseSettings["ExcludedFolders"] = excludedLibIds.join(",");
          } else {
            delete hseSettings["_queryExcludeViewIds"];
            delete hseSettings["ExcludedFolders"];
          }
        } else {
          try {
            hseSettings = JSON.parse(decodeURIComponent(hseTab && hseTab.dataset.hseSettings || "%7B%7D"));
          } catch {
            hseSettings = {};
          }
        }
        let hseTracked;
        try {
          hseTracked = JSON.parse(decodeURIComponent(hseTab && hseTab.dataset.hseTracked || "%5B%5D"));
        } catch {
          hseTracked = [];
        }
        const baseTag = {
          Name: entryLabel,
          Tag: name,
          Active: active,
          Blacklist: bl,
          ActiveIntervals: intervals,
          EnableTag: enableTagChk,
          EnableCollection: enableColl,
          CollectionName: collName,
          CollectionDescription: collDescription,
          CollectionPosterPath: collPoster,
          OnlyCollection: false,
          OverrideWhenActive: overrideWhenActive,
          LastModified: currentLastMod,
          SourceType: st,
          MediaInfoFilters: miFilters,
          MediaInfoConditions: [],
          TagTargetEpisode: !!rowEl.querySelector(".chkTagTargetEpisode")?.checked,
          TagTargetSeason: !!rowEl.querySelector(".chkTagTargetSeason")?.checked,
          TagTargetSeries: !!rowEl.querySelector(".chkTagTargetSeries")?.checked,
          CollectionTargetEpisode: !!rowEl.querySelector(".chkCollTargetEpisode")?.checked,
          CollectionTargetSeason: !!rowEl.querySelector(".chkCollTargetSeason")?.checked,
          CollectionTargetSeries: !!rowEl.querySelector(".chkCollTargetSeries")?.checked,
          MediaInfoTargetEpisode: false,
          MediaInfoTargetSeason: false,
          MediaInfoTargetSeries: false,
          MediaInfoTargetType: "",
          MediaInfoSeasonMode: false,
          EnableHomeSection: enableHse,
          HomeSectionLibraryId: hseLibraryId,
          HomeSectionUserIds: hseUserIds,
          HomeSectionSettings: JSON.stringify(hseSettings),
          HomeSectionTracked: hseTracked,
          EnablePlaylist: !!rowEl.querySelector(".chkEnablePlaylist")?.checked,
          PlaylistName: rowEl.querySelector(".txtPlaylistName")?.value || "",
          PlaylistUserIds: plUserIds2,
          PlaylistMappings: (() => {
            try {
              return JSON.parse(decodeURIComponent(plTab2 && plTab2.dataset.plMappings || "%5B%5D"));
            } catch {
              return [];
            }
          })()
        };
        if (st === "External") {
          let pushedExternal = false;
          rowEl.querySelectorAll(".url-row").forEach((uRow) => {
            const urlVal = uRow.querySelector(".txtTagUrl").value.trim();
            const limitVal = parseInt(uRow.querySelector(".txtUrlLimit").value, 10) || 0;
            if (urlVal) {
              flatTags.push(Object.assign({}, baseTag, { Url: urlVal, Limit: limitVal, LocalSourceId: "" }));
              pushedExternal = true;
            }
          });
          if (forComparison && !pushedExternal) {
            flatTags.push(Object.assign({}, baseTag, { Url: "", Limit: 0, LocalSourceId: "" }));
          }
        } else if (st === "LocalCollection" || st === "LocalPlaylist") {
          let pushedLocal = false;
          rowEl.querySelectorAll(".local-row").forEach((lRow) => {
            const localVal = lRow.querySelector(".selLocalSource").value;
            const limitVal = parseInt(lRow.querySelector(".txtLocalLimit").value, 10) || 0;
            if (localVal) {
              flatTags.push(Object.assign({}, baseTag, { Url: "", Limit: limitVal, LocalSourceId: localVal }));
              pushedLocal = true;
            }
          });
          if (forComparison && !pushedLocal) {
            flatTags.push(Object.assign({}, baseTag, { Url: "", Limit: 0, LocalSourceId: "" }));
          }
        } else if (st === "AI") {
          const aiLimitVal = parseInt(rowEl.querySelector(".txtAiLimit")?.value ?? "0", 10) || 0;
          flatTags.push(Object.assign({}, baseTag, {
            Url: "",
            Limit: aiLimitVal,
            LocalSourceId: "",
            AiProvider: rowEl.querySelector(".selAiProvider")?.value || "OpenAI",
            AiPrompt: rowEl.querySelector(".txtAiPrompt")?.value || "",
            AiIncludeRecentlyWatched: !!rowEl.querySelector(".chkAiRecentlyWatched")?.checked,
            AiRecentlyWatchedUserId: rowEl.querySelector(".selAiWatchedUser")?.value || "",
            AiRecentlyWatchedCount: parseInt(rowEl.querySelector(".txtAiWatchedCount")?.value || "20", 10) || 20,
            AiRefreshIntervalDays: parseInt(rowEl.querySelector(".txtAiRefreshInterval")?.value || "0", 10) || 0
          }));
        } else {
          const miLimitVal = parseInt(rowEl.querySelector(".txtMediaInfoLimit")?.value ?? "0", 10) || 0;
          flatTags.push(Object.assign({}, baseTag, { Url: "", Limit: miLimitVal, LocalSourceId: "" }));
        }
      });
      const hscEnabled = view.querySelector("#chkHscEnabled");
      const hscSource = view.querySelector("#selHscSourceUser");
      const hscLibraryOrder = view.querySelector("#chkHscLibraryOrder");
      return {
        TraktClientId: view.querySelector("#txtTraktClientId").value,
        MdblistApiKey: view.querySelector("#txtMdblistApiKey").value,
        TmdbApiKey: view.querySelector("#txtTmdbApiKey").value,
        OpenAiApiKey: view.querySelector("#txtOpenAiApiKey")?.value || "",
        OpenAiModel: view.querySelector("#txtOpenAiModel")?.value || "gpt-4o-mini",
        GeminiApiKey: view.querySelector("#txtGeminiApiKey")?.value || "",
        GeminiModel: view.querySelector("#txtGeminiModel")?.value || "gemini-2.5-flash-lite",
        ClaudeApiKey: view.querySelector("#txtClaudeApiKey")?.value || "",
        ClaudeModel: view.querySelector("#txtClaudeModel")?.value || "claude-haiku-4-5-20251001",
        OllamaBaseUrl: view.querySelector("#txtOllamaBaseUrl")?.value || "http://localhost:11434",
        OllamaModel: view.querySelector("#txtOllamaModel")?.value || "",
        AiSystemPrompt: view.querySelector("#txtAiSystemPrompt")?.value || "",
        ExtendedConsoleOutput: view.querySelector("#chkExtendedConsoleOutput").checked,
        LogMissingItems: view.querySelector("#chkLogMissingItems").checked,
        DryRunMode: view.querySelector("#chkDryRunMode").checked,
        PreserveTagsOnEmptyResult: view.querySelector("#chkPreserveTagsOnEmptyResult").checked,
        Tags: flatTags,
        SavedFilters: deps.savedFilters.filters,
        HomeSyncEnabled: hscEnabled ? hscEnabled.checked : deps.hsc.config.HomeSyncEnabled || false,
        HomeSyncLibraryOrder: hscLibraryOrder ? hscLibraryOrder.checked : deps.hsc.config.HomeSyncLibraryOrder || false,
        HomeSyncSourceUserId: hscSource ? hscSource.value || "" : deps.hsc.config.HomeSyncSourceUserId || "",
        HomeSyncTargetUserIds: hscEnabled ? Array.from(view.querySelectorAll(".hsc-target-chk:checked")).map((c) => c.value) : deps.hsc.config.HomeSyncTargetUserIds || []
      };
    }
    function checkFormState(deps) {
      const view = deps.view;
      const originalConfigState = deps.originalConfigState.getOriginalConfigState();
      if (!view || !originalConfigState) return;
      let isDirty = false;
      try {
        const current = JSON.stringify(deps.getUiConfig(view, true, {
          hsc: { config: {} },
          savedFilters: { filters: [] },
          miUsers: { users: null },
          readRowAsConfig: () => ({})
        }));
        isDirty = current !== originalConfigState;
      } catch {
        isDirty = true;
      }
      const btnApplyManage = view.querySelector("#btnApplyManage");
      if (btnApplyManage && !btnApplyManage.disabled) isDirty = true;
      const tcContainer = view.querySelector("#tcManageContainer");
      if (tcContainer && tcContainer._tcHasPending) isDirty = true;
      const tlContainer = view.querySelector("#tlContainer");
      if (tlContainer && tlContainer.querySelector('.tag-body[data-dirty="1"]')) isDirty = true;
      const btnSave = view.querySelector(".btn-save");
      if (btnSave) {
        const span = btnSave.querySelector("span");
        const isSyncRunning = !!(span && (span.textContent || "").includes("progress"));
        if (isSyncRunning) {
          btnSave.disabled = true;
          btnSave.style.opacity = "0.5";
        } else {
          btnSave.disabled = !isDirty;
          btnSave.style.opacity = isDirty ? "1" : "0.5";
        }
      }
    }
    function applyFilters(view) {
      const container = view.querySelector("#tagListContainer");
      if (!container) return;
      const rows = container.querySelectorAll(".tag-row");
      const searchTerm = (view.querySelector("#txtSearchTags")?.value || "").toLowerCase();
      const fTag = view.querySelector("#chkFilterTag")?.checked;
      const fColl = view.querySelector("#chkFilterCollection")?.checked;
      const fSched = view.querySelector("#chkFilterSchedule")?.checked;
      const fHome = view.querySelector("#chkFilterHomeScreen")?.checked;
      const fSrcExt = view.querySelector("#chkFilterSrcExternal")?.checked;
      const fSrcMI = view.querySelector("#chkFilterSrcMediaInfo")?.checked;
      const fSrcColl = view.querySelector("#chkFilterSrcCollection")?.checked;
      const fSrcPlay = view.querySelector("#chkFilterSrcPlaylist")?.checked;
      const fSrcAI = view.querySelector("#chkFilterSrcAI")?.checked;
      const fActive = view.querySelector("#chkFilterActive")?.checked;
      const fInactive = view.querySelector("#chkFilterInactive")?.checked;
      const anyFeature = !!(fTag || fColl || fSched || fHome);
      const anySrc = !!(fSrcExt || fSrcMI || fSrcColl || fSrcPlay || fSrcAI);
      const anyStatus = !!(fActive || fInactive);
      const btn = view.querySelector("#btnFilterDropdown");
      const lbl = view.querySelector("#filterDropdownLabel");
      if (btn && lbl) {
        const activeCount = [fTag, fColl, fSched, fHome, fSrcExt, fSrcMI, fSrcColl, fSrcPlay, fSrcAI, fActive, fInactive].filter(Boolean).length;
        lbl.textContent = activeCount > 0 ? "Filter (" + activeCount + ")" : "Filter";
        btn.classList.toggle("active", activeCount > 0);
      }
      rows.forEach((row) => {
        const tagName = (row.querySelector(".txtTagName").value || "").toLowerCase();
        const entryLbl = (row.querySelector(".txtEntryLabel").value || "").toLowerCase();
        const matchesSearch = !searchTerm || tagName.includes(searchTerm) || entryLbl.includes(searchTerm);
        let matchesFeature = true;
        if (anyFeature) {
          const hasTag = !!row.querySelector(".chkEnableTag")?.checked;
          const hasColl = !!row.querySelector(".chkEnableCollection")?.checked;
          const hasSched = row.querySelectorAll(".date-row").length > 0;
          const hasHome = !!row.querySelector(".chkEnableHomeSection")?.checked;
          matchesFeature = !!fTag && hasTag || !!fColl && hasColl || !!fSched && hasSched || !!fHome && hasHome;
        }
        let matchesSrc = true;
        if (anySrc) {
          const src = row.querySelector(".selSourceType")?.value || "";
          matchesSrc = !!fSrcExt && src === "External" || !!fSrcMI && src === "MediaInfo" || !!fSrcColl && src === "LocalCollection" || !!fSrcPlay && src === "LocalPlaylist" || !!fSrcAI && src === "AI";
        }
        let matchesStatus = true;
        if (anyStatus) {
          const isActive = !!row.querySelector(".chkTagActive")?.checked;
          matchesStatus = !!fActive && isActive || !!fInactive && !isActive;
        }
        row.style.display = matchesSearch && matchesFeature && matchesSrc && matchesStatus ? "" : "none";
      });
    }
    function checkForUpdates(view, deps) {
      deps.fetch(deps.getApiClient().getUrl("HomeScreenCompanion/Version")).then((r) => r.json()).then((result) => {
        const currentVer = result.Version || "";
        const footerVer = document.getElementById("footerVersionText");
        if (footerVer && currentVer) {
          const releaseUrl = "https://github.com/soderlund91/HomeScreenCompanion/releases/tag/v" + currentVer;
          footerVer.innerHTML = '<a href="' + releaseUrl + '" target="_blank" style="color:inherit;text-decoration:none;">v' + currentVer + "</a>";
        }
        if (!currentVer) return;
        return deps.fetch("https://api.github.com/repos/soderlund91/HomeScreenCompanion/releases/latest").then((r) => r.json()).then((release) => {
          const latestTag = (release.tag_name || "").replace(/^v/i, "");
          if (!latestTag) return;
          const a = latestTag.split(".").map(Number);
          const b = currentVer.split(".").map(Number);
          let isNewer = false;
          for (let i = 0; i < Math.max(a.length, b.length); i++) {
            if ((a[i] || 0) > (b[i] || 0)) {
              isNewer = true;
              break;
            }
            if ((a[i] || 0) < (b[i] || 0)) break;
          }
          if (isNewer) {
            const footerUpdate = document.getElementById("footerUpdateInfo");
            if (footerUpdate) {
              footerUpdate.innerHTML = '<a href="' + (release.html_url || "") + '" target="_blank" class="footer-update-link">Update available: v' + latestTag + "</a>";
              const footerUpdateSep = document.getElementById("footerUpdateSep");
              if (footerUpdateSep) footerUpdateSep.style.display = "";
            }
          }
        }).catch(() => void 0);
      }).catch(() => void 0);
    }

    const LUMA_THRESHOLD = 128;
    const THEME_PROBE_SELECTORS = [
      ".skinHeader",
      ".mainDrawer",
      ".contentScrollSlider",
      "body"
    ];
    const DARK_THEME_VARS = {
      "plugin-popup-bg": "#2a2a2a",
      "plugin-popup-bg2": "#333333",
      "plugin-popup-color": "#e8e8e8",
      "plugin-popup-muted": "#aaaaaa",
      "plugin-popup-border": "rgba(255,255,255,0.12)",
      "plugin-popup-hover": "rgba(255,255,255,0.08)",
      "plugin-popup-badge": "rgba(255,255,255,0.1)",
      "plugin-input-border": "rgba(255,255,255,0.2)",
      "plugin-input-bg": "rgba(255,255,255,0.08)",
      "plugin-footer-bg": "#181818"
    };
    const DARK_THEME_DATASET_MODE = "dark";
    const LIGHT_THEME_VARS = {
      "plugin-popup-bg": "#f2f2f2",
      "plugin-popup-bg2": "#e0e0e0",
      "plugin-popup-color": "#1a1a1a",
      "plugin-popup-muted": "#555555",
      "plugin-popup-border": "rgba(0,0,0,0.15)",
      "plugin-popup-hover": "rgba(0,0,0,0.08)",
      "plugin-popup-badge": "rgba(0,0,0,0.1)",
      "plugin-input-border": "rgba(0,0,0,0.28)",
      "plugin-input-bg": "rgba(0,0,0,0.04)",
      "plugin-footer-bg": "#c5cad1"
    };
    const LIGHT_THEME_DATASET_MODE = "light";
    function readBackgroundColor(el, getComputedStyleFn) {
      const gcs = ((target) => getComputedStyle(target));
      return gcs(el).backgroundColor;
    }
    function isDarkBackground(bg) {
      if (!bg) return true;
      const m = bg.match(/\d+/g);
      if (!m) return true;
      const r = parseInt(m[0] ?? "0", 10);
      const g = parseInt(m[1] ?? "0", 10);
      const b = parseInt(m[2] ?? "0", 10);
      return r * 0.299 + g * 0.587 + b * 0.114 < LUMA_THRESHOLD;
    }
    function applyPluginTheme(getComputedStyleFn) {
      let bg = null;
      for (const selector of THEME_PROBE_SELECTORS) {
        const el = document.querySelector(selector);
        if (!el) continue;
        const c = readBackgroundColor(el);
        if (c && c !== "transparent" && c !== "rgba(0, 0, 0, 0)") {
          bg = c;
          break;
        }
      }
      const dark = isDarkBackground(bg);
      const root = document.documentElement;
      const vars = dark ? DARK_THEME_VARS : LIGHT_THEME_VARS;
      for (const [key, value] of Object.entries(vars)) {
        root.style.setProperty(`--${key}`, value);
      }
      root.dataset.pluginTheme = dark ? DARK_THEME_DATASET_MODE : LIGHT_THEME_DATASET_MODE;
      const drawer = document.querySelector(".mainDrawer");
      const drawerRight = drawer ? drawer.getBoundingClientRect().right : 0;
      const footerLeft = drawerRight > 0 && drawerRight < window.innerWidth * 0.5 ? drawerRight : 0;
      root.style.setProperty("--plugin-footer-left", footerLeft + "px");
    }

    function updateSystemPromptResetBtn(view) {
      const ta = view.querySelector("#txtAiSystemPrompt");
      const btn = view.querySelector("#btnResetAiSystemPrompt");
      if (!(ta instanceof HTMLTextAreaElement) || !(btn instanceof HTMLElement)) return;
      btn.style.display = ta.value.trim() !== DEFAULT_AI_SYSTEM_PROMPT.trim() ? "" : "none";
    }

    function escapeHtml(str) {
      return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }
    function getDragAfterElement(container, y, selector = ".tag-row:not(.dragging)") {
      return findDragAfterElement(container, y, selector);
    }
    function getManDragAfterElement(container, y) {
      return findDragAfterElement(container, y, ".man-section-row:not(.man-dragging)");
    }
    function findDragAfterElement(container, y, selector) {
      const candidates = Array.from(
        container.querySelectorAll(selector)
      );
      let bestOffset = Number.NEGATIVE_INFINITY;
      let bestElement = null;
      for (const child of candidates) {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > bestOffset) {
          bestOffset = offset;
          bestElement = child;
        }
      }
      return bestElement;
    }
    function getUrlRowHtml(value, limit) {
      const val = value || "";
      const lim = limit !== void 0 ? limit : 0;
      return `
            <div class="url-row" style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
                <div style="flex-grow:1;">
                    <input is="emby-input" class="txtTagUrl" type="text" label="Trakt/MDBList/TMDb URL" value="${val}" />
                </div>
                <div style="width:110px;">
                    <input is="emby-input" class="txtUrlLimit" type="number" label="Max (0=All)" value="${lim}" min="0" />
                </div>
                <button type="button" is="emby-button" class="raised button-submit btnTestUrl" style="min-width:60px; height:36px; padding:0 10px; font-size:0.8rem; margin-top:12px;" title="Test Source"><span>Test</span></button>
                <button type="button" is="emby-button" class="raised btnRemoveUrl btn-row-remove" title="Remove URL"><i class="md-icon">remove_circle_outline</i></button>
            </div>`;
    }

    function parseDateYMD(dateStr) {
      if (!dateStr) return null;
      const s = String(dateStr);
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
      if (m) return { year: +m[1], month: +m[2], day: +m[3] };
      const d = new Date(s);
      if (!isNaN(d.getTime())) {
        return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
      }
      return null;
    }
    function getMaxDays(month) {
      return new Date(2001, month, 0).getDate();
    }
    const MONTH_NAMES = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec"
    ];
    function getMonthOptions(selectedMonth) {
      return MONTH_NAMES.map(
        (m, i) => `<option value="${i + 1}" ${selectedMonth == i + 1 ? "selected" : ""}>${m}</option>`
      ).join("");
    }
    function getDayOptions(selectedDay, maxDay) {
      const cap = maxDay || 31;
      let html = "";
      for (let i = 1; i <= cap; i++) {
        html += `<option value="${i}" ${selectedDay == i ? "selected" : ""}>${i}</option>`;
      }
      return html;
    }
    const WEEK_DAYS = [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday"
    ];
    const WEEK_DAYS_SHORT = [
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
      "Sun"
    ];
    function getWeekButtons(savedDays) {
      const saved = (savedDays || "").toLowerCase();
      return WEEK_DAYS.map((d, i) => {
        const isActive = saved.includes(d.toLowerCase());
        return `<button type="button" class="day-toggle ${isActive ? "active" : ""}" data-day="${d}">${WEEK_DAYS_SHORT[i]}</button>`;
      }).join("");
    }

    function getLocalRowHtml(type, selectedName, limit, items = []) {
      const optHtml = '<option value="">-- Select --</option>' + items.map((o) => `<option value="${o.Name}" ${selectedName === o.Name ? "selected" : ""}>${o.Name}</option>`).join("");
      const lim = limit !== void 0 ? limit : 0;
      return `
            <div class="local-row" style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
                <div style="flex-grow:1;">
                    <select is="emby-select" class="selLocalSource" style="width:100%;">
                        ${optHtml}
                    </select>
                </div>
                <div style="width:110px;">
                    <input is="emby-input" class="txtLocalLimit" type="number" label="Max (0=All)" value="${lim}" min="0" />
                </div>
                <button type="button" is="emby-button" class="raised btnRemoveLocal btn-row-remove" title="Remove"><i class="md-icon">remove_circle_outline</i></button>
            </div>`;
    }
    function getDateRowHtml(interval) {
      const type = interval.Type || "SpecificDate";
      if (type === "EveryYear") console.log("[HSC schedule] raw interval from server:", JSON.stringify(interval));
      const sDate = interval.Start ? interval.Start.split("T")[0] : "";
      const eDate = interval.End ? interval.End.split("T")[0] : "";
      const sParts = parseDateYMD(interval.Start);
      const eParts = parseDateYMD(interval.End);
      const sMonth = sParts ? sParts.month : 12;
      let sDay = sParts ? sParts.day : 1;
      const eMonth = eParts ? eParts.month : 12;
      let eDay = eParts ? eParts.day : 28;
      const sMaxDay = getMaxDays(sMonth);
      const eMaxDay = getMaxDays(eMonth);
      sDay = Math.min(sDay, sMaxDay);
      eDay = Math.min(eDay, eMaxDay);
      const dayOfWeek = interval.DayOfWeek || "";
      return `
            <div class="date-row date-row-container" style="display: flex; flex-wrap: wrap; align-items: flex-start; gap: 15px;">
                
                <div style="width:160px;">
                    <label class="selectLabel">Rule Type</label>
                    <select is="emby-select" class="selDateType" style="width:100%;">
                        <option value="SpecificDate" ${type === "SpecificDate" ? "selected" : ""}>Specific Date</option>
                        <option value="EveryYear" ${type === "EveryYear" ? "selected" : ""}>Recurring</option>
                        <option value="Weekly" ${type === "Weekly" ? "selected" : ""}>Week Days</option>
                    </select>
                </div>
                
                <div class="inputs-specific" style="display: ${type === "SpecificDate" ? "flex" : "none"}; gap: 8px; flex-grow: 1; align-items: center;">
                    <div style="flex-grow:1;">
                        <input is="emby-input" type="date" class="txtFullStartDate" label="Start Date" value="${sDate}" />
                    </div>
                    <span style="opacity:0.5; padding-top:15px;">to</span>
                    <div style="flex-grow:1;">
                        <input is="emby-input" type="date" class="txtFullEndDate" label="End Date" value="${eDate}" />
                    </div>
                </div>

                <div class="inputs-annual" style="display: ${type === "EveryYear" ? "flex" : "none"}; gap: 8px; flex-grow: 1; align-items: flex-start;">
                    
                    <div style="display:flex; display:flex; gap:5px;">
                        <div style="width:80px;">
                            <label class="selectLabel">Start Month</label>
                            <select is="emby-select" class="selStartMonth" style="width:100%;">${getMonthOptions(sMonth)}</select>
                        </div>
                        <div style="width:70px;">
                            <label class="selectLabel">Day</label>
                            <select is="emby-select" class="selStartDay" style="width:100%;">${getDayOptions(sDay, sMaxDay)}</select>
                        </div>
                    </div>

                    <span style="opacity:0.5; padding-top:32px;">to</span>

                    <div style="display:flex; display:flex; gap:5px;">
                        <div style="width:80px;">
                            <label class="selectLabel">End Month</label>
                            <select is="emby-select" class="selEndMonth" style="width:100%;">${getMonthOptions(eMonth)}</select>
                        </div>
                        <div style="width:70px;">
                            <label class="selectLabel">Day</label>
                            <select is="emby-select" class="selEndDay" style="width:100%;">${getDayOptions(eDay, eMaxDay)}</select>
                        </div>
                    </div>
                </div>

                <div class="inputs-weekly" style="display: ${type === "Weekly" ? "flex" : "none"}; flex-grow: 1; align-items: center; gap: 5px; flex-wrap: wrap;">
                    <div style="width:100%;">
                        <label class="selectLabel">Active On Days</label>
                        <div class="week-btn-container" style="display:flex; gap:5px; margin-top:2px;">
                            ${getWeekButtons(dayOfWeek)}
                        </div>
                    </div>
                </div>

                <button type="button" is="emby-button" class="btnRemoveDate" style="background:transparent; color:#cc3333; min-width:40px; margin-top: 25px;" title="Remove Rule"><i class="md-icon">delete</i></button>
            </div>`;
    }
    function readRowAsConfig(row) {
      const entryLabel = row.querySelector(".txtEntryLabel").value;
      const tagName = row.querySelector(".txtTagName").value || entryLabel;
      const active = row.querySelector(".chkTagActive").checked;
      const blInput = row.querySelector(".txtTagBlacklist");
      const bl = blInput ? blInput.value.split(/[\n\r]+/).map((s) => s.trim()).filter((s) => s.length > 0) : [];
      const enableTag = row.querySelector(".chkEnableTag").checked;
      const enableColl = row.querySelector(".chkEnableCollection").checked;
      const overrideWhenActive = !!row.querySelector(".chkOverrideWhenActive")?.checked;
      const plTab = row.querySelector(".playlist-tab");
      let plUserIds;
      if (plTab && plTab.dataset.plLoaded === "1") {
        plUserIds = Array.from(plTab.querySelectorAll(".chkPlaylistUser:checked")).map((c) => c.value);
      } else {
        try {
          plUserIds = JSON.parse(decodeURIComponent(plTab && plTab.dataset.plUserids || "%5B%5D"));
        } catch {
          plUserIds = [];
        }
      }
      const collName = row.querySelector(".txtCollectionName").value;
      const collDesc = row.querySelector(".txtCollectionDescription") ? row.querySelector(".txtCollectionDescription").value : "";
      const collPoster = row.querySelector(".hiddenPosterPath") ? row.querySelector(".hiddenPosterPath").value : "";
      const st = row.querySelector(".selSourceType").value;
      const intervals = [];
      row.querySelectorAll(".date-row").forEach((dr) => {
        const type = dr.querySelector(".selDateType").value;
        let s = null;
        let e = null;
        let days = "";
        if (type === "SpecificDate") {
          s = dr.querySelector(".txtFullStartDate").value;
          e = dr.querySelector(".txtFullEndDate").value;
        } else if (type === "EveryYear") {
          const sM = dr.querySelector(".selStartMonth").value;
          const sD = dr.querySelector(".selStartDay").value;
          const eM = dr.querySelector(".selEndMonth").value;
          const eD = dr.querySelector(".selEndDay").value;
          s = "2000-" + sM.padStart(2, "0") + "-" + sD.padStart(2, "0");
          e = "2000-" + eM.padStart(2, "0") + "-" + eD.padStart(2, "0");
        } else if (type === "Weekly") {
          days = Array.from(dr.querySelectorAll(".day-toggle.active")).map((b) => b.dataset.day).join(",");
        }
        intervals.push({ Type: type, Start: s || null, End: e || null, DayOfWeek: days });
      });
      const miFilters = [];
      row.querySelectorAll(".mediainfo-filter-group").forEach((group, gi) => {
        const operator = group.dataset.op || "AND";
        const groupOp = gi === 0 ? "AND" : group.dataset.groupOp || "AND";
        const criteria = [];
        group.querySelectorAll(".mi-rule").forEach((rule) => {
          const prop = rule.querySelector(".selMiProperty")?.value || "";
          const selVal = rule.querySelector(".selMiValue");
          const txtVal = rule.querySelector(".txtMiValue");
          const selOp = rule.querySelector(".selMiOp");
          const txtNum = rule.querySelector(".txtMiNum");
          const selUser = rule.querySelector(".selMiUser");
          const selTextOp = rule.querySelector(".selMiTextOp");
          let val = selVal ? selVal.value : txtVal ? txtVal.value.replace(/\r?\n/g, "\n").trim() : "";
          if (prop === "MediaType" && val === "Episode") {
            const incParentChk = rule.querySelector(".chkIncludeParentSeries");
            if (incParentChk && incParentChk.checked) val = "EpisodeIncludeSeries";
          }
          const op2 = selOp ? selOp.value : "";
          const textMatchOp = selTextOp ? selTextOp.value : "";
          const num = txtNum ? txtNum.value.trim() : "";
          const userId = selUser ? selUser.value : "";
          const finalOp = op2 || textMatchOp;
          const finalVal = op2 ? num : val;
          const notBtn = rule.querySelector(".btnNotToggle");
          const isNot = notBtn && notBtn.dataset.not === "1";
          const crit = buildCriterion(prop, finalOp, finalVal, userId);
          if (crit) criteria.push(isNot ? "!" + crit : crit);
        });
        if (criteria.length > 0) miFilters.push({ Operator: operator, Criteria: criteria, GroupOperator: groupOp });
      });
      const hseTab = row.querySelector(".homescreen-tab");
      const enableHse = hseTab ? !!hseTab.querySelector(".chkEnableHomeSection")?.checked : false;
      const hseLibraryId = hseTab && hseTab.dataset.hseLoaded === "1" ? hseTab.querySelector(".selHseLibrary")?.value || "auto" : decodeURIComponent(hseTab && hseTab.dataset.hseLibraryid || "auto");
      let hseUserIds;
      if (hseTab && hseTab.dataset.hseLoaded === "1") {
        hseUserIds = Array.from(hseTab.querySelectorAll(".chkHseUser:checked")).map((c) => c.value);
      } else {
        try {
          hseUserIds = JSON.parse(decodeURIComponent(hseTab && hseTab.dataset.hseUserids || "%5B%5D"));
        } catch {
          hseUserIds = [];
        }
      }
      let hseSettings = {};
      if (hseTab && hseTab.dataset.hseLoaded === "1") {
        hseTab.querySelectorAll("[data-field]").forEach((el) => {
          const f = el.dataset.field;
          const input = el;
          let v = input.type === "checkbox" ? String(input.checked) : input.value;
          if (v === "" && input.placeholder) v = input.placeholder;
          hseSettings[f] = v;
        });
        const hsePlaystate = hseSettings["_hsePlaystate"] || "";
        delete hseSettings["_hsePlaystate"];
        if (hsePlaystate === "played") {
          hseSettings["_queryIsPlayed"] = "true";
          hseSettings["_queryIsResumable"] = "";
        } else if (hsePlaystate === "unplayed") {
          hseSettings["_queryIsPlayed"] = "false";
          hseSettings["_queryIsResumable"] = "";
        } else if (hsePlaystate === "inprogress") {
          hseSettings["_queryIsPlayed"] = "";
          hseSettings["_queryIsResumable"] = "true";
        } else {
          hseSettings["_queryIsPlayed"] = "";
          hseSettings["_queryIsResumable"] = "";
        }
        const itemTypesVal = hseTab.querySelector(".selHseItemTypes")?.value || "Movie,Series";
        hseSettings["ItemTypes"] = JSON.stringify(itemTypesVal.split(","));
        const excludedLibIds = Array.from(hseTab.querySelectorAll(".chkHseLibrary:not(:checked)")).map((c) => c.value);
        if (excludedLibIds.length > 0) hseSettings["_queryExcludeViewIds"] = excludedLibIds.join(",");
        else delete hseSettings["_queryExcludeViewIds"];
      } else {
        try {
          hseSettings = JSON.parse(decodeURIComponent(hseTab && hseTab.dataset.hseSettings || "%7B%7D"));
        } catch {
        }
        if (!hseSettings["CustomName"]) {
          const hseDefaultName = row.querySelector(".txtEntryLabel")?.value || row.querySelector(".txtTagName")?.value || "";
          if (hseDefaultName) hseSettings["CustomName"] = hseDefaultName;
        }
      }
      const urls = [];
      row.querySelectorAll(".url-row").forEach((uRow) => {
        urls.push({
          url: uRow.querySelector(".txtTagUrl").value.trim(),
          limit: parseInt(uRow.querySelector(".txtUrlLimit").value, 10) || 0
        });
      });
      if (urls.length === 0) urls.push({ url: "", limit: 0 });
      const localSources = [];
      row.querySelectorAll(".local-row").forEach((lRow) => {
        localSources.push({
          id: lRow.querySelector(".selLocalSource").value,
          limit: parseInt(lRow.querySelector(".txtLocalLimit").value, 10) || 0
        });
      });
      const miLimit = parseInt(row.querySelector(".txtMediaInfoLimit")?.value ?? "", 10) || 0;
      const aiProvider = row.querySelector(".selAiProvider")?.value || "OpenAI";
      const aiPrompt = row.querySelector(".txtAiPrompt")?.value || "";
      const aiIncludeRecentlyWatched = !!row.querySelector(".chkAiRecentlyWatched")?.checked;
      const aiRecentlyWatchedUserId = row.querySelector(".selAiWatchedUser")?.value || "";
      const aiRecentlyWatchedCount = parseInt(row.querySelector(".txtAiWatchedCount")?.value ?? "", 10) || 20;
      const aiRefreshIntervalDays = parseInt(row.querySelector(".txtAiRefreshInterval")?.value ?? "", 10) || 0;
      let playlistMappings;
      try {
        playlistMappings = JSON.parse(decodeURIComponent(plTab && plTab.dataset.plMappings || "%5B%5D"));
      } catch {
        playlistMappings = [];
      }
      return {
        Name: entryLabel,
        Tag: tagName,
        Active: active,
        Blacklist: bl,
        ActiveIntervals: intervals,
        EnableTag: enableTag,
        EnableCollection: enableColl,
        CollectionName: collName,
        CollectionDescription: collDesc,
        CollectionPosterPath: collPoster,
        OverrideWhenActive: overrideWhenActive,
        SourceType: st,
        Urls: urls,
        LocalSources: localSources,
        Limit: miLimit,
        MediaInfoFilters: miFilters,
        MediaInfoConditions: [],
        EnableHomeSection: enableHse,
        HomeSectionLibraryId: hseLibraryId,
        HomeSectionUserIds: hseUserIds,
        HomeSectionSettings: JSON.stringify(hseSettings),
        HomeSectionTracked: [],
        LastModified: (/* @__PURE__ */ new Date()).toISOString(),
        AiProvider: aiProvider,
        AiPrompt: aiPrompt,
        AiIncludeRecentlyWatched: aiIncludeRecentlyWatched,
        AiRecentlyWatchedUserId: aiRecentlyWatchedUserId,
        AiRecentlyWatchedCount: aiRecentlyWatchedCount,
        AiRefreshIntervalDays: aiRefreshIntervalDays,
        TagTargetEpisode: !!row.querySelector(".chkTagTargetEpisode")?.checked,
        TagTargetSeason: !!row.querySelector(".chkTagTargetSeason")?.checked,
        TagTargetSeries: !!row.querySelector(".chkTagTargetSeries")?.checked,
        CollectionTargetEpisode: !!row.querySelector(".chkCollTargetEpisode")?.checked,
        CollectionTargetSeason: !!row.querySelector(".chkCollTargetSeason")?.checked,
        CollectionTargetSeries: !!row.querySelector(".chkCollTargetSeries")?.checked,
        EnablePlaylist: !!row.querySelector(".chkEnablePlaylist")?.checked,
        PlaylistName: row.querySelector(".txtPlaylistName")?.value ?? "",
        PlaylistUserIds: plUserIds,
        PlaylistMappings: playlistMappings,
        MediaInfoTargetEpisode: false,
        MediaInfoTargetSeason: false,
        MediaInfoTargetSeries: false,
        MediaInfoTargetType: "",
        MediaInfoSeasonMode: false
      };
    }

    const MI_TEXT_MATCH_PROPS = [
      "Tag",
      "Title",
      "EpisodeTitle",
      "Overview",
      "Studio",
      "Genre",
      "Actor",
      "Director",
      "Writer",
      "ContentRating",
      "AudioLanguage",
      "Artist",
      "Album",
      "FolderPath",
      "Country"
    ];
    const MI_DROPDOWN_OPTIONS = {
      Resolution: [["8K", "8K (7680p+)"], ["4K", "4K / UHD"], ["1080p", "1080p / FHD"], ["720p", "720p / HD"], ["SD", "SD (<720p)"]],
      VideoCodec: [["HEVC", "HEVC / H.265"], ["AV1", "AV1"], ["H264", "H.264 / AVC"]],
      HDR: [["HDR", "HDR (any)"], ["DolbyVision", "Dolby Vision"], ["HDR10", "HDR10"]],
      AudioFormat: [["Atmos", "Dolby Atmos"], ["TrueHD", "Dolby TrueHD"], ["DtsHdMa", "DTS-HD MA"], ["DTS", "DTS"], ["AC3", "Dolby Digital / AC3"], ["AAC", "AAC"]],
      AudioChannels: [["7.1", "7.1+ Surround"], ["5.1", "5.1 Surround"], ["Stereo", "Stereo"], ["Mono", "Mono"]],
      MediaType: [["Movie", "Movie"], ["Series", "Show / Series"], ["Episode", "Episode"], ["Audio", "Music Track (Audio)"], ["MusicVideo", "Music Video"], ["MusicAlbum", "Music Album"], ["MusicArtist", "Music Artist"]],
      IsPlayed: [["Watched", "Watched"], ["Unwatched", "Unwatched"]],
      InProgress: [["InProgress", "In progress (started, not finished)"]]
    };
    const MI_NUMERIC_PROPS = [
      "CommunityRating",
      "Year",
      "Runtime",
      "DateAdded",
      "DateModified",
      "FileSize",
      "LastPlayed",
      "PlayCount",
      "BitRate",
      "SampleRate",
      "BitsPerSample",
      "TrackNumber",
      "DiscNumber",
      "WatchedByCount"
    ];
    const MI_UNIT_LABELS = {
      DateAdded: "days ago",
      DateModified: "days ago",
      LastPlayed: "days ago",
      FileSize: "MB",
      PlayCount: "plays",
      BitRate: "kbps",
      SampleRate: "Hz",
      BitsPerSample: "bits",
      WatchedByCount: "users"
    };
    const MI_USER_PROPS = ["IsPlayed", "LastPlayed", "PlayCount"];
    const MI_TEXT_MATCH_DEFAULT = {
      Title: "contains",
      EpisodeTitle: "contains",
      Overview: "contains",
      Studio: "contains",
      Genre: "contains",
      Tag: "contains",
      Actor: "exact",
      Director: "exact",
      Writer: "exact",
      Artist: "contains",
      Album: "contains",
      ContentRating: "exact",
      AudioLanguage: "exact",
      FolderPath: "contains",
      Country: "contains"
    };
    const MI_TEXT_PLACEHOLDERS = {
      Title: "e.g. Batman, Dark Knight",
      EpisodeTitle: "e.g. Pilot, Finale",
      Overview: "e.g. heist, time travel",
      Studio: "e.g. Warner, Netflix, HBO",
      Genre: "e.g. Action, Thriller",
      Actor: "e.g. Tom Hanks, Idris Elba",
      Director: "e.g. Nolan, Tarantino",
      Writer: "e.g. Tarantino, Nolan",
      ContentRating: "e.g. PG-13, R",
      AudioLanguage: "e.g. eng, swe",
      ImdbId: "e.g. tt1234567, tt7654321",
      TvdbId: "e.g. 121361",
      FolderPath: "e.g. /movies/action",
      Country: "e.g. United States",
      Artist: "e.g. Radiohead, Pink Floyd",
      Album: "e.g. OK Computer, Dark Side of the Moon"
    };
    const PROPERTY_GROUPS = [
      { label: "Video", props: [["Resolution", "Resolution"], ["VideoCodec", "Video Codec"], ["HDR", "HDR"]] },
      { label: "Audio", props: [["AudioFormat", "Audio Format"], ["AudioChannels", "Audio Channels"], ["AudioLanguage", "Audio Language"]] },
      { label: "Content", props: [
        ["MediaType", "Media Type"],
        ["Tag", "Tag"],
        ["Title", "Title"],
        ["EpisodeTitle", "Title (Episode)"],
        ["Overview", "Overview"],
        ["Studio", "Studio"],
        ["Genre", "Genre"],
        ["Actor", "Actor / Cast"],
        ["Director", "Director"],
        ["Writer", "Writer"],
        ["ContentRating", "Content Rating"],
        ["ImdbId", "IMDB ID"],
        ["TvdbId", "TVDB ID"],
        ["Country", "Country"],
        ["Collection", "In Collection"],
        ["Playlist", "In Playlist"]
      ] },
      { label: "Music", props: [
        ["Artist", "Artist"],
        ["Album", "Album"],
        ["BitRate", "Bit Rate (kbps)"],
        ["SampleRate", "Sample Rate (Hz)"],
        ["BitsPerSample", "Bit Depth"],
        ["TrackNumber", "Track Number"],
        ["DiscNumber", "Disc Number"]
      ] },
      { label: "Metrics", props: [
        ["CommunityRating", "Community Rating"],
        ["Year", "Year"],
        ["Runtime", "Runtime (minutes)"],
        ["DateAdded", "Date Added"],
        ["DateModified", "Date Modified"],
        ["FileSize", "File Size (MB)"],
        ["FolderPath", "Folder Path"]
      ] },
      { label: "Activity", props: [
        ["IsPlayed", "Watched / Unwatched"],
        ["LastPlayed", "Last Played"],
        ["PlayCount", "Play Count"],
        ["InProgress", "In Progress (viewer)"],
        ["WatchedByCount", "Watched by (user count)"]
      ] }
    ];
    function propertyOptionsHtml(selected) {
      return PROPERTY_GROUPS.map(
        (g) => '<optgroup label="' + g.label + '">' + g.props.map(
          (p) => '<option value="' + p[0] + '"' + (p[0] === selected ? " selected" : "") + ">" + p[1] + "</option>"
        ).join("") + "</optgroup>"
      ).join("");
    }
    function getMiHintHtml(prop) {
      if (MI_TEXT_MATCH_PROPS.indexOf(prop) < 0 && prop !== "ImdbId" && prop !== "TvdbId") {
        return '<div class="mi-rule-hint"></div>';
      }
      return '<div class="mi-rule-hint" style="font-size:0.75em; opacity:0.5; margin-top:2px; padding-right:32px; text-align:right;">One value per line &mdash; matches if <em>any</em> line matches (OR)</div>';
    }
    function escapeText(val) {
      return val.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
    function textOpSelectHtml(selectedOp) {
      return '<select class="selMiTextOp" is="emby-select" style="flex:0 0 100px;"><option value="contains"' + (selectedOp === "contains" ? " selected" : "") + '>Contains</option><option value="exact"' + (selectedOp === "exact" ? " selected" : "") + ">Exact</option></select>";
    }
    function textAreaHtml(placeholder, val) {
      return '<textarea class="txtMiValue" placeholder="' + placeholder + '" rows="1" style="flex:1;resize:none;overflow:hidden;padding:6px 8px;font-size:inherit;font-family:inherit;background:var(--plugin-input-bg,rgba(255,255,255,0.08));border:1px solid var(--plugin-input-border,rgba(255,255,255,0.2));border-radius:3px;color:inherit;line-height:1.4;min-height:32px;max-height:120px;overflow-y:auto;">' + escapeText(val) + "</textarea>";
    }
    function getMiValueHtml(prop, savedOp, savedVal, savedUserId, deps) {
      let userHtml = "";
      if (MI_USER_PROPS.indexOf(prop) >= 0) {
        let specialOpts = '<option value="__any__"' + ("__any__" === savedUserId ? " selected" : "") + '>Any user</option><option value="__all__"' + ("__all__" === savedUserId ? " selected" : "") + ">All users</option>";
        if (prop === "IsPlayed") {
          specialOpts += '<option value="__current__"' + ("__current__" === savedUserId ? " selected" : "") + ">Current user (viewer)</option>";
        }
        const uOpts = specialOpts + (deps.users || []).map(function(u) {
          return '<option value="' + u.Id + '"' + (u.Id === savedUserId ? " selected" : "") + ">" + u.Name + "</option>";
        }).join("");
        userHtml = '<select class="selMiUser" is="emby-select" style="flex:0 0 auto;min-width:110px;">' + uOpts + "</select>";
      }
      const unit = MI_UNIT_LABELS[prop];
      const unitLabel = unit ? '<span style="margin-left:4px;opacity:.7;white-space:nowrap;">' + unit + "</span>" : "";
      if (prop === "Collection" || prop === "Playlist") {
        const cpList = prop === "Collection" ? deps.collections : deps.playlists;
        const cpOpts = cpList.map(function(o) {
          const n = o.Name || "";
          return '<option value="' + n.replace(/"/g, "&quot;") + '"' + (n === savedVal ? " selected" : "") + ">" + n + "</option>";
        }).join("");
        return '<select class="selMiValue" is="emby-select" style="flex:1;"><option value="">-- Select --</option>' + cpOpts + "</select>";
      }
      if (prop === "Tag") {
        const tagTextOp = savedOp || MI_TEXT_MATCH_DEFAULT["Tag"];
        const tagTextOpHtml = textOpSelectHtml(tagTextOp);
        if (deps.tags.length > 0) {
          const tagOpts = deps.tags.map(function(t) {
            return '<option value="' + t.replace(/"/g, "&quot;") + '"' + (t === savedVal ? " selected" : "") + ">" + t + "</option>";
          }).join("");
          return tagTextOpHtml + '<select class="selMiValue" is="emby-select" style="flex:1;"><option value="">-- Select tag --</option>' + tagOpts + "</select>";
        }
        return tagTextOpHtml + textAreaHtml("e.g. 4K", migrateCommaSeparated(savedVal || "") ?? "");
      }
      const dropdown = MI_DROPDOWN_OPTIONS[prop];
      if (dropdown) {
        if (prop === "MediaType") {
          const dispVal = savedVal === "EpisodeIncludeSeries" ? "Episode" : savedVal || "";
          const mtOpts = dropdown.map(function(pair) {
            return '<option value="' + pair[0] + '"' + (pair[0] === dispVal ? " selected" : "") + ">" + pair[1] + "</option>";
          }).join("");
          const ipChecked = savedVal === "EpisodeIncludeSeries" ? "checked" : "";
          const ipDisplay = dispVal === "Episode" ? "inline-flex" : "none";
          return '<select class="selMiValue" is="emby-select" style="flex:1;">' + mtOpts + '</select><label class="mi-include-parent" style="display:' + ipDisplay + '; align-items:center; gap:6px; cursor:pointer; white-space:nowrap; font-size:0.85em; margin:0;"><input type="checkbox" class="chkIncludeParentSeries" ' + ipChecked + ' style="margin:0;"><span>Also include parent series</span></label>';
        }
        const opts = dropdown.map(function(pair) {
          return '<option value="' + pair[0] + '"' + (pair[0] === savedVal ? " selected" : "") + ">" + pair[1] + "</option>";
        }).join("");
        return userHtml + '<select class="selMiValue" is="emby-select" style="flex:1;">' + opts + "</select>";
      }
      if (MI_NUMERIC_PROPS.indexOf(prop) >= 0) {
        const ops = ["=", ">", ">=", "<", "<="];
        const defaultOp = prop === "PlayCount" ? ">=" : "<=";
        const opOpts = ops.map(function(o) {
          return '<option value="' + o + '"' + (o === (savedOp || defaultOp) ? " selected" : "") + ">" + o + "</option>";
        }).join("");
        const infoTooltip = '<div class="mi-op-info"><div class="mi-op-info-icon">i</div><div class="mi-op-tooltip"><table><tr><td>=</td><td>Exactly equal</td></tr><tr><td>&gt;</td><td>Greater than</td></tr><tr><td>&gt;=</td><td>Greater than or equal</td></tr><tr><td>&lt;</td><td>Less than</td></tr><tr><td>&lt;=</td><td>Less than or equal</td></tr></table></div></div>';
        const numStep = prop === "PlayCount" ? "1" : "0.01";
        return userHtml + '<select class="selMiOp" is="emby-select" style="flex:0 0 64px;">' + opOpts + "</select>" + infoTooltip + '<input class="txtMiNum" is="emby-input" type="number" step="' + numStep + '" value="' + (savedVal || "") + '" style="flex:1;" />' + unitLabel;
      }
      if (MI_TEXT_MATCH_PROPS.indexOf(prop) >= 0) {
        const textOp = savedOp || MI_TEXT_MATCH_DEFAULT[prop] || "contains";
        const textOpHtml = textOpSelectHtml(textOp);
        const ph2 = MI_TEXT_PLACEHOLDERS[prop] || "";
        return textOpHtml + textAreaHtml(ph2, migrateCommaSeparated(savedVal || "") ?? "");
      }
      const ph = MI_TEXT_PLACEHOLDERS[prop] || "";
      return textAreaHtml(ph, migrateCommaSeparated(savedVal || "") ?? "");
    }
    function getMediaInfoRuleHtml(criterion, deps) {
      const parsed = parseCriterion(criterion || "");
      const prop = parsed.prop || "Resolution";
      const notActive = parsed.not;
      const notBg = notActive ? "rgba(200,50,50,0.75)" : "transparent";
      const notColor = notActive ? "#fff" : "";
      const notBorder = notActive ? "1px solid rgba(200,50,50,0.6)" : "1px solid rgba(128,128,128,0.4)";
      return '<div class="mi-rule" style="margin-bottom:6px;"><div style="display:flex; gap:6px; align-items:center;"><button type="button" class="btnNotToggle" data-not="' + (notActive ? "1" : "0") + '" style="border:' + notBorder + "; border-radius:10px; padding:3px 10px; font-size:0.78em; font-weight:bold; cursor:pointer; letter-spacing:0.5px; flex-shrink:0; background:" + notBg + "; color:" + notColor + ';" title="Negate this rule">NOT</button><select class="selMiProperty" is="emby-select" style="flex:0 0 155px;">' + propertyOptionsHtml(prop) + '</select><div class="mi-value-wrapper" style="flex:1; display:flex; gap:6px; align-items:center;">' + getMiValueHtml(prop, parsed.op, parsed.val, parsed.userId || "", deps) + '</div><button type="button" class="btnRemoveMiRule" style="background:transparent; border:none; color:#cc3333; cursor:pointer; padding:2px 8px; font-size:1em; flex-shrink:0;" title="Remove rule">\u2715</button></div>' + getMiHintHtml(prop) + "</div>";
    }
    function getMediaInfoFilterGroupHtml(filter, _i, isFirst, deps) {
      const op = filter && filter.Operator || "AND";
      const groupOp = filter && filter.GroupOperator || "AND";
      const criteria = filter && filter.Criteria || [];
      const connectorHtml = isFirst ? "" : '<div class="mi-group-connector" style="display:flex; align-items:center; gap:10px; margin:-12px -12px 14px; padding:8px 14px; background:rgba(0,0,0,0.12);"><div style="flex:1; height:1px; background:rgba(128,128,128,0.25);"></div><div style="display:flex; flex-direction:column; align-items:center; gap:4px;"><span style="font-size:0.7em; text-transform:uppercase; letter-spacing:1px; opacity:0.45;">Connect groups with</span><div style="display:flex; border-radius:14px; overflow:hidden; border:1px solid rgba(128,128,128,0.4);"><button type="button" class="btnGroupOpChoice" data-value="AND" style="border:none; padding:4px 16px; font-size:0.82em; font-weight:bold; cursor:pointer; letter-spacing:0.5px; background:' + (groupOp === "AND" ? "rgba(0,164,220,0.75)" : "transparent") + "; color:" + (groupOp === "AND" ? "#fff" : "inherit") + ';" title="Both filter groups must match">AND</button><div style="width:1px; background:rgba(128,128,128,0.4);"></div><button type="button" class="btnGroupOpChoice" data-value="OR" style="border:none; padding:4px 16px; font-size:0.82em; font-weight:bold; cursor:pointer; letter-spacing:0.5px; background:' + (groupOp === "OR" ? "rgba(220,120,0,0.75)" : "transparent") + "; color:" + (groupOp === "OR" ? "#fff" : "inherit") + ';" title="Either filter group is enough">OR</button></div><span class="group-op-desc" style="font-size:0.7em; opacity:0.55; white-space:nowrap;">' + (groupOp === "AND" ? "Both groups must match" : "Either group is enough") + '</span></div><div style="flex:1; height:1px; background:rgba(128,128,128,0.25);"></div></div>';
      const rulesHtml = criteria.map(function(c) {
        return getMediaInfoRuleHtml(c, deps);
      }).join("");
      return '<div class="mediainfo-filter-group" data-group-op="' + groupOp + '" data-op="' + op + '" style="border:1px solid rgba(128,128,128,0.3); border-radius:6px; padding:12px; margin-bottom:10px; background:rgba(128,128,128,0.03);">' + connectorHtml + '<div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;"><div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;"><span style="font-size:0.8em; font-weight:bold; text-transform:uppercase; letter-spacing:0.5px; opacity:0.6;">Match rules:</span><div style="display:flex; flex-direction:column; gap:3px;"><div style="display:flex; border-radius:14px; overflow:hidden; border:1px solid rgba(128,128,128,0.4);"><button type="button" class="btnGroupInnerOpChoice" data-value="AND" style="border:none; padding:4px 16px; font-size:0.82em; font-weight:bold; cursor:pointer; letter-spacing:0.5px; background:' + (op === "AND" ? "rgba(0,164,220,0.75)" : "transparent") + "; color:" + (op === "AND" ? "#fff" : "inherit") + ';" title="All rules in this group must match">ALL</button><div style="width:1px; background:rgba(128,128,128,0.4);"></div><button type="button" class="btnGroupInnerOpChoice" data-value="OR" style="border:none; padding:4px 16px; font-size:0.82em; font-weight:bold; cursor:pointer; letter-spacing:0.5px; background:' + (op === "OR" ? "rgba(220,120,0,0.75)" : "transparent") + "; color:" + (op === "OR" ? "#fff" : "inherit") + ';" title="Any rule in this group is enough">ANY</button></div><span class="inner-op-desc" style="font-size:0.7em; opacity:0.55;">' + (op === "AND" ? "All rules must match" : "Any rule is enough") + '</span></div></div><button type="button" class="btnRemoveFilterGroup" style="background:transparent; border:none; color:#cc3333; cursor:pointer; padding:2px 8px; font-size:0.85em; flex-shrink:0;">\u2715 Remove</button></div><div class="mi-rules-list">' + rulesHtml + '</div><button type="button" is="emby-button" class="btnAddMiRule raised btn-neutral" style="margin-top: 4px;">+ Add Rule</button></div>';
    }
    function readMiFiltersFromContainer(container) {
      const miFilters = [];
      container.querySelectorAll(".mediainfo-filter-group").forEach((group, gi) => {
        const operator = group.dataset.op || "AND";
        const groupOp = gi === 0 ? "AND" : group.dataset.groupOp || "AND";
        const criteria = [];
        group.querySelectorAll(".mi-rule").forEach((rule) => {
          const propEl = rule.querySelector(".selMiProperty");
          const prop = propEl ? propEl.value : "";
          const selVal = rule.querySelector(".selMiValue");
          const txtVal = rule.querySelector(".txtMiValue");
          const selOp = rule.querySelector(".selMiOp");
          const txtNum = rule.querySelector(".txtMiNum");
          const selUser = rule.querySelector(".selMiUser");
          const selTextOp = rule.querySelector(".selMiTextOp");
          let val = selVal ? selVal.value : txtVal ? txtVal.value.replace(/\r?\n/g, "\n").trim() : "";
          if (prop === "MediaType" && val === "Episode") {
            const incParentChk = rule.querySelector(".chkIncludeParentSeries");
            if (incParentChk && incParentChk.checked) val = "EpisodeIncludeSeries";
          }
          const op2 = selOp ? selOp.value : "";
          const textMatchOp = selTextOp ? selTextOp.value : "";
          const num = txtNum ? txtNum.value.trim() : "";
          const userId = selUser ? selUser.value : "";
          const finalOp = op2 || textMatchOp;
          const finalVal = op2 ? num : val;
          const notBtn = rule.querySelector(".btnNotToggle");
          const isNot = notBtn !== null && notBtn.dataset.not === "1";
          const crit = buildCriterion(prop, finalOp, finalVal, userId);
          if (crit) criteria.push(isNot ? "!" + crit : crit);
        });
        if (criteria.length > 0) miFilters.push({ Operator: operator, Criteria: criteria, GroupOperator: groupOp });
      });
      return miFilters;
    }

    function getMySavedFiltersPanelHtml(savedFilters) {
      if (savedFilters.length === 0) {
        return '<div style="font-size:0.82em; color:var(--theme-text-secondary); font-style:italic; margin-bottom:4px;">No saved filters yet.</div>';
      }
      return '<div style="display:flex; flex-wrap:wrap; gap:6px;">' + savedFilters.map(
        (sf, i) => '<div style="display:flex; align-items:center; gap:0;"><button type="button" class="btnApplyMySavedFilter" data-index="' + i + '" style="border:1.5px solid #000; border-radius:14px 0 0 14px; padding:4px 10px; font-size:0.82em; cursor:pointer; background:transparent; color:var(--theme-text-primary);">' + escapeHtml(sf.Name) + '</button><button type="button" class="btnDeleteMySavedFilter" data-index="' + i + '" style="border:1.5px solid #000; border-left:none; border-radius:0 14px 14px 0; background:transparent; color:#cc3333; cursor:pointer; padding:4px 8px; font-size:0.82em; line-height:1;" title="Delete">\u2715</button></div>'
      ).join("") + "</div>";
    }
    function refreshMySavedFiltersPanels(savedFilters) {
      const v = document.querySelector("#HomeScreenCompanionConfigPage");
      if (!v) return;
      const html = getMySavedFiltersPanelHtml(savedFilters);
      v.querySelectorAll(".mi-saved-panel-content").forEach((el) => {
        el.innerHTML = html;
      });
    }
    function saveSavedFiltersNow(deps) {
      deps.getApiClient().getPluginConfiguration(deps.pluginId).then((currentConfig) => {
        currentConfig.SavedFilters = deps.getSavedFilters();
        return deps.getApiClient().updatePluginConfiguration(deps.pluginId, currentConfig);
      }).then(() => {
        const original = deps.getOriginalConfigState();
        if (original) {
          try {
            const state = JSON.parse(original);
            if (state === null) {
            } else if (typeof state === "object") {
              state.SavedFilters = deps.getSavedFilters();
              deps.setOriginalConfigState(JSON.stringify(state));
            } else {
              deps.setOriginalConfigState(JSON.stringify(state));
            }
          } catch {
          }
        }
        const view = document.querySelector("#HomeScreenCompanionConfigPage");
        if (view) deps.checkFormState();
      });
    }

    const MI_PRESETS = [
      { label: "Resolution", presets: [
        {
          name: "Movies in 4K",
          build: () => [{ Operator: "AND", GroupOperator: "AND", Criteria: ["MediaType:Movie", "4K"] }]
        },
        {
          name: "Movies in 1080p",
          build: () => [{ Operator: "AND", GroupOperator: "AND", Criteria: ["MediaType:Movie", "1080p"] }]
        },
        {
          name: "Movies below HD (\u2264720p)",
          build: () => [
            { Operator: "AND", GroupOperator: "AND", Criteria: ["MediaType:Movie"] },
            { Operator: "OR", GroupOperator: "AND", Criteria: ["720p", "SD"] }
          ]
        }
      ] },
      { label: "Release Year", presets: [
        {
          name: "Movies from the 1990s",
          build: () => [{ Operator: "AND", GroupOperator: "AND", Criteria: ["MediaType:Movie", "Year:>=:1990", "Year:<=:1999"] }]
        },
        {
          name: "Movies released this year",
          build: () => {
            const y = (/* @__PURE__ */ new Date()).getFullYear();
            return [{ Operator: "AND", GroupOperator: "AND", Criteria: ["MediaType:Movie", "Year:=:" + y] }];
          }
        },
        {
          name: "Movies released in the last 5 years",
          build: () => {
            const y = (/* @__PURE__ */ new Date()).getFullYear() - 5;
            return [{ Operator: "AND", GroupOperator: "AND", Criteria: ["MediaType:Movie", "Year:>=:" + y] }];
          }
        }
      ] },
      { label: "Recently", presets: [
        {
          name: "Recently added (last 30 days)",
          build: () => [{ Operator: "AND", GroupOperator: "AND", Criteria: ["DateAdded:<=:30"] }]
        },
        {
          name: "Recently modified (last 7 days)",
          build: () => [{ Operator: "AND", GroupOperator: "AND", Criteria: ["DateModified:<=:7"] }]
        },
        {
          name: "Recently played (last 7 days)",
          build: () => [{ Operator: "AND", GroupOperator: "AND", Criteria: ["LastPlayed:__any__:<=:7"] }]
        }
      ] },
      { label: "Watch Status", presets: [
        {
          name: "Unwatched movies",
          build: () => [{ Operator: "AND", GroupOperator: "AND", Criteria: ["MediaType:Movie", "IsPlayed:__any__:=:Unwatched"] }]
        },
        {
          name: "Never played by anyone",
          build: () => [{ Operator: "AND", GroupOperator: "AND", Criteria: ["IsPlayed:__all__:=:Unwatched"] }]
        },
        {
          name: "Watched by at least 2 users",
          build: () => [{ Operator: "AND", GroupOperator: "AND", Criteria: ["WatchedByCount:>=:2"] }]
        },
        {
          name: "Unseen by everyone",
          build: () => [{ Operator: "AND", GroupOperator: "AND", Criteria: ["WatchedByCount:=:0"] }]
        },
        {
          name: "In progress by current user (home section)",
          build: () => [{ Operator: "AND", GroupOperator: "AND", Criteria: ["InProgress"] }]
        },
        {
          name: "Watched by current user (home section)",
          build: () => [{ Operator: "AND", GroupOperator: "AND", Criteria: ["IsPlayed:__current__:=:Watched"] }]
        }
      ] },
      { label: "Music", presets: [
        {
          name: "All music tracks",
          build: () => [{ Operator: "AND", GroupOperator: "AND", Criteria: ["MediaType:Audio"] }]
        },
        {
          name: "All music videos",
          build: () => [{ Operator: "AND", GroupOperator: "AND", Criteria: ["MediaType:MusicVideo"] }]
        },
        {
          name: "Lossless audio (\u226524-bit)",
          build: () => [{ Operator: "AND", GroupOperator: "AND", Criteria: ["MediaType:Audio", "BitsPerSample:>=:24"] }]
        },
        {
          name: "Hi-res audio (\u226596 kHz)",
          build: () => [{ Operator: "AND", GroupOperator: "AND", Criteria: ["MediaType:Audio", "SampleRate:>=:96000"] }]
        },
        {
          name: "Music videos in 4K",
          build: () => [{ Operator: "AND", GroupOperator: "AND", Criteria: ["MediaType:MusicVideo", "4K"] }]
        }
      ] }
    ];
    const SOURCE_BADGE_MAP = {
      "External": { icon: "language", title: "External List" },
      "LocalCollection": { icon: "folder_special", title: "Local Collection" },
      "LocalPlaylist": { icon: "playlist_play", title: "Local Playlist" },
      "MediaInfo": { icon: "tune", title: "Smart Playlist" },
      "AI": { icon: "auto_awesome", title: "AI created lists" }
    };
    function getSourceBadgeHtml(st) {
      const e = SOURCE_BADGE_MAP[st];
      if (!e) return "";
      return `<span class="tag-indicator source" title="${e.title}"><i class="md-icon" style="font-size:1.1em;">${e.icon}</i></span>`;
    }
    function asTagConfig(tagConfig) {
      return tagConfig && typeof tagConfig === "object" ? tagConfig : {};
    }
    function renderTagGroup(tagConfig, groupIndex, deps) {
      const cfg = asTagConfig(tagConfig);
      const isChecked = cfg.Active !== false ? "checked" : "";
      const tagName = cfg.Tag || "";
      const labelName = cfg.Name || "";
      const urls = cfg.Urls || (cfg.Url ? [{ url: cfg.Url, limit: cfg.Limit !== void 0 ? cfg.Limit : 0 }] : [{ url: "", limit: 0 }]);
      const blacklist = migrateCommaSeparated((cfg.Blacklist || []).join("\n")) || "";
      const intervals = cfg.ActiveIntervals || [];
      const idx = typeof groupIndex !== "undefined" ? groupIndex : 9999;
      const lastMod = cfg.LastModified || (/* @__PURE__ */ new Date()).toISOString();
      const enableTag = cfg.EnableTag !== false ? "checked" : "";
      const enableColl = cfg.EnableCollection ? "checked" : "";
      const enablePlaylist = cfg.EnablePlaylist ? "checked" : "";
      const playlistName = cfg.PlaylistName || "";
      const playlistUserIds = cfg.PlaylistUserIds || [];
      const playlistUserIdsEnc = encodeURIComponent(JSON.stringify(playlistUserIds));
      const playlistMappingsEnc = encodeURIComponent(JSON.stringify(cfg.PlaylistMappings || []));
      const overrideChecked = cfg.OverrideWhenActive ? "checked" : "";
      const collName = cfg.CollectionName || "";
      const collDescription = cfg.CollectionDescription || "";
      const collPosterPath = cfg.CollectionPosterPath || "";
      const sourceType = cfg.SourceType || "";
      let localSources = cfg.LocalSources || [];
      if (localSources.length === 0) localSources = [{ id: "", limit: 0 }];
      const mediaInfoLimit = cfg.Limit || 0;
      const aiLimit = cfg.Limit || 0;
      const _legacyTarget = cfg.MediaInfoTargetType || (cfg.MediaInfoSeasonMode ? "Season" : "");
      const _tagAnySet = cfg.TagTargetEpisode || cfg.TagTargetSeason || cfg.TagTargetSeries || cfg.MediaInfoTargetEpisode || cfg.MediaInfoTargetSeason || cfg.MediaInfoTargetSeries || _legacyTarget !== "";
      const _tagTargetEp = cfg.TagTargetEpisode || cfg.MediaInfoTargetEpisode || _legacyTarget === "Episode";
      const _tagTargetSea = cfg.TagTargetSeason || cfg.MediaInfoTargetSeason || _legacyTarget === "Season";
      const _tagTargetSer = cfg.TagTargetSeries || cfg.MediaInfoTargetSeries || _legacyTarget === "Series" || !_tagAnySet;
      const _collAnySet = cfg.CollectionTargetEpisode || cfg.CollectionTargetSeason || cfg.CollectionTargetSeries || cfg.MediaInfoTargetEpisode || cfg.MediaInfoTargetSeason || cfg.MediaInfoTargetSeries || _legacyTarget !== "";
      const _collTargetEp = cfg.CollectionTargetEpisode || cfg.MediaInfoTargetEpisode || _legacyTarget === "Episode";
      const _collTargetSea = cfg.CollectionTargetSeason || cfg.MediaInfoTargetSeason || _legacyTarget === "Season";
      const _collTargetSer = cfg.CollectionTargetSeries || cfg.MediaInfoTargetSeries || _legacyTarget === "Series" || !_collAnySet;
      const enableHomeSection = cfg.EnableHomeSection ? "checked" : "";
      const _hasViewerCriteria = deps.tagConfigHasViewerCriteria(cfg);
      const _hseAllowedWithoutOutput = sourceType === "MediaInfo" && _hasViewerCriteria;
      const disableHomeSection = cfg.EnableTag === false && !cfg.EnableCollection && !_hseAllowedWithoutOutput ? "disabled" : "";
      const homeSectionLibraryId = encodeURIComponent(cfg.HomeSectionLibraryId || "auto");
      const homeSectionUserIdsEnc = encodeURIComponent(JSON.stringify(cfg.HomeSectionUserIds || []));
      const homeSectionSettingsEnc = encodeURIComponent(cfg.HomeSectionSettings || "{}");
      const homeSectionTrackedEnc = encodeURIComponent(JSON.stringify(cfg.HomeSectionTracked || []));
      const hsDefaultSectionType = cfg.EnableCollection ? "boxset" : cfg.EnableTag || _hseAllowedWithoutOutput ? "items" : "boxset";
      const mediaFilters = cfg.MediaInfoFilters && cfg.MediaInfoFilters.length > 0 ? cfg.MediaInfoFilters : cfg.MediaInfoConditions && cfg.MediaInfoConditions.length > 0 ? [{ Operator: "AND", GroupOperator: "AND", Criteria: cfg.MediaInfoConditions }] : [];
      const filterGroupsHtml = mediaFilters.map((f, i) => deps.getMediaInfoFilterGroupHtml(f, i, i === 0, deps.miFilterDeps)).join("");
      const activeText = cfg.Active !== false ? "Active" : "Disabled";
      const activeColor = cfg.Active !== false ? "#52B54B" : "var(--theme-text-secondary)";
      const sourceBadgeHtml = getSourceBadgeHtml(sourceType);
      let indicatorsHtml = "";
      if (intervals.length > 0) {
        const schedPriorityClass = cfg.OverrideWhenActive ? " priority-active" : "";
        const schedText = cfg.OverrideWhenActive ? "Schedule priority" : "Schedule";
        indicatorsHtml += `<span class="tag-indicator schedule${schedPriorityClass}"><i class="md-icon" style="font-size:1.1em;">calendar_today</i> ${schedText}</span>`;
      }
      if (cfg.EnableCollection) {
        indicatorsHtml += `<span class="tag-indicator collection"><i class="md-icon" style="font-size:1.1em;">library_books</i> Collection</span>`;
      }
      if (cfg.EnableHomeSection) {
        indicatorsHtml += `<span class="tag-indicator homescreen"><i class="md-icon" style="font-size:1.1em;">home</i> Home Section</span>`;
      }
      if (cfg.EnableTag) {
        indicatorsHtml += `<span class="tag-indicator tag"><i class="md-icon" style="font-size:1.1em;">label</i> Tag</span>`;
      }
      if (cfg.EnablePlaylist) {
        indicatorsHtml += `<span class="tag-indicator playlist"><i class="md-icon" style="font-size:1.1em;">queue_music</i> Playlist</span>`;
      }
      if (deps.topLists.tagNames.has(tagName.toLowerCase())) {
        indicatorsHtml += `<span class="tag-indicator toplist"><i class="md-icon" style="font-size:1.1em;">format_list_numbered</i> Top-List</span>`;
      }
      const inactiveClass = cfg.Active === false ? "inactive" : "";
      const newClass = "";
      const html = `
        <div class="tag-row ${inactiveClass} ${newClass}" data-index="${idx}" data-tag="${tagName.toLowerCase()}" data-last-modified="${lastMod}" data-dirty="false">
            <div class="tag-header" style="display:flex; align-items:center; justify-content:space-between; padding:10px; cursor:pointer;">
                <div style="display:flex; align-items:center;">
                    <div class="header-actions" style="margin-right:15px; display:flex; align-items:center;" onclick="event.stopPropagation()">
                        <div class="drag-handle">
                            <i class="md-icon">reorder</i>
                        </div>
                        <span class="lblActiveStatus" style="margin-right:8px; font-size:0.9em; font-weight:bold; color:${activeColor}; min-width:60px; text-align:right;">${activeText}</span>
                        <label class="checkboxContainer" style="margin:0;">
                            <input type="checkbox" is="emby-checkbox" class="chkTagActive" ${isChecked} />
                            <span></span>
                        </label>
                    </div>
                    <div class="tag-info" style="display:flex; align-items:center;">
                        <span class="source-badge">${sourceBadgeHtml}</span>
                        <span class="tag-title" style="font-weight:bold; font-size:1.1em;">${labelName || tagName || "New"}</span>
                        <span class="badge-container" style="display:flex; align-items:center;">${indicatorsHtml}</span>
                    </div>
                </div>
                <i class="md-icon expand-icon">expand_more</i>
            </div>
            <div class="tag-body" style="display:none; padding:15px; border-top:1px solid rgba(255,255,255,0.1);">
                <div style="display:flex; justify-content:flex-end; margin-bottom:4px;">
                    <button type="button" is="emby-button" class="btnDuplicateRow raised" style="background:transparent; color:var(--theme-text-secondary); font-size:0.82em; padding:0 10px; min-width:0; box-shadow:none;" title="Duplicate this source"><i class="md-icon" style="font-size:1em; margin-right:4px;">content_copy</i><span>Duplicate</span></button>
                </div>
                <div class="tag-tabs" style="display: flex; gap: 20px; margin-bottom: 15px; border-bottom: 1px solid rgba(255,255,255,0.1);">
                    <div class="tag-tab active" data-tab="general" style="padding: 8px 0; cursor: pointer; font-weight: bold; border-bottom: 2px solid #52B54B;">Source</div>
                    <div class="tag-tab" data-tab="tag" style="padding: 8px 0; cursor: pointer; opacity: 0.6; font-weight: bold; border-bottom: 2px solid transparent;">Tag</div>
                    <div class="tag-tab" data-tab="collection" style="padding: 8px 0; cursor: pointer; opacity: 0.6; font-weight: bold; border-bottom: 2px solid transparent;">Collection</div>
                    <div class="tag-tab" data-tab="playlist" style="padding: 8px 0; cursor: pointer; opacity: 0.6; font-weight: bold; border-bottom: 2px solid transparent;">Playlist</div>
                    <div class="tag-tab" data-tab="schedule" style="padding: 8px 0; cursor: pointer; opacity: 0.6; font-weight: bold; border-bottom: 2px solid transparent;">Schedule</div>
                    <div class="tag-tab" data-tab="advanced" style="padding: 8px 0; cursor: pointer; opacity: 0.6; font-weight: bold; border-bottom: 2px solid transparent;">Blacklist</div>
                    <div class="tag-tab" data-tab="homescreen" style="padding: 8px 0; cursor: pointer; opacity: 0.6; font-weight: bold; border-bottom: 2px solid transparent;">Home Screen</div>
                </div>

                <div class="tab-content general-tab">
                    <div class="inputContainer" style="flex-grow:1;"><input is="emby-input" class="txtEntryLabel" type="text" label="Display Name" value="${labelName}" /></div>

                    <div style="margin-bottom: 15px;">
                        <label class="selectLabel">Source Type</label>
                        <select is="emby-select" class="selSourceType" style="width:100%;">
                            <option value="" ${!sourceType ? "selected" : ""}>-- Select source type --</option>
                            <option value="External" ${sourceType === "External" ? "selected" : ""}>External List (Trakt/MDBList/TMDb)</option>
                            <option value="LocalCollection" ${sourceType === "LocalCollection" ? "selected" : ""}>Local Collection</option>
                            <option value="LocalPlaylist" ${sourceType === "LocalPlaylist" ? "selected" : ""}>Local Playlist</option>
                            <option value="MediaInfo" ${sourceType === "MediaInfo" ? "selected" : ""}>Local Media Information (Smart Playlist)</option>
                            <option value="AI" ${sourceType === "AI" ? "selected" : ""}>AI created lists</option>
                        </select>
                        <p class="source-type-hint" style="margin:6px 0 0 0; font-size:1em; opacity:0.8; line-height:1.4;">${function(st) {
    if (st === "External") return "Use an external list to tag, or create a collection, from the items that match your library.";
    if (st === "LocalCollection") return "Every item in the selected collection(s) gets the configured tag or is added to a new collection. You can also use this to create a curated list of selected collections as a home screen section.";
    if (st === "LocalPlaylist") return "Every item in the selected playlist(s) gets the configured tag or is added to a new collection.";
    if (st === "MediaInfo") return "Filter your own library to select which movies or shows to tag or create a collection of. This is also known as a Smart Playlist.";
    if (st === "AI") return "Use AI to create a list. Write your prompt and the AI will build a list based on it.";
    return "";
  }(sourceType)}</p>
                    </div>

                    <div class="source-external-container" style="display: ${sourceType === "External" ? "block" : "none"};">
                        <div style="display:flex; align-items:baseline; gap:10px; margin:10px 0 10px 0;">
                            <p style="margin:0; font-size:0.9em; font-weight:bold; opacity:0.7;">Source URLs</p>
                            <span style="font-size:0.75em; opacity:0.5;">\u2014 Find lists: <a href="https://trakt.tv/discover" target="_blank" style="color:inherit; text-decoration:underline;">Trakt</a> &middot; <a href="https://mdblist.com/toplists/" target="_blank" style="color:inherit; text-decoration:underline;">MDBList</a> &middot; <a href="https://www.themoviedb.org/" target="_blank" style="color:inherit; text-decoration:underline;">TMDb</a> &middot; <a href="https://developer.themoviedb.org/reference/getting-started" target="_blank" style="color:inherit; text-decoration:underline;">TMDb API</a></span>
                        </div>
                        <div class="url-list-container">${urls.map((u) => deps.getUrlRowHtml(u.url, u.limit)).join("")}</div>
                        <div style="margin-top:10px;"><button is="emby-button" type="button" class="raised btnAddUrl" style="width:100%; background:transparent; border:2px dashed rgba(128,128,128,0.4); color:var(--theme-text-secondary);"><i class="md-icon" style="margin-right:5px;">add</i>Add another URL</button></div>
                    </div>

                    <div class="source-local-container" style="display: ${sourceType === "LocalCollection" || sourceType === "LocalPlaylist" ? "block" : "none"};">
                        <p style="margin:10px 0 10px 0; font-size:0.9em; font-weight:bold; opacity:0.7;" class="local-type-label">${sourceType === "LocalPlaylist" ? "Select Playlists" : "Select Collections"}</p>
                        <div class="local-list-container">${localSources.map((ls) => deps.getLocalRowHtml(sourceType, ls.id, ls.limit)).join("")}</div>
                        <div style="margin-top:10px;"><button is="emby-button" type="button" class="raised btnAddLocal" style="width:100%; background:transparent; border:2px dashed rgba(128,128,128,0.4); color:var(--theme-text-secondary);"><i class="md-icon" style="margin-right:5px;">add</i>Add another</button></div>
                    </div>

                    <div class="source-ai-container" style="display: ${sourceType === "AI" ? "block" : "none"};">
                        <div style="margin-bottom: 15px;">
                            <label class="selectLabel">AI Provider</label>
                            <select is="emby-select" class="selAiProvider" style="width:100%;">
                                <option value="OpenAI" ${(cfg.AiProvider || "OpenAI") === "OpenAI" ? "selected" : ""}>OpenAI (ChatGPT)</option>
                                <option value="Gemini" ${(cfg.AiProvider || "OpenAI") === "Gemini" ? "selected" : ""}>Google Gemini</option>
                                <option value="Claude" ${(cfg.AiProvider || "OpenAI") === "Claude" ? "selected" : ""}>Anthropic Claude</option>
                                <option value="Ollama" ${(cfg.AiProvider || "OpenAI") === "Ollama" ? "selected" : ""}>Ollama (Local)</option>
                            </select>
                        </div>

                        <div class="ollama-experimental-warning" style="display:${(cfg.AiProvider || "OpenAI") === "Ollama" ? "flex" : "none"}; align-items:flex-start; gap:8px; background:rgba(232,168,56,0.1); border:1px solid rgba(232,168,56,0.35); border-radius:4px; padding:10px 12px; margin-bottom:15px; font-size:0.85em; line-height:1.5;">
                            <i class="md-icon" style="font-size:1.1em; color:#e8a838; flex-shrink:0; margin-top:1px;">warning</i>
                            <span style="opacity:0.85;"><strong>Experimental:</strong> Ollama support is experimental. Local models may return inaccurate IMDB IDs \u2014 the plugin will fall back to title matching, but results <strong>WILL</strong> vary depending on the model used. Known limitations with local AI is the lack of new and updated information, and limited ability to research online. Cloud based models seems to be the best options for now. </span>
                        </div>

                        <div class="inputContainer" style="margin-bottom:15px;">
                            <textarea is="emby-textarea" class="txtAiPrompt" rows="3"
                                label="Prompt"
                                style="width:100%; resize:vertical; box-sizing:border-box;"
                                placeholder="e.g. Give me the best thriller movies from the 2000s">${cfg.AiPrompt || ""}</textarea>
                            <div class="fieldDescription">Write your intent. The system will automatically format the output as a structured movie/show list. You don't need to specify a format.</div>
                        </div>

                        <div class="checkboxContainer checkboxContainer-withDescription" style="margin-top:12px;">
                            <label>
                                <input type="checkbox" is="emby-checkbox" class="chkAiRecentlyWatched" ${cfg.AiIncludeRecentlyWatched ? "checked" : ""} />
                                <span>Include recently watched for personalization</span>
                            </label>
                            <div class="fieldDescription">Prepends the selected user's watch history to the AI prompt, enabling "Recommended for you" style lists.</div>
                        </div>

                        <div class="ai-recently-watched-options" style="display: ${cfg.AiIncludeRecentlyWatched ? "block" : "none"}; margin-top:10px; padding-left:10px; border-left:2px solid rgba(128,128,128,0.3);">
                            <div style="margin-bottom:10px;">
                                <label class="selectLabel">User for watch history</label>
                                <select is="emby-select" class="selAiWatchedUser" style="width:100%;">
                                    <option value="">-- Select user --</option>
                                    ${(deps.miUsers.users || []).map((u) => '<option value="' + u.Id + '"' + (u.Id === (cfg.AiRecentlyWatchedUserId || "") ? " selected" : "") + ">" + u.Name + "</option>").join("")}
                                </select>
                            </div>
                            <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                                <label style="font-size:0.9em; white-space:nowrap; margin:0;">Recent items to include</label>
                                <input is="emby-input" class="txtAiWatchedCount" type="number" value="${cfg.AiRecentlyWatchedCount || 20}" min="5" max="100" style="width:80px;" />
                            </div>
                        </div>

                        <div style="display:flex; align-items:center; gap:12px; margin-top:15px; margin-bottom:15px;">
                            <label style="font-size:0.9em; white-space:nowrap; margin:0;">Max items</label>
                            <input is="emby-input" class="txtAiLimit" type="number" value="${aiLimit}" min="0" style="width:90px;" />
                            <span style="font-size:0.8em; opacity:0.5;">0 = no limit. Injected into the prompt automatically.</span>
                        </div>

                        <div style="display:flex; align-items:center; gap:12px; margin-top:0; margin-bottom:15px;">
                            <label style="font-size:0.9em; white-space:nowrap; margin:0;">Refresh every</label>
                            <input is="emby-input" class="txtAiRefreshInterval" type="number" value="${cfg.AiRefreshIntervalDays || 0}" min="0" style="width:90px;" />
                            <span style="font-size:0.8em; opacity:0.5;">days &nbsp;(0 = run on every full sync)</span>
                        </div>

                        <div style="margin-top:0;">
                            <button type="button" is="emby-button" class="raised btnTestAiSource btn-neutral" style="background:transparent; border:1px solid rgba(128,128,128,0.4); color:var(--theme-text-secondary);">
                                <i class="md-icon" style="margin-right:5px;">science</i>Test AI Source
                            </button>
                            <span class="ai-test-result" style="margin-left:10px; font-size:0.85em; opacity:0.7;"></span>
                        </div>
                    </div>

                    <div class="source-mediainfo-container" style="display: ${sourceType && sourceType !== "" ? "block" : "none"};">
                        <div class="mi-limit-row" style="display:${sourceType === "MediaInfo" ? "flex" : "none"}; align-items:center; gap:12px; margin-bottom:14px; flex-wrap:wrap;">
                            <label style="font-size:0.9em; white-space:nowrap; margin:0;">Max items</label>
                            <input is="emby-input" class="txtMediaInfoLimit" type="number" value="${mediaInfoLimit}" min="0" style="width:90px;" />
                            <button type="button" is="emby-button" class="btnMiHelp raised" style="margin-left:auto; background:transparent; border:1px solid rgba(128,128,128,0.35); color:var(--theme-text-secondary); font-size:0.82em; padding:0 10px; min-width:0;"><i class="md-icon" style="font-size:1em; margin-right:4px;">help_outline</i><span>How to (filter guide)</span></button>
                        </div>
                        <div class="mi-toggle-row" style="display:${sourceType === "MediaInfo" || mediaFilters.length > 0 ? "none" : "block"}; padding-top:14px; border-top:1px solid var(--line-color);">
                            <button type="button" is="emby-button" class="btnToggleAdditionalFilters raised" style="background:transparent; border:1px solid rgba(128,128,128,0.35); color:var(--theme-text-secondary); font-size:0.85em;"><i class="md-icon" style="font-size:1em; margin-right:4px;">filter_list</i><span>Add filters (optional)</span></button>
                        </div>
                        <div class="mi-filter-body" style="display:${sourceType === "MediaInfo" || mediaFilters.length > 0 ? "block" : "none"};">
                            <div class="mi-help-btn-row" style="display:${sourceType === "MediaInfo" ? "none" : "flex"}; margin-bottom:14px; padding-top:14px; border-top:1px solid var(--line-color);">
                                <button type="button" is="emby-button" class="btnMiHelp raised" style="margin-left:auto; background:transparent; border:1px solid rgba(128,128,128,0.35); color:var(--theme-text-secondary); font-size:0.82em; padding:0 10px; min-width:0;"><i class="md-icon" style="font-size:1em; margin-right:4px;">help_outline</i><span>How to (filter guide)</span></button>
                            </div>
                            <div class="mediainfo-filter-list">${filterGroupsHtml}</div>
                            <div style="display:flex; gap:8px; margin-top:8px;">
                                <button type="button" is="emby-button" class="btnAddMediaInfoFilter raised" style="flex:1; background:transparent; border:2px dashed rgba(128,128,128,0.4); color:var(--theme-text-secondary);"><i class="md-icon" style="margin-right:5px;">add</i>Add Filter Group</button>
                                <button type="button" is="emby-button" class="btnClearAllFilters raised" style="background:transparent; border:2px dashed rgba(204,51,51,0.4); color:#cc3333; padding:0 14px; min-width:0;" title="Clear all filters"><i class="md-icon" style="font-size:1em;">delete_sweep</i></button>
                            </div>
                            <div class="mi-presets-section" style="margin-top:30px; border-top:1px solid var(--line-color); padding-top:1px; display:${sourceType === "MediaInfo" ? "block" : "none"};">
                            ${`
                                <button type="button" is="emby-button" class="btnPremadeFilters raised btn-neutral" style="width:100%; margin-bottom:6px; background:transparent; border:1px solid var(--line-color); color:var(--theme-text-secondary); display:flex; align-items:center; justify-content:space-between;"><span><i class="md-icon" style="margin-right:5px;">auto_awesome</i>Premade filters</span><i class="md-icon mi-expand-icon" style="transition:transform 0.2s; font-size:1.2em;">expand_more</i></button>
                                <div class="mi-preset-panel" style="display:none; border:1px solid var(--line-color); border-radius:6px; padding:10px 12px; margin-bottom:8px; background:rgba(128,128,128,0.06);">
                                    <div style="font-size:0.8em; color:var(--theme-text-secondary); margin-bottom:10px;">Select a preset to replace the current filters:</div>
                                    ${MI_PRESETS.map(
    (cat, ci) => '<div style="margin-bottom:10px;"><div style="font-size:0.72em; text-transform:uppercase; letter-spacing:1px; color:var(--theme-text-secondary); margin-bottom:5px;">' + cat.label + '</div><div style="display:flex; flex-wrap:wrap; gap:6px;">' + cat.presets.map(
      (p, pi) => '<button type="button" class="btnApplyMiPreset" data-preset="' + ci + "," + pi + '" style="border:1.5px solid #000; border-radius:14px; padding:4px 12px; font-size:0.82em; cursor:pointer; background:transparent; color:var(--theme-text-primary);">' + p.name + "</button>"
    ).join("") + "</div></div>"
  ).join("")}
                                </div>
                                <button type="button" is="emby-button" class="btnMySavedFilters raised btn-neutral" style="width:100%; margin-bottom:6px; background:transparent; border:1px solid var(--line-color); color:var(--theme-text-secondary); display:flex; align-items:center; justify-content:space-between;"><span><i class="md-icon" style="margin-right:5px;">bookmarks</i>My saved filters</span><i class="md-icon mi-expand-icon" style="transition:transform 0.2s; font-size:1.2em;">expand_more</i></button>
                                <div class="mi-saved-panel" style="display:none; border:1px solid var(--line-color); border-radius:6px; padding:10px 12px; margin-bottom:8px; background:rgba(128,128,128,0.06);">
                                    <div style="font-size:0.8em; color:var(--theme-text-secondary); margin-bottom:10px;">Select a saved filter to replace the current filters:</div>
                                    <div class="mi-saved-panel-content">${deps.getMySavedFiltersPanelHtml(deps.savedFilters)}</div>
                                    <div style="border-top:1px solid var(--line-color); margin:12px 0 10px;"></div>
                                    <div style="font-size:0.8em; color:var(--theme-text-secondary); margin-bottom:6px;">Save current filter as:</div>
                                    <div class="mi-saveas-bar" style="display:flex; gap:6px; align-items:flex-start;">
                                        <input type="text" class="txtSaveFilterName emby-input" placeholder="Filter name..." style="flex:1; padding:4px 8px; font-size:0.85em;" />
                                        <button type="button" is="emby-button" class="btnConfirmSaveFilter raised" style="background:var(--button-background); color:var(--button-foreground); flex-shrink:0;">Save</button>
                                    </div>
                                </div>
                            ` }
                            </div>
                        </div>
                    </div>

                </div>

            <div class="tab-content tagname-tab" style="display:none;">
                    <div class="inputContainer" style="flex-grow:1;"><input is="emby-input" class="txtTagName" type="text" label="Tag Name" value="${tagName}" placeholder="${labelName}" /></div>
                    <div class="tag-tab-controls" style="margin-top:10px;">
                        <div class="checkboxContainer checkboxContainer-withDescription">
                            <label>
                                <input is="emby-checkbox" type="checkbox" class="chkEnableTag" ${enableTag} />
                                <span>Apply Tag</span>
                            </label>
                            <div class="fieldDescription">Automatically tag matched items in Emby.</div>
                        </div>
                        <div class="tag-settings" style="margin-left: 20px; padding-left: 15px; border-left: 2px solid var(--line-color); margin-top: 10px; display: ${cfg.EnableTag !== false ? "block" : "none"};">
                            <div class="mi-tag-target-section" style="margin-top:4px;">
                                <div style="font-size:0.85em; opacity:0.6; margin-bottom:6px; display:flex; align-items:center; gap:8px;">
                                    <span>For TV shows, choose what level to tag:</span>
                                    <button type="button" is="emby-button" class="btnTagTargetHelp raised" style="background:transparent; border:1px solid rgba(128,128,128,0.35); color:var(--theme-text-secondary); font-size:0.82em; padding:0 10px; min-width:0;"><i class="md-icon" style="font-size:1em; margin-right:4px;">help_outline</i><span>How to use</span></button>
                                </div>
                                <div style="display:flex; flex-direction:row; align-items:center; gap:20px;">
                                    <label style="display:flex; align-items:center; gap:6px; cursor:pointer; white-space:nowrap;">
                                        <input type="checkbox" is="emby-checkbox" class="chkTagTargetSeries" ${_tagTargetSer ? "checked" : ""} />
                                        <span>Series</span>
                                    </label>
                                    <label style="display:flex; align-items:center; gap:6px; cursor:pointer; white-space:nowrap;">
                                        <input type="checkbox" is="emby-checkbox" class="chkTagTargetSeason" ${_tagTargetSea ? "checked" : ""} />
                                        <span>Season</span>
                                    </label>
                                    <label style="display:flex; align-items:center; gap:6px; cursor:pointer; white-space:nowrap;">
                                        <input type="checkbox" is="emby-checkbox" class="chkTagTargetEpisode" ${_tagTargetEp ? "checked" : ""} />
                                        <span>Episode</span>
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
            </div>

                <div class="tab-content schedule-tab" style="display:none;">
                    <p style="margin:0 0 15px 0; font-size:0.9em; opacity:0.8;">Define when this tag should be active. If empty, it's always active.</p>
                    <div class="date-list-container">${intervals.map((i) => deps.getDateRowHtml(i)).join("")}</div>
                    <button is="emby-button" type="button" class="btnAddDate" style="width:100%; background:transparent; border:2px dashed rgba(128,128,128,0.4); color:var(--theme-text-secondary); margin-top:10px;"><i class="md-icon" style="margin-right:5px;">event</i>Add Schedule Rule</button>
                    <div class="checkboxContainer checkboxContainer-withDescription" style="margin-top:16px; ${intervals.length === 0 ? "opacity:0.4;" : ""}">
                        <label>
                            <input is="emby-checkbox" type="checkbox" class="chkOverrideWhenActive" ${overrideChecked} ${intervals.length === 0 ? "disabled" : ""} />
                            <span>Priority override when active</span>
                        </label>
                        <div class="fieldDescription">When this entry is in schedule, all other entries sharing the same tag or collection are suppressed \u2014 only this entry's items keep the tag and collection.</div>
                    </div>
                </div>

                <div class="tab-content collection-tab" style="display:none;">
                    <div class="collection-tab-controls">
                    <div class="checkboxContainer checkboxContainer-withDescription">
                        <label>
                            <input is="emby-checkbox" type="checkbox" class="chkEnableCollection" ${enableColl} />
                            <span>Create Collection</span>
                        </label>
                        <div class="fieldDescription">Automatically create and maintain an Emby Collection from these items.</div>
                    </div>

                    <div class="collection-settings" style="margin-left: 20px; padding-left: 15px; border-left: 2px solid var(--line-color); margin-top: 10px; display: ${cfg.EnableCollection ? "block" : "none"};">
                        <div class="inputContainer">
                            <input is="emby-input" type="text" class="txtCollectionName" label="Collection Name" value="${collName}" placeholder="${labelName}" />
                            <div class="fieldDescription">Leave empty to use Display Name.</div>
                        </div>

                        <div class="mi-coll-target-section" style="margin-top:10px;">
                            <div style="font-size:0.85em; opacity:0.6; margin-bottom:6px; display:flex; align-items:center; gap:8px;">
                                <span>For TV shows, choose what level to add to collection:</span>
                                <button type="button" is="emby-button" class="btnCollTargetHelp raised" style="background:transparent; border:1px solid rgba(128,128,128,0.35); color:var(--theme-text-secondary); font-size:0.82em; padding:0 10px; min-width:0;"><i class="md-icon" style="font-size:1em; margin-right:4px;">help_outline</i><span>How to use</span></button>
                            </div>
                            <div style="display:flex; flex-direction:row; align-items:center; gap:20px;">
                                <label style="display:flex; align-items:center; gap:6px; cursor:pointer; white-space:nowrap;">
                                    <input type="checkbox" is="emby-checkbox" class="chkCollTargetSeries" ${_collTargetSer ? "checked" : ""} />
                                    <span>Series</span>
                                    </label>
                                    <label style="display:flex; align-items:center; gap:6px; cursor:pointer; white-space:nowrap;">
                                        <input type="checkbox" is="emby-checkbox" class="chkCollTargetSeason" ${_collTargetSea ? "checked" : ""} />
                                        <span>Season</span>
                                    </label>
                                    <label style="display:flex; align-items:center; gap:6px; cursor:pointer; white-space:nowrap;">
                                        <input type="checkbox" is="emby-checkbox" class="chkCollTargetEpisode" ${_collTargetEp ? "checked" : ""} />
                                        <span>Episode</span>
                                    </label>
                                </div>
                            </div>

                            <div class="inputContainer" style="margin-top:15px;">
                                <textarea is="emby-textarea" class="txtCollectionDescription" rows="3"
                                    label="Description"
                                    placeholder="Optional description for this collection..."
                                    style="width:100%; resize:vertical; box-sizing:border-box;">${collDescription}</textarea>
                            </div>

                            <div style="margin-top:15px;">
                                <p style="margin:0 0 8px 0; font-size:0.9em; font-weight:bold; opacity:0.7;">Collection Poster</p>
                                <div class="poster-preview-container" style="margin-bottom:8px; display:${collPosterPath ? "block" : "none"};">
                                    <span class="poster-filename" style="font-size:0.85em; opacity:0.7;">${collPosterPath ? collPosterPath.split(/[\\\\/]/).pop() : ""}</span>
                                    <button type="button" class="btnRemovePoster" style="margin-left:10px; font-size:0.8em; background:transparent; border:none; color:#e55; cursor:pointer; vertical-align:middle;">\u2715 Remove</button>
                                </div>
                                <img class="poster-preview-img" src="" alt="" style="max-width:120px; max-height:180px; border-radius:4px; display:none; margin-bottom:8px;" />
                                <input type="file" class="inputPosterFile" accept="image/*" style="display:none;" />
                                <input type="hidden" class="hiddenPosterPath" value="${collPosterPath}" />
                                <button type="button" is="emby-button" class="btnChoosePoster raised" style="width:100%; background:transparent; border:2px dashed rgba(128,128,128,0.4); color:var(--theme-text-secondary);">
                                    <i class="md-icon" style="margin-right:5px;">image</i>Choose Poster Image
                                </button>
                                <div style="display:flex; align-items:center; gap:6px; margin-top:8px; opacity:0.45;">
                                    <div style="flex:1; height:1px; background:currentColor;"></div>
                                    <span style="font-size:0.75em;">or</span>
                                    <div style="flex:1; height:1px; background:currentColor;"></div>
                                </div>
                                <div style="display:flex; gap:6px; margin-top:6px;">
                                    <input class="txtPosterUrl" is="emby-input" type="url" placeholder="https://example.com/poster.jpg" style="flex:1;" />
                                    <button type="button" is="emby-button" class="btnLoadPosterUrl raised btn-neutral">Load</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="tab-content playlist-tab" style="display:none;"
                    data-pl-userids="${playlistUserIdsEnc}"
                    data-pl-mappings="${playlistMappingsEnc}"
                    data-pl-loaded="0">
                    <div class="checkboxContainer checkboxContainer-withDescription">
                        <label>
                            <input is="emby-checkbox" type="checkbox" class="chkEnablePlaylist" ${enablePlaylist} />
                            <span>Create Playlist</span>
                        </label>
                        <div class="fieldDescription">Automatically create and maintain an individual Emby Playlist for each selected user.</div>
                    </div>
                    <div class="playlist-settings" style="margin-left: 20px; padding-left: 15px; border-left: 2px solid var(--line-color); margin-top: 10px; display: ${cfg.EnablePlaylist ? "block" : "none"};">
                        <div class="inputContainer">
                            <input is="emby-input" type="text" class="txtPlaylistName" label="Playlist Name" value="${playlistName}" placeholder="${labelName}" />
                            <div class="fieldDescription">Leave empty to use Display Name.</div>
                        </div>
                        <div style="margin-top:12px;">
                            <p style="margin:0 0 8px 0; font-size:0.9em; font-weight:bold; opacity:0.7;">Target Users</p>
                            <div class="playlist-user-list"><em style="opacity:0.5">Loading users...</em></div>
                        </div>
                    </div>
                </div>

                <div class="tab-content advanced-tab" style="display:none;">
                    <div class="inputContainer">
                        <p style="margin:0 0 5px 0; font-size:0.9em; font-weight:bold; opacity:0.7;">Blacklist / Ignore (IMDB IDs)</p>
                        <textarea class="txtTagBlacklist" rows="2" placeholder="tt1234567&#10;tt9876543" style="width:100%;resize:none;overflow:hidden;padding:6px 8px;font-size:inherit;font-family:inherit;background:var(--plugin-input-bg,rgba(255,255,255,0.08));border:1px solid var(--plugin-input-border,rgba(255,255,255,0.2));border-radius:3px;color:inherit;line-height:1.4;min-height:44px;max-height:120px;overflow-y:auto;">${blacklist}</textarea>
                        <div class="fieldDescription">Items with these IDs will never be tagged or added to collection.</div>
                    </div>
                </div>

                <div class="tab-content homescreen-tab" style="display:none;"
                    data-hse-libraryid="${homeSectionLibraryId}"
                    data-hse-userids="${homeSectionUserIdsEnc}"
                    data-hse-settings="${homeSectionSettingsEnc}"
                    data-hse-tracked="${homeSectionTrackedEnc}"
                    data-hse-default-type="${hsDefaultSectionType}"
                    data-hse-loaded="0">
                    <div class="checkboxContainer checkboxContainer-withDescription">
                        <label>
                            <input is="emby-checkbox" class="chkEnableHomeSection" type="checkbox" ${enableHomeSection} ${disableHomeSection}/>
                            <span>Add as home screen section</span>
                        </label>
                        <div class="fieldDescription">A home screen section will be managed for selected users each time sync runs.</div>
                        <div class="hse-disabled-hint" style="font-size:0.9em; color:#e07070; margin-top:4px; display:${cfg.EnableTag === false && !cfg.EnableCollection && !_hseAllowedWithoutOutput ? "block" : "none"};">Requires <strong>Apply Tag</strong>, <strong>Create Collection</strong>, or a current-user filter (Smart playlist) to be enabled.</div>
                    </div>
                    <div class="hse-details" style="display:${enableHomeSection ? "block" : "none"}; margin-top:15px;">
                        <div style="margin-bottom:15px;">
                            <p style="margin:0 0 8px 0; font-size:0.9em; font-weight:bold; opacity:0.7;">Target Users</p>
                            <div class="hse-user-list-inner"><em style="opacity:0.5">Loading users...</em></div>
                        </div>
                        <div>
                            <p style="margin:0 0 8px 0; font-size:0.9em; font-weight:bold; opacity:0.7;">Section Settings</p>
                            <div class="hse-fields-inner"><em style="opacity:0.5">Loading settings...</em></div>
                        </div>
                    </div>
                </div>

                <div style="display:flex; justify-content:flex-end; align-items:center; gap:8px; margin-top:20px; border-top:1px solid var(--line-color); padding-top:10px;">
                    <button is="emby-button" type="button" class="raised button-submit btnRunEntry" style="background:#0099d5 !important; color:#fff !important;"><i class="md-icon" style="margin-right:5px;">play_arrow</i><span class="btnRunEntryLabel">Run Group</span></button>
                    <button is="emby-button" type="button" class="raised btnRemoveGroup" style="background:#cc3333 !important; color:#fff;"><i class="md-icon" style="margin-right:5px;">delete</i>Remove Group</button>
                </div>
            </div>
        </div>`;
      return html;
    }
    function refreshTopListBadges(topListTagNames) {
      document.querySelectorAll(".tag-row").forEach((row) => {
        const container = row.querySelector(".badge-container");
        if (!container) return;
        const tagName = (row.dataset.tag || "").toLowerCase();
        const existing = container.querySelector(".tag-indicator.toplist");
        if (topListTagNames.has(tagName)) {
          if (!existing) {
            const span = document.createElement("span");
            span.className = "tag-indicator toplist";
            span.innerHTML = '<i class="md-icon" style="font-size:1.1em;">format_list_numbered</i> Top-List';
            container.appendChild(span);
          }
        } else if (existing) {
          existing.remove();
        }
      });
    }

    function buildHomeSectionFormHtml(savedSettings, defaultSectionType, defaultName, tagEnabled, collEnabled, libraryOptions, savedLibraryId, allLibraries, viewerOnly) {
      const s = savedSettings || {};
      let html = "";
      const st = s.SectionType || defaultSectionType;
      html += '<div style="margin-bottom:12px;"><label class="selectLabel">Section Type</label>';
      html += '<select is="emby-select" class="selHseSectionType hse-field-str" data-field="SectionType" style="width:100%;">';
      const sectionTypeOptions = [];
      if (collEnabled) sectionTypeOptions.push(["boxset", "Single Collection"]);
      if (tagEnabled) sectionTypeOptions.push(["items", "Dynamic Media (tag)"]);
      else if (viewerOnly) sectionTypeOptions.push(["items", "Dynamic Media (per user)"]);
      sectionTypeOptions.forEach((o) => {
        html += '<option value="' + o[0] + '"' + (st === o[0] ? " selected" : "") + ">" + o[1] + "</option>";
      });
      html += "</select></div>";
      const displayModeVal = s.DisplayMode || "";
      html += '<div style="margin-bottom:12px;"><label class="selectLabel">Show this section</label>';
      html += '<select is="emby-select" class="hse-field-str" data-field="DisplayMode" style="width:100%;">';
      html += '<option value=""' + (displayModeVal === "" ? " selected" : "") + ">Always</option>";
      html += '<option value="tv"' + (displayModeVal === "tv" ? " selected" : "") + ">When TV Display Mode is on</option>";
      html += '<option value="mobile,desktop"' + (displayModeVal === "mobile,desktop" ? " selected" : "") + ">When TV Display Mode is off</option>";
      html += "</select></div>";
      let savedItemTypes = [];
      try {
        savedItemTypes = JSON.parse(s.ItemTypes || "[]");
      } catch {
      }
      const savedItemTypesStr = savedItemTypes.length > 0 ? savedItemTypes.join(",") : "Movie,Series";
      html += '<div class="hse-items-only" style="margin-bottom:12px;"><label class="selectLabel">Media Type</label>';
      html += '<select is="emby-select" class="selHseItemTypes" style="width:100%;">';
      const itemTypeOptions = [
        ["Movie", "Movies"],
        ["Series", "Shows"],
        ["Movie,Series", "Movies & Shows"],
        ["Episode", "Episodes"],
        ["BoxSet", "Collections"],
        ["MusicVideo", "Music Videos"],
        ["Video", "Videos"],
        ["Photo", "Photos"],
        ["Program", "Programs"],
        ["TvChannel", "Live TV Channels"],
        ["MusicAlbum", "Music Albums"],
        ["MusicArtist", "Artists"],
        ["Audio", "Songs"],
        ["AudioBook", "Audiobooks"],
        ["Trailer", "Trailers"],
        ["Game", "Games"],
        ["Book", "Books"]
      ];
      itemTypeOptions.forEach((o) => {
        html += '<option value="' + o[0] + '"' + (savedItemTypesStr === o[0] ? " selected" : "") + ">" + o[1] + "</option>";
      });
      html += "</select></div>";
      const customName = (s.CustomName || "").replace(/"/g, "&quot;");
      const customNamePlaceholder = (defaultName || "").replace(/"/g, "&quot;");
      html += '<div style="margin-bottom:12px;"><input is="emby-input" type="text" class="hse-field-str" data-field="CustomName" label="Custom Title" value="' + customName + '" placeholder="' + customNamePlaceholder + '"/></div>';
      const viewTypeVal = (s.ViewType === "cards" ? "" : s.ViewType) || "";
      html += '<div class="hse-items-only" style="margin-bottom:12px;"><label class="selectLabel">View Type</label>';
      html += '<select is="emby-select" class="selHseViewType hse-field-str" data-field="ViewType" style="width:100%;">';
      [["", "Cards (default)"], ["spotlight", "Spotlight"]].forEach((o) => {
        html += '<option value="' + o[0] + '"' + (viewTypeVal === o[0] ? " selected" : "") + ">" + o[1] + "</option>";
      });
      html += "</select></div>";
      const imgTypeVal = s.ImageType || "";
      const imgTypeDisabled = viewTypeVal === "spotlight";
      html += '<div style="margin-bottom:12px;"><label class="selectLabel">Image Type</label>';
      html += '<select is="emby-select" class="selHseImageType hse-field-str" data-field="ImageType" style="width:100%;"' + (imgTypeDisabled ? " disabled" : "") + '><option value=""' + (imgTypeVal === "" ? " selected" : "") + ">Auto</option>";
      ["Primary", "Thumb"].forEach((o) => {
        html += '<option value="' + o + '"' + (imgTypeVal === o ? " selected" : "") + ">" + o + "</option>";
      });
      html += "</select></div>";
      const sortByVal = s.SortBy || "";
      html += '<div style="margin-bottom:12px;"><label class="selectLabel">Sort By</label>';
      html += '<select is="emby-select" class="hse-field-str" data-field="SortBy" style="width:100%;">';
      html += '<option value=""' + (sortByVal === "" ? " selected" : "") + ">(Default)</option>";
      [
        ["CommunityRating,SortName", "Rating"],
        ["DateCreated,SortName", "Date Added"],
        ["SortName", "Name"],
        ["Runtime,SortName", "Runtime"],
        ["ProductionYear,PremiereDate,SortName", "Release Date"],
        ["ProductionYear,SortName", "Year"],
        ["DatePlayed,SortName", "Last Played (per user)"],
        ["Random", "Random"]
      ].forEach((o) => {
        html += '<option value="' + o[0] + '"' + (sortByVal === o[0] ? " selected" : "") + ">" + o[1] + "</option>";
      });
      html += "</select></div>";
      const sortOrderVal = s.SortOrder || "";
      html += '<div style="margin-bottom:12px;"><label class="selectLabel">Sort Order</label>';
      html += '<select is="emby-select" class="hse-field-str" data-field="SortOrder" style="width:100%;">';
      html += '<option value=""' + (sortOrderVal === "" ? " selected" : "") + ">(Default)</option>";
      [["Ascending", "Ascending"], ["Descending", "Descending"]].forEach((o) => {
        html += '<option value="' + o[0] + '"' + (sortOrderVal === o[0] ? " selected" : "") + ">" + o[1] + "</option>";
      });
      html += "</select></div>";
      const dispModeVal = s.ScrollDirection || "";
      html += '<div style="margin-bottom:12px;"><label class="selectLabel">Scroll Direction</label>';
      html += '<select is="emby-select" class="hse-field-str" data-field="ScrollDirection" style="width:100%;"><option value="">(Auto)</option>';
      [["Horizontal", "Horizontal"], ["Vertical", "Vertical"]].forEach((o) => {
        html += '<option value="' + o[0] + '"' + (dispModeVal === o[0] ? " selected" : "") + ">" + o[1] + "</option>";
      });
      html += "</select></div>";
      let playstateVal = "";
      if (s._queryIsResumable === "true") playstateVal = "inprogress";
      else if (s._queryIsPlayed === "true") playstateVal = "played";
      else if (s._queryIsPlayed === "false") playstateVal = "unplayed";
      html += '<div class="hse-items-only" style="margin-bottom:12px;"><label class="selectLabel">Playstate (per user)</label>';
      html += '<select is="emby-select" class="hse-field-str" data-field="_hsePlaystate" style="width:100%;">';
      html += '<option value=""' + (playstateVal === "" ? " selected" : "") + ">Any</option>";
      [["played", "Played"], ["unplayed", "Unplayed"], ["inprogress", "In progress (started, not finished)"]].forEach((o) => {
        html += '<option value="' + o[0] + '"' + (playstateVal === o[0] ? " selected" : "") + ">" + o[1] + "</option>";
      });
      html += "</select></div>";
      const curLibId = savedLibraryId || "auto";
      html += '<select class="selHseLibrary" style="display:none;">';
      html += '<option value="auto"' + (curLibId === "auto" ? " selected" : "") + ">auto</option>";
      (libraryOptions || []).forEach((lib) => {
        html += '<option value="' + lib.id + '"' + (curLibId === lib.id ? " selected" : "") + ">" + lib.name + "</option>";
      });
      html += "</select>";
      if (st !== "boxset" && (allLibraries || []).length > 0) {
        const excludedIds = /* @__PURE__ */ new Set();
        try {
          const raw = (s._queryExcludeViewIds || "").split(",").map((x) => x.trim()).filter((x) => x.length > 0);
          raw.forEach((id) => {
            excludedIds.add(id);
          });
        } catch {
        }
        if (excludedIds.size === 0) {
          (allLibraries || []).forEach((lib) => {
            if (lib.isTopList) excludedIds.add(lib.id);
          });
        }
        html += '<div style="display:none;">';
        (allLibraries || []).forEach((lib) => {
          const isChecked = !excludedIds.has(lib.id);
          html += '<input type="checkbox" class="chkHseLibrary" value="' + lib.id + '"' + (isChecked ? " checked" : "") + "/>";
        });
        html += "</div>";
      }
      return html;
    }
    function updateHseItemsOnlyVisibility(tab) {
      const stSel = tab.querySelector(".selHseSectionType");
      const isItems = !stSel || stSel.value !== "boxset";
      tab.querySelectorAll(".hse-items-only").forEach((el) => {
        el.style.display = isItems ? "" : "none";
      });
    }
    function updateHseImageTypeState(tab) {
      const stSel = tab.querySelector(".selHseSectionType");
      const vtSel = tab.querySelector(".selHseViewType");
      const imgSel = tab.querySelector(".selHseImageType");
      if (!imgSel) return;
      const isItems = !stSel || stSel.value !== "boxset";
      const isCards = !vtSel || vtSel.value === "" || vtSel.value === "cards";
      imgSel.disabled = isItems && !isCards;
    }
    function wireHomeSectionTypeChange(tab) {
      const stSel = tab.querySelector(".selHseSectionType");
      if (!stSel) return;
      updateHseItemsOnlyVisibility(tab);
      updateHseImageTypeState(tab);
      stSel.addEventListener("change", () => {
        updateHseItemsOnlyVisibility(tab);
        updateHseImageTypeState(tab);
      });
      const vtSel = tab.querySelector(".selHseViewType");
      if (vtSel) {
        vtSel.addEventListener("change", () => {
          updateHseImageTypeState(tab);
        });
      }
    }
    function tagConfigHasViewerCriteria(tagConfig) {
      if (!tagConfig) return false;
      const filters = tagConfig.MediaInfoFilters && tagConfig.MediaInfoFilters.length > 0 ? tagConfig.MediaInfoFilters : tagConfig.MediaInfoConditions && tagConfig.MediaInfoConditions.length > 0 ? [{ Criteria: tagConfig.MediaInfoConditions }] : [];
      let found = false;
      filters.forEach((f) => {
        (f.Criteria || []).forEach((c) => {
          const raw = String(c);
          const s = raw.charAt(0) === "!" ? raw.slice(1) : raw;
          if (s === "InProgress" || s.indexOf(":__current__:") >= 0) found = true;
        });
      });
      return found;
    }
    function rowHasViewerCriteria(row) {
      let found = false;
      row.querySelectorAll(".mi-rule").forEach((rule) => {
        const propEl = rule.querySelector(".selMiProperty");
        const prop = propEl?.value || "";
        const selUserEl = rule.querySelector(".selMiUser");
        if (prop === "InProgress" || selUserEl && selUserEl.value === "__current__") found = true;
      });
      return found;
    }
    function syncHomeSectionFromEmby(tab, deps) {
      const tracked = [];
      try {
        tracked.push(...JSON.parse(decodeURIComponent(tab.dataset.hseTracked || "%5B%5D")));
      } catch {
      }
      const entry = tracked.find((t) => t.SectionId && !t.SectionId.startsWith("hsc__"));
      if (!entry || !entry.UserId) return Promise.resolve();
      const syncHeaders = {};
      const syncToken = deps.getApiClient().accessToken();
      if (syncToken) syncHeaders["X-Emby-Token"] = syncToken;
      const syncUrl = deps.getApiClient().getUrl("HomeScreenCompanion/Hsc/UserSections", { UserId: entry.UserId });
      return deps.fetch(syncUrl, { headers: syncHeaders }).then((r) => r.json()).then((data) => {
        const payload = data && typeof data === "object" ? data : null;
        const sections = payload?.Sections || [];
        const section = sections.find((s) => s && s["Id"] === entry.SectionId);
        if (!section) return;
        const query = section["Query"] && typeof section["Query"] === "object" ? section["Query"] : null;
        const sd = section["ScrollDirection"];
        const fieldMap = {
          SectionType: String(section["SectionType"] || ""),
          CustomName: String(section["CustomName"] || ""),
          DisplayMode: String(section["DisplayMode"] || ""),
          ViewType: String(section["ViewType"] || ""),
          ImageType: String(section["ImageType"] || ""),
          SortBy: String(section["SortBy"] || ""),
          SortOrder: String(section["SortOrder"] || ""),
          ScrollDirection: sd === null || sd === void 0 ? "" : typeof sd === "number" ? sd === 0 ? "Horizontal" : sd === 1 ? "Vertical" : "" : String(sd),
          _hsePlaystate: query?.IsResumable === true ? "inprogress" : query?.IsPlayed === true ? "played" : query?.IsUnplayed === true || query?.IsPlayed === false ? "unplayed" : ""
        };
        Object.keys(fieldMap).forEach((field) => {
          const el = tab.querySelector(`[data-field="${field}"]`);
          if (!el) return;
          const val = fieldMap[field];
          if (el.tagName === "SELECT") {
            const sel = el;
            for (let i = 0; i < sel.options.length; i++) {
              if (sel.options[i].value === val) {
                sel.selectedIndex = i;
                break;
              }
            }
          } else {
            el.value = val;
          }
        });
        const itemTypesSel = tab.querySelector(".selHseItemTypes");
        if (itemTypesSel && Array.isArray(section["ItemTypes"]) && section["ItemTypes"].length > 0) {
          const itemTypesStr = section["ItemTypes"].map(String).join(",");
          for (let i = 0; i < itemTypesSel.options.length; i++) {
            if (itemTypesSel.options[i].value === itemTypesStr) {
              itemTypesSel.options[i].selected = true;
              break;
            }
          }
        }
        if (Array.isArray(section["ExcludedFolders"])) {
          const embyExcluded = new Set(section["ExcludedFolders"].map((id) => String(id)));
          tab.querySelectorAll(".chkHseLibrary").forEach((chk) => {
            chk.checked = !embyExcluded.has(chk.value);
          });
        }
        updateHseItemsOnlyVisibility(tab);
        updateHseImageTypeState(tab);
      }).catch(() => void 0);
    }
    function initPlaylistTab(row, deps) {
      const tab = row.querySelector(".playlist-tab");
      if (!tab || tab.dataset.plLoaded === "1") return;
      tab.dataset.plLoaded = "1";
      let savedUserIds = [];
      try {
        savedUserIds = JSON.parse(decodeURIComponent(tab.dataset.plUserids || "%5B%5D"));
      } catch {
      }
      deps.getHseUsers().then((users) => {
        const listEl = tab.querySelector(".playlist-user-list");
        if (!listEl) return;
        listEl.innerHTML = deps.buildUserMultiSelectHtml(users, savedUserIds, "chkPlaylistUser");
        deps.wireUserMultiSelect(listEl);
      });
    }
    function initHomeSectionTab(row, deps) {
      const tab = row.querySelector(".homescreen-tab");
      if (!tab || tab.dataset.hseLoaded === "1") return;
      tab.dataset.hseLoaded = "loading";
      let savedUserIds = [];
      let savedSettings = {};
      try {
        savedUserIds = JSON.parse(decodeURIComponent(tab.dataset.hseUserids || "%5B%5D"));
      } catch {
      }
      try {
        savedSettings = JSON.parse(decodeURIComponent(tab.dataset.hseSettings || "%7B%7D"));
      } catch {
      }
      const defaultSectionType = tab.dataset.hseDefaultType || "items";
      const savedLibraryId = decodeURIComponent(tab.dataset.hseLibraryid || "auto");
      Promise.all([deps.getHseUsers(), deps.preFetchLibraryData()]).then((results) => {
        const users = results[0];
        const libData = results[1] && typeof results[1] === "object" ? results[1] : { topListFolderNames: /* @__PURE__ */ new Set(), virtualFolders: [] };
        const topListFolderNames = libData.topListFolderNames;
        const virtualFolders = libData.virtualFolders || [];
        const libraryOptions = virtualFolders.filter((f) => !(f.Locations || []).some((loc) => {
          const parts = loc.replace(/\\/g, "/").split("/");
          const folderName = parts[parts.length - 1] || parts[parts.length - 2] || "";
          return topListFolderNames.has(folderName.toLowerCase());
        })).map((f) => ({ id: f.ItemId, name: f.Name }));
        const allLibraries = virtualFolders.map((f) => {
          const isTopList = (f.Locations || []).some((loc) => {
            const parts = loc.replace(/\\/g, "/").split("/");
            const folderName = parts[parts.length - 1] || parts[parts.length - 2] || "";
            return topListFolderNames.has(folderName.toLowerCase());
          });
          return { id: f.ItemId, name: f.Name, isTopList };
        });
        const userListEl = tab.querySelector(".hse-user-list-inner");
        if (userListEl) {
          userListEl.innerHTML = deps.buildUserMultiSelectHtml(users, savedUserIds, "chkHseUser");
          deps.wireUserMultiSelect(userListEl);
        }
        const entryLabelEl = row.querySelector(".txtEntryLabel");
        const tagNameEl = row.querySelector(".txtTagName");
        const defaultTagName = entryLabelEl?.value || tagNameEl?.value || "";
        const tagEnabled = !!row.querySelector(".chkEnableTag")?.checked;
        const collEnabled = !!row.querySelector(".chkEnableCollection")?.checked;
        const selSourceType = row.querySelector(".selSourceType");
        const viewerOnly = (selSourceType?.value || "") === "MediaInfo" && rowHasViewerCriteria(row);
        const hseView = document.querySelector("#HomeScreenCompanionConfigPage");
        const originalSnapshot = deps.originalConfigState.getOriginalConfigState();
        let wasAlreadyDirty = false;
        if (hseView && originalSnapshot) {
          try {
            wasAlreadyDirty = JSON.stringify(deps.getUiConfig(hseView, true)) !== originalSnapshot;
          } catch {
          }
        }
        const fieldsEl = tab.querySelector(".hse-fields-inner");
        if (fieldsEl) {
          fieldsEl.innerHTML = buildHomeSectionFormHtml(
            savedSettings,
            defaultSectionType,
            defaultTagName,
            tagEnabled,
            collEnabled,
            libraryOptions,
            savedLibraryId,
            allLibraries,
            viewerOnly
          );
        }
        wireHomeSectionTypeChange(tab);
        tab.dataset.hseLoaded = "1";
        deps.syncHomeSectionFromEmby(tab, {
          fetch: typeof fetch !== "undefined" ? fetch.bind(globalThis) : () => Promise.reject(new Error("fetch unavailable")),
          getApiClient: () => {
            const ac = typeof window !== "undefined" ? window.ApiClient : void 0;
            if (ac) return ac;
            return {
              accessToken: () => "",
              getUrl: (_name, _params) => "",
              getJSON: () => Promise.resolve({})
            };
          }
        }).then(() => {
          if (!wasAlreadyDirty && hseView && deps.originalConfigState.getOriginalConfigState()) {
            try {
              deps.originalConfigState.setOriginalConfigState(
                JSON.stringify(deps.getUiConfig(hseView, true))
              );
            } catch {
            }
          }
          setTimeout(deps.checkFormState, 0);
        });
      }).catch((e) => {
        const fieldsEl = tab.querySelector(".hse-fields-inner");
        if (fieldsEl) {
          const message = e instanceof Error ? e.message : String(e);
          fieldsEl.innerHTML = '<em style="color:#cc4444">Failed to load: ' + message + "</em>";
        }
        tab.dataset.hseLoaded = "0";
      });
    }
    function updateHseSectionAvailability(row, deps) {
      const tagEnabled = !!row.querySelector(".chkEnableTag")?.checked;
      const collEnabled = !!row.querySelector(".chkEnableCollection")?.checked;
      const selSourceType = row.querySelector(".selSourceType");
      const isMediaInfo = (selSourceType?.value || "") === "MediaInfo";
      const viewerOnly = isMediaInfo && deps.rowHasViewerCriteria(row);
      const allowed = tagEnabled || collEnabled || viewerOnly;
      const hseCbx = row.querySelector(".chkEnableHomeSection");
      if (!hseCbx) return;
      const hint = row.querySelector(".hse-disabled-hint");
      if (!allowed) {
        hseCbx.disabled = true;
        hseCbx.checked = false;
        if (hint) hint.style.display = "block";
        const hseDetails = row.querySelector(".hse-details");
        if (hseDetails) hseDetails.style.display = "none";
        deps.updateBadges(row);
      } else {
        hseCbx.disabled = false;
        if (hint) hint.style.display = "none";
      }
      const tab = row.querySelector(".homescreen-tab");
      if (tab && tab.dataset.hseLoaded === "1") {
        deps.refreshHseSectionTypeOptions(tab, tagEnabled, collEnabled, viewerOnly);
      }
    }

    function fetchManageSections(view, userId, state, deps) {
      const container = view.querySelector("#hscManageContainer");
      if (!container) return;
      const listEl = container.querySelector("#manSectionList");
      if (!listEl) return;
      listEl.innerHTML = '<p class="textMuted" style="padding:10px 0;">Loading sections...</p>';
      const btnApply = container.querySelector("#btnApplyManage");
      btnApply.disabled = true;
      const headers = {};
      const token = deps.getApiClient().accessToken();
      if (token) headers["X-Emby-Token"] = token;
      deps.fetchFn(deps.getApiClient().getUrl("HomeScreenCompanion/Hsc/UserSections", { userId }), { headers }).then((r) => r.json()).then((result) => {
        const payload = result;
        state.sections = payload.Sections || [];
        deps.renderSections(view, state, deps);
      }).catch(() => {
        listEl.innerHTML = '<p class="textMuted" style="padding:10px 0;color:#cc3333;">Failed to load sections.</p>';
      });
    }
    function renderManageSections(view, state, deps) {
      const container = view.querySelector("#hscManageContainer");
      if (!container) return;
      const listEl = container.querySelector("#manSectionList");
      if (!listEl) return;
      const con = container;
      const list = listEl;
      if (state.sections.length === 0) {
        list.innerHTML = '<p class="textMuted" style="padding:10px 0;">No sections found for this user.</p>';
        return;
      }
      list.innerHTML = state.sections.map((s, i) => {
        const name = s.CustomName || s.Name || s.SectionType || "Section " + (i + 1);
        return [
          '<div class="man-section-row" draggable="false" data-section-index="' + i + '">',
          '<span class="drag-handle"><i class="md-icon">drag_indicator</i></span>',
          '<span style="flex-grow:1;">' + name + "</span>",
          '<button type="button" is="emby-button" class="man-btn-delete raised" data-section-index="' + i + '" title="Remove section">',
          '<i class="md-icon">delete</i>',
          "</button>"
        ].join("") + "</div>";
      }).join("");
      function applyDomOrder() {
        const domRows = Array.from(list.querySelectorAll(".man-section-row"));
        if (domRows.length > 0) {
          const snapshot = state.sections.slice();
          state.sections = domRows.map(
            (r) => snapshot[parseInt(r.dataset.sectionIndex ?? "", 10)]
          );
          domRows.forEach((r, pos) => {
            r.dataset.sectionIndex = String(pos);
            const delBtn = r.querySelector(".man-btn-delete");
            if (delBtn) delBtn.dataset.sectionIndex = String(pos);
          });
          const btnApply = con.querySelector("#btnApplyManage");
          if (btnApply) {
            btnApply.disabled = false;
            deps.checkFormState();
          }
        }
      }
      list.querySelectorAll(".man-section-row").forEach((row) => {
        const handle = row.querySelector(".drag-handle");
        handle.addEventListener("mousedown", () => {
          row.setAttribute("draggable", "true");
        });
        handle.addEventListener("mouseup", () => {
          row.setAttribute("draggable", "false");
        });
        handle.addEventListener(
          "touchstart",
          (e) => {
            e.preventDefault();
            row.classList.add("man-dragging");
            function onTouchMove(ev) {
              ev.preventDefault();
              const touch = ev.touches[0];
              const afterEl = deps.getManDragAfterElement(list, touch.clientY);
              let ph = list.querySelector(".sort-placeholder");
              if (!ph) {
                ph = document.createElement("div");
                ph.className = "sort-placeholder";
              }
              if (afterEl == null) {
                if (ph.nextElementSibling !== null) list.appendChild(ph);
              } else {
                if (ph.nextElementSibling !== afterEl) list.insertBefore(ph, afterEl);
              }
            }
            function onTouchEnd() {
              document.removeEventListener("touchmove", onTouchMove);
              document.removeEventListener("touchend", onTouchEnd);
              document.removeEventListener("touchcancel", onTouchCancel);
              row.classList.remove("man-dragging");
              const ph = list.querySelector(".sort-placeholder");
              if (ph) {
                list.insertBefore(row, ph);
                ph.remove();
              }
              applyDomOrder();
            }
            function onTouchCancel() {
              document.removeEventListener("touchmove", onTouchMove);
              document.removeEventListener("touchend", onTouchEnd);
              document.removeEventListener("touchcancel", onTouchCancel);
              row.classList.remove("man-dragging");
              const ph = list.querySelector(".sort-placeholder");
              if (ph) ph.remove();
            }
            document.addEventListener("touchmove", onTouchMove, { passive: false });
            document.addEventListener("touchend", onTouchEnd);
            document.addEventListener("touchcancel", onTouchCancel);
          },
          { passive: false }
        );
        row.addEventListener("dragstart", (e) => {
          row.classList.add("man-dragging");
          const dt = e.dataTransfer;
          dt.effectAllowed = "move";
          dt.setData("text/plain", "");
          setTimeout(() => {
            row.style.display = "none";
          }, 0);
        });
        row.addEventListener("dragend", () => {
          row.style.display = "";
          row.classList.remove("man-dragging");
          row.setAttribute("draggable", "false");
          const ph = list.querySelector(".sort-placeholder");
          if (ph) ph.remove();
          applyDomOrder();
        });
        const delBtn = row.querySelector(".man-btn-delete");
        delBtn.addEventListener("click", () => {
          state.sections.splice(parseInt(delBtn.dataset.sectionIndex ?? "", 10), 1);
          renderManageSections(view, state, deps);
          const btnApply = con.querySelector("#btnApplyManage");
          if (btnApply) {
            btnApply.disabled = false;
            deps.checkFormState();
          }
        });
      });
    }
    function applyManageSections(view, state, deps) {
      const container = view.querySelector("#hscManageContainer");
      if (!container) return;
      const selUser = container.querySelector("#selManageUser");
      const btnApply = container.querySelector("#btnApplyManage");
      if (!selUser || !selUser.value) return;
      btnApply.disabled = true;
      const btnSpan = btnApply.querySelector("span");
      const origText = btnSpan ? btnSpan.textContent : "";
      if (btnSpan) btnSpan.textContent = "Applying\u2026";
      const headers = { "Content-Type": "application/json" };
      const token = deps.getApiClient().accessToken();
      if (token) headers["X-Emby-Token"] = token;
      deps.fetchFn(deps.getApiClient().getUrl("HomeScreenCompanion/Hsc/UserSections"), {
        method: "POST",
        headers,
        body: JSON.stringify({ UserId: selUser.value, Sections: state.sections })
      }).then((r) => r.json()).then((result) => {
        if (btnSpan) btnSpan.textContent = origText;
        const payload = result;
        if (payload.Success) {
          deps.alert("Home screen layout saved successfully!");
        } else {
          deps.alert("Failed to save: " + (payload.Message || "Unknown error"));
          btnApply.disabled = false;
        }
      }).catch(() => {
        if (btnSpan) btnSpan.textContent = origText;
        deps.alert("Error applying changes. Check server logs.");
        btnApply.disabled = false;
      });
    }
    function loadHscManageTab(view, state, deps) {
      const container = view.querySelector("#hscManageContainer");
      if (!container) return;
      const selUser = container.querySelector("#hscManageUserSelect");
      const btnAdd = container.querySelector("#btnAddManSection");
      const btnApply = container.querySelector("#btnApplyManSections");
      const btnRefresh = container.querySelector("#btnRefreshManSections");
      if (!selUser || !btnAdd || !btnApply || !btnRefresh) return;
      const fetchSections = deps.fetchSections ?? fetchManageSections;
      const applySections = deps.applySections ?? applyManageSections;
      void deps.getHseUsers().then((raw) => {
        const users = (raw || []).slice();
        const userOptions = users.map((u) => '<option value="' + u.Id + '">' + u.Name + "</option>").join("");
        selUser.innerHTML = userOptions;
        selUser.dataset.originalOptions = JSON.stringify(users);
        selUser.addEventListener("change", () => {
          if (selUser.value) fetchSections(view, selUser.value, state, deps);
        });
        deps.renderSections(view, state, deps);
        btnAdd.addEventListener("click", () => {
          const name = deps.prompt("Section name:", "");
          if (name && name.trim()) {
            state.sections.push({ CustomName: name.trim(), SectionType: "Movies" });
            deps.renderSections(view, state, deps);
          }
        });
        btnApply.addEventListener("click", () => {
          applySections(view, state, deps);
        });
        btnRefresh.addEventListener("click", () => {
          if (selUser.value) fetchSections(view, selUser.value, state, deps);
        });
      });
    }

    function loadHscUsers(view, deps) {
      const container = view.querySelector("#hscContainer");
      if (!container) return;
      const apiClient = typeof window !== "undefined" ? window.ApiClient : void 0;
      if (!apiClient) {
        container.innerHTML = '<p class="textMuted" style="padding:20px;">Failed to load users. ApiClient unavailable.</p>';
        return;
      }
      apiClient.getJSON(apiClient.getUrl("Users", { IsDisabled: false })).then((raw) => {
        const users = normalizeUsers(raw);
        deps.renderTab(container, deps.getConfig(), users);
        deps.enforceConflict(container);
        const enableChk = container.querySelector("#chkHscEnabled");
        if (enableChk) {
          enableChk.addEventListener("change", function() {
            const show = this.checked;
            const syncConfig = container.querySelector("#hscSyncConfig");
            const syncToCard = container.querySelector("#hscSyncToCard");
            if (syncConfig) syncConfig.style.display = show ? "" : "none";
            if (syncToCard) syncToCard.style.display = show ? "" : "none";
            setTimeout(deps.notifyFormChanged, 0);
          });
        }
        const sourceSelect = container.querySelector("#selHscSourceUser");
        if (sourceSelect) {
          sourceSelect.addEventListener("change", () => {
            deps.enforceConflict(container);
            setTimeout(deps.notifyFormChanged, 0);
          });
        }
        container.querySelectorAll(".hsc-target-chk").forEach((chk) => {
          chk.addEventListener("change", () => {
            deps.enforceConflict(container);
            setTimeout(deps.notifyFormChanged, 0);
          });
        });
        container.querySelectorAll("input:not(.hsc-target-chk), select:not(#selHscSourceUser)").forEach((el) => {
          el.addEventListener("change", () => setTimeout(deps.notifyFormChanged, 0));
          el.addEventListener("input", () => setTimeout(deps.notifyFormChanged, 0));
        });
      }).catch(() => {
        container.innerHTML = '<p class="textMuted" style="padding:20px;">Failed to load users. Check server connection.</p>';
      });
    }
    function normalizeUsers(raw) {
      if (Array.isArray(raw)) {
        return raw.filter(isUserLike);
      }
      if (raw && typeof raw === "object" && Array.isArray(raw.Items)) {
        return raw.Items.filter(isUserLike);
      }
      return [];
    }
    function isUserLike(v) {
      return typeof v === "object" && v !== null && typeof v.Id === "string" && typeof v.Name === "string";
    }

    function getHseUsers(deps) {
      if (deps.cache.users) return Promise.resolve(deps.cache.users);
      return deps.getApiClient().getJSON("Users", { IsDisabled: false }).then((resp) => {
        const raw = resp || [];
        const list = raw.map((u) => ({ Id: u.Id, Name: u.Name }));
        deps.cache.users = list;
        return list;
      });
    }
    function preFetchLibraryData(deps) {
      if (deps.cache.libraryPromise) return deps.cache.libraryPromise;
      const apiClient = deps.getApiClient();
      const token = apiClient.accessToken();
      const headers = { "X-MediaBrowser-Token": token };
      deps.cache.libraryPromise = Promise.all([
        fetch(apiClient.getUrl("HomeScreenCompanion/TopList/List"), { headers }).then((r) => r.json()).catch(() => ({ FolderNames: [] })),
        fetch(apiClient.getUrl("Library/VirtualFolders"), { headers }).then((r) => r.json()).catch(() => [])
      ]).then((results) => {
        const first = results[0];
        const second = results[1];
        return {
          topListFolderNames: new Set((first?.FolderNames || []).map((n) => n.toLowerCase())),
          virtualFolders: second || []
        };
      }).catch(() => {
        deps.cache.libraryPromise = null;
        return { topListFolderNames: /* @__PURE__ */ new Set(), virtualFolders: [] };
      });
      return deps.cache.libraryPromise;
    }
    function escAttr$1(s) {
      return String(s || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    }
    function escHtml$1(s) {
      return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
    function buildUserMultiSelectHtml(users, selectedIds, checkboxClass) {
      if (!users || users.length === 0) {
        return '<em style="opacity:0.5">No users found</em>';
      }
      const sel = selectedIds || [];
      const rows = users.map((u) => {
        const chk = sel.indexOf(u.Id) !== -1 ? " checked" : "";
        return '<div class="checkboxContainer" style="margin:2px 0;"><label><input type="checkbox" is="emby-checkbox" class="' + escAttr$1(checkboxClass) + '" value="' + escAttr$1(u.Id) + '" data-name="' + escAttr$1(u.Name) + '"' + chk + "><span>" + escHtml$1(u.Name) + "</span></label></div>";
      }).join("");
      const checkedNames = users.filter((u) => sel.indexOf(u.Id) !== -1).map((u) => u.Name);
      const lbl = checkedNames.length === 0 ? "No users selected" : checkedNames.length === users.length ? "All users" : checkedNames.join(", ");
      const btnStyle = "display:flex;align-items:center;width:100%;padding:6px 10px;background:var(--plugin-input-bg,rgba(128,128,128,0.08));border:1px solid var(--plugin-input-border,var(--line-color));border-radius:4px;font-size:0.9em;color:inherit;cursor:pointer;box-sizing:border-box;text-align:left;";
      return '<div class="filter-dropdown-wrapper hsc-user-dropdown" style="width:100%;"><button type="button" class="hsc-user-dropdown-btn" style="' + btnStyle + '"><span class="hsc-user-dropdown-label" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escHtml$1(lbl) + '</span><i class="md-icon hsc-user-dropdown-caret" style="font-size:1em;margin-left:6px;flex-shrink:0;">expand_more</i></button><div class="filter-dropdown-panel" style="min-width:220px;width:100%;box-sizing:border-box;">' + rows + "</div></div>";
    }
    function wireUserMultiSelect(container) {
      const wrapper = container && container.querySelector(".hsc-user-dropdown");
      if (!wrapper) return;
      const btn = wrapper.querySelector(".hsc-user-dropdown-btn");
      const panel = wrapper.querySelector(".filter-dropdown-panel");
      const lbl = wrapper.querySelector(".hsc-user-dropdown-label");
      const caret = wrapper.querySelector(".hsc-user-dropdown-caret");
      if (!btn || !panel || !lbl || !caret) return;
      function updateLabel() {
        const allBoxes = panel.querySelectorAll('input[type="checkbox"]');
        const checkedBoxes = panel.querySelectorAll('input[type="checkbox"]:checked');
        if (checkedBoxes.length === 0) {
          lbl.textContent = "No users selected";
        } else if (checkedBoxes.length === allBoxes.length) {
          lbl.textContent = "All users";
        } else {
          lbl.textContent = Array.from(checkedBoxes).map((cb) => cb.dataset.name || "").join(", ");
        }
      }
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const open = panel.classList.toggle("open");
        caret.textContent = open ? "expand_less" : "expand_more";
      });
      panel.querySelectorAll('input[type="checkbox"]').forEach((chk) => {
        chk.addEventListener("change", updateLabel);
      });
      document.addEventListener("click", function closeUserDrop(e) {
        if (!wrapper.isConnected) {
          document.removeEventListener("click", closeUserDrop);
          return;
        }
        const target = e.target;
        if (!target) return;
        if (!panel.contains(target) && target !== btn) {
          panel.classList.remove("open");
          caret.textContent = "expand_more";
        }
      });
    }

    const TIMESTAMP_PREFIX_RE = /^\[(\d{2}:\d{2}:\d{2})\] ?/;
    const DEBUG_PREFIX_RE = /^\[DEBUG\] ?/;
    const RULE_LINE_RE = /^=+$/;
    const SKIP_PREFIX_RE = /^\s{1,3}– /;
    const HEAD_PREFIX_RE = /^(»|Results$|Summary$|\[Cleanup\]$|\[\d+\/\d+\] |Home Screen (Companion|Sync) )/;
    function classifyLogLine(raw) {
      if (DEBUG_PREFIX_RE.test(raw)) return "log-debug";
      if (raw.trim() === "") return "log-blank";
      if (RULE_LINE_RE.test(raw.trim())) return "log-rule";
      if (raw.indexOf("\u2716") >= 0) return "log-err";
      if (raw.indexOf("\u26A0") >= 0) return "log-warn";
      if (raw.indexOf("\u2714") >= 0) return "log-ok";
      if (SKIP_PREFIX_RE.test(raw)) return "log-skip";
      if (HEAD_PREFIX_RE.test(raw)) return "log-head";
      return "";
    }
    function appendLogLine(frag, src, ts, raw, cls, showSrc) {
      const line = document.createElement("div");
      line.className = "log-line" + (cls ? " " + cls : "");
      if (cls !== "log-blank") {
        const tsEl = document.createElement("span");
        tsEl.className = "log-ts";
        tsEl.textContent = ts;
        line.appendChild(tsEl);
        if (showSrc) {
          const srcEl = document.createElement("span");
          srcEl.className = "log-src";
          srcEl.textContent = src;
          line.appendChild(srcEl);
        }
        line.appendChild(document.createTextNode(raw));
      } else {
        line.textContent = " ";
      }
      frag.appendChild(line);
    }
    function renderLogLines(container, entries, isRunning) {
      const stickToBottom = isRunning && container.scrollHeight - container.scrollTop - container.clientHeight < 40;
      const wasEmpty = container.childElementCount === 0;
      if (!entries.length) {
        container.textContent = "(no logs yet)";
        return;
      }
      const srcCount = {};
      for (const e of entries) srcCount[e.src] = 1;
      const showSrc = Object.keys(srcCount).length > 1;
      const frag = document.createDocumentFragment();
      for (const e of entries) {
        let raw = e.text || "";
        let ts = "";
        const m = raw.match(TIMESTAMP_PREFIX_RE);
        if (m) {
          ts = m[1] ?? "";
          raw = raw.substring(m[0].length);
        }
        let cls = "";
        if (DEBUG_PREFIX_RE.test(raw)) {
          cls = "log-debug";
          raw = raw.replace(DEBUG_PREFIX_RE, "");
        } else {
          cls = classifyLogLine(raw);
        }
        appendLogLine(frag, e.src, ts, raw, cls, showSrc);
      }
      container.textContent = "";
      container.appendChild(frag);
      if (stickToBottom || wasEmpty) container.scrollTop = container.scrollHeight;
    }
    const SORT_ROW_SELECTOR = ".tag-row";
    function sortRows(container, criteria) {
      const rows = Array.from(container.querySelectorAll(SORT_ROW_SELECTOR));
      rows.sort((a, b) => {
        if (criteria === "Name") {
          const aInput = a.querySelector(".txtEntryLabel") ?? a.querySelector(".txtTagName");
          const bInput = b.querySelector(".txtEntryLabel") ?? b.querySelector(".txtTagName");
          const na = (aInput?.value ?? "").toLowerCase();
          const nb = (bInput?.value ?? "").toLowerCase();
          return na.localeCompare(nb);
        }
        if (criteria === "Active") {
          const aa = a.querySelector(".chkTagActive")?.checked ? 1 : 0;
          const bb = b.querySelector(".chkTagActive")?.checked ? 1 : 0;
          return bb - aa;
        }
        if (criteria === "LatestEdited") {
          const da = new Date(a.dataset.lastModified || "0").getTime();
          const db = new Date(b.dataset.lastModified || "0").getTime();
          return db - da;
        }
        return parseInt(a.dataset.index ?? "0", 10) - parseInt(b.dataset.index ?? "0", 10);
      });
      for (const row of rows) container.appendChild(row);
      if (criteria !== "Manual") container.classList.add("sort-hidden");
      else container.classList.remove("sort-hidden");
    }
    function renderLogModal(view, deps) {
      const content = view.querySelector("#logContent");
      const tabs = view.querySelectorAll("#logTabs .log-tab");
      if (!content) return;
      const keys = ["sync", "hsc", "tl"];
      const ls = deps.state.lastStatus;
      function startedMs(k) {
        const s = ls[k];
        const t = s && s.StartedUtc ? Date.parse(s.StartedUtc) : NaN;
        return isNaN(t) ? 0 : t;
      }
      function running(k) {
        const s = ls[k];
        return !!(s && s.IsRunning);
      }
      function logs(k) {
        const s = ls[k];
        return s && s.Logs || [];
      }
      let selected = deps.state.logTab;
      if (!selected) {
        const runningKey = keys.find((k) => running(k));
        if (runningKey) {
          selected = runningKey;
        } else {
          let best = 0;
          keys.forEach((k) => {
            const ms = startedMs(k);
            if (ms > best) {
              best = ms;
              selected = k;
            }
          });
        }
        if (!selected) selected = "sync";
      }
      const finalSelected = selected;
      tabs.forEach((tab) => {
        const k = tab.getAttribute("data-log") ?? "";
        tab.classList.toggle("active", k === finalSelected);
        tab.classList.toggle("empty", logs(k).length === 0 && !running(k));
        const dot = tab.querySelector(".status-dot");
        if (dot) {
          dot.className = "status-dot";
          if (running(k)) dot.classList.add("running");
          dot.style.visibility = running(k) || logs(k).length ? "visible" : "hidden";
        }
        const timeEl = tab.querySelector(".log-tab-time");
        if (timeEl) {
          const ms = startedMs(k);
          timeEl.textContent = ms ? new Date(ms).toLocaleString(void 0, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
        }
      });
      const rawLogs = logs(finalSelected);
      const entries = rawLogs.map((l) => ({ src: finalSelected, text: String(l) }));
      if (!entries.length) {
        content.textContent = "(no runs yet)";
        return;
      }
      renderLogLines(content, entries, running(finalSelected));
    }
    function refreshStatus(view, deps) {
      const myId = ++deps.state.statusRequestId;
      const api = deps.getApiClient();
      Promise.all([
        api.getJSON("HomeScreenCompanion/Status"),
        api.getJSON("HomeScreenCompanion/Hsc/Status").catch(() => null),
        api.getJSON("HomeScreenCompanion/TopList/Status").catch(() => null)
      ]).then((results) => {
        if (myId !== deps.state.statusRequestId) return;
        const result = results[0];
        const hscResult = results[1];
        const tlResult = results[2];
        const label = view.querySelector("#lastRunStatusLabel");
        const dot = view.querySelector("#dotStatus");
        const content = view.querySelector("#logContent");
        const btnSave = view.querySelector(".btn-save");
        const btnRun = view.querySelector("#btnRunSync");
        const eitherRunning = !!(result && result.IsRunning) || !!(hscResult && hscResult.IsRunning);
        if (eitherRunning) {
          if (btnSave) {
            btnSave.disabled = true;
            btnSave.style.opacity = "0.5";
            const span = btnSave.querySelector("span");
            if (span) span.textContent = "Sync in progress...";
          }
          if (btnRun) btnRun.disabled = true;
        } else {
          if (btnRun) btnRun.disabled = false;
          if (btnSave) {
            const span = btnSave.querySelector("span");
            if (span) span.textContent = "Save Settings";
            deps.checkFormState();
          }
        }
        if (label) label.textContent = result && result.LastRunStatus || "Never";
        if (dot) {
          dot.className = "status-dot";
          const st = result && result.LastRunStatus || "";
          if (st.includes("Running")) dot.classList.add("running");
          else if (/failed|error/i.test(st)) dot.classList.add("failed");
          else if (/warning/i.test(st)) dot.classList.add("warn");
        }
        deps.state.lastStatus = { sync: result, hsc: hscResult, tl: tlResult };
        if (content) renderLogModal(view, deps);
      }).catch(() => {
        if (myId !== deps.state.statusRequestId) return;
      });
    }

    function executeTopListCreationSteps(tagName, displayName, selectedUserIds, displayMode, customName, imageType, maxItems, prepareResult, ui, onSuccess, deps) {
      const saveBtn = ui.saveBtn;
      const errEl = ui.errEl;
      const modal = ui.modal;
      const badgeStyle = ui.badgeStyle || "neutral";
      const tok = deps.getAccessToken();
      let snapshotId = null;
      let pendingLibraryId = null;
      saveBtn.innerHTML = 'Creating library <span class="tc-dot-loader"><span></span><span></span><span></span></span>';
      return deps.fetch(deps.getUrl("HomeScreenCompanion/TopList/SnapshotPolicies"), {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Emby-Token": tok },
        body: JSON.stringify({})
      }).then(function(r) {
        return r.json();
      }).then(function(result) {
        const snapshotResult = result;
        if (snapshotResult && snapshotResult.SnapshotId) {
          snapshotId = snapshotResult.SnapshotId;
          console.log("[HSC] Policy snapshot taken:", snapshotResult.UserCount, "users, id:", snapshotId);
        }
      }).catch(function() {
      }).then(function() {
        return deps.fetch(deps.getUrl("Library/VirtualFolders"), {
          headers: { "X-MediaBrowser-Token": tok }
        }).then(function(r) {
          return r.json();
        }).then(function(existingFoldersRaw) {
          function normLibPath(p) {
            return (p || "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
          }
          const existingFolders = existingFoldersRaw;
          const targetPath = normLibPath(prepareResult.FolderPath);
          const preCreationIds = new Set((existingFolders || []).map(function(f) {
            return f.ItemId;
          }).filter((id) => Boolean(id)));
          const alreadyExists = (existingFolders || []).some(function(f) {
            return (f.Locations || []).some(function(loc) {
              return normLibPath(loc) === targetPath;
            });
          });
          if (alreadyExists) {
            return { folders: existingFolders, preCreationIds: /* @__PURE__ */ new Set() };
          }
          return deps.fetch(deps.getUrl("Library/VirtualFolders"), {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Emby-Token": tok },
            body: JSON.stringify({
              Name: customName,
              CollectionType: "movies",
              RefreshLibrary: false,
              Paths: [prepareResult.FolderPath],
              LibraryOptions: {
                EnableInternetProviders: true,
                TypeOptions: [{
                  Type: "Movie",
                  MetadataFetchers: ["Nfo", "TheMovieDb", "TheTVDB"],
                  MetadataFetcherOrder: ["Nfo", "TheMovieDb", "TheTVDB"],
                  ImageFetchers: ["TheMovieDb", "TheTVDB"],
                  ImageFetcherOrder: ["TheMovieDb", "TheTVDB"]
                }]
              }
            })
          }).catch(function() {
          }).then(function() {
            return deps.fetch(deps.getUrl("Library/VirtualFolders"), {
              headers: { "X-MediaBrowser-Token": tok }
            }).then(function(r) {
              return r.json();
            });
          }).then(function(newFoldersRaw) {
            return { folders: newFoldersRaw, preCreationIds };
          });
        }).then(function(result) {
          saveBtn.innerHTML = 'Saving settings <span class="tc-dot-loader"><span></span><span></span><span></span></span>';
          const folders = result.folders;
          const preCreationIds = result.preCreationIds;
          function normLibPath2(p) {
            return (p || "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
          }
          const match = (folders || []).find(function(f) {
            return (f.Locations || []).some(function(loc) {
              return normLibPath2(loc) === normLibPath2(prepareResult.FolderPath);
            });
          });
          let newLibId = match && match.ItemId ? match.ItemId : null;
          if (!newLibId && preCreationIds.size > 0) {
            const diffMatch = (folders || []).find(function(f) {
              return f.ItemId && !preCreationIds.has(f.ItemId);
            });
            if (diffMatch && diffMatch.ItemId) newLibId = diffMatch.ItemId;
          }
          const userId = selectedUserIds[0];
          const viewsPromise = userId ? deps.fetch(deps.getUrl("Users/" + userId + "/Views"), { headers: { "X-MediaBrowser-Token": tok } }).then(function(r) {
            return r.json();
          }).catch(function() {
            return { Items: [] };
          }) : Promise.resolve({ Items: [] });
          return viewsPromise.then(function(viewsResultRaw) {
            const viewsResult = viewsResultRaw;
            const allViewIds = /* @__PURE__ */ new Set();
            (folders || []).forEach(function(f) {
              if (f.ItemId) allViewIds.add(f.ItemId);
            });
            (viewsResult && viewsResult.Items || []).forEach(function(v) {
              if (v.Id) allViewIds.add(v.Id);
            });
            const excludedViewIds = Array.from(allViewIds).filter(function(id) {
              return !newLibId || id !== newLibId;
            }).join(",");
            return { prepareResult, libraryItemId: newLibId, excludedViewIds };
          });
        }).then(function(ctx) {
          return deps.getPluginConfiguration().then(function(config) {
            const topLists = config.TopLists || [];
            const existing = topLists.find(function(t) {
              return (t.TagName || "").toLowerCase() === tagName.toLowerCase();
            });
            const hseSettings = JSON.stringify({
              SectionType: "items",
              DisplayMode: displayMode,
              CustomName: customName,
              MaxItems: String(maxItems),
              ViewType: "",
              ImageType: imageType,
              BadgeStyle: badgeStyle,
              SortBy: "SortName",
              SortOrder: "Ascending",
              ScrollDirection: "",
              ItemTypes: JSON.stringify(["Movie"]),
              _queryIsPlayed: "",
              _queryExcludeViewIds: ctx.excludedViewIds,
              ExcludedFolders: ctx.excludedViewIds
            });
            if (existing) {
              existing.HomeSectionUserIds = selectedUserIds;
              existing.HomeSectionLibraryId = ctx.libraryItemId || "auto";
              existing.HomeSectionSettings = hseSettings;
              existing.HomeSectionTracked = existing.HomeSectionTracked || [];
              existing.MaxItems = maxItems;
            } else {
              topLists.push({
                TagName: tagName,
                MaxItems: maxItems,
                HomeSectionUserIds: selectedUserIds,
                HomeSectionLibraryId: ctx.libraryItemId || "auto",
                HomeSectionSettings: hseSettings,
                HomeSectionTracked: []
              });
            }
            config.TopLists = topLists;
            return deps.updatePluginConfiguration(config).then(function() {
              return { prepareResult: ctx.prepareResult, libraryItemId: ctx.libraryItemId };
            });
          });
        }).then(function(ctx2) {
          if (ctx2.libraryItemId) pendingLibraryId = ctx2.libraryItemId;
          return ctx2;
        }).then(function(ctx2) {
          saveBtn.innerHTML = 'Creating home sections <span class="tc-dot-loader"><span></span><span></span><span></span></span>';
          const tok5 = deps.getAccessToken();
          return deps.fetch(deps.getUrl("HomeScreenCompanion/TopList/SyncHomeSections"), {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Emby-Token": tok5 },
            body: JSON.stringify({ TagName: tagName })
          }).then(function(r) {
            return r.json();
          }).then(function(syncResultRaw) {
            const syncResult = syncResultRaw;
            if (!syncResult.Success) throw new Error(syncResult.Message || "Failed to create home sections.");
            return ctx2;
          });
        }).then(function(ctx2) {
          if (ctx2.libraryItemId) {
            saveBtn.innerHTML = 'Scanning library <span class="tc-dot-loader"><span></span><span></span><span></span></span>';
            const tok6 = deps.getAccessToken();
            return deps.fetch(deps.getUrl("Items/" + ctx2.libraryItemId + "/Refresh") + "?Recursive=true&MetadataRefreshMode=Default&ImageRefreshMode=Default", {
              method: "POST",
              headers: { "X-MediaBrowser-Token": tok6 }
            }).catch(function() {
            }).then(function() {
              return ctx2.prepareResult;
            });
          }
          return ctx2.prepareResult;
        }).then(function(prepareResult2) {
          const tok7 = deps.getAccessToken();
          return deps.fetch(deps.getUrl("HomeScreenCompanion/TopList/SyncAllSections"), {
            method: "POST",
            headers: { "X-MediaBrowser-Token": tok7 }
          }).catch(function() {
          }).then(function() {
            return prepareResult2;
          });
        }).then(function(prepareResult2) {
          if (!pendingLibraryId) return prepareResult2;
          const tok8 = deps.getAccessToken();
          const libIdLower = pendingLibraryId.toLowerCase();
          return deps.fetch(deps.getUrl("Users"), {
            headers: { "X-MediaBrowser-Token": tok8 }
          }).then(function(r) {
            return r.json();
          }).then(function(usersRaw) {
            const users = usersRaw;
            return Promise.all((users || []).map(function(u) {
              if (u && u.Policy) return Promise.resolve(u);
              return deps.fetch(deps.getUrl("Users/" + u.Id), {
                headers: { "X-MediaBrowser-Token": tok8 }
              }).then(function(r) {
                return r.json();
              }).catch(function() {
                return u;
              });
            }));
          }).then(function(users) {
            const updates = (users || []).filter(function(u) {
              return !!u && !!u.Policy && !u.Policy.EnableAllFolders && selectedUserIds.some(function(id) {
                return id.toLowerCase() === (u.Id || "").toLowerCase();
              }) && !(u.Policy.EnabledFolders || []).some(function(f) {
                return (f || "").toLowerCase() === libIdLower;
              });
            }).map(function(u) {
              const pol = JSON.parse(JSON.stringify(u.Policy));
              pol.EnabledFolders = (u.Policy.EnabledFolders || []).concat([pendingLibraryId]);
              return deps.fetch(deps.getUrl("Users/" + u.Id + "/Policy"), {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-MediaBrowser-Token": tok8 },
                body: JSON.stringify(pol)
              }).catch(function() {
              });
            });
            return Promise.all(updates);
          }).catch(function() {
          }).then(function() {
            return prepareResult2;
          });
        }).then(function(prepareResult2) {
          deps.registerTopList(tagName.toLowerCase());
          if (typeof ui.closeHandler === "function") {
            ui.closeHandler();
            return;
          }
          const innerBox = ui.innerBox || modal.querySelector("div");
          innerBox.innerHTML = '<div style="text-align:center;padding:10px 0 20px;"><i class="md-icon" style="font-size:2.5em;color:#52B54B;display:block;margin-bottom:12px;">check_circle</i><p style="margin:0 0 6px;font-size:1.05em;font-weight:500;">Top-list created!</p><p style="margin:0;opacity:0.65;font-size:0.9em;">' + prepareResult2.FilesCreated + " movie" + (prepareResult2.FilesCreated !== 1 ? "s" : "") + ' included.</p><p style="margin:8px 0 0;opacity:0.5;font-size:0.82em;font-style:italic;">Finishing touches will continue in the background.</p></div><div style="display:flex;justify-content:center;padding-top:16px;border-top:1px solid var(--line-color);margin-top:20px;"><button type="button" class="btnTlmDone" style="cursor:pointer;border:none;background:#52B54B;color:#fff;border-radius:3px;padding:8px 22px;font-size:0.9em;font-weight:500;">Close</button></div>';
          innerBox.querySelector(".btnTlmDone").addEventListener("click", function() {
            if (typeof ui.closeHandler === "function") {
              ui.closeHandler();
            } else {
              modal.remove();
            }
          });
        }).catch(function(err) {
          saveBtn.disabled = false;
          saveBtn.innerHTML = '<i class="md-icon" style="font-size:1em;vertical-align:middle;margin-right:6px;">check</i>Save and apply';
          errEl.textContent = err.message || String(err);
          throw err;
        });
      });
    }

    const BACKUP_SECTIONS = [
      { key: "Settings", label: "General settings", desc: "AI models, system prompt, logging, dry run, preserve-on-empty." },
      { key: "ApiKeys", label: "API keys", desc: "Trakt, MDBList, TMDB, OpenAI, Gemini, Claude. Stored in plain text in the file." },
      { key: "Tags", label: "Tag & collection groups", desc: "All source groups incl. schedules, blacklists, filters, collection settings, home sections and playlists." },
      { key: "SavedFilters", label: "Saved media-info filters", desc: "Your saved filter presets." },
      { key: "TopLists", label: "Top lists", desc: "Top-list settings and the movie lists of manual top-lists." },
      { key: "HomeSync", label: "Home screen sync", desc: "Source user, target users and library-order sync." }
    ];
    function buildBackupModalShell() {
      const modal = document.createElement("div");
      modal.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.75);z-index:9999;display:flex;align-items:center;justify-content:center;";
      modal.renderBox = function(content) {
        modal.innerHTML = '<div style="background:var(--plugin-popup-bg,#2a2a2a);color:var(--plugin-popup-color,#e8e8e8);border:1px solid var(--plugin-popup-border,rgba(255,255,255,0.12));border-radius:8px;padding:28px;max-width:560px;width:90%;max-height:85vh;overflow-y:auto;">' + content + "</div>";
      };
      function onEsc(e) {
        if (e.key === "Escape") modal.close();
      }
      modal.close = function() {
        modal.remove();
        document.removeEventListener("keydown", onEsc);
      };
      document.addEventListener("keydown", onEsc);
      modal.addEventListener("click", function(e) {
        if (e.target === modal && !modal.dataset.busy) modal.close();
      });
      document.body.appendChild(modal);
      return modal;
    }
    function buildBackupSectionsHtml(available, chkClass) {
      return BACKUP_SECTIONS.map((s) => {
        const present = !available || available.has(s.key);
        const rowStyle = "display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid var(--line-color,rgba(255,255,255,0.08));" + (present ? "" : "opacity:0.45;");
        return '<label style="' + rowStyle + "cursor:" + (present ? "pointer" : "default") + ';"><input type="checkbox" class="' + chkClass + '" data-section="' + s.key + '"' + (present ? " checked" : " disabled") + ' style="margin-top:3px;" /><span style="flex:1;"><span style="display:block;font-weight:600;font-size:0.95em;">' + s.label + (present ? "" : ' <span style="font-weight:400;opacity:0.7;">(not in file)</span>') + '</span><span style="display:block;font-size:0.82em;opacity:0.65;margin-top:2px;">' + s.desc + "</span></span></label>";
      }).join("");
    }
    function readBackupSectionFlags(modal, chkClass) {
      const flags = {};
      const boxes = modal.querySelectorAll("." + chkClass);
      boxes.forEach((c) => {
        flags[c.dataset.section ?? ""] = !c.disabled && c.checked;
      });
      return flags;
    }
    function detectBackupSections(parsed) {
      const sections = /* @__PURE__ */ new Set();
      const info = { legacy: false, sections, createdUtc: "", pluginVersion: "" };
      if (parsed && typeof parsed === "object" && typeof parsed.BackupVersion === "number") {
        const p2 = parsed;
        (Array.isArray(p2.Sections) ? p2.Sections : []).forEach((s) => {
          if (typeof s === "string") sections.add(s);
        });
        info.createdUtc = typeof p2.CreatedUtc === "string" ? p2.CreatedUtc : "";
        info.pluginVersion = typeof p2.PluginVersion === "string" ? p2.PluginVersion : "";
        return info;
      }
      info.legacy = true;
      sections.add("Settings");
      sections.add("ApiKeys");
      const p = parsed && typeof parsed === "object" ? parsed : {};
      if (Array.isArray(p.Tags)) sections.add("Tags");
      if (Array.isArray(p.SavedFilters)) sections.add("SavedFilters");
      return info;
    }
    const BACKUP_BTN_PRIMARY = "cursor:pointer;border:none;background:#52B54B;color:#fff;border-radius:4px;padding:10px 26px;font-size:0.95em;font-weight:600;";
    const BACKUP_BTN_SECONDARY = "cursor:pointer;border:1px solid var(--line-color);background:transparent;color:var(--theme-text-primary);border-radius:3px;padding:8px 18px;font-size:0.9em;";
    const BACKUP_TITLE_STYLE = "margin:0 0 6px;font-size:1.15em;font-weight:600;";
    const BACKUP_HINT_STYLE = "font-size:0.88em;opacity:0.7;margin:0 0 14px;line-height:1.45;";
    function showBackupModal(deps) {
      const modal = buildBackupModalShell();
      modal.renderBox(
        '<h3 style="' + BACKUP_TITLE_STYLE + '">Download Backup</h3><p style="' + BACKUP_HINT_STYLE + '">Choose what to include. Only configuration is saved \u2013 tags, collections, playlists, top-list files and images are recreated by the plugin on the next sync run.</p><div style="margin-bottom:16px;">' + buildBackupSectionsHtml(null, "chkBackupSection") + '</div><div class="backup-error" style="color:#cc3333;font-size:0.85em;min-height:1.2em;margin-bottom:6px;"></div><div style="display:flex;gap:10px;justify-content:flex-end;align-items:center;"><button type="button" class="btnBackupCancel" style="' + BACKUP_BTN_SECONDARY + '">Cancel</button><button type="button" class="btnBackupDownload" style="' + BACKUP_BTN_PRIMARY + '"><i class="md-icon" style="font-size:1em;vertical-align:middle;margin-right:6px;">download</i>Download</button></div>'
      );
      const cancelBtn = modal.querySelector(".btnBackupCancel");
      const downloadBtn = modal.querySelector(".btnBackupDownload");
      const errEl = modal.querySelector(".backup-error");
      if (cancelBtn) cancelBtn.addEventListener("click", () => {
        modal.close();
      });
      if (downloadBtn) downloadBtn.addEventListener("click", function() {
        const btn = this;
        if (!errEl) return;
        const flags = readBackupSectionFlags(modal, "chkBackupSection");
        if (!Object.keys(flags).some((k) => flags[k])) {
          errEl.textContent = "Select at least one section.";
          return;
        }
        errEl.textContent = "";
        btn.disabled = true;
        btn.innerHTML = 'Preparing <span class="tc-dot-loader"><span></span><span></span><span></span></span>';
        modal.dataset.busy = "1";
        const api = deps.getApiClient();
        const tok = api.accessToken();
        deps.fetch(api.getUrl("HomeScreenCompanion/Backup/Export"), {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Emby-Token": tok },
          body: JSON.stringify(flags)
        }).then((r) => {
          if (!r.ok) throw new Error("Server returned " + r.status);
          return r.json();
        }).then((backup) => {
          const json = JSON.stringify(backup, null, 2);
          const blob = new Blob([json], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "HSC_Backup_" + (/* @__PURE__ */ new Date()).toISOString().split("T")[0] + ".json";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          modal.close();
        }).catch((err) => {
          delete modal.dataset.busy;
          btn.disabled = false;
          btn.innerHTML = '<i class="md-icon" style="font-size:1em;vertical-align:middle;margin-right:6px;">download</i>Download';
          errEl.textContent = "Backup failed: " + (err.message || String(err));
        });
      });
    }
    function showRestoreModal(rawText, onRestored, deps) {
      let parsed;
      try {
        parsed = JSON.parse(rawText);
      } catch (err) {
        deps.alert("Failed to parse configuration file. The file may be corrupt or not a valid backup file. Error: " + err.message);
        return;
      }
      if (!parsed || typeof parsed !== "object") {
        deps.alert("The selected file is not a Home Screen Companion backup.");
        return;
      }
      const info = detectBackupSections(parsed);
      const fileInfo = info.legacy ? "Legacy backup (created by an older plugin version)" : "Created " + (info.createdUtc ? new Date(info.createdUtc).toLocaleString() : "unknown") + (info.pluginVersion ? " \xB7 plugin v" + escapeHtml(info.pluginVersion) : "");
      const modal = buildBackupModalShell();
      modal.renderBox(
        '<h3 style="' + BACKUP_TITLE_STYLE + '">Restore Backup</h3><p style="' + BACKUP_HINT_STYLE + 'margin-bottom:6px;">' + fileInfo + '</p><p style="' + BACKUP_HINT_STYLE + '">Select what to restore. Each selected section <strong>replaces</strong> the current configuration on the server immediately. Sections you leave unchecked are not touched.</p><div style="margin-bottom:16px;">' + buildBackupSectionsHtml(info.sections, "chkRestoreSection") + '</div><div class="backup-error" style="color:#cc3333;font-size:0.85em;min-height:1.2em;margin-bottom:6px;"></div><div style="display:flex;gap:10px;justify-content:flex-end;align-items:center;"><button type="button" class="btnRestoreCancel" style="' + BACKUP_BTN_SECONDARY + '">Cancel</button><button type="button" class="btnRestoreApply" style="' + BACKUP_BTN_PRIMARY + '"><i class="md-icon" style="font-size:1em;vertical-align:middle;margin-right:6px;">upload</i>Restore</button></div>'
      );
      const cancelBtn = modal.querySelector(".btnRestoreCancel");
      const applyBtn = modal.querySelector(".btnRestoreApply");
      const errEl = modal.querySelector(".backup-error");
      if (cancelBtn) cancelBtn.addEventListener("click", () => {
        modal.close();
      });
      if (applyBtn) applyBtn.addEventListener("click", function() {
        const btn = this;
        if (!errEl) return;
        const flags = readBackupSectionFlags(modal, "chkRestoreSection");
        if (!Object.keys(flags).some((k) => flags[k])) {
          errEl.textContent = "Select at least one section.";
          return;
        }
        errEl.textContent = "";
        btn.disabled = true;
        btn.innerHTML = 'Restoring <span class="tc-dot-loader"><span></span><span></span><span></span></span>';
        modal.dataset.busy = "1";
        const body = Object.assign({ BackupJson: rawText }, flags);
        const api = deps.getApiClient();
        const tok = api.accessToken();
        deps.fetch(api.getUrl("HomeScreenCompanion/Backup/Import"), {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Emby-Token": tok },
          body: JSON.stringify(body)
        }).then((r) => {
          if (!r.ok) throw new Error("Server returned " + r.status);
          return r.json();
        }).then((raw) => {
          const result = raw && typeof raw === "object" ? raw : {};
          if (!result.Success) throw new Error(result.Message || "Unknown error");
          delete modal.dataset.busy;
          if (typeof onRestored === "function") onRestored();
          renderRestoreResult(modal, result, deps);
        }).catch((err) => {
          delete modal.dataset.busy;
          btn.disabled = false;
          btn.innerHTML = '<i class="md-icon" style="font-size:1em;vertical-align:middle;margin-right:6px;">upload</i>Restore';
          errEl.textContent = "Restore failed: " + (err.message || String(err));
        });
      });
    }
    function renderRestoreResult(modal, result, deps) {
      const pending = result.TopListsNeedingLibrary || [];
      const listStyle = "margin:0 0 14px;padding-left:20px;font-size:0.9em;line-height:1.5;";
      let html = '<div style="text-align:center;padding:4px 0 14px;"><i class="md-icon" style="font-size:2.5em;color:#52B54B;display:block;margin-bottom:8px;">check_circle</i><p style="margin:0;font-size:1.05em;font-weight:500;">Backup restored</p></div><span style="font-size:0.78em;font-weight:600;text-transform:uppercase;letter-spacing:0.4px;opacity:0.65;display:block;margin-bottom:4px;">Applied</span><ul style="' + listStyle + '">' + (result.Applied || []).map((a) => "<li>" + escapeHtml(a) + "</li>").join("") + "</ul>";
      if ((result.Warnings || []).length > 0) {
        html += '<span style="font-size:0.78em;font-weight:600;text-transform:uppercase;letter-spacing:0.4px;color:#e0a030;display:block;margin-bottom:4px;">Warnings</span><ul style="' + listStyle + 'opacity:0.85;">' + (result.Warnings || []).map((w) => "<li>" + escapeHtml(w) + "</li>").join("") + "</ul>";
      }
      if (pending.length > 0) {
        html += '<div style="border:1px solid rgba(224,160,48,0.5);background:rgba(224,160,48,0.08);border-radius:6px;padding:12px 14px;margin-bottom:14px;font-size:0.9em;line-height:1.5;"><strong>' + pending.length + " top-list" + (pending.length !== 1 ? "s" : "") + " need" + (pending.length === 1 ? "s" : "") + " an Emby library:</strong> " + pending.map((p) => escapeHtml(p.CustomName || p.TagName || "")).join(", ") + '.<br/>Their settings and files are restored, but no library exists for them on this server yet. Create them now (this creates the libraries, home sections and access rights exactly like <em>+ Create New</em>), or later by opening each list in the Top Lists tab and clicking Save.<div class="restore-tl-progress" style="margin-top:8px;font-size:0.88em;opacity:0.8;"></div></div>';
      }
      html += '<p style="' + BACKUP_HINT_STYLE + '">Run a sync afterwards to rebuild tags, collections, playlists and home sections from the restored configuration.</p><div style="display:flex;gap:10px;justify-content:flex-end;align-items:center;padding-top:14px;border-top:1px solid var(--line-color);">' + (pending.length > 0 ? '<button type="button" class="btnRestoreCreateLibs" style="' + BACKUP_BTN_PRIMARY + '"><i class="md-icon" style="font-size:1em;vertical-align:middle;margin-right:6px;">library_add</i>Create libraries now</button>' : "") + '<button type="button" class="btnRestoreDone" style="' + (pending.length > 0 ? BACKUP_BTN_SECONDARY : BACKUP_BTN_PRIMARY) + '">Close</button></div>';
      modal.renderBox(html);
      const doneBtn = modal.querySelector(".btnRestoreDone");
      if (doneBtn) doneBtn.addEventListener("click", () => {
        modal.close();
      });
      const createBtn = modal.querySelector(".btnRestoreCreateLibs");
      if (createBtn) {
        createBtn.addEventListener("click", function() {
          const btn = this;
          btn.disabled = true;
          const doneBtn2 = modal.querySelector(".btnRestoreDone");
          if (doneBtn2) doneBtn2.disabled = true;
          modal.dataset.busy = "1";
          const progressEl = modal.querySelector(".restore-tl-progress");
          const failures = [];
          const dummyBtn = document.createElement("button");
          const dummyErr = document.createElement("div");
          const dummyModal = document.createElement("div");
          const tlDeps = buildTopListCreationDeps(deps);
          pending.reduce((p, tl, idx) => {
            return p.then(() => {
              if (progressEl) progressEl.textContent = "Creating " + (idx + 1) + " of " + pending.length + ": " + (tl.CustomName || tl.TagName || "") + "\u2026";
              return new Promise((resolve, reject) => {
                executeTopListCreationSteps(
                  tl.TagName || "",
                  tl.CustomName || tl.TagName || "",
                  tl.UserIds || [],
                  tl.DisplayMode || "",
                  tl.CustomName || tl.TagName || "",
                  tl.ImageType || "",
                  tl.MaxItems || 0,
                  { FolderPath: tl.FolderPath || "", FilesCreated: 0 },
                  { saveBtn: dummyBtn, errEl: dummyErr, modal: dummyModal, badgeStyle: tl.BadgeStyle || "neutral", silent: true, closeHandler: resolve },
                  void 0,
                  tlDeps
                ).catch(reject);
              }).catch((err) => {
                failures.push((tl.CustomName || tl.TagName || "") + ": " + (err?.message || String(err)));
              });
            });
          }, Promise.resolve()).then(() => {
            delete modal.dataset.busy;
            const doneBtn3 = modal.querySelector(".btnRestoreDone");
            if (doneBtn3) doneBtn3.disabled = false;
            if (!progressEl) return;
            if (failures.length === 0) {
              progressEl.style.color = "#52B54B";
              progressEl.textContent = "All " + pending.length + " librar" + (pending.length === 1 ? "y" : "ies") + " created. Finishing touches continue in the background.";
              btn.style.display = "none";
            } else {
              progressEl.style.color = "#cc3333";
              progressEl.innerHTML = "Some libraries could not be created:<br/>" + failures.map(escapeHtml).join("<br/>");
              btn.disabled = false;
            }
            const tlContainer = document.querySelector("#tlContainer");
            if (tlContainer) tlContainer.dataset.loaded = "";
          });
        });
      }
    }
    function buildTopListCreationDeps(deps) {
      const api = deps.getApiClient();
      return {
        getUrl: (p) => api.getUrl(p),
        getAccessToken: () => api.accessToken(),
        getPluginConfiguration: () => api.getPluginConfiguration(deps.pluginId),
        updatePluginConfiguration: (cfg) => api.updatePluginConfiguration(deps.pluginId, cfg),
        fetch: deps.fetch,
        registerTopList: (tagNameLower) => {
          deps.state.topLists.tagNames.add(tagNameLower);
        }
      };
    }

    function loadTagManageTab(view, deps) {
      const container = view.querySelector("#tcManageContainer");
      if (!container) return;
      container.innerHTML = '<div style="padding:20px;color:var(--theme-text-secondary);display:flex;align-items:center;gap:10px;">Loading <span class="tc-dot-loader"><span></span><span></span><span></span></span></div>';
      const apiClient = deps.getApiClient();
      const token = apiClient.accessToken();
      let pendingTagDeletes = {};
      let pendingCollDeletes = {};
      const reload = () => {
        loadTagManageTab(view, deps);
      };
      Promise.all([
        deps.fetch(apiClient.getUrl("HomeScreenCompanion/Manage/Tags"), { headers: { "X-MediaBrowser-Token": token } }).then(function(r) {
          return r.json();
        }),
        deps.fetch(apiClient.getUrl("HomeScreenCompanion/Manage/Collections"), { headers: { "X-MediaBrowser-Token": token } }).then(function(r) {
          return r.json();
        }),
        apiClient.getPluginConfiguration(deps.pluginId).catch(function() {
          return { Tags: [] };
        })
      ]).then(function(results) {
        const tagsData = results[0];
        const collectionsData = results[1];
        const pluginConfig = results[2];
        const managedTagMap = {};
        const managedCollMap = {};
        const seenGroupByTag = {};
        (pluginConfig.Tags || []).forEach(function(t, idx) {
          if (!t.Tag) return;
          const tName = t.Tag.trim();
          const tKey = tName.toLowerCase();
          if (seenGroupByTag[tKey]) return;
          seenGroupByTag[tKey] = true;
          const groupLabel = t.Name && t.Name.trim() && t.Name.trim().toLowerCase() !== tKey ? t.Name.trim() : tName;
          const entry = { displayName: groupLabel, groupIndex: idx, groupActive: !!t.Active };
          if (!managedTagMap[tKey]) managedTagMap[tKey] = [];
          managedTagMap[tKey].push(entry);
          if (t.EnableCollection) {
            const cName = t.CollectionName && t.CollectionName.trim() ? t.CollectionName.trim() : tName;
            const cKey = cName.toLowerCase();
            if (!managedCollMap[cKey]) managedCollMap[cKey] = [];
            managedCollMap[cKey].push(entry);
          }
        });
        function escAttr(s) {
          return String(s || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;");
        }
        function escHtml(s) {
          return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        }
        const btnStyle = "cursor:pointer;border:none;border-radius:3px;padding:4px 12px;font-size:0.82em;font-weight:500;";
        function renderSection(title, items, isTagSection, headerExtra) {
          const sectionId = isTagSection ? "tcTagSection" : "tcCollSection";
          const rows = items.length === 0 ? '<div style="color:var(--theme-text-secondary);padding:8px 0;">No items found.</div>' : items.map(function(item) {
            const it = item;
            const id = it.Id || "";
            const name = it.Name || "";
            const count = it.ItemCount != null ? it.ItemCount : 0;
            const managed = isTagSection ? managedTagMap[name.toLowerCase()] : managedCollMap[name.toLowerCase()];
            const badge = managed && managed.length > 0 ? '<span style="font-size:0.75em;background:#52B54B22;color:#52B54B;border:1px solid #52B54B55;border-radius:4px;padding:1px 6px;margin-left:8px;white-space:nowrap;">Managed by HSC Plugin</span>' : "";
            const typesVal = isTagSection ? (it.ItemTypes || []).map(function(t) {
              return t.toLowerCase();
            }).join(",") : "";
            return '<tr class="tc-manage-row" data-rowname="' + escAttr(name.toLowerCase()) + '" data-managed="' + (managed && managed.length > 0 ? "1" : "0") + '" data-count="' + count + '" data-types="' + escAttr(typesVal) + '"><td style="padding:9px 4px;border-bottom:1px solid var(--line-color);width:100%;max-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + (id ? '<a class="tc-item-name tc-nav-link" href="javascript:void(0)" data-navid="' + escAttr(id) + `" style="color:inherit;text-decoration:none;cursor:pointer;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">` + escHtml(name) + "</a>" : '<span class="tc-item-name">' + escHtml(name) + "</span>") + badge + '</td><td style="padding:9px 4px 9px 16px;border-bottom:1px solid var(--line-color);white-space:nowrap;color:var(--theme-text-secondary);font-size:0.88em;">' + count + ' items</td><td style="padding:9px 4px 9px 8px;border-bottom:1px solid var(--line-color);white-space:nowrap;"><button type="button" class="btnTcMark" style="' + btnStyle + 'background:#cc3333;color:#fff;" data-id="' + escAttr(id) + '" data-name="' + escAttr(name) + '" data-count="' + count + '" data-type="' + (isTagSection ? "tag" : "coll") + '">Remove</button></td></tr>';
          }).join("");
          return '<div id="' + sectionId + '" style="flex:1 1 300px;min-width:0;"><div style="display:flex;align-items:center;gap:30px;margin-bottom:12px;"><h3 style="margin:0;font-size:1em;text-transform:uppercase;letter-spacing:1px;color:#52B54B;">' + escHtml(title) + "</h3>" + headerExtra + '<button type="button" class="btnTcRefresh" style="' + btnStyle + 'background:transparent;color:var(--theme-text-secondary);border:1px solid var(--line-color);margin-left:auto;"><i class="md-icon" style="font-size:1em;vertical-align:middle;">refresh</i></button></div><table class="tc-manage-list" style="width:100%;border-collapse:collapse;"><tbody>' + rows + "</tbody></table></div>";
        }
        const searchInputStyle = "background:rgba(128,128,128,0.08);border:1px solid var(--line-color);border-radius:4px;padding:5px 10px;font-size:0.9em;color:inherit;width:400px;max-width:100%;";
        const tcTypeGroups = [
          { label: "Movies", types: ["movie"] },
          { label: "Series", types: ["series"] },
          { label: "Episodes", types: ["episode"] },
          { label: "Seasons", types: ["season"] },
          { label: "Music", types: ["audio", "musicvideo", "musicalbum", "musicartist"] },
          { label: "Books", types: ["book"] },
          { label: "Games", types: ["game"] },
          { label: "Trailers", types: ["trailer"] },
          { label: "Theme songs", types: ["themesong"] },
          { label: "Theme videos", types: ["themevideo", "video"] },
          { label: "Extras", types: ["behindthescenes", "deletedscene", "interview", "scene", "clip", "featurette", "short"] },
          { label: "People", types: ["person"] },
          { label: "Collections", types: ["boxset"] },
          { label: "Photos", types: ["photo", "photoalbum"] },
          { label: "Playlists", types: ["playlist"] },
          { label: "Recordings", types: ["recording"] },
          { label: "Studios", types: ["studio"] }
        ];
        const tcExtraTypes = ["themesong", "themevideo", "trailer", "behindthescenes", "deletedscene", "interview", "scene", "clip", "featurette", "short"];
        const presentGroups = tcTypeGroups.filter(function(g) {
          return (tagsData.Tags || []).some(function(tag) {
            return (tag.ItemTypes || []).some(function(t) {
              return g.types.indexOf(t.toLowerCase()) !== -1;
            });
          });
        });
        const typeFilterDropdownHtml = presentGroups.length > 0 ? '<div class="filter-dropdown-wrapper" id="tcTypeFilterWrap"><div class="filter-dropdown-btn" id="tcTypeFilterBtn"><i class="md-icon" style="font-size:1.1em;">filter_list</i><span id="tcTypeFilterLabel">Filter tags</span><i class="md-icon" style="font-size:0.9em;opacity:0.6;" id="tcTypeFilterCaret">expand_more</i></div><div class="filter-dropdown-panel" id="tcTypeFilterDropdown"><div class="filter-dropdown-label">Media type</div>' + presentGroups.map(function(g) {
          return '<label class="filter-chk-row"><input type="checkbox" class="cbTypeFilter" data-group="' + escAttr(g.label) + '"> <span>' + escHtml(g.label) + "</span></label>";
        }).join("") + "</div></div>" : "";
        const extrasCheckboxHtml = '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:0.9em;white-space:nowrap;opacity:0.8;"><input type="checkbox" id="cbIncludeExtras" style="cursor:pointer;margin:0;"><span>Include extras</span></label>';
        container.innerHTML = '<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap;"><input type="text" id="tcSearch" placeholder="Search\u2026" style="' + searchInputStyle + '" /><select is="emby-select" id="tcSort" style="color:inherit;background:rgba(128,128,128,0.08);border:1px solid var(--line-color);padding:5px;border-radius:4px;font-size:0.9em;cursor:pointer;"><option value="name-asc">Name A\u2013Z</option><option value="name-desc">Name Z\u2013A</option><option value="count-desc">Most items</option><option value="count-asc">Fewest items</option><option value="managed">Managed first</option></select></div><div id="tcSectionsWrap" style="display:flex;gap:40px;align-items:flex-start;">' + renderSection("Tags", tagsData.Tags || [], true, typeFilterDropdownHtml + extrasCheckboxHtml) + renderSection("Collections", collectionsData.Collections || [], false, "") + "</div>";
        container.dataset.loaded = "1";
        function getSelectedTypeGroups() {
          return Array.from(container.querySelectorAll(".cbTypeFilter:checked")).map(function(cb) {
            return cb.dataset.group || "";
          });
        }
        function rowMatchesTypeFilter(row, selectedGroups) {
          if (selectedGroups.length === 0) return true;
          const rowTypes = (row.dataset.types || "").split(",").filter(Boolean);
          return selectedGroups.some(function(groupLabel) {
            const group = tcTypeGroups.find(function(g) {
              return g.label === groupLabel;
            });
            if (!group) return false;
            return rowTypes.some(function(t) {
              return group.types.indexOf(t) !== -1;
            });
          });
        }
        function updateTypeFilterBtn() {
          const btn = container.querySelector("#tcTypeFilterBtn");
          const lbl = container.querySelector("#tcTypeFilterLabel");
          if (!btn || !lbl) return;
          const selected = getSelectedTypeGroups();
          lbl.textContent = selected.length === 0 ? "Filter tags" : selected.length + " type" + (selected.length > 1 ? "s" : "");
          if (selected.length > 0) btn.classList.add("active");
          else btn.classList.remove("active");
        }
        function applySearchSort() {
          const query = (container.querySelector("#tcSearch").value || "").toLowerCase();
          const sort = container.querySelector("#tcSort").value;
          const selectedGroups = getSelectedTypeGroups();
          const includeExtras = !!(container.querySelector("#cbIncludeExtras") || { checked: false }).checked;
          ["tcTagSection", "tcCollSection"].forEach(function(sectionId) {
            const section = container.querySelector("#" + sectionId);
            if (!section) return;
            const rows = Array.from(section.querySelectorAll(".tc-manage-row"));
            const isTagSection = sectionId === "tcTagSection";
            rows.forEach(function(row) {
              const rowName = row.dataset.rowname || "";
              const nameMatch = !query || rowName.indexOf(query) !== -1;
              const typeMatch = !isTagSection || rowMatchesTypeFilter(row, selectedGroups);
              const extrasOk = !isTagSection || includeExtras || function() {
                const types = (row.dataset.types || "").split(",").filter(Boolean);
                return types.length === 0 || !types.every(function(t) {
                  return tcExtraTypes.indexOf(t) !== -1;
                });
              }();
              row.style.display = nameMatch && typeMatch && extrasOk ? "" : "none";
            });
            const list = section.querySelector(".tc-manage-list");
            if (!list) return;
            const visibleRows = rows.filter(function(r) {
              return r.style.display !== "none";
            });
            visibleRows.sort(function(a, b) {
              const nameA = a.dataset.rowname || "";
              const nameB = b.dataset.rowname || "";
              const countA = parseInt(a.dataset.count || "0", 10);
              const countB = parseInt(b.dataset.count || "0", 10);
              const managedA = a.dataset.managed === "1";
              const managedB = b.dataset.managed === "1";
              if (sort === "name-asc") return nameA.localeCompare(nameB);
              if (sort === "name-desc") return nameB.localeCompare(nameA);
              if (sort === "count-desc") return countB - countA;
              if (sort === "count-asc") return countA - countB;
              if (sort === "managed") return (managedB ? 1 : 0) - (managedA ? 1 : 0) || nameA.localeCompare(nameB);
              return 0;
            });
            visibleRows.forEach(function(r) {
              list.appendChild(r);
            });
          });
        }
        container.querySelector("#tcSearch").addEventListener("input", applySearchSort);
        container.querySelector("#tcSort").addEventListener("change", applySearchSort);
        const cbIncludeExtras = container.querySelector("#cbIncludeExtras");
        if (cbIncludeExtras) cbIncludeExtras.addEventListener("change", applySearchSort);
        const typeFilterBtn = container.querySelector("#tcTypeFilterBtn");
        const typeFilterDropdown = container.querySelector("#tcTypeFilterDropdown");
        const typeFilterCaret = container.querySelector("#tcTypeFilterCaret");
        if (typeFilterBtn && typeFilterDropdown) {
          typeFilterBtn.addEventListener("click", function(e) {
            e.stopPropagation();
            const open = typeFilterDropdown.classList.toggle("open");
            if (typeFilterCaret) typeFilterCaret.textContent = open ? "expand_less" : "expand_more";
          });
          typeFilterDropdown.addEventListener("change", function(e) {
            const t = e.target;
            if (t && t.classList.contains("cbTypeFilter")) {
              updateTypeFilterBtn();
              applySearchSort();
            }
          });
          document.addEventListener("click", function closeTypeFilter(e) {
            const t = e.target;
            if (t && !typeFilterDropdown.contains(t) && !typeFilterBtn.contains(t)) {
              typeFilterDropdown.classList.remove("open");
              if (typeFilterCaret) typeFilterCaret.textContent = "expand_more";
            }
            if (!container.isConnected) document.removeEventListener("click", closeTypeFilter);
          });
        }
        applySearchSort();
        const tcTooltip = document.createElement("div");
        tcTooltip.style.cssText = "position:fixed;z-index:9999;pointer-events:none;display:none;background:var(--plugin-popup-bg,#2a2a2a);color:var(--plugin-popup-color,#eee);border:1px solid var(--plugin-popup-border,#444);border-radius:6px;padding:8px 12px;font-size:0.82em;line-height:1.6;max-width:210px;box-shadow:0 4px 14px rgba(0,0,0,0.4);";
        document.body.appendChild(tcTooltip);
        const tcTooltipObserver = new MutationObserver(function() {
          if (!container.isConnected) {
            tcTooltip.remove();
            tcTooltipObserver.disconnect();
          }
        });
        if (container.parentNode) tcTooltipObserver.observe(container.parentNode, { childList: true });
        function getTypeLabels(typesStr) {
          const rawTypes = (typesStr || "").split(",").filter(Boolean);
          if (!rawTypes.length) return null;
          const seen = {};
          const labels = [];
          tcTypeGroups.forEach(function(g) {
            if (!seen[g.label] && rawTypes.some(function(t) {
              return g.types.indexOf(t) !== -1;
            })) {
              seen[g.label] = true;
              labels.push(g.label);
            }
          });
          return labels.length ? labels : null;
        }
        const tcTagSection = container.querySelector("#tcTagSection");
        if (tcTagSection) {
          tcTagSection.addEventListener("mouseover", function(e) {
            const t = e.target;
            if (!t) {
              tcTooltip.style.display = "none";
              return;
            }
            const nameEl = t.closest(".tc-item-name");
            if (!nameEl) {
              tcTooltip.style.display = "none";
              return;
            }
            const row = nameEl.closest(".tc-manage-row");
            if (!row) return;
            const labels = getTypeLabels(row.dataset.types || "");
            if (!labels) {
              tcTooltip.style.display = "none";
              return;
            }
            tcTooltip.innerHTML = '<div style="font-weight:600;opacity:0.55;font-size:0.85em;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:5px;">Found in</div>' + labels.map(function(l) {
              return '<div style="display:flex;align-items:center;gap:6px;"><i class="md-icon" style="font-size:0.95em;opacity:0.7;">label</i>' + escHtml(l) + "</div>";
            }).join("");
            tcTooltip.style.display = "block";
          });
          tcTagSection.addEventListener("mousemove", function(e) {
            const t = e.target;
            if (!t) {
              tcTooltip.style.display = "none";
              return;
            }
            const nameEl = t.closest(".tc-item-name");
            if (!nameEl) {
              tcTooltip.style.display = "none";
              return;
            }
            tcTooltip.style.left = e.clientX + 16 + "px";
            tcTooltip.style.top = e.clientY + 12 + "px";
            const rect = tcTooltip.getBoundingClientRect();
            if (rect.right > window.innerWidth - 8) tcTooltip.style.left = e.clientX - rect.width - 16 + "px";
            if (rect.bottom > window.innerHeight - 8) tcTooltip.style.top = e.clientY - rect.height - 12 + "px";
          });
          tcTagSection.addEventListener("mouseout", function(e) {
            const t = e.target;
            if (!t) return;
            const nameEl = t.closest(".tc-item-name");
            if (!nameEl) return;
            const rt = e.relatedTarget;
            if (rt && nameEl.contains(rt)) return;
            tcTooltip.style.display = "none";
          });
        }
        function updateSaveButton() {
          const hasPending = Object.keys(pendingTagDeletes).length > 0 || Object.keys(pendingCollDeletes).length > 0;
          container._tcHasPending = hasPending;
          deps.checkFormState();
        }
        if (container._tcClickHandler) container.removeEventListener("click", container._tcClickHandler);
        container._tcClickHandler = function(e) {
          const target = e.target;
          if (!target) return;
          const navLink = target.closest(".tc-nav-link");
          if (navLink) {
            const navId = navLink.getAttribute("data-navid") || "";
            const baseUrl = window.location.href.split("#")[0];
            const serverId = window.ApiClient?.serverId ? window.ApiClient.serverId() : "";
            const url = baseUrl + "#!/item?id=" + encodeURIComponent(navId) + (serverId ? "&serverId=" + encodeURIComponent(serverId) : "");
            window.open(url, "_blank");
            return;
          }
          const btn = target.closest("button");
          if (!btn) return;
          if (btn.classList.contains("btnTcMark")) {
            const type = btn.dataset.type;
            const id = btn.dataset.id || "";
            const name = btn.dataset.name || "";
            const count = parseInt(btn.dataset.count || "0", 10);
            if (type === "tag") pendingTagDeletes[id.toLowerCase()] = { name, itemCount: count };
            else pendingCollDeletes[id] = { id, name, itemCount: count };
            const row = btn.closest(".tc-manage-row");
            if (row) {
              row.style.opacity = "0.45";
              const nameEl = row.querySelector(".tc-item-name");
              if (nameEl) nameEl.style.textDecoration = "line-through";
              btn.textContent = "Undo";
              btn.classList.remove("btnTcMark");
              btn.classList.add("btnTcUndo");
              btn.style.background = "#555";
            }
            updateSaveButton();
            return;
          }
          if (btn.classList.contains("btnTcUndo")) {
            const type = btn.dataset.type;
            const id = btn.dataset.id || "";
            if (type === "tag") delete pendingTagDeletes[id.toLowerCase()];
            else delete pendingCollDeletes[id];
            const row = btn.closest(".tc-manage-row");
            if (row) {
              row.style.opacity = "1";
              const nameEl = row.querySelector(".tc-item-name");
              if (nameEl) nameEl.style.textDecoration = "";
              btn.textContent = "Remove";
              btn.classList.remove("btnTcUndo");
              btn.classList.add("btnTcMark");
              btn.style.background = "#cc3333";
            }
            updateSaveButton();
            return;
          }
          if (btn.classList.contains("btnTcRefresh")) {
            container.dataset.loaded = "";
            reload();
            return;
          }
        };
        container.addEventListener("click", container._tcClickHandler);
        container._tcShowModal = function() {
          showSummaryModal();
        };
        function showSummaryModal() {
          const undoBtnStyle = "cursor:pointer;border:none;background:transparent;color:#cc2222;border-radius:3px;padding:2px 6px;font-size:1.1em;line-height:1;margin-right:8px;flex-shrink:0;";
          function buildRows(items, isTag) {
            return items.map(function(item) {
              const name = item.name;
              const key = isTag ? item.name.toLowerCase() : pendingCollDeletes[item.name.toLowerCase()]?.id ?? "";
              const managed = isTag ? managedTagMap[name.toLowerCase()] : managedCollMap[name.toLowerCase()];
              let warning = "";
              const activeManaged = managed ? managed.filter(function(m) {
                return m.groupActive;
              }) : [];
              if (activeManaged.length > 0) {
                const what = isTag ? "recreate this tag" : "recreate this collection";
                const warningText = activeManaged.length === 1 ? "Group <strong>" + escHtml(activeManaged[0].displayName) + "</strong> is active and may " + what + " on next sync." : activeManaged.length + " active groups may " + what + " on next sync.";
                const checkboxes = activeManaged.map(function(m) {
                  return '<label style="display:flex;align-items:center;gap:6px;margin-top:5px;cursor:pointer;"><input type="checkbox" class="cbInactivateGroup" data-group-indices="' + escAttr(JSON.stringify([m.groupIndex])) + '"> Deactivate <strong>' + escHtml(m.displayName) + "</strong></label>";
                }).join("");
                warning = '<div style="color:#f0a000;margin-top:6px;font-size:0.88em;"><i class="md-icon" style="font-size:1em;vertical-align:middle;margin-right:4px;">warning</i>' + warningText + checkboxes + "</div>";
              }
              const itemCount = isTag ? item.itemCount : pendingCollDeletes[item.name.toLowerCase()]?.itemCount ?? 0;
              return '<div style="padding:10px 0;border-bottom:1px solid var(--line-color);display:flex;align-items:flex-start;"><button type="button" class="btnModalUndo" style="' + undoBtnStyle + '" data-key="' + escAttr(key) + '" data-type="' + (isTag ? "tag" : "coll") + '" title="Keep this one">\u2715</button><div style="flex:1;"><span style="font-weight:500;">' + escHtml(name) + '</span><span style="color:var(--theme-text-secondary);font-size:0.88em;margin-left:8px;">(' + itemCount + " items)</span>" + warning + "</div></div>";
            }).join("");
          }
          function buildContent() {
            const tagList = Object.values(pendingTagDeletes);
            const collList = Object.values(pendingCollDeletes);
            const tagSection = tagList.length > 0 ? '<div style="margin-bottom:20px;"><h4 style="margin:0 0 8px;color:#52B54B;">Tags to remove (' + tagList.length + ")</h4>" + buildRows(tagList, true) + "</div>" : "";
            const collSection = collList.length > 0 ? '<div style="margin-bottom:20px;"><h4 style="margin:0 0 8px;color:#52B54B;">Collections to remove (' + collList.length + ")</h4>" + buildRows(collList, false) + "</div>" : "";
            return tagSection + collSection;
          }
          const modal = document.createElement("div");
          modal.dataset.tcModal = "summary";
          modal.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.75);z-index:9999;display:flex;align-items:center;justify-content:center;";
          function renderModal() {
            const tagList = Object.values(pendingTagDeletes);
            const collList = Object.values(pendingCollDeletes);
            if (tagList.length === 0 && collList.length === 0) {
              modal.remove();
              updateSaveButton();
              return;
            }
            modal.innerHTML = '<div style="background:var(--plugin-popup-bg,#2a2a2a);color:var(--plugin-popup-color,#e8e8e8);border:1px solid var(--plugin-popup-border,rgba(255,255,255,0.12));border-radius:8px;padding:28px;max-width:600px;width:90%;max-height:80vh;overflow-y:auto;"><h3 style="margin:0 0 20px;font-size:1.1em;color:#52B54B;">Summary \u2014 Pending changes</h3><div id="tcModalBody">' + buildContent() + '</div><div style="display:flex;justify-content:flex-end;gap:12px;margin-top:20px;border-top:1px solid var(--line-color);padding-top:16px;"><button type="button" id="tcModalCancel" style="cursor:pointer;border:1px solid var(--line-color);background:transparent;color:var(--theme-text-primary);border-radius:3px;padding:8px 18px;font-size:0.9em;">Cancel</button><button type="button" id="tcModalConfirm" style="cursor:pointer;border:none;background:#52B54B;color:#fff;border-radius:3px;padding:8px 18px;font-size:0.9em;font-weight:500;"><i class="md-icon" style="font-size:1em;vertical-align:middle;margin-right:5px;">check</i>Confirm &amp; Save</button></div></div>';
            modal.querySelector("#tcModalCancel").addEventListener("click", function() {
              modal.remove();
            });
            modal.addEventListener("click", function(e) {
              const target = e.target;
              if (!target) return;
              const undoBtn = target.closest(".btnModalUndo");
              if (!undoBtn) return;
              const ub = undoBtn;
              const type = ub.dataset.type;
              const key = ub.dataset.key || "";
              if (type === "tag") delete pendingTagDeletes[key];
              else delete pendingCollDeletes[key];
              const keyLower = key.toLowerCase();
              const mainBtn = Array.from(container.querySelectorAll(".btnTcUndo")).find(function(b) {
                return (b.dataset.id || "").toLowerCase() === keyLower;
              });
              if (mainBtn) {
                const row = mainBtn.closest(".tc-manage-row");
                if (row) {
                  row.style.opacity = "1";
                  const nameEl = row.querySelector(".tc-item-name");
                  if (nameEl) nameEl.style.textDecoration = "";
                }
                mainBtn.textContent = "Remove";
                mainBtn.classList.remove("btnTcUndo");
                mainBtn.classList.add("btnTcMark");
                mainBtn.style.background = "#cc3333";
              }
              updateSaveButton();
              renderModal();
            });
            modal.querySelector("#tcModalConfirm").addEventListener("click", function() {
              const confirmBtn = modal.querySelector("#tcModalConfirm");
              confirmBtn.disabled = true;
              confirmBtn.innerHTML = 'Saving <span class="tc-dot-loader"><span></span><span></span><span></span></span>';
              const tagList2 = Object.values(pendingTagDeletes);
              const collList2 = Object.values(pendingCollDeletes);
              const groupsToInactivate = /* @__PURE__ */ new Set();
              modal.querySelectorAll(".cbInactivateGroup:checked").forEach(function(cb) {
                const raw = cb.dataset.groupIndices ? JSON.parse(cb.dataset.groupIndices) : [];
                const indices = Array.isArray(raw) ? raw : [];
                indices.forEach(function(idx) {
                  if (typeof idx === "number") groupsToInactivate.add(idx);
                });
              });
              const tok = apiClient.accessToken();
              const tagBatchPromise = tagList2.length === 0 ? Promise.resolve() : deps.fetch(apiClient.getUrl("HomeScreenCompanion/Manage/DeleteTags"), {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-MediaBrowser-Token": tok },
                body: JSON.stringify({ TagNames: tagList2.map(function(t) {
                  return t.name;
                }) })
              }).then(function(r) {
                return r.json();
              });
              const collOps = [];
              collList2.forEach(function(c) {
                collOps.push(function() {
                  return deps.fetch(apiClient.getUrl("HomeScreenCompanion/Manage/DeleteCollection"), {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "X-MediaBrowser-Token": tok },
                    body: JSON.stringify({ CollectionId: c.id })
                  }).then(function(r) {
                    return r.json();
                  });
                });
              });
              tagBatchPromise.then(function() {
                return collOps.reduce(function(chain, op) {
                  return chain.then(op);
                }, Promise.resolve());
              }).then(function() {
                if (groupsToInactivate.size === 0) return Promise.resolve();
                return apiClient.getPluginConfiguration(deps.pluginId).then(function(cfgRaw) {
                  const cfg = cfgRaw;
                  const tagsToInactivate = /* @__PURE__ */ new Set();
                  groupsToInactivate.forEach(function(idx) {
                    const tagsArr = cfg.Tags;
                    if (!tagsArr) return;
                    const entry = tagsArr[idx];
                    if (entry && entry.Tag) tagsToInactivate.add(entry.Tag.trim().toLowerCase());
                  });
                  (cfg.Tags || []).forEach(function(t) {
                    if (t.Tag && tagsToInactivate.has(t.Tag.trim().toLowerCase()))
                      t.Active = false;
                  });
                  return apiClient.updatePluginConfiguration(deps.pluginId, cfg);
                });
              }).then(function() {
                modal.remove();
                const inactivatedTagKeys = /* @__PURE__ */ new Set();
                groupsToInactivate.forEach(function(idx) {
                  const seedRow = view.querySelector('#tagListContainer .tag-row[data-index="' + idx + '"]');
                  if (seedRow && seedRow.dataset.tag) inactivatedTagKeys.add(seedRow.dataset.tag.toLowerCase());
                });
                view.querySelectorAll("#tagListContainer .tag-row").forEach(function(sourceRow) {
                  const rowTag = (sourceRow.dataset.tag || "").toLowerCase();
                  if (!inactivatedTagKeys.has(rowTag)) return;
                  const chk = sourceRow.querySelector(".chkTagActive");
                  const lbl = sourceRow.querySelector(".lblActiveStatus");
                  if (chk) chk.checked = false;
                  if (lbl) {
                    lbl.textContent = "Disabled";
                    lbl.style.color = "var(--theme-text-secondary)";
                  }
                  sourceRow.classList.add("inactive");
                  const runBtn = sourceRow.querySelector(".btnRunEntry");
                  if (runBtn) {
                    runBtn.disabled = true;
                    runBtn.style.opacity = "0.4";
                  }
                });
                pendingTagDeletes = {};
                pendingCollDeletes = {};
                const tc2 = container;
                tc2._tcHasPending = false;
                deps.checkFormState();
                tc2.dataset.loaded = "";
                reload();
              }).catch(function(err) {
                modal.remove();
                deps.alert("Error saving: " + String(err));
              });
            });
          }
          renderModal();
          document.body.appendChild(modal);
        }
      }).catch(function(err) {
        container.innerHTML = '<div style="color:#cc3333;padding:20px;">Failed to load: ' + String(err) + "</div>";
      });
    }

    function loadTopListsTab(view, deps) {
      const container = view.querySelector("#tlContainer");
      if (!container) return;
      container.innerHTML = '<div style="padding:20px;color:var(--theme-text-secondary);display:flex;align-items:center;gap:10px;">Loading <span class="tc-dot-loader"><span></span><span></span><span></span></span></div>';
      const token = deps.getAccessToken();
      Promise.all([
        deps.fetch(deps.getUrl("HomeScreenCompanion/Manage/Tags"), { headers: { "X-MediaBrowser-Token": token } }).then(function(r) {
          return r.json();
        }),
        deps.fetch(deps.getUrl("HomeScreenCompanion/Manage/Collections"), { headers: { "X-MediaBrowser-Token": token } }).then(function(r) {
          return r.json();
        }),
        deps.getPluginConfiguration().catch(function() {
          return { Tags: [] };
        }),
        deps.fetch(deps.getUrl("HomeScreenCompanion/TopList/List"), { headers: { "X-MediaBrowser-Token": token } }).then(function(r) {
          return r.json();
        }).catch(function() {
          return { FolderNames: [] };
        })
      ]).then(function(results) {
        const tagsData = results[0];
        const topListListResult = results[3];
        const pluginConfig = results[2];
        const existingTopLists = new Set((topListListResult.FolderNames || []).map(function(n) {
          return n.toLowerCase();
        }));
        function sanitizeTlName(name) {
          const safe = (name || "unknown").replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").replace(/^\.+|\.+$/g, "").trim();
          return safe.length === 0 ? "unknown" : safe;
        }
        results[1];
        (pluginConfig.TopLists || []).forEach(function(tl) {
          if (!tl.TagName) return;
          sanitizeTlName(tl.TagName).toLowerCase();
          let settings = {};
          try {
            settings = JSON.parse(tl.HomeSectionSettings || "{}");
          } catch (e) {
          }
          if (settings.CustomName) settings.CustomName;
          if (tl.HomeSectionLibraryId && tl.HomeSectionLibraryId !== "auto")
            tl.HomeSectionLibraryId;
        });
        const managedTagMap = {};
        const managedCollMap = {};
        const seenGroupByTag = {};
        (pluginConfig.Tags || []).forEach(function(t, idx) {
          if (!t.Tag) return;
          const tName = t.Tag.trim();
          const tKey = tName.toLowerCase();
          if (seenGroupByTag[tKey]) return;
          seenGroupByTag[tKey] = true;
          const groupLabel = t.Name && t.Name.trim() && t.Name.trim().toLowerCase() !== tKey ? t.Name.trim() : tName;
          const entry = { displayName: groupLabel, groupIndex: idx, groupActive: !!t.Active };
          if (!managedTagMap[tKey]) managedTagMap[tKey] = [];
          managedTagMap[tKey].push(entry);
          if (t.EnableCollection) {
            const cName = t.CollectionName && t.CollectionName.trim() ? t.CollectionName.trim() : tName;
            const cKey = cName.toLowerCase();
            if (!managedCollMap[cKey]) managedCollMap[cKey] = [];
            managedCollMap[cKey].push(entry);
          }
        });
        function escAttr(s) {
          return String(s || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;");
        }
        const searchInputStyle = "background:var(--plugin-input-bg);border:1px solid var(--plugin-input-border);border-radius:4px;padding:5px 10px;font-size:0.9em;color:var(--plugin-popup-color);width:400px;max-width:100%;";
        const realTagNamesLower = new Set((tagsData.Tags || []).map(function(t) {
          return (t.Name || "").toLowerCase();
        }));
        const allExistingTopLists = (pluginConfig.TopLists || []).filter(function(tl) {
          return tl.TagName && existingTopLists.has(sanitizeTlName(tl.TagName).toLowerCase());
        }).map(function(tl) {
          const key = sanitizeTlName(tl.TagName || "").toLowerCase();
          let settings = {};
          try {
            settings = JSON.parse(tl.HomeSectionSettings || "{}");
          } catch (e) {
          }
          return {
            tagName: tl.TagName || "",
            displayName: settings.CustomName || tl.TagName || "",
            isManual: !realTagNamesLower.has((tl.TagName || "").toLowerCase()),
            count: (topListListResult.MovieCounts || {})[key] || 0,
            userIds: tl.HomeSectionUserIds || [],
            customName: settings.CustomName || "",
            displayMode: settings.DisplayMode || "",
            imageType: settings.ImageType || "",
            badgeStyle: settings.BadgeStyle || "neutral",
            maxItems: settings.MaxItems || 0
          };
        });
        function renderTopListRows(items) {
          if (items.length === 0) {
            return '<div id="tlRowsList"><p style="color:var(--theme-text-secondary);font-size:0.9em;font-style:italic;padding:20px 0;">No top-lists created yet. Click <strong>+ Create New</strong> to get started.</p></div>';
          }
          const rows = items.map(function(item) {
            const isManual = item.isManual;
            const typeBadge = isManual ? '<span class="tag-indicator toplist" style="margin-left:0;margin-right:12px;flex-shrink:0;"><i class="md-icon" style="font-size:1.1em;">format_list_numbered</i> Manual</span>' : '<span class="tag-indicator tag" style="margin-left:0;margin-right:12px;flex-shrink:0;"><i class="md-icon" style="font-size:1.1em;">label</i> ' + escapeHtml(item.tagName) + "</span>";
            ({ "": "Always", "tv": "TV mode only", "mobile,desktop": "Non-TV only" })[item.displayMode] || "Always";
            item.imageType || "Auto";
            item.maxItems ? String(item.maxItems) : "0 (all)";
            const editJson = escAttr(JSON.stringify({
              tagName: item.tagName,
              displayName: item.displayName,
              isManual: item.isManual,
              userIds: item.userIds,
              customName: item.customName,
              displayMode: item.displayMode,
              imageType: item.imageType,
              badgeStyle: item.badgeStyle,
              maxItems: String(item.maxItems || "0")
            }));
            return '<div class="tag-row" data-tlname="' + escAttr(item.tagName.toLowerCase()) + '" data-ismanual="' + (isManual ? "1" : "0") + '" data-count="' + item.count + '" data-editjson="' + editJson + '"><div class="tl-row-header tag-header" style="display:flex;align-items:center;justify-content:space-between;padding:10px;cursor:pointer;"><div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px;">' + typeBadge + '<span class="tag-title" style="font-weight:bold;font-size:1.1em;">' + escapeHtml(item.displayName) + '</span><span class="tag-indicator source" style="margin-left:8px;">' + item.count + ' movies</span></div><i class="md-icon expand-icon" style="flex-shrink:0;margin-left:12px;">expand_more</i></div><div class="tag-body" style="display:none;padding:15px;border-top:1px solid rgba(255,255,255,0.1);"></div></div>';
          }).join("");
          return '<div id="tlRowsList">' + rows + "</div>";
        }
        container.innerHTML = '<div style="max-width:900px;"><div class="sectionTitleContainer flex align-items-center" style="margin-bottom:1em;margin-top:2em;"><h2 class="sectionTitle" style="margin-bottom:0;">Top Lists</h2><button type="button" id="btnCreateNewTopList" is="emby-button" class="raised button-submit mb025" style="margin-left:auto;"><span>+ Create New</span></button></div><div style="margin-bottom:16px;font-size:0.9em;color:var(--theme-text-secondary);line-height:1.5;">Create a top-list home section from a tag managed by the plugin. Top-lists only work with movies.</div><div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap;"><input type="text" id="tlSearch" placeholder="Search\u2026" style="' + searchInputStyle + '" /><select is="emby-select" id="tlFilter" style="color:var(--plugin-popup-color);background:var(--plugin-input-bg);border:1px solid var(--plugin-input-border);padding:5px;border-radius:4px;font-size:0.9em;cursor:pointer;"><option value="all">All</option><option value="manual">Manual</option><option value="bytag">By tag</option></select><select is="emby-select" id="tlSort" style="color:var(--plugin-popup-color);background:var(--plugin-input-bg);border:1px solid var(--plugin-input-border);padding:5px;border-radius:4px;font-size:0.9em;cursor:pointer;"><option value="name-asc">Name A\u2013Z</option><option value="name-desc">Name Z\u2013A</option><option value="count-desc">Most movies</option><option value="count-asc">Fewest movies</option></select><button type="button" class="btnTlRefresh" style="cursor:pointer;border:1px solid var(--line-color);background:transparent;color:var(--theme-text-secondary);border-radius:3px;padding:5px 10px;font-size:0.9em;"><i class="md-icon" style="font-size:1em;vertical-align:middle;">refresh</i></button></div>' + renderTopListRows(allExistingTopLists) + "</div>";
        container.dataset.loaded = "1";
        const btnCreateNew = container.querySelector("#btnCreateNewTopList");
        if (btnCreateNew) {
          btnCreateNew.addEventListener("click", function() {
            deps.showCreateTopListChooser(tagsData, existingTopLists, function() {
              deps.reload();
            });
          });
        }
        function applySearchSort() {
          const c = container;
          const query = (c.querySelector("#tlSearch").value || "").toLowerCase();
          const filter = c.querySelector("#tlFilter").value;
          const sort = c.querySelector("#tlSort").value;
          const rowsList = c.querySelector("#tlRowsList");
          if (!rowsList) return;
          const rows = Array.from(rowsList.querySelectorAll(".tag-row"));
          rows.forEach(function(row) {
            const tlName = row.dataset.tlname || "";
            const isManual = row.dataset.ismanual === "1";
            const matchSearch = !query || tlName.indexOf(query) !== -1;
            let matchFilter = true;
            if (filter === "manual") matchFilter = isManual;
            if (filter === "bytag") matchFilter = !isManual;
            row.style.display = matchSearch && matchFilter ? "" : "none";
          });
          const visibleRows = rows.filter(function(r) {
            return r.style.display !== "none";
          });
          visibleRows.sort(function(a, b) {
            const nameA = a.dataset.tlname || "";
            const nameB = b.dataset.tlname || "";
            const countA = parseInt(a.dataset.count || "0", 10);
            const countB = parseInt(b.dataset.count || "0", 10);
            if (sort === "name-asc") return nameA.localeCompare(nameB);
            if (sort === "name-desc") return nameB.localeCompare(nameA);
            if (sort === "count-desc") return countB - countA;
            if (sort === "count-asc") return countA - countB;
            return 0;
          });
          visibleRows.forEach(function(r) {
            rowsList.appendChild(r);
          });
        }
        container.querySelector("#tlSearch").addEventListener("input", applySearchSort);
        container.querySelector("#tlFilter").addEventListener("change", applySearchSort);
        container.querySelector("#tlSort").addEventListener("change", applySearchSort);
        applySearchSort();
        if (container._tlClickHandler) container.removeEventListener("click", container._tlClickHandler);
        container._tlClickHandler = function(e) {
          const target = e.target;
          const rowHeader = target.closest(".tl-row-header");
          if (rowHeader && !target.closest("button")) {
            const row = rowHeader.closest(".tag-row");
            const body = row && row.querySelector(".tag-body");
            const icon = rowHeader.querySelector(".expand-icon");
            if (row && body) {
              const expanded = body.style.display !== "none";
              body.style.display = expanded ? "none" : "block";
              if (icon) icon.textContent = expanded ? "expand_more" : "expand_less";
              if (!expanded && !body.dataset.formLoaded) {
                body.dataset.formLoaded = "1";
                deps.loadInlineEditForm(row, body, function() {
                  deps.reload();
                });
              }
            }
            return;
          }
          const btn = target.closest("button");
          if (!btn) return;
          if (btn.classList.contains("btnTlDelete")) {
            const deleteName = btn.dataset.name;
            if (!deps.confirm('Delete top-list for "' + deleteName + '"?\n\nThis will remove the folder, all .strm files, and the virtual library.')) return;
            const deleteBtn = btn;
            deleteBtn.disabled = true;
            deleteBtn.textContent = "Deleting\u2026";
            const deleteToken = deps.getAccessToken();
            deps.fetch(deps.getUrl("HomeScreenCompanion/TopList/Delete"), {
              method: "POST",
              headers: { "Content-Type": "application/json", "X-MediaBrowser-Token": deleteToken },
              body: JSON.stringify({ TagName: deleteName })
            }).then(function(r) {
              return r.json();
            }).then(function(delResultRaw) {
              const delResult = delResultRaw;
              if (!delResult.Success) throw new Error(delResult.Message || "Delete failed");
              const folderPath = delResult.FolderPath;
              return deps.fetch(deps.getUrl("Library/VirtualFolders"), {
                headers: { "X-MediaBrowser-Token": deleteToken }
              }).then(function(r) {
                return r.json();
              }).then(function(foldersRaw) {
                const folders = foldersRaw;
                function normDlp(p) {
                  return (p || "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
                }
                const match = (folders || []).find(function(f) {
                  return (f.Locations || []).some(function(loc) {
                    return normDlp(loc) === normDlp(folderPath);
                  });
                });
                if (match && match.ItemId) {
                  return deps.fetch(deps.getUrl("Library/VirtualFolders") + "?Id=" + encodeURIComponent(match.ItemId) + "&RefreshLibrary=false", {
                    method: "DELETE",
                    headers: { "X-MediaBrowser-Token": deleteToken }
                  });
                }
              });
            }).then(function() {
              deps.unregisterTopList(deleteName.toLowerCase());
              deps.reload();
            }).catch(function(err) {
              deleteBtn.disabled = false;
              deleteBtn.textContent = "Delete top-list";
              deps.alert("Error deleting top-list: " + (err.message || err));
            });
            return;
          }
          if (btn.classList.contains("btnTlRefresh")) {
            deps.reload();
            return;
          }
        };
        container.addEventListener("click", container._tlClickHandler);
      }).catch(function(err) {
        container.innerHTML = '<div style="color:#cc3333;padding:20px;">Failed to load: ' + String(err) + "</div>";
      });
    }

    function sanitizeTlName(name) {
      const safe = (name || "unknown").replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").replace(/^\.+|\.+$/g, "").trim();
      return safe.length === 0 ? "unknown" : safe;
    }
    function escAttr(s) {
      return String(s || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    }
    function escHtml(s) {
      return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
    function showCreateTopListChooser(tagsData, existingTopLists, onSuccess, deps) {
      const innerStyle = "background:var(--plugin-popup-bg,#2a2a2a);color:var(--plugin-popup-color,#e8e8e8);border:1px solid var(--plugin-popup-border,rgba(255,255,255,0.12));border-radius:8px;padding:28px;max-width:480px;width:90%;max-height:85vh;overflow-y:auto;";
      const modal = document.createElement("div");
      modal.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.75);z-index:9999;display:flex;align-items:center;justify-content:center;";
      document.body.appendChild(modal);
      function onEsc(e) {
        if (e.key === "Escape") {
          modal.remove();
          document.removeEventListener("keydown", onEsc);
        }
      }
      document.addEventListener("keydown", onEsc);
      modal.addEventListener("click", (e) => {
        if (e.target === modal) {
          modal.remove();
          document.removeEventListener("keydown", onEsc);
        }
      });
      function renderStep1() {
        modal.innerHTML = '<div style="' + innerStyle + '"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;"><h3 style="margin:0;font-size:1.1em;color:#52B54B;">Create Top-List</h3><button type="button" class="btnChooserClose" style="background:transparent;border:none;color:inherit;cursor:pointer;padding:2px;opacity:0.6;line-height:1;"><i class="md-icon">close</i></button></div><p style="margin:0 0 20px;font-size:0.9em;color:var(--theme-text-secondary);">How do you want to create this top-list?</p><div style="display:flex;gap:16px;"><button type="button" class="btnChooseManual" style="flex:1;cursor:pointer;background:var(--plugin-input-bg,rgba(255,255,255,0.05));border:1px solid var(--plugin-input-border,rgba(255,255,255,0.12));border-radius:8px;padding:20px 16px;text-align:left;color:inherit;"><div style="font-size:1.4em;margin-bottom:10px;color:#52B54B;"><i class="md-icon">format_list_numbered</i></div><div style="font-weight:600;font-size:0.95em;margin-bottom:6px;">Manual</div><div style="font-size:0.82em;color:var(--theme-text-secondary);line-height:1.5;">Pick movies manually and build a custom list</div></button><button type="button" class="btnChooseByTag" style="flex:1;cursor:pointer;background:var(--plugin-input-bg,rgba(255,255,255,0.05));border:1px solid var(--plugin-input-border,rgba(255,255,255,0.12));border-radius:8px;padding:20px 16px;text-align:left;color:inherit;"><div style="font-size:1.4em;margin-bottom:10px;color:#52B54B;"><i class="md-icon">label</i></div><div style="font-weight:600;font-size:0.95em;margin-bottom:6px;">By tag</div><div style="font-size:0.82em;color:var(--theme-text-secondary);line-height:1.5;">Create from an existing tag in your library</div></button></div></div>';
        const closeBtn = modal.querySelector(".btnChooserClose");
        if (closeBtn) closeBtn.addEventListener("click", () => {
          modal.remove();
          document.removeEventListener("keydown", onEsc);
        });
        const btnManualCard = modal.querySelector(".btnChooseManual");
        const btnByTagCard = modal.querySelector(".btnChooseByTag");
        [btnManualCard, btnByTagCard].forEach((btn) => {
          if (!btn) return;
          btn.addEventListener("mouseover", function() {
            this.style.borderColor = "#52B54B";
          });
          btn.addEventListener("mouseout", function() {
            this.style.borderColor = "var(--plugin-input-border,rgba(255,255,255,0.12))";
          });
        });
        if (btnManualCard) {
          btnManualCard.addEventListener("click", () => {
            modal.remove();
            document.removeEventListener("keydown", onEsc);
            deps.showManualTopListModal(onSuccess, void 0, deps);
          });
        }
        if (btnByTagCard) {
          btnByTagCard.addEventListener("click", () => {
            renderStep2();
          });
        }
      }
      function renderStep2() {
        const inputStyle = "background:var(--plugin-input-bg);border:1px solid var(--plugin-input-border);border-radius:4px;padding:6px 10px;font-size:0.9em;color:var(--plugin-popup-color);width:100%;box-sizing:border-box;";
        const tagRowsHtml = tagsData.length === 0 ? '<p style="padding:12px 4px;color:var(--theme-text-secondary);font-size:0.88em;font-style:italic;">No tags found.</p>' : tagsData.map((tag) => {
          const name = tag.Name || "";
          const count = tag.MovieCount != null ? tag.MovieCount : tag.ItemCount != null ? tag.ItemCount : 0;
          const hasTopList = existingTopLists.has(sanitizeTlName(name).toLowerCase());
          const badge = hasTopList ? '<span style="font-size:0.72em;background:rgba(180,140,50,0.18);color:#c9a84c;border-radius:3px;padding:1px 6px;margin-left:6px;white-space:nowrap;">top-list</span>' : "";
          return '<button type="button" class="btnSelectTag" data-name="' + escAttr(name) + '" style="width:100%;cursor:pointer;background:transparent;border:none;border-bottom:1px solid var(--line-color);padding:10px 4px;display:flex;align-items:center;color:inherit;text-align:left;"><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escHtml(name) + badge + '</span><span style="margin-left:12px;white-space:nowrap;font-size:0.85em;color:var(--theme-text-secondary);">' + count + " movies</span></button>";
        }).join("");
        modal.innerHTML = '<div style="' + innerStyle + 'max-width:520px;"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;"><div style="display:flex;align-items:center;gap:10px;"><button type="button" class="btnChooserBack" style="background:transparent;border:none;color:var(--theme-text-secondary);cursor:pointer;padding:2px;line-height:1;opacity:0.7;"><i class="md-icon">arrow_back</i></button><h3 style="margin:0;font-size:1.1em;color:#52B54B;">Select Tag</h3></div><button type="button" class="btnChooserClose" style="background:transparent;border:none;color:inherit;cursor:pointer;padding:2px;opacity:0.6;line-height:1;"><i class="md-icon">close</i></button></div><div style="margin-bottom:14px;"><input type="text" id="tlChooserSearch" placeholder="Search tags\u2026" style="' + inputStyle + '" /></div><div id="tlChooserTagList" style="max-height:50vh;overflow-y:auto;">' + tagRowsHtml + "</div></div>";
        const closeBtn2 = modal.querySelector(".btnChooserClose");
        const backBtn = modal.querySelector(".btnChooserBack");
        if (closeBtn2) closeBtn2.addEventListener("click", () => {
          modal.remove();
          document.removeEventListener("keydown", onEsc);
        });
        if (backBtn) backBtn.addEventListener("click", () => {
          renderStep1();
        });
        const searchInput = modal.querySelector("#tlChooserSearch");
        if (searchInput) {
          searchInput.addEventListener("input", function() {
            const q = this.value.toLowerCase();
            modal.querySelectorAll(".btnSelectTag").forEach((btn) => {
              btn.style.display = !q || (btn.dataset.name || "").toLowerCase().indexOf(q) !== -1 ? "" : "none";
            });
          });
        }
        modal.querySelectorAll(".btnSelectTag").forEach((btn) => {
          btn.addEventListener("mouseover", function() {
            this.style.background = "rgba(82,181,75,0.08)";
          });
          btn.addEventListener("mouseout", function() {
            this.style.background = "transparent";
          });
          btn.addEventListener("click", function() {
            const tagName = this.dataset.name;
            modal.remove();
            document.removeEventListener("keydown", onEsc);
            deps.showTopListModal(tagName || null, tagName || null, onSuccess, void 0, deps);
          });
        });
      }
      renderStep1();
    }

    function rowTagLower(row) {
      return (row.dataset.tag || "").toLowerCase();
    }
    function buildScheduleBadgeHtml(row, deps) {
      const overrideChk = row.querySelector(".chkOverrideWhenActive");
      const hasSchedule = row.querySelectorAll(".date-row").length > 0;
      const hasOverride = hasSchedule && !!overrideChk && overrideChk.checked;
      const schedPriorityClass = hasOverride ? " priority-active" : "";
      const schedActiveClass = deps.isScheduleCurrentlyActive(deps.readIntervalsFromRow(row)) ? " schedule-active" : "";
      const schedText = hasOverride ? "Schedule priority" : "Schedule";
      return '<span class="tag-indicator schedule' + schedPriorityClass + schedActiveClass + '"><i class="md-icon" style="font-size:1.1em;">calendar_today</i> ' + schedText + "</span>";
    }
    function setupRowEvents(row, deps) {
      function updateBadges(r) {
        const container = r.querySelector(".badge-container");
        if (!container) return;
        const hasSchedule = r.querySelectorAll(".date-row").length > 0;
        const collChk = r.querySelector(".chkEnableCollection");
        const hseChk = r.querySelector(".chkEnableHomeSection");
        const tagChk = r.querySelector(".chkEnableTag");
        const plChk = r.querySelector(".chkEnablePlaylist");
        const hasCollection = !!collChk && collChk.checked;
        const hasHomeSection = !!hseChk && hseChk.checked;
        const hasTag = !!tagChk && tagChk.checked;
        const hasPlaylist = !!plChk && plChk.checked;
        const overrideChk = r.querySelector(".chkOverrideWhenActive");
        if (overrideChk) {
          overrideChk.disabled = !hasSchedule;
          if (!hasSchedule) overrideChk.checked = false;
          const overrideContainer = overrideChk.closest(".checkboxContainer");
          if (overrideContainer) overrideContainer.style.opacity = hasSchedule ? "" : "0.4";
        }
        const sourceBadge = r.querySelector(".source-badge");
        const sourceTypeEl = r.querySelector(".selSourceType");
        if (sourceBadge && sourceTypeEl) {
          sourceBadge.innerHTML = deps.getSourceBadgeHtml(sourceTypeEl.value);
        }
        let html = "";
        if (hasSchedule) html += buildScheduleBadgeHtml(r, deps);
        if (hasCollection) {
          html += '<span class="tag-indicator collection"><i class="md-icon" style="font-size:1.1em;">library_books</i> Collection</span>';
        }
        if (hasHomeSection) {
          html += '<span class="tag-indicator homescreen"><i class="md-icon" style="font-size:1.1em;">home</i> Home Section</span>';
        }
        if (hasTag) {
          html += '<span class="tag-indicator tag"><i class="md-icon" style="font-size:1.1em;">label</i> Tag</span>';
        }
        if (hasPlaylist) {
          html += '<span class="tag-indicator playlist"><i class="md-icon" style="font-size:1.1em;">queue_music</i> Playlist</span>';
        }
        if (deps.topLists.tagNames.has(rowTagLower(r))) {
          html += '<span class="tag-indicator toplist"><i class="md-icon" style="font-size:1.1em;">format_list_numbered</i> Top-List</span>';
        }
        container.innerHTML = html;
      }
      function updateRunGroupBtn(_r) {
        const runBtn = row.querySelector(".btnRunEntry");
        if (!runBtn || !chk) return;
        const active = chk.checked;
        runBtn.disabled = !active;
        runBtn.style.opacity = active ? "1" : "0.4";
      }
      function updateTagTitle(_r) {
        const lbl = row.querySelector(".txtEntryLabel")?.value || "";
        const tag = row.querySelector(".txtTagName")?.value || "";
        const titleEl = row.querySelector(".tag-title");
        if (titleEl) titleEl.textContent = lbl || tag || "New";
        const tagNameEl = row.querySelector(".txtTagName");
        if (tagNameEl) tagNameEl.setAttribute("placeholder", lbl);
        const collNameEl = row.querySelector(".txtCollectionName");
        if (collNameEl) collNameEl.setAttribute("placeholder", lbl);
        const hseCustomTitle = row.querySelector('[data-field="CustomName"]');
        if (hseCustomTitle) hseCustomTitle.setAttribute("placeholder", lbl);
        updateBadges(row);
      }
      deps.updateBadges = updateBadges;
      deps.updateRunGroupBtn = updateRunGroupBtn;
      deps.updateTagTitle = updateTagTitle;
      row.querySelectorAll(".tag-tab").forEach((tab) => {
        tab.addEventListener("click", function() {
          row.querySelectorAll(".tag-tab").forEach((t) => {
            t.style.opacity = "0.6";
            t.style.borderBottomColor = "transparent";
          });
          this.style.opacity = "1";
          this.style.borderBottomColor = "#52B54B";
          const target = this.getAttribute("data-tab") || "";
          const generalTab = row.querySelector(".general-tab");
          const tagTab = row.querySelector(".tagname-tab");
          const schedTab = row.querySelector(".schedule-tab");
          const collTab = row.querySelector(".collection-tab");
          const advTab = row.querySelector(".advanced-tab");
          const hseTab = row.querySelector(".homescreen-tab");
          const plTab = row.querySelector(".playlist-tab");
          if (generalTab) generalTab.style.display = target === "general" ? "block" : "none";
          if (tagTab) tagTab.style.display = target === "tag" ? "block" : "none";
          if (schedTab) schedTab.style.display = target === "schedule" ? "block" : "none";
          if (collTab) collTab.style.display = target === "collection" ? "block" : "none";
          if (advTab) advTab.style.display = target === "advanced" ? "block" : "none";
          if (hseTab) hseTab.style.display = target === "homescreen" ? "block" : "none";
          if (plTab) plTab.style.display = target === "playlist" ? "block" : "none";
          if (target === "homescreen") deps.initHomeSectionTab(row);
          if (target === "playlist") deps.initPlaylistTab(row);
          const activeTabEl = row.querySelector("." + target + "-tab");
          if (activeTabEl) {
            activeTabEl.querySelectorAll("textarea.txtMiValue, textarea.txtTagBlacklist").forEach((ta) => {
              ta.style.height = "auto";
              ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
              ta.style.overflowY = ta.scrollHeight > 120 ? "auto" : "hidden";
            });
          }
        });
      });
      row.addEventListener("change", (e) => {
        const target = e.target;
        if (!target || !target.classList) return;
        const classes = target.classList;
        if (classes.contains("selSourceType")) {
          const type = target.value;
          const extC = row.querySelector(".source-external-container");
          const locC = row.querySelector(".source-local-container");
          const miC = row.querySelector(".source-mediainfo-container");
          const aiC = row.querySelector(".source-ai-container");
          if (extC) extC.style.display = type === "External" ? "block" : "none";
          if (locC) locC.style.display = type === "LocalCollection" || type === "LocalPlaylist" ? "block" : "none";
          if (miC) miC.style.display = type && type !== "" ? "block" : "none";
          if (aiC) aiC.style.display = type === "AI" ? "block" : "none";
          const hint = row.querySelector(".source-type-hint");
          if (hint) {
            const hints = {
              "External": "Use an external list to tag, or create a collection, from the items that match your library.",
              "LocalCollection": "Every item in the selected collection(s) gets the configured tag or is added to a new collection. You can also use this to create a curated list of selected collections as a home screen section.",
              "LocalPlaylist": "Every item in the selected playlist(s) gets the configured tag or is added to a new collection.",
              "MediaInfo": "Filter your own library to select which movies or shows to tag or create a collection of. This is also known as a Smart Playlist.",
              "AI": "Use AI to create a list. Write your prompt and the AI will build a list based on it."
            };
            hint.textContent = hints[type] || "";
          }
          const isMi = type === "MediaInfo";
          const miLimitRow = row.querySelector(".mi-limit-row");
          const miToggleRow = row.querySelector(".mi-toggle-row");
          const miFilterBody = row.querySelector(".mi-filter-body");
          const miHelpBtnRow = row.querySelector(".mi-help-btn-row");
          const miPresetsSection = row.querySelector(".mi-presets-section");
          if (miPresetsSection) miPresetsSection.style.display = isMi ? "block" : "none";
          if (miLimitRow) miLimitRow.style.display = isMi ? "flex" : "none";
          if (miHelpBtnRow) miHelpBtnRow.style.display = isMi ? "none" : "flex";
          if (isMi) {
            if (miToggleRow) miToggleRow.style.display = "none";
            if (miFilterBody) miFilterBody.style.display = "block";
          } else if (type) {
            if (miToggleRow) miToggleRow.style.display = "block";
            if (miFilterBody) miFilterBody.style.display = "none";
          }
          if (type) {
            const miList = row.querySelector(".mediainfo-filter-list");
            if (miList && isMi && miList.querySelectorAll(".mediainfo-filter-group").length === 0) {
              miList.insertAdjacentHTML(
                "beforeend",
                getMediaInfoFilterGroupHtml({ Operator: "AND", Criteria: [], GroupOperator: "AND" }, 0, true, deps.miFilterDeps)
              );
            }
          }
          if (type === "LocalCollection" || type === "LocalPlaylist") {
            const localListContainer = row.querySelector(".local-list-container");
            const localTypeLabel = row.querySelector(".local-type-label");
            if (localListContainer) {
              localListContainer.innerHTML = getLocalRowHtml(type, "", 0);
            }
            if (localTypeLabel) {
              localTypeLabel.textContent = type === "LocalPlaylist" ? "Select Playlists" : "Select Collections";
            }
          }
          updateBadges(row);
          deps.updateHseSectionAvailability(row);
          setTimeout(deps.checkFormState, 0);
          return;
        }
        if (classes.contains("selMiProperty")) {
          const miRule = target.closest(".mi-rule");
          if (miRule) {
            const valueWrapper = miRule.querySelector(".mi-value-wrapper");
            if (valueWrapper) {
              valueWrapper.innerHTML = getMiValueHtml(
                target.value,
                "",
                "",
                "",
                deps.miFilterDeps
              );
            }
            const existingHint = miRule.querySelector(".mi-rule-hint");
            if (existingHint) {
              existingHint.outerHTML = getMiHintHtml(target.value);
            }
          }
          deps.updateHseSectionAvailability(row);
          setTimeout(deps.checkFormState, 0);
          return;
        }
        if (classes.contains("selMiUser")) {
          deps.updateHseSectionAvailability(row);
          setTimeout(deps.checkFormState, 0);
          return;
        }
        if (classes.contains("selMiValue")) {
          const miRule = target.closest(".mi-rule");
          if (miRule) {
            const propEl = miRule.querySelector(".selMiProperty");
            const prop = propEl?.value || "";
            if (prop === "MediaType") {
              const incParent = miRule.querySelector(".mi-include-parent");
              if (incParent) {
                incParent.style.display = target.value === "Episode" ? "inline-flex" : "none";
              }
            }
          }
          setTimeout(deps.checkFormState, 0);
          return;
        }
        if (classes.contains("selDateType")) {
          const dateRow = target.closest(".date-row");
          if (dateRow) {
            const type = target.value;
            const specific = dateRow.querySelector(".inputs-specific");
            const annual = dateRow.querySelector(".inputs-annual");
            const weekly = dateRow.querySelector(".inputs-weekly");
            if (specific) specific.style.display = type === "SpecificDate" ? "flex" : "none";
            if (annual) annual.style.display = type === "EveryYear" ? "flex" : "none";
            if (weekly) weekly.style.display = type === "Weekly" ? "flex" : "none";
          }
          setTimeout(deps.checkFormState, 0);
          return;
        }
        if (classes.contains("selStartMonth") || classes.contains("selEndMonth")) {
          const isStart = classes.contains("selStartMonth");
          const dateRow = target.closest(".date-row");
          if (dateRow) {
            const month = parseInt(target.value, 10);
            const maxDay = deps.getMaxDays(month);
            const daySelect = dateRow.querySelector(isStart ? ".selStartDay" : ".selEndDay");
            if (daySelect) {
              const currentDay = Math.min(parseInt(daySelect.value, 10), maxDay);
              daySelect.innerHTML = deps.getDayOptions(currentDay, maxDay);
            }
          }
          setTimeout(deps.checkFormState, 0);
          return;
        }
        setTimeout(deps.checkFormState, 0);
      });
      const header = row.querySelector(".tag-header");
      const body = row.querySelector(".tag-body");
      const icon = row.querySelector(".expand-icon");
      if (header && body) {
        header.addEventListener("click", (e) => {
          const ev = e;
          if (ev.target instanceof Element && ev.target.closest(".header-actions")) return;
          const isHidden = body.style.display === "none";
          body.style.display = isHidden ? "block" : "none";
          if (icon) icon.innerText = isHidden ? "expand_less" : "expand_more";
          if (isHidden) {
            body.querySelectorAll("textarea.txtMiValue, textarea.txtTagBlacklist").forEach((ta) => {
              ta.style.height = "auto";
              ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
              ta.style.overflowY = ta.scrollHeight > 120 ? "auto" : "hidden";
            });
          }
        });
      }
      const chk = row.querySelector(".chkTagActive");
      const lblStatus = row.querySelector(".lblActiveStatus");
      if (chk && lblStatus) {
        chk.addEventListener("change", function() {
          lblStatus.textContent = this.checked ? "Active" : "Disabled";
          lblStatus.style.color = this.checked ? "#52B54B" : "var(--theme-text-secondary)";
          if (this.checked) row.classList.remove("inactive");
          else row.classList.add("inactive");
          updateRunGroupBtn();
        });
      }
      updateRunGroupBtn();
      const chkEnableTag = row.querySelector(".chkEnableTag");
      if (chkEnableTag) {
        chkEnableTag.addEventListener("change", function() {
          const tagSettings = row.querySelector(".tag-settings");
          if (tagSettings) tagSettings.style.display = this.checked ? "block" : "none";
          updateBadges(row);
          deps.updateHseSectionAvailability(row);
        });
      }
      const chkEnableCollection = row.querySelector(".chkEnableCollection");
      if (chkEnableCollection) {
        chkEnableCollection.addEventListener("change", function() {
          const collSettings = row.querySelector(".collection-settings");
          if (collSettings) collSettings.style.display = this.checked ? "block" : "none";
          updateBadges(row);
          deps.updateHseSectionAvailability(row);
        });
      }
      const chkEnablePlaylist = row.querySelector(".chkEnablePlaylist");
      if (chkEnablePlaylist) {
        chkEnablePlaylist.addEventListener("change", function() {
          const plSettings = row.querySelector(".playlist-settings");
          if (plSettings) plSettings.style.display = this.checked ? "block" : "none";
          updateBadges(row);
        });
      }
      const chkOverride = row.querySelector(".chkOverrideWhenActive");
      if (chkOverride) {
        chkOverride.addEventListener("change", () => {
          updateBadges(row);
        });
      }
      const chkEnableHse = row.querySelector(".chkEnableHomeSection");
      if (chkEnableHse) {
        chkEnableHse.addEventListener("change", function() {
          const hseDetails = row.querySelector(".hse-details");
          if (hseDetails) hseDetails.style.display = this.checked ? "block" : "none";
          updateBadges(row);
        });
      }
      const chkAiWatched = row.querySelector(".chkAiRecentlyWatched");
      if (chkAiWatched) {
        chkAiWatched.addEventListener("change", function() {
          const opts = row.querySelector(".ai-recently-watched-options");
          if (opts) opts.style.display = this.checked ? "block" : "none";
        });
      }
      const selAiProv = row.querySelector(".selAiProvider");
      if (selAiProv) {
        selAiProv.addEventListener("change", function() {
          const warn = row.querySelector(".ollama-experimental-warning");
          if (warn) warn.style.display = this.value === "Ollama" ? "flex" : "none";
        });
      }
      const btnAddUrl = row.querySelector(".btnAddUrl");
      if (btnAddUrl) {
        btnAddUrl.addEventListener("click", () => {
          const urlListContainer = row.querySelector(".url-list-container");
          if (urlListContainer) {
            urlListContainer.insertAdjacentHTML("beforeend", getUrlRowHtml("", 0));
          }
        });
      }
      const btnAddLocal = row.querySelector(".btnAddLocal");
      if (btnAddLocal) {
        btnAddLocal.addEventListener("click", () => {
          const st = row.querySelector(".selSourceType")?.value || "";
          const localListContainer = row.querySelector(".local-list-container");
          if (localListContainer) {
            localListContainer.insertAdjacentHTML("beforeend", getLocalRowHtml(st, "", 0));
          }
        });
      }
      const btnAddDate = row.querySelector(".btnAddDate");
      if (btnAddDate) {
        btnAddDate.addEventListener("click", () => {
          const dateListContainer = row.querySelector(".date-list-container");
          if (dateListContainer) {
            dateListContainer.insertAdjacentHTML("beforeend", getDateRowHtml({ Type: "SpecificDate" }));
          }
          updateBadges(row);
        });
      }
      const btnTagTargetHelp = row.querySelector(".btnTagTargetHelp");
      if (btnTagTargetHelp) {
        btnTagTargetHelp.addEventListener("click", () => {
          document.getElementById("tagTargetHelpModalOverlay")?.classList.add("modal-visible");
        });
      }
      const btnCollTargetHelp = row.querySelector(".btnCollTargetHelp");
      if (btnCollTargetHelp) {
        btnCollTargetHelp.addEventListener("click", () => {
          document.getElementById("tagTargetHelpModalOverlay")?.classList.add("modal-visible");
        });
      }
      row.addEventListener("click", (e) => {
        const ev = e;
        const clickTarget = ev.target;
        if (!clickTarget) return;
        if (clickTarget.closest(".btnMiHelp")) {
          document.getElementById("miHelpModalOverlay")?.classList.add("modal-visible");
          return;
        }
        if (clickTarget.closest(".btnToggleAdditionalFilters")) {
          const miToggleRow = row.querySelector(".mi-toggle-row");
          const miFilterBody = row.querySelector(".mi-filter-body");
          if (miToggleRow) miToggleRow.style.display = "none";
          if (miFilterBody) miFilterBody.style.display = "block";
          const miList = row.querySelector(".mediainfo-filter-list");
          if (miList && miList.querySelectorAll(".mediainfo-filter-group").length === 0) {
            miList.insertAdjacentHTML(
              "beforeend",
              getMediaInfoFilterGroupHtml({ Operator: "AND", Criteria: [], GroupOperator: "AND" }, 0, true, deps.miFilterDeps)
            );
          }
          return;
        }
        const removeUrlBtn = clickTarget.closest(".btnRemoveUrl");
        if (removeUrlBtn) {
          const urlRow = removeUrlBtn.closest(".url-row");
          if (urlRow) urlRow.remove();
          return;
        }
        const removeLocalBtn = clickTarget.closest(".btnRemoveLocal");
        if (removeLocalBtn) {
          const localRow = removeLocalBtn.closest(".local-row");
          if (localRow) localRow.remove();
          return;
        }
        const removeDateBtn = clickTarget.closest(".btnRemoveDate");
        if (removeDateBtn) {
          const dateRow = removeDateBtn.closest(".date-row");
          if (dateRow) dateRow.remove();
          updateBadges(row);
          return;
        }
        const premadeBtn = clickTarget.closest(".btnPremadeFilters");
        if (premadeBtn) {
          const panel = premadeBtn.closest(".source-mediainfo-container")?.querySelector(".mi-preset-panel");
          if (panel) {
            const open = panel.style.display === "none";
            panel.style.display = open ? "" : "none";
            const iconEl = premadeBtn.querySelector(".mi-expand-icon");
            if (iconEl) iconEl.style.transform = open ? "rotate(180deg)" : "";
          }
          return;
        }
        const mySavedBtn = clickTarget.closest(".btnMySavedFilters");
        if (mySavedBtn) {
          const savedPanel = mySavedBtn.closest(".source-mediainfo-container")?.querySelector(".mi-saved-panel");
          if (savedPanel) {
            const open = savedPanel.style.display === "none";
            savedPanel.style.display = open ? "" : "none";
            const iconEl = mySavedBtn.querySelector(".mi-expand-icon");
            if (iconEl) iconEl.style.transform = open ? "rotate(180deg)" : "";
          }
          return;
        }
        const confirmSaveBtn = clickTarget.closest(".btnConfirmSaveFilter");
        if (confirmSaveBtn) {
          const miContainer = confirmSaveBtn.closest(".source-mediainfo-container");
          if (miContainer) {
            const nameInput = miContainer.querySelector(".txtSaveFilterName");
            const name = nameInput?.value.trim() || "";
            if (!name) {
              nameInput?.focus();
              return;
            }
            const filters = readMiFiltersFromContainer(miContainer);
            if (filters.length === 0) {
              nameInput?.focus();
              return;
            }
            deps.savedFilters.filters.push({ Name: name, Filters: filters });
            if (nameInput) nameInput.value = "";
            deps.refreshMySavedFiltersPanels(deps.savedFilters.filters);
            deps.saveSavedFiltersNow();
          }
          return;
        }
        const applySavedBtn = clickTarget.closest(".btnApplyMySavedFilter");
        if (applySavedBtn) {
          const idx = parseInt(applySavedBtn.dataset.index || "-1", 10);
          const sf = deps.savedFilters.filters[idx];
          if (sf) {
            const savedList = applySavedBtn.closest(".source-mediainfo-container")?.querySelector(".mediainfo-filter-list");
            if (savedList) {
              savedList.innerHTML = sf.Filters.map(
                (f, i) => getMediaInfoFilterGroupHtml(f, i, i === 0, deps.miFilterDeps)
              ).join("");
            }
            const savedPanel = applySavedBtn.closest(".mi-saved-panel");
            if (savedPanel) savedPanel.style.display = "none";
            setTimeout(deps.checkFormState, 0);
          }
          return;
        }
        const deleteSavedBtn = clickTarget.closest(".btnDeleteMySavedFilter");
        if (deleteSavedBtn) {
          const idx = parseInt(deleteSavedBtn.dataset.index || "-1", 10);
          if (idx >= 0) deps.savedFilters.filters.splice(idx, 1);
          deps.refreshMySavedFiltersPanels(deps.savedFilters.filters);
          deps.saveSavedFiltersNow();
          return;
        }
        const applyPresetBtn = clickTarget.closest(".btnApplyMiPreset");
        if (applyPresetBtn) {
          const dataset = applyPresetBtn.dataset.preset || "";
          const idxParts = dataset.split(",");
          const catIdx = parseInt(idxParts[0] || "-1", 10);
          const presetIdx = parseInt(idxParts[1] || "-1", 10);
          const cat = deps.miPresets[catIdx];
          const preset = cat?.presets[presetIdx];
          if (preset) {
            const presetFilters = preset.build();
            const presetList = applyPresetBtn.closest(".source-mediainfo-container")?.querySelector(".mediainfo-filter-list");
            if (presetList) {
              presetList.innerHTML = presetFilters.map(
                (f, i) => getMediaInfoFilterGroupHtml(f, i, i === 0, deps.miFilterDeps)
              ).join("");
            }
            const presetPanel = applyPresetBtn.closest(".mi-preset-panel");
            if (presetPanel) presetPanel.style.display = "none";
            setTimeout(deps.checkFormState, 0);
          }
          return;
        }
        if (clickTarget.closest(".btnAddMediaInfoFilter")) {
          const list = row.querySelector(".mediainfo-filter-list");
          if (list) {
            const idx = list.querySelectorAll(".mediainfo-filter-group").length;
            list.insertAdjacentHTML(
              "beforeend",
              getMediaInfoFilterGroupHtml(
                { Operator: "AND", Criteria: [], GroupOperator: "AND" },
                idx,
                false,
                deps.miFilterDeps
              )
            );
          }
          return;
        }
        if (clickTarget.closest(".btnClearAllFilters")) {
          const list = row.querySelector(".mediainfo-filter-list");
          if (list) list.innerHTML = "";
          return;
        }
        if (clickTarget.closest(".btnRemoveFilterGroup")) {
          const group = clickTarget.closest(".mediainfo-filter-group");
          if (group) group.remove();
          const miList = row.querySelector(".mediainfo-filter-list");
          const firstGroup = miList?.querySelector(".mediainfo-filter-group");
          if (firstGroup) {
            const conn = firstGroup.querySelector(".mi-group-connector");
            if (conn) conn.remove();
          }
          return;
        }
        const groupOpBtn = clickTarget.closest(".btnGroupOpChoice");
        if (groupOpBtn) {
          const newOp = groupOpBtn.dataset.value || "AND";
          const group = groupOpBtn.closest(".mediainfo-filter-group");
          if (group) {
            group.dataset.groupOp = newOp;
            group.querySelectorAll(".btnGroupOpChoice").forEach((b) => {
              const active = (b.dataset.value || "") === newOp;
              b.style.background = active ? newOp === "AND" ? "rgba(0,164,220,0.75)" : "rgba(220,120,0,0.75)" : "transparent";
              b.style.color = active ? "#fff" : "";
            });
            const desc = group.querySelector(".group-op-desc");
            if (desc) desc.textContent = newOp === "AND" ? "Both groups must match" : "Either group is enough";
          }
          setTimeout(deps.checkFormState, 0);
          return;
        }
        const innerOpBtn = clickTarget.closest(".btnGroupInnerOpChoice");
        if (innerOpBtn) {
          const newOp = innerOpBtn.dataset.value || "AND";
          const group = innerOpBtn.closest(".mediainfo-filter-group");
          if (group) {
            group.dataset.op = newOp;
            group.querySelectorAll(".btnGroupInnerOpChoice").forEach((b) => {
              const active = (b.dataset.value || "") === newOp;
              b.style.background = active ? newOp === "AND" ? "rgba(0,164,220,0.75)" : "rgba(220,120,0,0.75)" : "transparent";
              b.style.color = active ? "#fff" : "";
            });
            const desc = group.querySelector(".inner-op-desc");
            if (desc) desc.textContent = newOp === "AND" ? "All rules must match" : "Any rule is enough";
          }
          setTimeout(deps.checkFormState, 0);
          return;
        }
        const notBtn = clickTarget.closest(".btnNotToggle");
        if (notBtn) {
          const active = notBtn.dataset.not === "1";
          const nextActive = !active;
          notBtn.dataset.not = nextActive ? "1" : "0";
          notBtn.style.background = nextActive ? "rgba(200,50,50,0.75)" : "transparent";
          notBtn.style.color = nextActive ? "#fff" : "";
          notBtn.style.border = nextActive ? "1px solid rgba(200,50,50,0.6)" : "1px solid rgba(128,128,128,0.4)";
          setTimeout(deps.checkFormState, 0);
          return;
        }
        if (clickTarget.closest(".mi-include-parent")) {
          setTimeout(deps.checkFormState, 0);
          return;
        }
        if (clickTarget.closest(".btnAddMiRule")) {
          const group = clickTarget.closest(".mediainfo-filter-group");
          const rulesList = group?.querySelector(".mi-rules-list");
          if (rulesList) {
            rulesList.insertAdjacentHTML("beforeend", getMediaInfoRuleHtml("", deps.miFilterDeps));
          }
          return;
        }
        if (clickTarget.closest(".btnRemoveMiRule")) {
          const miRule = clickTarget.closest(".mi-rule");
          if (miRule) miRule.remove();
          return;
        }
        if (clickTarget.closest(".btnRemoveGroup")) {
          const removeConfirmed = typeof confirm === "function" ? confirm("Delete this tag group?") : window.confirm("Delete this tag group?");
          if (removeConfirmed) row.remove();
          return;
        }
        const runEntryBtn = clickTarget.closest(".btnRunEntry");
        if (runEntryBtn) {
          const entryName = row.querySelector(".txtEntryLabel")?.value || row.querySelector(".txtTagName")?.value || "";
          if (!entryName) {
            deps.alert("Entry has no name or tag.");
            return;
          }
          const doRun = () => {
            const liveView2 = row.closest("#HomeScreenCompanionConfigPage");
            const btn = row.querySelector(".btnRunEntry");
            const lbl = btn?.querySelector(".btnRunEntryLabel");
            const btnSaveEl = liveView2?.querySelector(".btn-save");
            const dotEl = liveView2?.querySelector("#dotStatus");
            const labelEl = liveView2?.querySelector("#lastRunStatusLabel");
            if (lbl) lbl.textContent = "Running\u2026";
            if (btn) btn.disabled = true;
            if (btnSaveEl) {
              btnSaveEl.disabled = true;
              btnSaveEl.style.opacity = "0.5";
              const sp = btnSaveEl.querySelector("span");
              if (sp) sp.textContent = "Sync in progress...";
            }
            if (dotEl) dotEl.className = "status-dot running";
            if (labelEl) labelEl.textContent = "Running...";
            const apiClient = typeof window !== "undefined" ? window.ApiClient : void 0;
            if (!apiClient) return;
            const headers = {
              "Content-Type": "application/json",
              "X-MediaBrowser-Token": apiClient.accessToken()
            };
            fetch(apiClient.getUrl("HomeScreenCompanion/RunEntry"), {
              method: "POST",
              headers,
              body: JSON.stringify({ EntryName: entryName })
            }).then((r) => r.json()).then((result) => {
              if (lbl) lbl.textContent = "Run Group";
              if (btn) btn.disabled = false;
              if (liveView2) deps.refreshStatus(liveView2);
              deps.alert(result.Success ? "Done: " + result.Message : "Failed: " + result.Message);
            }).catch(() => {
              if (lbl) lbl.textContent = "Run Group";
              if (btn) btn.disabled = false;
              if (liveView2) deps.refreshStatus(liveView2);
              deps.alert("Request failed.");
            });
          };
          const liveView = row.closest("#HomeScreenCompanionConfigPage");
          const _saveBtn = liveView ? liveView.querySelector(".btn-save") : document.querySelector(".btn-save");
          const isDirty = !!_saveBtn && !_saveBtn.disabled;
          if (isDirty) {
            const confirmed = typeof confirm === "function" ? confirm("You have unsaved changes. Save and run?") : window.confirm("You have unsaved changes. Save and run?");
            if (confirmed) {
              _saveBtn?.click();
              setTimeout(doRun, 800);
            }
          } else {
            doRun();
          }
          return;
        }
        const btnTest = clickTarget.closest(".btnTestUrl");
        if (btnTest) {
          const uRow = btnTest.closest(".url-row");
          if (uRow) {
            const urlInput = uRow.querySelector(".txtTagUrl");
            const url = urlInput?.value || "";
            if (!url) return;
            const limitInput = uRow.querySelector(".txtUrlLimit");
            const limitVal = parseInt(limitInput?.value || "0", 10) || 0;
            const testBtn = btnTest;
            testBtn.disabled = true;
            const apiClient = typeof window !== "undefined" ? window.ApiClient : void 0;
            if (apiClient) {
              apiClient.getJSON(apiClient.getUrl("HomeScreenCompanion/TestUrl", { Url: url, Limit: limitVal })).then((result) => {
                deps.alert(result.Message || "");
              }).finally(() => {
                testBtn.disabled = false;
              });
            } else {
              testBtn.disabled = false;
            }
          }
          return;
        }
        const btnTestAi = clickTarget.closest(".btnTestAiSource");
        if (btnTestAi) {
          const aiContainer = btnTestAi.closest(".source-ai-container");
          if (aiContainer) {
            const aiProvider = aiContainer.querySelector(".selAiProvider")?.value || "OpenAI";
            const aiPrompt = (aiContainer.querySelector(".txtAiPrompt")?.value || "").trim();
            const aiIncludeWatched = !!aiContainer.querySelector(".chkAiRecentlyWatched")?.checked;
            const aiWatchedUserId = aiIncludeWatched ? aiContainer.querySelector(".selAiWatchedUser")?.value || "" : "";
            const aiWatchedCount = parseInt(
              aiContainer.querySelector(".txtAiWatchedCount")?.value || "20",
              10
            ) || 20;
            const resultSpan = aiContainer.querySelector(".ai-test-result");
            if (!aiPrompt) {
              if (resultSpan) resultSpan.textContent = "Please enter a prompt first.";
              return;
            }
            const testBtn = btnTestAi;
            testBtn.disabled = true;
            if (resultSpan) resultSpan.textContent = "Testing...";
            const apiClient = typeof window !== "undefined" ? window.ApiClient : void 0;
            if (!apiClient) {
              testBtn.disabled = false;
              return;
            }
            const headers = {
              "Content-Type": "application/json",
              "X-MediaBrowser-Token": apiClient.accessToken()
            };
            fetch(apiClient.getUrl("HomeScreenCompanion/TestAiSource"), {
              method: "POST",
              headers,
              body: JSON.stringify({
                Provider: aiProvider,
                Prompt: aiPrompt,
                IncludeRecentlyWatched: aiIncludeWatched,
                RecentlyWatchedUserId: aiWatchedUserId,
                RecentlyWatchedCount: aiWatchedCount
              })
            }).then((r) => r.json()).then((result) => {
              if (resultSpan) {
                resultSpan.textContent = result.Success ? result.Message || "" : "Failed: " + result.Message;
              }
              if (result.Success && result.Preview && result.Preview.length > 0) {
                deps.alert("AI returned " + result.Count + " items:\n\n" + result.Preview.join("\n"));
              } else if (!result.Success) {
                deps.alert("AI test failed:\n" + result.Message);
              }
            }).catch((err) => {
              if (resultSpan) {
                resultSpan.textContent = "Error: " + (err instanceof Error ? err.message : String(err));
              }
            }).finally(() => {
              testBtn.disabled = false;
            });
          }
          return;
        }
      });
      const txtEntryLabel = row.querySelector(".txtEntryLabel");
      if (txtEntryLabel) {
        txtEntryLabel.addEventListener("input", () => {
          updateTagTitle();
        });
      }
      const txtTagName = row.querySelector(".txtTagName");
      if (txtTagName) {
        txtTagName.addEventListener("input", () => {
          updateTagTitle();
        });
      }
      const handle = row.querySelector(".drag-handle");
      if (handle) {
        handle.addEventListener("mousedown", () => {
          if (localStorage.getItem("HomeScreenCompanion_SortBy") === "Manual") {
            row.setAttribute("draggable", "true");
          }
        });
        handle.addEventListener("mouseup", () => {
          row.setAttribute("draggable", "false");
        });
        handle.addEventListener("touchstart", (e) => {
          if (localStorage.getItem("HomeScreenCompanion_SortBy") !== "Manual") return;
          const touchEvent = e;
          touchEvent.preventDefault();
          const tagContainer = row.closest("#tagListContainer") || row.parentElement;
          if (!tagContainer) return;
          document.querySelectorAll(".tag-body").forEach((b) => {
            b.style.display = "none";
          });
          document.querySelectorAll(".expand-icon").forEach((i) => {
            i.innerText = "expand_more";
          });
          row.classList.add("dragging");
          const onTouchMove = (ev) => {
            const tEv = ev;
            tEv.preventDefault();
            const touch = tEv.touches[0];
            if (!touch) return;
            const afterEl = getDragAfterElement(tagContainer, touch.clientY);
            let ph = tagContainer.querySelector(".sort-placeholder");
            if (!ph) {
              ph = document.createElement("div");
              ph.className = "sort-placeholder";
            }
            if (afterEl == null) {
              if (ph.nextElementSibling !== null) tagContainer.appendChild(ph);
            } else {
              if (ph.nextElementSibling !== afterEl) tagContainer.insertBefore(ph, afterEl);
            }
          };
          const onTouchEnd = () => {
            document.removeEventListener("touchmove", onTouchMove);
            document.removeEventListener("touchend", onTouchEnd);
            document.removeEventListener("touchcancel", onTouchCancel);
            row.classList.remove("dragging");
            const ph = tagContainer.querySelector(".sort-placeholder");
            if (ph) {
              tagContainer.insertBefore(row, ph);
              ph.remove();
            }
            row.classList.add("just-moved");
            setTimeout(() => {
              row.classList.remove("just-moved");
            }, 2e3);
            setTimeout(deps.checkFormState, 0);
          };
          const onTouchCancel = () => {
            document.removeEventListener("touchmove", onTouchMove);
            document.removeEventListener("touchend", onTouchEnd);
            document.removeEventListener("touchcancel", onTouchCancel);
            row.classList.remove("dragging");
            const ph = tagContainer.querySelector(".sort-placeholder");
            if (ph) ph.remove();
          };
          document.addEventListener("touchmove", onTouchMove, { passive: false });
          document.addEventListener("touchend", onTouchEnd);
          document.addEventListener("touchcancel", onTouchCancel);
        }, { passive: false });
      }
      const btnDuplicateRow = row.querySelector(".btnDuplicateRow");
      if (btnDuplicateRow) {
        btnDuplicateRow.addEventListener("click", () => {
          const config = readRowAsConfig(row);
          const tagged = {
            ...config,
            Name: (config.Name || config.Tag || "Source") + " (copy)"
          };
          const tagContainer = row.closest("#tagListContainer");
          deps.renderTagGroup(tagged, tagContainer, true, void 0, true);
          deps.applyFilters(deps.view);
          setTimeout(deps.checkFormState, 0);
        });
      }
      row.addEventListener("dragstart", (e) => {
        if (localStorage.getItem("HomeScreenCompanion_SortBy") !== "Manual") {
          e.preventDefault();
          return;
        }
        document.querySelectorAll(".tag-body").forEach((b) => {
          b.style.display = "none";
        });
        document.querySelectorAll(".expand-icon").forEach((i) => {
          i.innerText = "expand_more";
        });
        row.classList.add("dragging");
        const dragEv = e;
        if (dragEv.dataTransfer) {
          dragEv.dataTransfer.effectAllowed = "move";
          dragEv.dataTransfer.setData("text/plain", "");
        }
        setTimeout(() => {
          row.style.display = "none";
        }, 0);
      });
      row.addEventListener("dragend", () => {
        row.style.display = "";
        row.classList.remove("dragging");
        row.setAttribute("draggable", "false");
        const existingPlaceholder = document.querySelector(".sort-placeholder");
        if (existingPlaceholder) existingPlaceholder.remove();
        row.classList.add("just-moved");
        setTimeout(() => {
          row.classList.remove("just-moved");
        }, 2e3);
        setTimeout(deps.checkFormState, 0);
      });
      const btnChoosePoster = row.querySelector(".btnChoosePoster");
      const inputPosterFile = row.querySelector(".inputPosterFile");
      if (btnChoosePoster && inputPosterFile) {
        btnChoosePoster.addEventListener("click", () => {
          inputPosterFile.click();
        });
        inputPosterFile.addEventListener("change", () => {
          const file = inputPosterFile.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = (re) => {
            const dataUrl = re.target?.result;
            if (typeof dataUrl !== "string") return;
            const base64 = dataUrl.split(",")[1] || "";
            const img = row.querySelector(".poster-preview-img");
            if (img) {
              img.src = dataUrl;
              img.style.display = "block";
            }
            const apiClient = typeof window !== "undefined" ? window.ApiClient : void 0;
            if (!apiClient) return;
            const headers = { "Content-Type": "application/json" };
            const token = apiClient.accessToken();
            if (token) headers["X-Emby-Token"] = token;
            const hiddenPath = row.querySelector(".hiddenPosterPath")?.value || "";
            fetch(apiClient.getUrl("HomeScreenCompanion/UploadCollectionImage"), {
              method: "POST",
              headers,
              body: JSON.stringify({ FileName: file.name, Base64Data: base64, OldFilePath: hiddenPath })
            }).then((r) => r.json()).then((result) => {
              if (result.Success) {
                const pathInput = row.querySelector(".hiddenPosterPath");
                if (pathInput && result.FilePath) pathInput.value = result.FilePath;
                const fnameEl = row.querySelector(".poster-filename");
                if (fnameEl) fnameEl.textContent = file.name;
                const previewContainer = row.querySelector(".poster-preview-container");
                if (previewContainer) previewContainer.style.display = "block";
              } else {
                deps.alert("Upload failed: " + (result.Message || "Unknown error"));
                if (img) img.style.display = "none";
              }
            }).catch(() => {
              deps.alert("Upload error. Check server logs.");
              if (img) img.style.display = "none";
            });
          };
          reader.readAsDataURL(file);
        });
      }
      const btnRemovePoster = row.querySelector(".btnRemovePoster");
      if (btnRemovePoster) {
        btnRemovePoster.addEventListener("click", () => {
          const pathInput = row.querySelector(".hiddenPosterPath");
          if (pathInput) pathInput.value = "";
          const fnameEl = row.querySelector(".poster-filename");
          if (fnameEl) fnameEl.textContent = "";
          const previewContainer = row.querySelector(".poster-preview-container");
          if (previewContainer) previewContainer.style.display = "none";
          const previewImg = row.querySelector(".poster-preview-img");
          if (previewImg) previewImg.style.display = "none";
          if (inputPosterFile) inputPosterFile.value = "";
        });
      }
      const btnLoadPosterUrl = row.querySelector(".btnLoadPosterUrl");
      if (btnLoadPosterUrl) {
        btnLoadPosterUrl.addEventListener("click", () => {
          const urlInput = row.querySelector(".txtPosterUrl");
          const url = (urlInput?.value || "").trim();
          if (!url) return;
          const apiClient = typeof window !== "undefined" ? window.ApiClient : void 0;
          if (!apiClient) return;
          const headers = { "Content-Type": "application/json" };
          const token = apiClient.accessToken();
          if (token) headers["X-Emby-Token"] = token;
          const hiddenPath = row.querySelector(".hiddenPosterPath")?.value || "";
          fetch(apiClient.getUrl("HomeScreenCompanion/FetchCollectionImageFromUrl"), {
            method: "POST",
            headers,
            body: JSON.stringify({ Url: url, OldFilePath: hiddenPath })
          }).then((r) => r.json()).then((result) => {
            if (result.Success) {
              const pathInput = row.querySelector(".hiddenPosterPath");
              if (pathInput && result.FilePath) pathInput.value = result.FilePath;
              const fnameEl = row.querySelector(".poster-filename");
              if (fnameEl) {
                const parts = url.split("/");
                fnameEl.textContent = (parts[parts.length - 1] || "").split("?")[0] || "";
              }
              const previewContainer = row.querySelector(".poster-preview-container");
              if (previewContainer) previewContainer.style.display = "block";
              const img = row.querySelector(".poster-preview-img");
              if (img) {
                img.src = url;
                img.style.display = "block";
              }
              if (urlInput) urlInput.value = "";
            } else {
              deps.alert("Failed to load image: " + (result.Message || "Unknown error"));
            }
          }).catch(() => {
            deps.alert("Error fetching image. Check the URL and server logs.");
          });
        });
      }
      setTimeout(() => {
        deps.updateHseSectionAvailability(row);
      }, 0);
    }

    const customCss = `
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
    function isScheduleCurrentlyActive(intervals) {
      if (!intervals || intervals.length === 0) return false;
      const now = /* @__PURE__ */ new Date();
      const dowNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const todayName = dowNames[now.getDay()] ?? "";
      return intervals.some((iv) => {
        if (iv.Type === "Weekly") {
          const days = (iv.DayOfWeek || "").split(",").map((d) => d.trim());
          return days.indexOf(todayName) >= 0;
        }
        if (!iv.Start || !iv.End) return false;
        const s = new Date(iv.Start);
        const e = new Date(iv.End);
        if (iv.Type === "EveryYear") {
          const nowMD = now.getMonth() * 100 + now.getDate();
          const sMD = s.getMonth() * 100 + s.getDate();
          const eMD = e.getMonth() * 100 + e.getDate();
          return sMD <= nowMD && nowMD <= eMD;
        }
        e.setHours(23, 59, 59, 999);
        return s <= now && now <= e;
      });
    }
    function readIntervalsFromRow(row) {
      const intervals = [];
      row.querySelectorAll(".date-row").forEach((dr) => {
        const drEl = dr;
        const typeSel = drEl.querySelector(".selDateType");
        const type = typeSel ? typeSel.value : "SpecificDate";
        let s = null;
        let e = null;
        let days = "";
        if (type === "SpecificDate") {
          const sEl = drEl.querySelector(".txtFullStartDate");
          const eEl = drEl.querySelector(".txtFullEndDate");
          s = sEl ? sEl.value || null : null;
          e = eEl ? eEl.value || null : null;
        } else if (type === "EveryYear") {
          const sM = drEl.querySelector(".selStartMonth");
          const sD = drEl.querySelector(".selStartDay");
          const eM = drEl.querySelector(".selEndMonth");
          const eD = drEl.querySelector(".selEndDay");
          const smStr = sM ? sM.value : "1";
          const sdStr = sD ? sD.value : "1";
          const emStr = eM ? eM.value : "1";
          const edStr = eD ? eD.value : "1";
          s = "2000-" + smStr.padStart(2, "0") + "-" + sdStr.padStart(2, "0");
          e = "2000-" + emStr.padStart(2, "0") + "-" + edStr.padStart(2, "0");
        } else if (type === "Weekly") {
          const activeBtns = Array.from(drEl.querySelectorAll(".day-toggle.active"));
          days = activeBtns.map((b) => b.dataset.day || "").filter(Boolean).join(",");
        }
        intervals.push({ Type: type, Start: s, End: e, DayOfWeek: days });
      });
      return intervals;
    }
    function getApi() {
      return window.ApiClient;
    }
    function getDashboard() {
      return window.Dashboard;
    }
    function index(view) {
      const appState = createAppState();
      function miFilterDeps() {
        return {
          users: appState.miUsers.users,
          collections: appState.libraryCache.collections,
          playlists: appState.libraryCache.playlists,
          tags: appState.libraryCache.tags
        };
      }
      function hscDeps() {
        return {
          getConfig: () => appState.hsc.config,
          renderTab: legacyRenderHscTab,
          enforceConflict: legacyEnforceHscSourceTargetConflict,
          notifyFormChanged: () => {
            setTimeout(checkFormStateBound, 0);
          }
        };
      }
      function boundGetUiConfig(view2, forComparison) {
        return getUiConfig(view2, forComparison, {
          hsc: appState.hsc,
          savedFilters: appState.savedFilters});
      }
      function checkFormStateBound() {
        checkFormState({
          view: currentView,
          originalConfigState: appState.originalConfigState,
          getUiConfig: boundGetUiConfig
        });
      }
      function applyFiltersFn(view2) {
        applyFilters(view2);
      }
      function refreshStatusFn(view2) {
        refreshStatus(view2, {
          getApiClient: () => ({ getJSON: (n, p) => {
            const ac = getApi();
            return ac ? ac.getJSON(n, p) : Promise.resolve({});
          } }),
          state: appState.logStatus,
          checkFormState: checkFormStateBound
        });
      }
      function getSourceBadgeHtml(st) {
        const map = {
          "External": { icon: "language", title: "External List" },
          "LocalCollection": { icon: "folder_special", title: "Local Collection" },
          "LocalPlaylist": { icon: "playlist_play", title: "Local Playlist" },
          "MediaInfo": { icon: "tune", title: "Smart Playlist" },
          "AI": { icon: "auto_awesome", title: "AI created lists" }
        };
        const e = map[st];
        if (!e) return "";
        return `<span class="tag-indicator source" title="${e.title}"><i class="md-icon" style="font-size:1.1em;">${e.icon}</i></span>`;
      }
      function legacyRenderTagGroup(tagConfig, container, prepend, idx, isNew, afterRef) {
        if (!container) return;
        const html = renderTagGroup(tagConfig, idx, {
          miUsers: appState.miUsers,
          topLists: appState.topLists,
          getUrlRowHtml,
          getLocalRowHtml,
          getDateRowHtml,
          getMediaInfoFilterGroupHtml: (filter, i, isFirst, md) => getMediaInfoFilterGroupHtml(filter, i, isFirst, md),
          getMySavedFiltersPanelHtml: (sf) => getMySavedFiltersPanelHtml(sf),
          tagConfigHasViewerCriteria: (cfg) => tagConfigHasViewerCriteria(cfg),
          miFilterDeps: miFilterDeps(),
          savedFilters: appState.savedFilters.filters
        });
        if (afterRef) afterRef.insertAdjacentHTML("afterend", html);
        else if (prepend) container.insertAdjacentHTML("afterbegin", html);
        else container.insertAdjacentHTML("beforeend", html);
        const newRow = afterRef ? afterRef.nextElementSibling : prepend ? container.firstElementChild : container.lastElementChild;
        if (!newRow) return;
        setupRowEvents(newRow, buildSetupRowDeps(newRow));
        if (isNew) {
          newRow.classList.add("just-added");
          setTimeout(() => newRow.classList.remove("just-added"), 2e3);
        }
      }
      function buildSetupRowDeps(row) {
        const self = {};
        const api = getApi();
        const deps = {
          savedFilters: appState.savedFilters,
          topLists: appState.topLists,
          originalConfigState: appState.originalConfigState,
          miFilterDeps: miFilterDeps(),
          getApiClient: () => ({
            getPluginConfiguration: (id) => api ? api.getPluginConfiguration(id) : Promise.resolve({}),
            updatePluginConfiguration: (id, c) => api ? api.updatePluginConfiguration(id, c) : Promise.resolve({})
          }),
          pluginId: PLUGIN_ID,
          initHomeSectionTab: (r) => initHomeSectionTab(r, {
            getHseUsers: () => getHseUsers({ getApiClient: () => api, cache: appState.hseUserCache }),
            buildUserMultiSelectHtml: (users, selIds, chkClass) => buildUserMultiSelectHtml(users, selIds, chkClass),
            wireUserMultiSelect: (c) => wireUserMultiSelect(c),
            preFetchLibraryData: () => preFetchLibraryData({ getApiClient: () => api, cache: appState.hseUserCache }),
            syncHomeSectionFromEmby: (tab, syncDeps) => syncHomeSectionFromEmby(tab, syncDeps),
            getUiConfig: boundGetUiConfig,
            checkFormState: checkFormStateBound,
            originalConfigState: appState.originalConfigState
          }),
          initPlaylistTab: (r) => initPlaylistTab(r, {
            getHseUsers: () => getHseUsers({ getApiClient: () => api, cache: appState.hseUserCache }),
            buildUserMultiSelectHtml: (users, selIds, chkClass) => buildUserMultiSelectHtml(users, selIds, chkClass),
            wireUserMultiSelect: (c) => wireUserMultiSelect(c)
          }),
          updateHseSectionAvailability: (r) => updateHseSectionAvailability(r, {
            rowHasViewerCriteria: (r2) => rowHasViewerCriteriaInline(r2),
            refreshHseSectionTypeOptions: (tab, tagEnabled, collEnabled, viewerOnly) => {
              const stSel = tab.querySelector(".selHseSectionType");
              if (!stSel) return;
              const currentVal = stSel.value;
              stSel.innerHTML = "";
              if (collEnabled) {
                const o1 = document.createElement("option");
                o1.value = "boxset";
                o1.textContent = "Single Collection";
                stSel.appendChild(o1);
              }
              if (tagEnabled || viewerOnly) {
                const o2 = document.createElement("option");
                o2.value = "items";
                o2.textContent = viewerOnly && !tagEnabled ? "Dynamic Media (per user)" : "Dynamic Media (tag)";
                stSel.appendChild(o2);
              }
              const stillValid = Array.from(stSel.options).some((o) => o.value === currentVal);
              if (stillValid) stSel.value = currentVal;
              const itemsOnlyEls = tab.querySelectorAll(".hse-items-only");
              const isItems = !stSel || stSel.value !== "boxset";
              itemsOnlyEls.forEach((el) => {
                el.style.display = isItems ? "" : "none";
              });
            },
            updateBadges: (r2) => {
              if (self.updateBadges) self.updateBadges(r2);
            }
          }),
          checkFormState: checkFormStateBound,
          saveSavedFiltersNow: () => saveSavedFiltersNow({
            getSavedFilters: () => appState.savedFilters.filters,
            getOriginalConfigState: () => appState.originalConfigState.getOriginalConfigState(),
            setOriginalConfigState: (v) => appState.originalConfigState.setOriginalConfigState(v),
            pluginId: PLUGIN_ID,
            getApiClient: () => ({
              getPluginConfiguration: (id) => api ? api.getPluginConfiguration(id) : Promise.resolve({}),
              updatePluginConfiguration: (id, c) => api ? api.updatePluginConfiguration(id, c) : Promise.resolve({})
            }),
            checkFormState: checkFormStateBound
          }),
          refreshMySavedFiltersPanels: (sf) => refreshMySavedFiltersPanels(sf),
          getMaxDays,
          getDayOptions,
          isScheduleCurrentlyActive,
          readIntervalsFromRow,
          getSourceBadgeHtml,
          renderTagGroup: legacyRenderTagGroup,
          applyFilters: applyFiltersFn,
          refreshStatus: refreshStatusFn,
          miPresets: MI_PRESETS,
          view: currentView,
          alert: (msg) => {
            getDashboard()?.alert(msg);
          },
          updateBadges: (r) => {
            if (self.updateBadges) self.updateBadges(r);
          },
          updateRunGroupBtn: (r) => {
            if (self.updateRunGroupBtn) self.updateRunGroupBtn(r);
          },
          updateTagTitle: (r) => {
            if (self.updateTagTitle) self.updateTagTitle(r);
          }
        };
        setupRowEvents(row, deps);
        if (deps.updateBadges) self.updateBadges = deps.updateBadges;
        if (deps.updateRunGroupBtn) self.updateRunGroupBtn = deps.updateRunGroupBtn;
        if (deps.updateTagTitle) self.updateTagTitle = deps.updateTagTitle;
        return deps;
      }
      function rowHasViewerCriteriaInline(row) {
        let found = false;
        row.querySelectorAll(".mi-rule").forEach((rule) => {
          const ruleEl = rule;
          const propEl = ruleEl.querySelector(".selMiProperty");
          const prop = propEl ? propEl.value : "";
          const selUserEl = ruleEl.querySelector(".selMiUser");
          if (prop === "InProgress" || selUserEl && selUserEl.value === "__current__") found = true;
        });
        return found;
      }
      function legacyRenderHscTab(_container, _config, _users) {
      }
      function legacyEnforceHscSourceTargetConflict(_container) {
      }
      function loadHscManageTabFn(view2) {
        const api = getApi();
        const check = () => checkFormState({
          view: view2,
          originalConfigState: appState.originalConfigState,
          getUiConfig: boundGetUiConfig
        });
        const deps = {
          getApiClient: () => api ? {
            accessToken: () => api.accessToken(),
            getUrl: (n, p) => api.getUrl(n, p)
          } : { accessToken: () => "", getUrl: () => "" },
          fetchFn: (...args) => fetch(...args),
          renderSections: () => renderManageSections(view2, appState.manage, deps),
          getManDragAfterElement,
          checkFormState: check,
          alert: (msg) => {
            getDashboard()?.alert(msg);
          }
        };
        loadHscManageTab(view2, appState.manage, {
          ...deps,
          getHseUsers: () => getHseUsers({ getApiClient: () => api, cache: appState.hseUserCache }),
          prompt: (msg, def) => window.prompt(msg, def)
        });
      }
      function loadTopListsTabFn(view2) {
        const api = getApi();
        const deps = {
          getUrl: (path) => api ? api.getUrl(path) : "",
          getAccessToken: () => api ? api.accessToken() : "",
          getPluginConfiguration: () => api ? api.getPluginConfiguration(PLUGIN_ID) : Promise.resolve({}),
          fetch: (...args) => fetch(...args),
          showCreateTopListChooser: showCreateTopListChooserFactory(),
          loadInlineEditForm: () => {
          },
          unregisterTopList: (tagNameLower) => {
            appState.topLists.tagNames.delete(tagNameLower);
            refreshTopListBadges(appState.topLists.tagNames);
          },
          confirm: (msg) => window.confirm(msg),
          alert: (msg) => {
            getDashboard()?.alert(msg);
          },
          reload: () => {
            const c = view2.querySelector("#tlContainer");
            if (c) c.dataset.loaded = "";
            loadTopListsTabFn(view2);
          }
        };
        loadTopListsTab(view2, deps);
      }
      function loadTagManageTabFn(view2) {
        const api = getApi();
        const deps = {
          fetch: (...args) => fetch(...args),
          getApiClient: () => api ? {
            accessToken: () => api.accessToken(),
            getUrl: (n, p) => api.getUrl(n, p),
            getJSON: (n, p) => api.getJSON(n, p),
            getPluginConfiguration: (id) => api.getPluginConfiguration(id),
            updatePluginConfiguration: (id, c) => api.updatePluginConfiguration(id, c)
          } : {
            accessToken: () => "",
            getUrl: () => "",
            getJSON: () => Promise.resolve({}),
            getPluginConfiguration: () => Promise.resolve({}),
            updatePluginConfiguration: () => Promise.resolve({})
          },
          confirm: (msg) => window.confirm(msg),
          alert: (msg) => {
            getDashboard()?.alert(msg);
          },
          escapeHtml,
          getHseUsers: () => getHseUsers({ getApiClient: () => api, cache: appState.hseUserCache }),
          executeTopListCreationSteps: () => Promise.resolve(void 0),
          showCreateTopListChooser: showCreateTopListChooserFactory(),
          loadInlineEditForm: () => {
          },
          sortRows: (container, criteria) => sortRows(container, criteria),
          getDragAfterElement,
          checkFormState: checkFormStateBound,
          refreshMySavedFiltersPanels: (sf) => refreshMySavedFiltersPanels(sf),
          savedFilters: appState.savedFilters.filters,
          pluginId: PLUGIN_ID
        };
        loadTagManageTab(view2, deps);
      }
      function applyManageSectionsFn(view2) {
        const api = getApi();
        const check = () => checkFormState({
          view: view2,
          originalConfigState: appState.originalConfigState,
          getUiConfig: boundGetUiConfig
        });
        const deps = {
          getApiClient: () => api ? {
            accessToken: () => api.accessToken(),
            getUrl: (n, p) => api.getUrl(n, p)
          } : { accessToken: () => "", getUrl: () => "" },
          fetchFn: (...args) => fetch(...args),
          renderSections: () => renderManageSections(view2, appState.manage, deps),
          getManDragAfterElement,
          checkFormState: check,
          alert: (msg) => {
            getDashboard()?.alert(msg);
          }
        };
        applyManageSections(view2, appState.manage, deps);
      }
      function showCreateTopListChooserFactory() {
        return (tagsData, existingTopLists, onSuccess) => {
          const api = getApi();
          const db = getDashboard();
          const modalDeps = {
            fetch: (...args) => fetch(...args),
            getApiClient: () => api ? {
              accessToken: () => api.accessToken(),
              getUrl: (n, p) => api.getUrl(n, p),
              getJSON: (n, p) => api.getJSON(n, p),
              updatePluginConfiguration: (id, c) => api.updatePluginConfiguration(id, c),
              getPluginConfiguration: (id) => api.getPluginConfiguration(id)
            } : {
              accessToken: () => "",
              getUrl: () => "",
              getJSON: () => Promise.resolve({}),
              updatePluginConfiguration: () => Promise.resolve({}),
              getPluginConfiguration: () => Promise.resolve({})
            },
            alert: (msg) => {
              db?.alert(msg);
            },
            confirm: (msg) => window.confirm(msg),
            closeModal: () => {
            },
            escapeHtml,
            executeTopListCreationSteps: () => {
              throw new Error("executeTopListCreationSteps not bound");
            },
            getHseUsers: () => getHseUsers({ getApiClient: () => api, cache: appState.hseUserCache }),
            buildUserMultiSelectHtml,
            wireUserMultiSelect,
            buildBadgePickerHtml: (sv) => `<div data-badge-picker="${sv || "neutral"}"></div>`,
            initBadgePicker: () => {
            },
            readBadgeStyle: () => "neutral",
            showTopListModal: () => {
              throw new Error("showTopListModal not bound");
            },
            showManualTopListModal: () => {
              throw new Error("showManualTopListModal not bound");
            },
            loadInlineEditForm: () => {
              throw new Error("loadInlineEditForm not bound");
            },
            state: {
              topLists: appState.topLists,
              hseUserCache: appState.hseUserCache
            },
            pluginId: PLUGIN_ID
          };
          showCreateTopListChooser(tagsData.Tags || [], existingTopLists, onSuccess, modalDeps);
        };
      }
      function backupDeps() {
        const api = getApi();
        const db = getDashboard();
        return {
          fetch: (...args) => fetch(...args),
          getApiClient: () => api ? {
            accessToken: () => api.accessToken(),
            getUrl: (n, p) => api.getUrl(n, p),
            getJSON: (n, p) => api.getJSON(n, p),
            updatePluginConfiguration: (id, c) => api.updatePluginConfiguration(id, c),
            getPluginConfiguration: (id) => api.getPluginConfiguration(id)
          } : {
            accessToken: () => "",
            getUrl: () => "",
            getJSON: () => Promise.resolve({}),
            updatePluginConfiguration: () => Promise.resolve({}),
            getPluginConfiguration: () => Promise.resolve({})
          },
          alert: (msg) => {
            db?.alert(msg);
          },
          state: {
            originalConfigState: appState.originalConfigState,
            hsc: appState.hsc,
            savedFilters: appState.savedFilters,
            topLists: appState.topLists,
            manage: appState.manage,
            libraryCache: appState.libraryCache
          },
          pluginId: PLUGIN_ID
        };
      }
      let currentView = null;
      function loadConfigFn() {
        if (!currentView) return Promise.resolve();
        const view2 = currentView;
        const api = getApi();
        if (!api) return Promise.resolve();
        appState.hseUserCache.libraryPromise = null;
        void preFetchLibraryData({ getApiClient: () => api, cache: appState.hseUserCache });
        return api.getPluginConfiguration(PLUGIN_ID).then((config) => {
          const cfg = config;
          appState.hsc.config = {
            HomeSyncEnabled: cfg.HomeSyncEnabled || false,
            HomeSyncLibraryOrder: cfg.HomeSyncLibraryOrder || false,
            HomeSyncSourceUserId: cfg.HomeSyncSourceUserId || "",
            HomeSyncTargetUserIds: cfg.HomeSyncTargetUserIds || []
          };
          appState.savedFilters.filters = cfg.SavedFilters || [];
          const container = view2.querySelector("#tagListContainer");
          if (container) container.innerHTML = "";
          const setVal = (sel, val) => {
            const el = view2.querySelector(sel);
            if (el) el.value = val;
          };
          setVal("#txtTraktClientId", cfg.TraktClientId || "");
          setVal("#txtMdblistApiKey", cfg.MdblistApiKey || "");
          setVal("#txtTmdbApiKey", cfg.TmdbApiKey || "");
          setVal("#txtOpenAiApiKey", cfg.OpenAiApiKey || "");
          setVal("#txtOpenAiModel", cfg.OpenAiModel || "gpt-4o-mini");
          setVal("#txtGeminiApiKey", cfg.GeminiApiKey || "");
          setVal("#txtGeminiModel", cfg.GeminiModel || "gemini-2.5-flash-lite");
          setVal("#txtClaudeApiKey", cfg.ClaudeApiKey || "");
          setVal("#txtClaudeModel", cfg.ClaudeModel || "claude-haiku-4-5-20251001");
          setVal("#txtOllamaBaseUrl", cfg.OllamaBaseUrl || "http://localhost:11434");
          setVal("#txtOllamaModel", cfg.OllamaModel || "");
          const spEl = view2.querySelector("#txtAiSystemPrompt");
          if (spEl) spEl.value = cfg.AiSystemPrompt || "";
          updateSystemPromptResetBtn(view2);
          const setChk = (sel, val) => {
            const el = view2.querySelector(sel);
            if (el) el.checked = val;
          };
          setChk("#chkExtendedConsoleOutput", !!cfg.ExtendedConsoleOutput);
          setChk("#chkLogMissingItems", !!cfg.LogMissingItems);
          setChk("#chkDryRunMode", !!cfg.DryRunMode);
          setChk("#chkPreserveTagsOnEmptyResult", !!cfg.PreserveTagsOnEmptyResult);
          const ts = view2.querySelector("#txtSearchTags");
          if (ts) ts.value = "";
          const btnClear = view2.querySelector("#btnClearSearch");
          if (btnClear) btnClear.style.display = "none";
          [
            "#chkFilterTag",
            "#chkFilterCollection",
            "#chkFilterSchedule",
            "#chkFilterHomeScreen",
            "#chkFilterSrcExternal",
            "#chkFilterSrcMediaInfo",
            "#chkFilterSrcCollection",
            "#chkFilterSrcPlaylist",
            "#chkFilterSrcAI",
            "#chkFilterActive",
            "#chkFilterInactive"
          ].forEach((id) => {
            const el = view2.querySelector(id);
            if (el) el.checked = false;
          });
          const lbl = view2.querySelector("#filterDropdownLabel");
          if (lbl) lbl.textContent = "Filter";
          const btn = view2.querySelector("#btnFilterDropdown");
          if (btn) btn.classList.remove("active");
          appState.topLists.tagNames = new Set((cfg.TopLists || []).map((tl) => (tl.TagName || "").toLowerCase()).filter(Boolean));
          const grouped = groupConfigTags(cfg.Tags || []);
          const c2 = view2.querySelector("#tagListContainer");
          if (!c2) return;
          const keys = Object.keys(grouped);
          keys.forEach((k, i) => {
            legacyRenderTagGroup(grouped[k], c2, false, i, false, null);
          });
          if (keys.length === 0) {
            legacyRenderTagGroup({ Tag: "", Urls: [{ url: "", limit: 0 }], Active: true }, c2, false, 0, false, null);
          }
          const savedSort = localStorage.getItem("HomeScreenCompanion_SortBy") || "Manual";
          sortRows(c2, savedSort);
          applyFilters(view2);
          requestAnimationFrame(() => {
            try {
              appState.originalConfigState.setOriginalConfigState(JSON.stringify(boundGetUiConfig(view2, true)));
            } catch {
              appState.originalConfigState.setOriginalConfigState(null);
            }
            checkFormStateBound();
            updateDryRunWarning(appState.originalConfigState.getOriginalConfigState());
          });
        });
      }
      function hasDirtyStateFn() {
        if (!currentView) return false;
        const btnSave = currentView.querySelector(".btn-save");
        if (btnSave && !btnSave.disabled) return true;
        const tcContainer = currentView.querySelector("#tcManageContainer");
        if (tcContainer && tcContainer._tcHasPending) return true;
        return false;
      }
      function doSaveFn() {
        const view2 = currentView;
        if (!view2) return;
        const cleanupTab = view2.querySelector("#tabCleanup");
        const tcContainer = view2.querySelector("#tcManageContainer");
        if (cleanupTab && cleanupTab.style.display !== "none" && tcContainer && tcContainer._tcHasPending && tcContainer._tcShowModal) {
          tcContainer._tcShowModal();
          return;
        }
        const btnApplyManage = view2.querySelector("#btnApplyManage");
        if (btnApplyManage && !btnApplyManage.disabled) applyManageSectionsFn(view2);
        const configObj = boundGetUiConfig(view2, false);
        const originalConfStr = appState.originalConfigState.getOriginalConfigState();
        if (!originalConfStr) return;
        const originalConf = JSON.parse(originalConfStr);
        const originalTags = groupConfigTags(originalConf.Tags || []);
        (configObj.Tags || []).forEach((tag) => {
          const tagAny = tag;
          const key = tagAny.Name ? tagAny.Name + "" + tagAny.Tag : tagAny.Tag;
          const originalTag = originalTags[key];
          const currentTagForCompare = Object.assign({}, tag, { LastModified: "CONSTANT_FOR_COMPARISON" });
          const originalTagForCompare = originalTag ? Object.assign({}, originalTag, { LastModified: "CONSTANT_FOR_COMPARISON" }) : null;
          if (!originalTag || JSON.stringify(currentTagForCompare) !== JSON.stringify(originalTagForCompare)) {
            tag.LastModified = (/* @__PURE__ */ new Date()).toISOString();
          } else {
            tag.LastModified = originalTag.LastModified;
          }
        });
        const api = getApi();
        if (!api) return;
        api.getPluginConfiguration(PLUGIN_ID).catch(() => ({ Tags: [] })).then((currentConfig) => {
          const cc = currentConfig;
          const currentGrouped = groupConfigTags(cc.Tags || []);
          (configObj.Tags || []).forEach((t) => {
            const tAny = t;
            const key = tAny.Name ? tAny.Name + "" + tAny.Tag : tAny.Tag;
            const existing = currentGrouped[key];
            if (existing && existing.HomeSectionTracked && existing.HomeSectionTracked.length > 0 && (!t.HomeSectionTracked || t.HomeSectionTracked.length === 0)) {
              t.HomeSectionTracked = existing.HomeSectionTracked;
            }
            if (existing && existing.PlaylistMappings && existing.PlaylistMappings.length > 0 && (!t.PlaylistMappings || t.PlaylistMappings.length === 0)) {
              t.PlaylistMappings = existing.PlaylistMappings;
            }
          });
          configObj.TopLists = cc.TopLists || [];
          return preFetchLibraryData({ getApiClient: () => api, cache: appState.hseUserCache }).then((libData) => {
            const ld = libData;
            const topListIds = new Set(
              (ld.virtualFolders || []).filter((f) => {
                return (f.Locations || []).some((loc) => {
                  const parts = loc.replace(/\\/g, "/").split("/");
                  const fn = (parts[parts.length - 1] || parts[parts.length - 2] || "").toLowerCase();
                  return ld.topListFolderNames.has(fn);
                });
              }).map((f) => f.ItemId)
            );
            if (topListIds.size > 0) {
              (configObj.Tags || []).forEach((tag) => {
                const tagAny = tag;
                if (!tagAny.EnableHomeSection) return;
                let settings = {};
                try {
                  settings = JSON.parse(tagAny.HomeSectionSettings || "{}");
                } catch {
                }
                if ((settings["SectionType"] || "items") !== "items") return;
                const excluded = new Set(
                  String(settings["_queryExcludeViewIds"] || "").split(",").map((id) => id.trim()).filter(Boolean)
                );
                let changed = false;
                topListIds.forEach((id) => {
                  if (!excluded.has(id)) {
                    excluded.add(id);
                    changed = true;
                  }
                });
                if (changed) {
                  const excStr = Array.from(excluded).join(",");
                  settings["_queryExcludeViewIds"] = excStr;
                  settings["ExcludedFolders"] = excStr;
                  tag.HomeSectionSettings = JSON.stringify(settings);
                }
              });
            }
            return api.updatePluginConfiguration(PLUGIN_ID, configObj);
          });
        }).then((r) => {
          getDashboard()?.processPluginConfigurationUpdateResult(r);
          appState.topLists.tagNames = new Set((configObj.TopLists || []).map((tl) => {
            const t = tl;
            return (t.TagName || "").toLowerCase();
          }).filter(Boolean));
          const newGrouped = groupConfigTags(configObj.Tags || []);
          view2.querySelectorAll(".tag-row").forEach((row) => {
            const lblInput = row.querySelector(".txtEntryLabel");
            if (!lblInput) return;
            const name = lblInput.value;
            const tagNameEl = row.querySelector(".txtTagName");
            const tagName = tagNameEl ? tagNameEl.value || name : name;
            const key = name ? name + "" + tagName : tagName;
            const tc = newGrouped[key];
            if (tc) {
              row.dataset.lastModified = String(tc.LastModified || "");
              const hseTab = row.querySelector(".homescreen-tab");
              if (hseTab) {
                hseTab.dataset.hseTracked = encodeURIComponent(JSON.stringify(tc.HomeSectionTracked || []));
                hseTab.dataset.hseSettings = encodeURIComponent(tc.HomeSectionSettings || "{}");
                hseTab.dataset.hseUserids = encodeURIComponent(JSON.stringify(tc.HomeSectionUserIds || []));
              }
            }
          });
          appState.originalConfigState.setOriginalConfigState(JSON.stringify(boundGetUiConfig(view2, true)));
          checkFormStateBound();
          updateDryRunWarning(appState.originalConfigState.getOriginalConfigState());
          (configObj.Tags || []).forEach((tcRaw) => {
            const tc = tcRaw;
            if (!tc.EnableHomeSection) return;
            const hasTracked = (tc.HomeSectionTracked || []).some((t) => t.SectionId && !t.SectionId.startsWith("hsc__"));
            if (!hasTracked) return;
            const applyUrl = api.getUrl("HomeScreenCompanion/Hsc/ApplyTagHomeSections");
            const tok = api.accessToken();
            fetch(applyUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json", "X-Emby-Token": tok },
              body: JSON.stringify({ TagName: tc.Name || tc.Tag })
            }).then((rr) => rr.json()).then((res) => {
              console.log("[HSC] ApplyTagHomeSections", tc.Name || tc.Tag, res);
            }).catch((e) => {
              console.warn("[HSC] ApplyTagHomeSections failed", tc.Name || tc.Tag, e);
            });
          });
        });
      }
      function submitFormHandler(e) {
        e.preventDefault();
        if (!currentView) return;
        const view2 = currentView;
        const tlCont = view2.querySelector("#tlContainer");
        const dirtyBodies = tlCont ? Array.from(tlCont.querySelectorAll('.tag-body[data-dirty="1"]')) : [];
        if (dirtyBodies.length > 0) {
          const btn = view2.querySelector(".btn-save");
          const origHtml = btn ? btn.innerHTML : "";
          if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="md-icon" style="margin-right:5px;">hourglass_empty</i><span>Saving\u2026</span>';
          }
          dirtyBodies.reduce((p, b) => {
            return p.then(() => {
              const tlSaveForm = b.tlSaveForm;
              return typeof tlSaveForm === "function" ? tlSaveForm() : Promise.resolve();
            });
          }, Promise.resolve()).then(() => {
            dirtyBodies.forEach((b) => {
              delete b.dataset.dirty;
            });
            if (btn) {
              btn.innerHTML = origHtml;
              btn.disabled = false;
            }
            doSaveFn();
          }).catch((err) => {
            if (btn) {
              btn.innerHTML = origHtml;
              btn.disabled = false;
            }
            const errMsg = err instanceof Error ? err.message : String(err);
            alert("Failed to save top-list changes: " + errMsg);
          });
          return;
        }
        doSaveFn();
      }
      currentView = view;
      view.addEventListener("viewshow", () => {
        if (!document.getElementById("homeScreenCompanionCustomCss")) {
          document.body.insertAdjacentHTML("beforeend", customCss);
        }
        applyPluginTheme();
        const form = view.querySelector(".HomeScreenCompanionForm");
        if (!form) return;
        const isFirstVisit = !view.dataset.hscInit;
        if (isFirstVisit) view.dataset.hscInit = "1";
        appState.originalConfigState.setOriginalConfigState(null);
        const changeHandler = () => {
          setTimeout(checkFormStateBound, 0);
        };
        if (appState.viewShow.formAc) appState.viewShow.formAc.abort();
        const formAc = new AbortController();
        appState.viewShow.formAc = formAc;
        const signal = formAc.signal;
        form.addEventListener("input", changeHandler, { signal });
        form.addEventListener("change", changeHandler, { signal });
        form.addEventListener("input", (e) => {
          const target = e.target;
          if (!target) return;
          const ta = target.closest("textarea.txtMiValue, textarea.txtTagBlacklist");
          if (!ta) return;
          ta.style.height = "auto";
          ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
          ta.style.overflowY = ta.scrollHeight > 120 ? "auto" : "hidden";
        }, { signal });
        const settingsTab = view.querySelector("#tabSettings");
        if (settingsTab) {
          settingsTab.addEventListener("input", changeHandler, { signal });
          settingsTab.addEventListener("change", changeHandler, { signal });
        }
        const spTa = view.querySelector("#txtAiSystemPrompt");
        const resetBtn = view.querySelector("#btnResetAiSystemPrompt");
        if (spTa && resetBtn) {
          spTa.addEventListener("input", () => {
            updateSystemPromptResetBtn(view);
          }, { signal });
          resetBtn.addEventListener("click", () => {
            spTa.value = DEFAULT_AI_SYSTEM_PROMPT;
            updateSystemPromptResetBtn(view);
            changeHandler();
          }, { signal });
        }
        form.addEventListener("click", (e) => {
          const target = e.target;
          if (!target) return;
          const dayBtn = target.closest(".day-toggle");
          if (dayBtn) dayBtn.classList.toggle("active");
          if (target.closest(".btnRemoveUrl, .btnAddUrl, .btnRemoveLocal, .btnAddLocal, .btnRemoveDate, .btnAddDate, .btnRemoveFilterGroup, .btnAddMediaInfoFilter, .btnClearAllFilters, .btnGroupOpChoice, .btnGroupInnerOpChoice, .btnAddMiRule, .btnRemoveMiRule, .btnRemoveGroup, .day-toggle, .btnRemovePoster, .btnApplyMiPreset")) {
            changeHandler();
          }
        }, { signal });
        const container = view.querySelector("#tagListContainer");
        if (isFirstVisit) {
          if (container) {
            let rafId = null;
            container.addEventListener("dragover", (e) => {
              if (localStorage.getItem("HomeScreenCompanion_SortBy") !== "Manual") return;
              e.preventDefault();
              if (rafId) return;
              rafId = requestAnimationFrame(() => {
                const draggingRow = document.querySelector(".tag-row.dragging");
                if (!draggingRow) {
                  rafId = null;
                  return;
                }
                const afterElement = getDragAfterElement(container, e.clientY);
                let placeholder = document.querySelector(".sort-placeholder");
                if (!placeholder) {
                  placeholder = document.createElement("div");
                  placeholder.className = "sort-placeholder";
                }
                if (afterElement == null) {
                  if (placeholder.nextElementSibling !== null) container.appendChild(placeholder);
                } else {
                  if (placeholder.nextElementSibling !== afterElement) container.insertBefore(placeholder, afterElement);
                }
                rafId = null;
              });
            });
            container.addEventListener("drop", (e) => {
              if (localStorage.getItem("HomeScreenCompanion_SortBy") !== "Manual") return;
              e.preventDefault();
              const draggingRow = document.querySelector(".tag-row.dragging");
              const placeholder = document.querySelector(".sort-placeholder");
              if (draggingRow && placeholder) {
                container.insertBefore(draggingRow, placeholder);
                placeholder.remove();
                changeHandler();
              }
            });
          }
          const logOverlay = view.querySelector("#logModalOverlay");
          const helpOverlay = view.querySelector("#helpModalOverlay");
          const bugOverlay = view.querySelector("#bugReportModalOverlay");
          const btnOpenLogs = view.querySelector("#btnOpenLogs");
          const btnCloseLogs = view.querySelector("#btnCloseLogs");
          const btnOpenHelp = view.querySelector("#btnOpenHelp");
          const btnCloseHelp = view.querySelector("#btnCloseHelp");
          const btnOpenBug = view.querySelector("#btnOpenBugReport");
          const btnCloseBug = view.querySelector("#btnCloseBugReport");
          const btnCloseMiHelp = view.querySelector("#btnCloseMiHelp");
          const btnCloseTagTargetHelp = view.querySelector("#btnCloseTagTargetHelp");
          if (btnOpenLogs) btnOpenLogs.addEventListener("click", (e) => {
            e.preventDefault();
            appState.logStatus.logTab = null;
            renderLogModal(view, { state: appState.logStatus});
            if (logOverlay) logOverlay.classList.add("modal-visible");
          });
          if (btnCloseLogs) btnCloseLogs.addEventListener("click", () => {
            appState.logStatus.logTab = null;
            if (logOverlay) logOverlay.classList.remove("modal-visible");
          });
          if (logOverlay) logOverlay.addEventListener("click", (e) => {
            if (e.target === logOverlay) {
              appState.logStatus.logTab = null;
              logOverlay.classList.remove("modal-visible");
            }
          });
          view.querySelectorAll("#logTabs .log-tab").forEach((tab) => {
            tab.addEventListener("click", () => {
              const key = tab.getAttribute("data-log");
              appState.logStatus.logTab = key;
              renderLogModal(view, { state: appState.logStatus});
            });
          });
          if (btnOpenHelp) btnOpenHelp.addEventListener("click", () => helpOverlay && helpOverlay.classList.add("modal-visible"));
          if (btnCloseHelp) btnCloseHelp.addEventListener("click", () => helpOverlay && helpOverlay.classList.remove("modal-visible"));
          if (helpOverlay) helpOverlay.addEventListener("click", (e) => {
            if (e.target === helpOverlay) helpOverlay.classList.remove("modal-visible");
          });
          if (btnOpenBug) btnOpenBug.addEventListener("click", () => bugOverlay && bugOverlay.classList.add("modal-visible"));
          if (btnCloseBug) btnCloseBug.addEventListener("click", () => bugOverlay && bugOverlay.classList.remove("modal-visible"));
          if (bugOverlay) bugOverlay.addEventListener("click", (e) => {
            if (e.target === bugOverlay) bugOverlay.classList.remove("modal-visible");
          });
          const miHelpOverlay = view.querySelector("#miHelpModalOverlay");
          if (btnCloseMiHelp) btnCloseMiHelp.addEventListener("click", () => miHelpOverlay && miHelpOverlay.classList.remove("modal-visible"));
          if (miHelpOverlay) miHelpOverlay.addEventListener("click", (e) => {
            if (e.target === miHelpOverlay) miHelpOverlay.classList.remove("modal-visible");
          });
          const tagTargetHelpOverlay = view.querySelector("#tagTargetHelpModalOverlay");
          if (btnCloseTagTargetHelp) btnCloseTagTargetHelp.addEventListener("click", () => tagTargetHelpOverlay && tagTargetHelpOverlay.classList.remove("modal-visible"));
          if (tagTargetHelpOverlay) tagTargetHelpOverlay.addEventListener("click", (e) => {
            if (e.target === tagTargetHelpOverlay) tagTargetHelpOverlay.classList.remove("modal-visible");
          });
          const headerAction = view.querySelector(".sectionTitleContainer");
          if (headerAction && !view.querySelector("#cbSortTags")) {
            const savedSort = localStorage.getItem("HomeScreenCompanion_SortBy") || "Manual";
            headerAction.style.display = "flex";
            headerAction.style.alignItems = "center";
            headerAction.style.justifyContent = "space-between";
            headerAction.style.width = "100%";
            headerAction.style.marginBottom = "10px";
            const controlRowHtml = `
                    <div class="control-row" style="flex-direction: row !important; align-items: center !important; flex-wrap: nowrap !important; justify-content: flex-start !important; padding: 10px 15px !important; gap: 0 !important;">

                        <span class="control-label" style="opacity:0.7; margin-right: 10px; flex-shrink: 0;">Sort:</span>

                        <select is="emby-select" id="cbSortTags" style="color:inherit; background:rgba(128,128,128,0.08); border:1px solid var(--line-color); padding:5px; border-radius:4px; font-size:0.9em; cursor:pointer; width: 80px; margin-right: 0px;">
                            <option value="Manual" ${savedSort === "Manual" ? "selected" : ""}>Manual</option>
                            <option value="Name" ${savedSort === "Name" ? "selected" : ""}>Name</option>
                            <option value="Active" ${savedSort === "Active" ? "selected" : ""}>Status</option>
                            <option value="LatestEdited" ${savedSort === "LatestEdited" ? "selected" : ""}>Latest</option>
                        </select>

                        <div style="width: 1px; height: 25px; background: var(--line-color); margin-right: 10px;"></div>

                        <span class="control-label" style="opacity:0.7; margin-right: 10px; flex-shrink: 0;"> | Filters:</span>

                        <div class="search-input-wrapper" style="width: 200px !important; margin-right: 10px; flex-shrink: 0;">
                            <i class="md-icon search-icon">search</i>
                            <input type="text" id="txtSearchTags" placeholder="Search..." autocomplete="off" style="padding-left: 28px !important; background: rgba(128,128,128,0.06) !important; border: 1px solid var(--line-color) !important; width: 100% !important;" />
                            <i class="md-icon" id="btnClearSearch">close</i>
                        </div>

                        <div class="filter-dropdown-wrapper">
                            <div class="filter-dropdown-btn" id="btnFilterDropdown">
                                <i class="md-icon" style="font-size:1.1em;">filter_list</i>
                                <span id="filterDropdownLabel">Filter</span>
                                <i class="md-icon" style="font-size:0.9em; opacity:0.6;" id="filterDropdownCaret">expand_more</i>
                            </div>
                            <div class="filter-dropdown-panel" id="filterDropdownPanel">
                                <div class="filter-dropdown-label">Features</div>
                                <label class="filter-chk-row"><input type="checkbox" id="chkFilterTag" /><span>Tag</span></label>
                                <label class="filter-chk-row"><input type="checkbox" id="chkFilterCollection" /><span>Collection</span></label>
                                <label class="filter-chk-row"><input type="checkbox" id="chkFilterSchedule" /><span>Schedule</span></label>
                                <label class="filter-chk-row"><input type="checkbox" id="chkFilterHomeScreen" /><span>Home Screen Section</span></label>
                                <div class="filter-dropdown-divider"></div>
                                <div class="filter-dropdown-label">Sources</div>
                                <label class="filter-chk-row"><input type="checkbox" id="chkFilterSrcExternal" /><span>External</span></label>
                                <label class="filter-chk-row"><input type="checkbox" id="chkFilterSrcMediaInfo" /><span>Local Media Information</span></label>
                                <label class="filter-chk-row"><input type="checkbox" id="chkFilterSrcCollection" /><span>Local Collection</span></label>
                                <label class="filter-chk-row"><input type="checkbox" id="chkFilterSrcPlaylist" /><span>Local Playlist</span></label>
                                <label class="filter-chk-row"><input type="checkbox" id="chkFilterSrcAI" /><span>AI created lists</span></label>
                                <div class="filter-dropdown-divider"></div>
                                <div class="filter-dropdown-label">Status</div>
                                <label class="filter-chk-row"><input type="checkbox" id="chkFilterActive" /><span style="display:flex;align-items:center;gap:6px;"><span style="width:8px;height:8px;border-radius:50%;background:#52B54B;flex-shrink:0;"></span>Active</span></label>
                                <label class="filter-chk-row"><input type="checkbox" id="chkFilterInactive" /><span style="display:flex;align-items:center;gap:6px;"><span style="width:8px;height:8px;border-radius:50%;background:rgba(128,128,128,0.5);flex-shrink:0;"></span>Inactive</span></label>
                            </div>
                        </div>

                    </div>`;
            headerAction.insertAdjacentHTML("afterend", controlRowHtml);
            const txtSearch = view.querySelector("#txtSearchTags");
            const btnClear = view.querySelector("#btnClearSearch");
            if (txtSearch && btnClear) {
              txtSearch.addEventListener("input", () => {
                btnClear.style.display = txtSearch.value ? "block" : "none";
                applyFilters(view);
              });
              btnClear.addEventListener("click", () => {
                txtSearch.value = "";
                btnClear.style.display = "none";
                txtSearch.focus();
                applyFilters(view);
              });
            }
            const cbSortTags = view.querySelector("#cbSortTags");
            if (cbSortTags) {
              cbSortTags.addEventListener("change", function() {
                localStorage.setItem("HomeScreenCompanion_SortBy", this.value);
                const c = view.querySelector("#tagListContainer");
                if (c) sortRows(c, this.value);
              });
            }
            [
              "#chkFilterTag",
              "#chkFilterCollection",
              "#chkFilterSchedule",
              "#chkFilterHomeScreen",
              "#chkFilterSrcExternal",
              "#chkFilterSrcMediaInfo",
              "#chkFilterSrcCollection",
              "#chkFilterSrcPlaylist",
              "#chkFilterSrcAI",
              "#chkFilterActive",
              "#chkFilterInactive"
            ].forEach((id) => {
              const el = view.querySelector(id);
              if (el) el.addEventListener("change", () => applyFilters(view));
            });
            const dropBtn = view.querySelector("#btnFilterDropdown");
            const dropPanel = view.querySelector("#filterDropdownPanel");
            const dropCaret = view.querySelector("#filterDropdownCaret");
            if (dropBtn && dropPanel && dropCaret) {
              dropBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                const open = dropPanel.classList.toggle("open");
                dropCaret.textContent = open ? "expand_less" : "expand_more";
              });
              document.addEventListener("click", function closeFilterDrop(e) {
                const target = e.target;
                if (!target) return;
                if (!dropPanel.contains(target) && target !== dropBtn) {
                  dropPanel.classList.remove("open");
                  dropCaret.textContent = "expand_more";
                }
              });
            }
          }
          const btnAddTag = view.querySelector("#btnAddTag");
          if (btnAddTag) btnAddTag.addEventListener("click", () => {
            legacyRenderTagGroup({ Tag: "", Urls: [{ url: "", limit: 0 }], Active: true }, container, true, void 0, true, null);
            applyFilters(view);
          });
          const btnBackupConfig = view.querySelector("#btnBackupConfig");
          if (btnBackupConfig) btnBackupConfig.addEventListener("click", () => {
            showBackupModal(backupDeps());
          });
          const fileInput = view.querySelector("#fileRestoreConfig");
          const btnRestoreConfigTrigger = view.querySelector("#btnRestoreConfigTrigger");
          if (btnRestoreConfigTrigger && fileInput) {
            btnRestoreConfigTrigger.addEventListener("click", () => {
              if (hasDirtyStateFn() && !confirm("You have unsaved changes. They will be discarded when a backup is restored. Continue?")) return;
              fileInput.click();
            });
            fileInput.addEventListener("change", (e) => {
              const ev = e;
              const target = ev.target;
              const file = target && target.files ? target.files[0] : null;
              if (!file) return;
              const reader = new FileReader();
              reader.onload = function(readerEvt) {
                fileInput.value = "";
                const loadResult = readerEvt.target && typeof readerEvt.target.result === "string" ? readerEvt.target.result : "";
                showRestoreModal(loadResult, () => {
                  ["#hscContainer", "#hscManageContainer", "#tlContainer", "#tcManageContainer"].forEach((sel) => {
                    const el = view.querySelector(sel);
                    if (el) el.dataset.loaded = "";
                  });
                  loadConfigFn().then(() => {
                    refreshMySavedFiltersPanels(appState.savedFilters.filters);
                    const activeTab = view.querySelector(".page-tab-btn.active");
                    const target2 = activeTab ? activeTab.getAttribute("data-page-tab") : "";
                    if (target2 === "HomeCompanion") {
                      loadHscUsers(view, hscDeps());
                      loadHscManageTabFn(view);
                    } else if (target2 === "TopLists") loadTopListsTabFn(view);
                    else if (target2 === "Cleanup") loadTagManageTabFn(view);
                  });
                }, backupDeps());
              };
              reader.readAsText(file);
            });
          }
        }
        if (!view.querySelector(".dry-run-warning")) {
          view.insertAdjacentHTML("afterbegin", '<div class="dry-run-warning"><i class="md-icon" style="font-size:1.4em;"></i>DRY RUN MODE IS ACTIVE - NO CHANGES WILL BE SAVED</div>');
        }
        const btnSave = view.querySelector(".btn-save");
        if (btnSave) {
          btnSave.disabled = true;
          btnSave.style.opacity = "0.5";
        }
        const api = getApi();
        checkForUpdates(view, {
          fetch: (...args) => fetch(...args),
          getApiClient: () => api ? { getUrl: (n) => api.getUrl(n) } : { getUrl: () => "" }
        });
        refreshStatusFn(view);
        if (appState.viewShow.statusInterval) clearInterval(appState.viewShow.statusInterval);
        const statusInterval = setInterval(() => refreshStatusFn(view), 5e3);
        appState.viewShow.statusInterval = statusInterval;
        getHseUsers({ getApiClient: () => api, cache: appState.hseUserCache }).then((users) => {
          appState.miUsers.users = users;
        });
        Promise.all([
          api ? api.getJSON(api.getUrl("Users/" + api.getCurrentUserId() + "/Items", { IncludeItemTypes: "BoxSet", Recursive: true })) : Promise.resolve({ Items: [] }),
          api ? api.getJSON(api.getUrl("Items", { IncludeItemTypes: "Playlist", Recursive: true })) : Promise.resolve({ Items: [] }),
          api ? api.getJSON(api.getUrl("Items/Filters2", { UserId: api.getCurrentUserId(), Recursive: true })).catch(() => ({ Tags: [] })) : Promise.resolve({ Tags: [] })
        ]).then((responses) => {
          const r0 = responses[0];
          const r1 = responses[1];
          const r2 = responses[2];
          appState.libraryCache.collections = r0.Items || [];
          appState.libraryCache.playlists = r1.Items || [];
          appState.libraryCache.tags = (r2 && r2.Tags || []).slice().sort();
          void loadConfigFn();
        });
      });
      view.addEventListener("viewhide", () => {
        if (appState.viewShow.statusInterval) {
          clearInterval(appState.viewShow.statusInterval);
          appState.viewShow.statusInterval = null;
        }
      });
      const formEl = view.querySelector(".HomeScreenCompanionForm");
      if (formEl) formEl.addEventListener("submit", submitFormHandler);
      const speedDial = view.querySelector("#runSpeedDial");
      const syncMenu = view.querySelector("#runSyncMenu");
      const btnRunSync = view.querySelector("#btnRunSync");
      if (btnRunSync && speedDial && syncMenu) {
        btnRunSync.addEventListener("click", function(e) {
          e.stopPropagation();
          const isOpen = speedDial.classList.toggle("open");
          syncMenu.classList.toggle("open", isOpen);
        });
      }
      function closeSpeedDial() {
        if (speedDial) speedDial.classList.remove("open");
        if (syncMenu) syncMenu.classList.remove("open");
      }
      document.addEventListener("click", closeSpeedDial);
      function runTask(key, label) {
        const api = getApi();
        const db = getDashboard();
        if (!api) return;
        api.getScheduledTasks().then((tasks) => {
          const t = tasks.find((x) => x.Key === key);
          if (t) {
            api.startScheduledTask(t.Id).then(() => {
              db?.alert(label + " started!");
            });
          } else {
            db?.alert("Task not found: " + key);
          }
        });
        closeSpeedDial();
      }
      const btnDialTagsCollections = view.querySelector("#btnDialTagsCollections");
      if (btnDialTagsCollections) btnDialTagsCollections.addEventListener("click", () => {
        runTask("HomeScreenCompanionSyncTask", "Tag sync");
      });
      const btnDialHomeScreen = view.querySelector("#btnDialHomeScreen");
      if (btnDialHomeScreen) btnDialHomeScreen.addEventListener("click", () => {
        runTask("HomeSectionSyncTask", "Home screen sync");
      });
      const btnDialFullSync = view.querySelector("#btnDialFullSync");
      if (btnDialFullSync) btnDialFullSync.addEventListener("click", () => {
        const api = getApi();
        const db = getDashboard();
        if (!api) return;
        api.getScheduledTasks().then((tasks) => {
          const tagTask = tasks.find((x) => x.Key === "HomeScreenCompanionSyncTask");
          const hscTask = tasks.find((x) => x.Key === "HomeSectionSyncTask");
          const promises = [];
          if (tagTask) promises.push(api.startScheduledTask(tagTask.Id));
          if (hscTask) promises.push(api.startScheduledTask(hscTask.Id));
          Promise.all(promises).then(() => {
            db?.alert("Full sync started!");
          });
        });
        closeSpeedDial();
      });
      function beforeUnloadHandler(e) {
        if (hasDirtyStateFn()) {
          e.preventDefault();
          e.returnValue = "";
        }
      }
      window.addEventListener("beforeunload", beforeUnloadHandler);
      view.addEventListener("viewhide", function() {
        document.removeEventListener("click", closeSpeedDial);
        window.removeEventListener("beforeunload", beforeUnloadHandler);
      }, { once: true });
      view.querySelectorAll(".page-tab-btn").forEach((btn) => {
        btn.addEventListener("click", function() {
          const target = this.getAttribute("data-page-tab");
          const wasDirty = hasDirtyStateFn();
          if (wasDirty && !confirm("You have unsaved changes. Leave this tab and discard changes?")) return;
          if (wasDirty) void loadConfigFn();
          view.querySelectorAll(".page-tab-btn").forEach((b) => {
            b.classList.remove("active");
          });
          this.classList.add("active");
          view.querySelectorAll(".page-tab-content").forEach((c) => {
            c.style.display = "none";
          });
          const tgt = view.querySelector("#tab" + (target || ""));
          if (tgt) tgt.style.display = "";
          if (target === "HomeCompanion") {
            const hscContainer = view.querySelector("#hscContainer");
            if (hscContainer && !hscContainer.dataset.loaded) {
              loadHscUsers(view, hscDeps());
            }
            const manageContainer = view.querySelector("#hscManageContainer");
            if (manageContainer && !manageContainer.dataset.loaded) {
              loadHscManageTabFn(view);
            }
          } else if (target === "Cleanup") {
            const container2 = view.querySelector("#tcManageContainer");
            if (container2 && !container2.dataset.loaded) loadTagManageTabFn(view);
          } else if (target === "TopLists") {
            const tlContainer = view.querySelector("#tlContainer");
            if (tlContainer && !tlContainer.dataset.loaded) loadTopListsTabFn(view);
          }
        });
      });
      view.addEventListener("change", (e) => {
        const cb = e.target?.closest(".chkShowApiKey");
        if (!cb) return;
        const input = view.querySelector("#" + (cb.dataset.target || ""));
        if (input) input.type = cb.checked ? "text" : "password";
      });
      view.addEventListener("click", (e) => {
        const header = e.target?.closest(".settings-panel-toggle");
        if (header) {
          const panel = header.closest(".settings-panel");
          if (panel) {
            const body = panel.querySelector(".settings-panel-body");
            const chevron = header.querySelector(".settings-panel-chevron");
            if (body) {
              const isOpen = body.style.display !== "none";
              body.style.display = isOpen ? "none" : "block";
              if (chevron) chevron.style.transform = isOpen ? "" : "rotate(180deg)";
            }
          }
          return;
        }
      });
      view.addEventListener("click", (e) => {
        const btn = e.target?.closest(".hsc-sub-tab-btn");
        if (!btn) return;
        const target = btn.getAttribute("data-hsc-tab");
        view.querySelectorAll(".hsc-sub-tab-btn").forEach((b) => {
          b.classList.remove("active");
        });
        btn.classList.add("active");
        view.querySelectorAll(".hsc-sub-tab-content").forEach((c) => {
          c.style.display = "none";
        });
        if (target === "copy") {
          const tgt = view.querySelector("#hscSubTabCopy");
          if (tgt) tgt.style.display = "";
          const hscContainer = view.querySelector("#hscContainer");
          if (hscContainer && !hscContainer.dataset.loaded) loadHscUsers(view, hscDeps());
        } else if (target === "manage") {
          const tgt = view.querySelector("#hscSubTabManage");
          if (tgt) tgt.style.display = "";
          const manageContainer = view.querySelector("#hscManageContainer");
          if (manageContainer && !manageContainer.dataset.loaded) loadHscManageTabFn(view);
        }
      });
      const origStatusInterval = appState.viewShow.statusInterval;
      if (origStatusInterval) clearInterval(origStatusInterval);
      const finalStatusInterval = setInterval(() => refreshStatusFn(view), 5e3);
      appState.viewShow.statusInterval = finalStatusInterval;
    }

    return index;

}));
/* Plugin v0.0.0 */
