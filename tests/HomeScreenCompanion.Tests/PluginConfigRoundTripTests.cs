using System.Linq;
using System.Reflection;
using HomeScreenCompanion.UI;
using Xunit;

namespace HomeScreenCompanion.Tests;

/// <summary>
/// Audit-plan v2 / Wave 2 / T3: round-trip tests for the typed
/// <see cref="MainPageConfigMapper"/>. Verifies that every scalar
/// property on <c>MainPageUI</c> maps 1:1 onto <c>PluginConfiguration</c>
/// and back, and that lossy fields (none in v2) are filtered out.
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
    public void ToPluginConfig_Copies_Every_Scalar_Setting()
    {
        var ui = new MainPageUI
        {
            DryRunMode = true,
            ExtendedConsoleOutput = true,
            LogMissingItems = true,
            PreserveTagsOnEmptyResult = false,
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
            AiSystemPrompt = "custom prompt",
        };

        var config = MainPageConfigMapper.ToPluginConfig(ui);

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
    public void ToPluginConfig_Falls_Back_To_Default_When_Prompt_Is_Empty()
    {
        var ui = new MainPageUI { AiSystemPrompt = "" };

        var config = MainPageConfigMapper.ToPluginConfig(ui);

        Assert.Equal(PluginConfiguration.DefaultAiSystemPrompt, config.AiSystemPrompt);
    }

    [Fact]
    public void HydrateFrom_Populates_All_Scalars_From_The_Legacy_Config()
    {
        var config = new PluginConfiguration
        {
            TraktClientId = "trakt-xyz",
            OpenAiModel = "gpt-4-turbo",
            DryRunMode = true,
        };

        var ui = new MainPageUI();
        MainPageConfigMapper.HydrateFrom(ui, config);

        Assert.Equal("trakt-xyz", ui.TraktClientId);
        Assert.Equal("gpt-4-turbo", ui.OpenAiModel);
        Assert.True(ui.DryRunMode);
    }

    [Fact]
    public void HydrateFrom_Survives_A_Full_Round_Trip()
    {
        // Set scalars on the UI → map to config → map back → compare.
        var original = new MainPageUI
        {
            DryRunMode = true,
            MdblistApiKey = "mdb-original",
            PreserveTagsOnEmptyResult = false,
            ClaudeModel = "claude-opus",
        };

        var config = MainPageConfigMapper.ToPluginConfig(original);

        var roundTripped = new MainPageUI();
        MainPageConfigMapper.HydrateFrom(roundTripped, config);

        Assert.Equal(original.DryRunMode, roundTripped.DryRunMode);
        Assert.Equal(original.MdblistApiKey, roundTripped.MdblistApiKey);
        Assert.Equal(original.PreserveTagsOnEmptyResult, roundTripped.PreserveTagsOnEmptyResult);
        Assert.Equal(original.ClaudeModel, roundTripped.ClaudeModel);
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
