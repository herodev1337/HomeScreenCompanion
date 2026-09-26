namespace HomeScreenCompanion.UI.Tabs
{
    /// <summary>
    /// Typed mapper between the Settings tab's SDK declarative-UI model
    /// (<see cref="SettingsTabUI"/>) and the legacy XML config
    /// (<see cref="PluginConfiguration"/>). The Settings tab owns the
    /// scalar surface that used to live on the old Main page, so this
    /// mapper is the single source of truth for reading/writing those
    /// values.
    /// </summary>
    public static class SettingsConfigMapper
    {
        public static PluginConfiguration ToPluginConfig(SettingsTabUI ui)
        {
            if (ui == null) return new PluginConfiguration();
            return new PluginConfiguration
            {
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
                DryRunMode = ui.DryRunMode,
                ExtendedConsoleOutput = ui.ExtendedConsoleOutput,
                LogMissingItems = ui.LogMissingItems,
                PreserveTagsOnEmptyResult = ui.PreserveTagsOnEmptyResult
            };
        }

        public static void HydrateFrom(SettingsTabUI ui, PluginConfiguration config)
        {
            if (ui == null || config == null) return;
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
            ui.DryRunMode = config.DryRunMode;
            ui.ExtendedConsoleOutput = config.ExtendedConsoleOutput;
            ui.LogMissingItems = config.LogMissingItems;
            ui.PreserveTagsOnEmptyResult = config.PreserveTagsOnEmptyResult;
        }
    }
}
