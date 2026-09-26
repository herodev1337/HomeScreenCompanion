using System.Linq;
using System.Reflection;
using HomeScreenCompanion.UI;
using HomeScreenCompanion.UI.Tabs;
using Xunit;

namespace HomeScreenCompanion.Tests;

/// <summary>
/// Round-trip tests for the typed <see cref="MainPageConfigMapper"/>.
/// Verifies that the trimmed quick-access scalars on
/// <c>MainPageUI</c> (Run interval, DryRunMode, AiSystemPrompt) map 1:1
/// onto <c>PluginConfiguration</c> and back, and that the rest of the
/// scalar surface (API keys, AI provider keys/models, advanced toggles)
/// round-trips through <see cref="SettingsConfigMapper"/> /
/// <see cref="SettingsTabUI"/>.
/// </summary>
public sealed class PluginConfigRoundTripTests
{
    [Fact]
    public void Mapper_Has_ToPluginConfig_And_HydrateFrom()
    {
        var toMethod = typeof(MainPageConfigMapper).GetMethod("ToPluginConfig",
            BindingFlags.Public | BindingFlags.Static);
        Assert.NotNull(toMethod);
        Assert.Equal(typeof(PluginConfiguration), toMethod!.ReturnType);

        var hydrate = typeof(MainPageConfigMapper).GetMethod("HydrateFrom",
            BindingFlags.Public | BindingFlags.Static);
        Assert.NotNull(hydrate);
        Assert.Equal(typeof(void), hydrate!.ReturnType);
    }

    [Fact]
    public void ToPluginConfig_Copies_QuickAccess_Scalars()
    {
        // MainPageUI is the quick-access landing tab — only the
        // day-to-day scalars live here. The "full" scalar surface
        // (API keys, AI provider settings, advanced toggles) lives
        // on SettingsTabUI instead.
        var ui = new MainPageUI
        {
            RunIntervalMinutes = 90,
            DryRunMode = true,
            AiSystemPrompt = "custom prompt",
        };

        var config = MainPageConfigMapper.ToPluginConfig(ui);

        Assert.True(config.DryRunMode);
        Assert.Equal("custom prompt", config.AiSystemPrompt);
        Assert.Equal(90, ui.RunIntervalMinutes); // local property; not persisted (no setter target on PluginConfiguration)
    }

    [Fact]
    public void ToPluginConfig_Falls_Back_To_Default_When_Prompt_Is_Empty()
    {
        var ui = new MainPageUI { AiSystemPrompt = "" };

        var config = MainPageConfigMapper.ToPluginConfig(ui);

        Assert.Equal(PluginConfiguration.DefaultAiSystemPrompt, config.AiSystemPrompt);
    }

    [Fact]
    public void HydrateFrom_Populates_QuickAccess_Scalars_From_The_Legacy_Config()
    {
        var config = new PluginConfiguration
        {
            DryRunMode = true,
            AiSystemPrompt = "gpt-prompt-v2",
        };

        var ui = new MainPageUI();
        MainPageConfigMapper.HydrateFrom(ui, config);

        Assert.True(ui.DryRunMode);
        Assert.Equal("gpt-prompt-v2", ui.AiSystemPrompt);
    }

    [Fact]
    public void HydrateFrom_Survives_A_Full_Round_Trip()
    {
        // Set scalars on the UI → map to config → map back → compare.
        var original = new MainPageUI
        {
            DryRunMode = true,
            AiSystemPrompt = "round-trip prompt",
        };

        var config = MainPageConfigMapper.ToPluginConfig(original);

        var roundTripped = new MainPageUI();
        MainPageConfigMapper.HydrateFrom(roundTripped, config);

        Assert.Equal(original.DryRunMode, roundTripped.DryRunMode);
        Assert.Equal(original.AiSystemPrompt, roundTripped.AiSystemPrompt);
    }

    [Fact]
    public void SettingsConfigMapper_Roundtrips_The_Full_Scalar_Surface()
    {
        // Companion to ToPluginConfig_Copies_QuickAccess_Scalars:
        // the API keys / AI provider settings / advanced toggles that
        // used to live on MainPageUI now live on SettingsTabUI and
        // round-trip through SettingsConfigMapper.
        var ui = new SettingsTabUI
        {
            TraktClientId = "trakt-abc",
            MdblistApiKey = "mdb-xyz",
            TmdbApiKey = "tmdb-123",
            OpenAiApiKey = "sk-test",
            OpenAiModel = "gpt-4o",
            GeminiApiKey = "gem-key",
            GeminiModel = "gem-flash",
            ClaudeApiKey = "claude-key",
            ClaudeModel = "claude-sonnet",
            OllamaBaseUrl = "http://gpu-host:11434",
            OllamaModel = "qwen2",
            DryRunMode = true,
            ExtendedConsoleOutput = true,
            LogMissingItems = true,
            PreserveTagsOnEmptyResult = false,
            RunIntervalMinutes = 90,
            AiSystemPrompt = "custom prompt",
        };

        var config = SettingsConfigMapper.ToPluginConfig(ui);

        Assert.True(config.DryRunMode);
        Assert.True(config.ExtendedConsoleOutput);
        Assert.True(config.LogMissingItems);
        Assert.False(config.PreserveTagsOnEmptyResult);
        Assert.Equal("trakt-abc", config.TraktClientId);
        Assert.Equal("mdb-xyz", config.MdblistApiKey);
        Assert.Equal("tmdb-123", config.TmdbApiKey);
        Assert.Equal("sk-test", config.OpenAiApiKey);
        Assert.Equal("gpt-4o", config.OpenAiModel);
        Assert.Equal("gem-key", config.GeminiApiKey);
        Assert.Equal("gem-flash", config.GeminiModel);
        Assert.Equal("claude-key", config.ClaudeApiKey);
        Assert.Equal("claude-sonnet", config.ClaudeModel);
        Assert.Equal("http://gpu-host:11434", config.OllamaBaseUrl);
        Assert.Equal("qwen2", config.OllamaModel);
        Assert.Equal("custom prompt", config.AiSystemPrompt);
    }

    [Fact]
    public void PluginConfiguration_Exposes_DefaultAiSystemPrompt_Const()
    {
        var f = typeof(PluginConfiguration).GetField("DefaultAiSystemPrompt",
            BindingFlags.Public | BindingFlags.Static | BindingFlags.NonPublic);
        Assert.NotNull(f);
        Assert.True(f!.IsLiteral, "DefaultAiSystemPrompt must be a const");
        var value = (string)f.GetRawConstantValue()!;
        Assert.NotEmpty(value);
        Assert.Contains("movie and TV show recommendation assistant", value);
    }

    [Fact]
    public void MainPageUI_AiSystemPrompt_Defaults_From_DefaultAiSystemPrompt_Const()
    {
        // Avoid the divergence trap where the two defaults could drift.
        var ui = new MainPageUI();
        var defaultValue = ui.AiSystemPrompt;

        var constField = typeof(PluginConfiguration).GetField("DefaultAiSystemPrompt",
            BindingFlags.Public | BindingFlags.Static | BindingFlags.NonPublic)!;
        var constValue = (string)constField.GetRawConstantValue()!;

        Assert.Equal(constValue, defaultValue);
    }
}
