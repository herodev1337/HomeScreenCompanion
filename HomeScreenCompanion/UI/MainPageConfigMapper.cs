using System.Collections.Generic;

namespace HomeScreenCompanion.UI
{
    /// <summary>
    /// Typed mapper between the SDK declarative-UI model
    /// (<see cref="MainPageUI"/>) and the legacy XML config
    /// (<see cref="PluginConfiguration"/>).
    ///
    /// Audit-plan v2 / Wave 2 / T3: keeps both surfaces in sync without
    /// duplicating field definitions. Tag rows continue to live on
    /// <see cref="PluginConfiguration.Tags"/> as legacy
    /// <c>TagConfig</c> entries until U4 / T6 swap them for the SDK
    /// row type — the mapper does not yet touch the row list.
    /// </summary>
    public static class MainPageConfigMapper
    {
        /// <summary>Apply the UI's scalar settings onto the legacy XML config.</summary>
        public static PluginConfiguration ToPluginConfig(MainPageUI ui)
        {
            if (ui == null) return new PluginConfiguration();
            return new PluginConfiguration
            {
                DryRunMode = ui.DryRunMode,
                ExtendedConsoleOutput = ui.ExtendedConsoleOutput,
                LogMissingItems = ui.LogMissingItems,
                PreserveTagsOnEmptyResult = ui.PreserveTagsOnEmptyResult,
                TraktClientId = ui.TraktClientId ?? "",
                MdblistApiKey = ui.MdblistApiKey ?? "",
                TmdbApiKey = ui.TmdbApiKey ?? "",
                OpenAiApiKey = ui.OpenAiApiKey ?? "",
                OpenAiModel = ui.OpenAiModel ?? "gpt-4o-mini",
                GeminiApiKey = ui.GeminiApiKey ?? "",
                GeminiModel = ui.GeminiModel ?? "gemini-2.5-flash-lite",
                ClaudeApiKey = ui.ClaudeApiKey ?? "",
                ClaudeModel = ui.ClaudeModel ?? "claude-haiku-4-5-20251001",
                OllamaBaseUrl = ui.OllamaBaseUrl ?? "http://localhost:11434",
                OllamaModel = ui.OllamaModel ?? "",
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
            ui.ExtendedConsoleOutput = config.ExtendedConsoleOutput;
            ui.LogMissingItems = config.LogMissingItems;
            ui.PreserveTagsOnEmptyResult = config.PreserveTagsOnEmptyResult;
            ui.TraktClientId = config.TraktClientId ?? "";
            ui.MdblistApiKey = config.MdblistApiKey ?? "";
            ui.TmdbApiKey = config.TmdbApiKey ?? "";
            ui.OpenAiApiKey = config.OpenAiApiKey ?? "";
            ui.OpenAiModel = config.OpenAiModel ?? "gpt-4o-mini";
            ui.GeminiApiKey = config.GeminiApiKey ?? "";
            ui.GeminiModel = config.GeminiModel ?? "gemini-2.5-flash-lite";
            ui.ClaudeApiKey = config.ClaudeApiKey ?? "";
            ui.ClaudeModel = config.ClaudeModel ?? "claude-haiku-4-5-20251001";
            ui.OllamaBaseUrl = config.OllamaBaseUrl ?? "http://localhost:11434";
            ui.OllamaModel = config.OllamaModel ?? "";
            ui.AiSystemPrompt = string.IsNullOrEmpty(config.AiSystemPrompt)
                ? PluginConfiguration.DefaultAiSystemPrompt
                : config.AiSystemPrompt;
            // ReleaseNotesUrl is JSON-only on the UI for now (UI-managed).
        }
    }
}
