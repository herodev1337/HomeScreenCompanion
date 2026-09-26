using System.Collections.Generic;

namespace HomeScreenCompanion.UI
{
    /// <summary>
    /// Typed mapper between the Home Screen Companion landing tab's SDK
    /// declarative-UI model (<see cref="MainPageUI"/>) and the legacy
    /// XML config (<see cref="PluginConfiguration"/>).
    ///
    /// The landing tab only carries the quick-access scalars (Run interval,
    /// Dry-run mode, AI system prompt, Release-notes URL). The full scalar
    /// surface (API keys, AI provider settings, advanced toggles) lives on
    /// <c>SettingsTabUI</c> + <c>SettingsConfigMapper</c>.
    /// </summary>
    public static class MainPageConfigMapper
    {
        public static PluginConfiguration ToPluginConfig(MainPageUI ui)
        {
            if (ui == null) return new PluginConfiguration();
            return new PluginConfiguration
            {
                DryRunMode = ui.DryRunMode,
                AiSystemPrompt = string.IsNullOrEmpty(ui.AiSystemPrompt)
                    ? PluginConfiguration.DefaultAiSystemPrompt
                    : ui.AiSystemPrompt,
                // Tags / TopLists / SavedFilters / HomeSync flags — owned by
                // U4-T6; the UI is purely additive for now, the legacy
                // config keeps its existing structures untouched.
                Tags = new List<TagConfig>(),
                TopLists = new List<TopListHomeSection>(),
                SavedFilters = new List<SavedMediaInfoFilter>()
            };
        }

        /// <summary>
        /// Hydrate the UI from the legacy XML config. Run on plugin
        /// boot so the SDK page reflects existing settings; the JSON
        /// store backstops it after the user saves.
        /// </summary>
        public static void HydrateFrom(MainPageUI ui, PluginConfiguration config)
        {
            if (ui == null || config == null) return;
            ui.DryRunMode = config.DryRunMode;
            ui.AiSystemPrompt = string.IsNullOrEmpty(config.AiSystemPrompt)
                ? PluginConfiguration.DefaultAiSystemPrompt
                : config.AiSystemPrompt;
            // ReleaseNotesUrl is JSON-only on the UI for now (UI-managed).
        }
    }
}
