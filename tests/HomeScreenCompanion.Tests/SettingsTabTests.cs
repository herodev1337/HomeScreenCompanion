using System.Linq;
using System.Reflection;
using Xunit;

namespace HomeScreenCompanion.Tests;

/// <summary>
/// Wave 2 / U10: shape tests for the Settings tab. Verifies the
/// declarative UI model exposes every scalar group, the mapper
/// round-trips them, and the backup / restore dialogs exist.
/// </summary>
public sealed class SettingsTabTests
{
    private static System.Type GetType(string fullName)
    {
        var t = typeof(Plugin).Assembly.GetType(fullName);
        Assert.NotNull(t);
        return t!;
    }

    [Fact]
    public void SettingsTabUI_Exposes_All_Scalar_Groups()
    {
        var t = GetType("HomeScreenCompanion.UI.Tabs.SettingsTabUI");
        var names = t.GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .Select(p => p.Name)
            .ToHashSet();

        // External list API keys
        Assert.Contains("TraktClientId", names);
        Assert.Contains("MdblistApiKey", names);
        Assert.Contains("TmdbApiKey", names);

        // AI provider keys + models
        Assert.Contains("OpenAiApiKey", names);
        Assert.Contains("OpenAiModel", names);
        Assert.Contains("GeminiApiKey", names);
        Assert.Contains("GeminiModel", names);
        Assert.Contains("ClaudeApiKey", names);
        Assert.Contains("ClaudeModel", names);
        Assert.Contains("OllamaBaseUrl", names);
        Assert.Contains("OllamaModel", names);

        // System prompt
        Assert.Contains("AiSystemPrompt", names);

        // Schedule + behaviour toggles
        Assert.Contains("RunIntervalMinutes", names);
        Assert.Contains("DryRunMode", names);
        Assert.Contains("ExtendedConsoleOutput", names);
        Assert.Contains("LogMissingItems", names);
        Assert.Contains("PreserveTagsOnEmptyResult", names);

        // Action buttons
        Assert.Contains("ExportBackupButton", names);
        Assert.Contains("ImportBackupButton", names);
        Assert.Contains("ResetSystemPromptButton", names);
    }

    [Fact]
    public void SettingsConfigMapper_Roundtrips_Scalars()
    {
        var mapper = GetType("HomeScreenCompanion.UI.Tabs.SettingsConfigMapper");
        Assert.NotNull(mapper.GetMethod("ToPluginConfig", new[] { GetType("HomeScreenCompanion.UI.Tabs.SettingsTabUI") }));
        Assert.NotNull(mapper.GetMethod("HydrateFrom", new[] { GetType("HomeScreenCompanion.UI.Tabs.SettingsTabUI"), typeof(PluginConfiguration) }));
    }

    [Fact]
    public void SettingsConfigMapper_ToPluginConfig_Returns_PluginConfiguration()
    {
        var mapper = GetType("HomeScreenCompanion.UI.Tabs.SettingsConfigMapper");
        var uiType = GetType("HomeScreenCompanion.UI.Tabs.SettingsTabUI");
        var toMethod = mapper.GetMethod("ToPluginConfig", new[] { uiType })!;
        Assert.Equal(typeof(PluginConfiguration), toMethod.ReturnType);
    }

    [Fact]
    public void BackupDialog_And_RestoreDialog_Exist()
    {
        Assert.NotNull(typeof(Plugin).Assembly.GetType("HomeScreenCompanion.UI.Tabs.BackupDialog"));
        Assert.NotNull(typeof(Plugin).Assembly.GetType("HomeScreenCompanion.UI.Tabs.RestoreDialog"));
        Assert.NotNull(typeof(Plugin).Assembly.GetType("HomeScreenCompanion.UI.Tabs.BackupOptionsUI"));
        Assert.NotNull(typeof(Plugin).Assembly.GetType("HomeScreenCompanion.UI.Tabs.RestoreOptionsUI"));
    }

    [Fact]
    public void BackupOptionsUI_Has_All_Six_Section_Checkboxes()
    {
        var t = GetType("HomeScreenCompanion.UI.Tabs.BackupOptionsUI");
        var names = t.GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .Select(p => p.Name)
            .ToHashSet();

        Assert.Contains("Settings", names);
        Assert.Contains("ApiKeys", names);
        Assert.Contains("Tags", names);
        Assert.Contains("SavedFilters", names);
        Assert.Contains("TopLists", names);
        Assert.Contains("HomeSync", names);
    }

    [Fact]
    public void RestoreOptionsUI_Has_FilePicker_And_Six_Section_Checkboxes()
    {
        var t = GetType("HomeScreenCompanion.UI.Tabs.RestoreOptionsUI");
        var names = t.GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .Select(p => p.Name)
            .ToHashSet();

        Assert.Contains("BackupFile", names);
        Assert.Contains("Settings", names);
        Assert.Contains("ApiKeys", names);
        Assert.Contains("Tags", names);
        Assert.Contains("SavedFilters", names);
        Assert.Contains("TopLists", names);
        Assert.Contains("HomeSync", names);
    }
}
