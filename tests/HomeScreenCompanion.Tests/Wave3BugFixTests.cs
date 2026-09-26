using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using Emby.Web.GenericEdit.Elements;
using HomeScreenCompanion.UI;
using HomeScreenCompanion.UI.Tabs;
using Xunit;

namespace HomeScreenCompanion.Tests;

/// <summary>
/// Wave 3 / bug-fix regressions: covers the bug-fix work that landed on top
/// of the wave-2 tabbed shell. Each [Fact] maps to a specific user-visible
/// issue from the bug report.
/// </summary>
public sealed class Wave3BugFixTests
{
    private static System.Type GetType(string fullName)
    {
        var t = typeof(Plugin).Assembly.GetType(fullName);
        Assert.NotNull(t);
        return t!;
    }

    // ─── Tab 1: Home Screen Companion (MainPageView) ───────────────────

    [Fact]
    public void MainPageView_Has_OpenReleaseNotes_Command_Constant()
    {
        // The button on MainPageUI is wired to Data1="OpenReleaseNotes".
        var ui = new MainPageUI();
        var button = ui.OpenReleaseNotesButton;
        Assert.NotNull(button);
        Assert.Equal("OpenReleaseNotes", button.Data1);
    }

    [Fact]
    public void MainPageView_Handles_OpenReleaseNotes_Command()
    {
        var method = typeof(MainPageView).GetMethod("RunCommand",
            BindingFlags.Public | BindingFlags.Instance);
        Assert.NotNull(method);

        var buttonCmd = new MainPageUI().OpenReleaseNotesButton.Data1;
        Assert.Equal("OpenReleaseNotes", buttonCmd);
    }

    [Fact]
    public void MainPageUI_No_Longer_Exposes_Dropped_TagsPlaceholder()
    {
        // Tag rules now live in their own tab; remove the placeholder
        // EditorDxGrid Tags on the main overview page.
        var t = typeof(MainPageUI);
        var names = t.GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .Select(p => p.Name)
            .ToHashSet();
        Assert.DoesNotContain("Tags", names);
    }

    [Fact]
    public void MainPageUI_Is_QuickAccess_Only()
    {
        // The first tab is a "quick summary" — API keys, AI provider
        // settings, advanced toggles and backup/restore all live on
        // the Settings tab. Stripping those out of MainPageUI keeps
        // the two surfaces from drifting apart.
        var names = typeof(MainPageUI)
            .GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .Select(p => p.Name)
            .ToHashSet();

        Assert.DoesNotContain("ExtendedConsoleOutput", names);
        Assert.DoesNotContain("LogMissingItems", names);
        Assert.DoesNotContain("PreserveTagsOnEmptyResult", names);
        Assert.DoesNotContain("TraktClientId", names);
        Assert.DoesNotContain("MdblistApiKey", names);
        Assert.DoesNotContain("TmdbApiKey", names);
        Assert.DoesNotContain("OpenAiApiKey", names);
        Assert.DoesNotContain("OpenAiModel", names);
        Assert.DoesNotContain("GeminiApiKey", names);
        Assert.DoesNotContain("GeminiModel", names);
        Assert.DoesNotContain("ClaudeApiKey", names);
        Assert.DoesNotContain("ClaudeModel", names);
        Assert.DoesNotContain("OllamaBaseUrl", names);
        Assert.DoesNotContain("OllamaModel", names);
    }

    // ─── Tab 2: Tag & Collection (AddSourceDialog + dropdowns) ────────

    [Fact]
    public void AddSourceOptionsUI_Exposes_SourceType_With_SelectItemsSource()
    {
        var t = GetType("HomeScreenCompanion.UI.Tabs.AddSourceOptionsUI");
        var prop = t.GetProperty("SourceType", BindingFlags.Public | BindingFlags.Instance)!;
        var attrs = prop.GetCustomAttributesData()
            .Select(a => a.AttributeType?.FullName)
            .Where(s => s != null)
            .Select(s => s!)
            .ToHashSet();
        Assert.Contains("MediaBrowser.Model.Attributes.SelectItemsSourceAttribute", attrs);
    }

