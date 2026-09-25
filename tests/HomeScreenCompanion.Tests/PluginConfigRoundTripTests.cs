using System;
using System.Linq;
using System.Reflection;
using Xunit;

namespace HomeScreenCompanion.Tests;

/// <summary>
/// Audit-plan v2 / Wave 2 / T3: round-trip tests for the typed
/// <see cref="HomeScreenCompanion.UI.MainPageConfigMapper"/>.
/// Verifies that every scalar property on <c>MainPageUI</c> maps
/// 1:1 onto <c>PluginConfiguration</c> and back, and that lossy
/// fields (none in v2) are filtered out.
/// </summary>
public sealed class PluginConfigRoundTripTests
{
    private static Type? MainPageUiType =>
        HscAssembly.FindType("HomeScreenCompanion.UI.MainPageUI");
    private static Type? MapperType =>
        HscAssembly.FindType("HomeScreenCompanion.UI.MainPageConfigMapper");
    private static Type? PluginConfigType =>
        HscAssembly.FindType("HomeScreenCompanion.PluginConfiguration");

    [Fact]
    public void Mapper_Has_ToPluginConfig_And_HydrateFrom()
    {
        Assert.NotNull(MapperType);
        var toMethod = MapperType!.GetMethod("ToPluginConfig",
            BindingFlags.Public | BindingFlags.Static);
        Assert.NotNull(toMethod);
        Assert.Equal(PluginConfigType, toMethod!.ReturnType);

        var hydrate = MapperType.GetMethod("HydrateFrom",
            BindingFlags.Public | BindingFlags.Static);
        Assert.NotNull(hydrate);
        Assert.Equal(typeof(void), hydrate!.ReturnType);
    }

    [Fact]
    public void ToPluginConfig_Copies_Every_Scalar_Setting()
    {
        var ui = Activator.CreateInstance(MainPageUiType!)!;
        var dryRunProp = MainPageUiType!.GetProperty("DryRunMode")!;
        var extendedProp = MainPageUiType!.GetProperty("ExtendedConsoleOutput")!;
        var missingProp = MainPageUiType!.GetProperty("LogMissingItems")!;
        var preserveProp = MainPageUiType!.GetProperty("PreserveTagsOnEmptyResult")!;
        var traktProp = MainPageUiType!.GetProperty("TraktClientId")!;
        var mdbProp = MainPageUiType!.GetProperty("MdblistApiKey")!;
        var tmdbProp = MainPageUiType!.GetProperty("TmdbApiKey")!;
        var openAiKeyProp = MainPageUiType!.GetProperty("OpenAiApiKey")!;
        var openAiModelProp = MainPageUiType!.GetProperty("OpenAiModel")!;
        var geminiKeyProp = MainPageUiType!.GetProperty("GeminiApiKey")!;
        var geminiModelProp = MainPageUiType!.GetProperty("GeminiModel")!;
        var claudeKeyProp = MainPageUiType!.GetProperty("ClaudeApiKey")!;
        var claudeModelProp = MainPageUiType!.GetProperty("ClaudeModel")!;
        var ollamaUrlProp = MainPageUiType!.GetProperty("OllamaBaseUrl")!;
        var ollamaModelProp = MainPageUiType!.GetProperty("OllamaModel")!;
        var promptProp = MainPageUiType!.GetProperty("AiSystemPrompt")!;

        dryRunProp.SetValue(ui, true);
        extendedProp.SetValue(ui, true);
        missingProp.SetValue(ui, true);
        preserveProp.SetValue(ui, false);
        traktProp.SetValue(ui, "trakt-abc");
        mdbProp.SetValue(ui, "mdb-xyz");
        tmdbProp.SetValue(ui, "tmdb-123");
        openAiKeyProp.SetValue(ui, "sk-test");
        openAiModelProp.SetValue(ui, "gpt-4o");
        geminiKeyProp.SetValue(ui, "gem-key");
        geminiModelProp.SetValue(ui, "gem-flash");
        claudeKeyProp.SetValue(ui, "claude-key");
        claudeModelProp.SetValue(ui, "claude-sonnet");
        ollamaUrlProp.SetValue(ui, "http://gpu-host:11434");
        ollamaModelProp.SetValue(ui, "qwen2");
        promptProp.SetValue(ui, "custom prompt");

        var toMethod = MapperType!.GetMethod("ToPluginConfig")!;
        var config = toMethod.Invoke(null, new[] { ui })!;

        Assert.Equal(true, PluginConfigType!.GetProperty("DryRunMode")!.GetValue(config));
        Assert.Equal(true, PluginConfigType.GetProperty("ExtendedConsoleOutput")!.GetValue(config));
        Assert.Equal(true, PluginConfigType.GetProperty("LogMissingItems")!.GetValue(config));
        Assert.Equal(false, PluginConfigType.GetProperty("PreserveTagsOnEmptyResult")!.GetValue(config));
        Assert.Equal("trakt-abc", PluginConfigType.GetProperty("TraktClientId")!.GetValue(config));
        Assert.Equal("mdb-xyz", PluginConfigType.GetProperty("MdblistApiKey")!.GetValue(config));
        Assert.Equal("tmdb-123", PluginConfigType.GetProperty("TmdbApiKey")!.GetValue(config));
        Assert.Equal("sk-test", PluginConfigType.GetProperty("OpenAiApiKey")!.GetValue(config));
        Assert.Equal("gpt-4o", PluginConfigType.GetProperty("OpenAiModel")!.GetValue(config));
        Assert.Equal("gem-key", PluginConfigType.GetProperty("GeminiApiKey")!.GetValue(config));
        Assert.Equal("gem-flash", PluginConfigType.GetProperty("GeminiModel")!.GetValue(config));
        Assert.Equal("claude-key", PluginConfigType.GetProperty("ClaudeApiKey")!.GetValue(config));
        Assert.Equal("claude-sonnet", PluginConfigType.GetProperty("ClaudeModel")!.GetValue(config));
        Assert.Equal("http://gpu-host:11434", PluginConfigType.GetProperty("OllamaBaseUrl")!.GetValue(config));
        Assert.Equal("qwen2", PluginConfigType.GetProperty("OllamaModel")!.GetValue(config));
        Assert.Equal("custom prompt", PluginConfigType.GetProperty("AiSystemPrompt")!.GetValue(config));
    }