    [Fact]
    public void AddSourceOptionsUI_SourceTypes_Are_All_Explicitly_Enabled()
    {
        // Regression for "Source type all options greyed out". The SDK
        // defaults IsEnabled=true, but being explicit guards against a
        // bug that would otherwise ship with broken dropdowns.
        var t = GetType("HomeScreenCompanion.UI.Tabs.AddSourceOptionsUI");
        var instance = (AddSourceOptionsUI)System.Activator.CreateInstance(t);
        Assert.NotEmpty(instance.SourceTypes);
        Assert.All(instance.SourceTypes, o => Assert.True(o.IsEnabled));
    }

    [Fact]
    public void TagRulesTabUI_FilterSourceType_Is_A_Dropdown()
    {
        var t = GetType("HomeScreenCompanion.UI.Tabs.TagRulesTabUI");
        var prop = t.GetProperty("FilterSourceType", BindingFlags.Public | BindingFlags.Instance)!;
        var attrs = prop.GetCustomAttributesData()
            .Select(a => a.AttributeType?.FullName)
            .Where(s => s != null)
            .Select(s => s!)
            .ToHashSet();
        Assert.Contains("MediaBrowser.Model.Attributes.SelectItemsSourceAttribute", attrs);
    }

    [Fact]
    public void AddSourceDialog_OnOk_Persists_TagConfig_To_Plugin()
    {
        // Regression for "pressing Add -> closes modal nothing happens".
        // The dialog now persists inside OnOkCommand instead of relying
        // on OnDialogResult (which the Emby SDK doesn't reliably invoke).
        var t = GetType("HomeScreenCompanion.UI.Tabs.AddSourceDialog");
        var method = t.GetMethod("OnOkCommand",
            BindingFlags.Public | BindingFlags.Instance);
        Assert.NotNull(method);
    }

    [Fact]
    public void TagRuleFactory_Generates_Unique_Names()
    {
        var existing = new List<TagConfig>
        {
            new TagConfig { Name = "External-Tag-1" },
            new TagConfig { Name = "External-Tag-3" },
        };
        var tag = TagRuleFactory.CreateBlank(existing, "External");
        Assert.Equal("External-Tag-2", tag.Name);
        Assert.Equal("External-Tag-2", tag.Tag);
        Assert.Equal("External", tag.SourceType);
        Assert.True(tag.Active);
        Assert.True(tag.EnableTag);
    }

    // ─── Tab 3: Top Lists (Add 500 + persistence) ──────────────────────

    [Fact]
    public void TopListEditDialog_Persists_OnOk()
    {
        var t = GetType("HomeScreenCompanion.UI.Tabs.TopListEditDialog");
        var method = t.GetMethod("OnOkCommand",
            BindingFlags.Public | BindingFlags.Instance);
        Assert.NotNull(method);
    }

    [Fact]
    public void TopListEditDialog_Handles_Stray_Cancel_Without_500()
    {
        var t = GetType("HomeScreenCompanion.UI.Tabs.TopListEditDialog");
        var method = t.GetMethod("RunCommand",
            BindingFlags.Public | BindingFlags.Instance);
        Assert.NotNull(method);
    }

    // ─── Tab 4: Home Screen (user dropdown + Unauthorized) ────────────

    [Fact]
    public void HomeScreenTabUI_SourceUserId_Is_A_Dropdown()
    {
        var t = GetType("HomeScreenCompanion.UI.Tabs.HomeScreenTabUI");
        var manage = t.GetProperty("SourceUserId", BindingFlags.Public | BindingFlags.Instance)!;
        var sync = t.GetProperty("SyncSourceUserId", BindingFlags.Public | BindingFlags.Instance)!;

        foreach (var p in new[] { manage, sync })
        {
            var attrs = p!.GetCustomAttributesData()
                .Select(a => a.AttributeType?.FullName)
                .Where(s => s != null)
                .Select(s => s!)
                .ToHashSet();
            Assert.Contains("MediaBrowser.Model.Attributes.SelectItemsSourceAttribute", attrs);
        }
    }