    [Fact]
    public void ToPluginConfig_Falls_Back_To_Default_When_Prompt_Is_Empty()
    {
        var ui = Activator.CreateInstance(MainPageUiType!)!;
        MainPageUiType!.GetProperty("AiSystemPrompt")!.SetValue(ui, "");

        var toMethod = MapperType!.GetMethod("ToPluginConfig")!;
        var config = toMethod.Invoke(null, new[] { ui })!;
        var prompt = (string)PluginConfigType!.GetProperty("AiSystemPrompt")!.GetValue(config)!;

        var defaultConstField = PluginConfigType.GetField("DefaultAiSystemPrompt",
            BindingFlags.Public | BindingFlags.Static | BindingFlags.NonPublic);
        Assert.NotNull(defaultConstField);
        var defaultPrompt = (string)defaultConstField!.GetRawConstantValue()!;
        Assert.Equal(defaultPrompt, prompt);
    }

    [Fact]
    public void HydrateFrom_Populates_All_Scalars_From_The_Legacy_Config()
    {
        var config = Activator.CreateInstance(PluginConfigType!)!;
        PluginConfigType!.GetProperty("TraktClientId")!.SetValue(config, "trakt-xyz");
        PluginConfigType.GetProperty("OpenAiModel")!.SetValue(config, "gpt-4-turbo");
        PluginConfigType.GetProperty("DryRunMode")!.SetValue(config, true);

        var ui = Activator.CreateInstance(MainPageUiType!)!;
        var hydrate = MapperType!.GetMethod("HydrateFrom")!;
        hydrate.Invoke(null, new object[] { ui, config });

        Assert.Equal("trakt-xyz", MainPageUiType!.GetProperty("TraktClientId")!.GetValue(ui));
        Assert.Equal("gpt-4-turbo", MainPageUiType.GetProperty("OpenAiModel")!.GetValue(ui));
        Assert.Equal(true, MainPageUiType.GetProperty("DryRunMode")!.GetValue(ui));
    }

    [Fact]
    public void HydrateFrom_Survives_A_Full_Round_Trip()
    {
        // Set scalars on the UI → map to config → map back → compare.
        var original = Activator.CreateInstance(MainPageUiType!)!;
        MainPageUiType!.GetProperty("DryRunMode")!.SetValue(original, true);
        MainPageUiType.GetProperty("MdblistApiKey")!.SetValue(original, "mdb-original");
        MainPageUiType.GetProperty("PreserveTagsOnEmptyResult")!.SetValue(original, false);
        MainPageUiType.GetProperty("ClaudeModel")!.SetValue(original, "claude-opus");

        var config = MapperType!.GetMethod("ToPluginConfig")!
            .Invoke(null, new[] { original })!;

        var roundTripped = Activator.CreateInstance(MainPageUiType!)!;
        MapperType.GetMethod("HydrateFrom")!
            .Invoke(null, new object[] { roundTripped, config });

        var props = new[]
        {
            "DryRunMode", "MdblistApiKey", "PreserveTagsOnEmptyResult", "ClaudeModel"
        };
        foreach (var name in props)
        {
            var orig = MainPageUiType.GetProperty(name)!.GetValue(original);
            var copy = MainPageUiType.GetProperty(name)!.GetValue(roundTripped);
            Assert.Equal(orig, copy);
        }
    }

    [Fact]
    public void PluginConfiguration_Exposes_DefaultAiSystemPrompt_Const()
    {
        var f = PluginConfigType!.GetField("DefaultAiSystemPrompt",
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
        var ui = Activator.CreateInstance(MainPageUiType!)!;
        var defaultProp = MainPageUiType!
            .GetProperty("AiSystemPrompt", BindingFlags.Public | BindingFlags.Instance)!;
        var defaultValue = (string)defaultProp.GetValue(ui)!;

        var constField = PluginConfigType!.GetField("DefaultAiSystemPrompt",
            BindingFlags.Public | BindingFlags.Static | BindingFlags.NonPublic)!;
        var constValue = (string)constField.GetRawConstantValue()!;

        Assert.Equal(constValue, defaultValue);
    }
}