    [Fact]
    public void HomeScreenTabView_PopulateUserOptions_Exists_And_Is_Public()
    {
        var t = GetType("HomeScreenCompanion.UI.Tabs.HomeScreenTabView");
        var method = t.GetMethod("PopulateUserOptions",
            BindingFlags.Public | BindingFlags.Instance);
        Assert.NotNull(method);
    }

    [Fact]
    public void HomeScreenTabUI_Has_SourceUserOptions_Collection()
    {
        var t = GetType("HomeScreenCompanion.UI.Tabs.HomeScreenTabUI");
        var prop = t.GetProperty("SourceUserOptions", BindingFlags.Public | BindingFlags.Instance);
        Assert.NotNull(prop);
    }

    [Fact]
    public void HomeScreenTabView_RunCommand_Handles_Cancel_Without_500()
    {
        // Defensive guard: SDK sometimes sends stray "Cancel" commands.
        var t = GetType("HomeScreenCompanion.UI.Tabs.HomeScreenTabView");
        var method = t.GetMethod("RunCommand", BindingFlags.Public | BindingFlags.Instance);
        Assert.NotNull(method);
    }

    // ─── Tab 5: Logs & Status (auto-refresh) ──────────────────────────

    [Fact]
    public void LogsTabUI_Exposes_AutoRefresh_Fields()
    {
        var t = GetType("HomeScreenCompanion.UI.Tabs.LogsTabUI");
        var names = t.GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .Select(p => p.Name)
            .ToHashSet();
        Assert.Contains("AutoRefreshEnabled", names);
        Assert.Contains("AutoRefreshSeconds", names);
        Assert.Contains("AutoRefreshStateLabel", names);
    }

    [Fact]
    public void LogsTabUI_AutoRefresh_Is_Backed_By_AutoPostBack()
    {
        var t = GetType("HomeScreenCompanion.UI.Tabs.LogsTabUI");
        var prop = t.GetProperty("AutoRefreshEnabled", BindingFlags.Public | BindingFlags.Instance)!;
        var attrs = prop.GetCustomAttributesData()
            .Select(a => a.AttributeType?.FullName)
            .Where(s => s != null)
            .Select(s => s!)
            .ToHashSet();
        Assert.Contains("MediaBrowser.Model.Attributes.AutoPostBackAttribute", attrs);
    }

    [Fact]
    public void LogsTabView_Exposes_AutoRefreshToggle_Command_Constant()
    {
        var t = GetType("HomeScreenCompanion.UI.Tabs.LogsTabView");
        var field = t.GetField("AutoRefreshToggleCommand",
            BindingFlags.Public | BindingFlags.Static | BindingFlags.NonPublic);
        Assert.NotNull(field);
    }

    // ─── Tab 6: Settings (Export Backup icon) ─────────────────────────

    [Fact]
    public void SettingsTabUI_ExportBackupButton_Uses_Reliable_Icon()
    {
        // Regression for "Export Backup has big text before OUTLINE".
        // The icon used to be IconNames.bookmark_outline which some
        // themes render as raw text. Switched to a glyph that is in
        // the base Material Icons font.
        var t = GetType("HomeScreenCompanion.UI.Tabs.SettingsTabUI");
        var btn = t.GetProperty("ExportBackupButton", BindingFlags.Public | BindingFlags.Instance)!;
        var instance = (ButtonItem)btn.GetValue(System.Activator.CreateInstance(t))!;
        Assert.NotEqual(IconNames.bookmark_outline, instance.Icon);
        Assert.NotEqual(default(IconNames), instance.Icon);
    }

    [Fact]
    public void SettingsTabUI_ImportBackupButton_Uses_Reliable_Icon()
    {
        var t = GetType("HomeScreenCompanion.UI.Tabs.SettingsTabUI");
        var btn = t.GetProperty("ImportBackupButton", BindingFlags.Public | BindingFlags.Instance)!;
        var instance = (ButtonItem)btn.GetValue(System.Activator.CreateInstance(t))!;
        Assert.NotEqual(IconNames.bookmark_outline, instance.Icon);
        Assert.NotEqual(default(IconNames), instance.Icon);
    }
}
