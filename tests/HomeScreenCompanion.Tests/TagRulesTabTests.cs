using System.Linq;
using System.Reflection;
using HomeScreenCompanion.UI.Tabs;
using Xunit;

namespace HomeScreenCompanion.Tests;

/// <summary>
/// Wave 2 / U11: shape tests for the Tag &amp; Collection tab and the
/// supporting source / schedule / MediaInfo models.
/// </summary>
public sealed class TagRulesTabTests
{
    private static System.Type GetType(string fullName)
    {
        var t = typeof(Plugin).Assembly.GetType(fullName);
        Assert.NotNull(t);
        return t!;
    }

    [Fact]
    public void TagRulesTabUI_Exposes_Required_Fields()
    {
        var t = GetType("HomeScreenCompanion.UI.Tabs.TagRulesTabUI");
        var names = t.GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .Select(p => p.Name)
            .ToHashSet();

        Assert.Contains("AddSourceButton", names);
        Assert.Contains("Rules", names);
        Assert.Contains("FilterSourceType", names);
    }

    [Fact]
    public void AddSourceOptionsUI_Has_Source_Type_Picker()
    {
        var t = GetType("HomeScreenCompanion.UI.Tabs.AddSourceOptionsUI");
        Assert.NotNull(t.GetProperty("SourceType", BindingFlags.Public | BindingFlags.Instance));
    }

    [Fact]
    public void TagRuleEditUI_Covers_All_Six_Sections()
    {
        var t = GetType("HomeScreenCompanion.UI.Tabs.TagRuleEditUI");
        var names = t.GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .Select(p => p.Name)
            .ToHashSet();

        // Identity
        Assert.Contains("Name", names);
        Assert.Contains("Tag", names);
        // Sources
        Assert.Contains("Sources", names);
        // AI provider (conditional)
        Assert.Contains("AiProvider", names);
        Assert.Contains("AiPrompt", names);
        // Schedule
        Assert.Contains("ActiveIntervals", names);
        // MediaInfo filters
        Assert.Contains("MediaInfoGroups", names);
        // Collection
        Assert.Contains("EnableCollection", names);
        // Home section
        Assert.Contains("EnableHomeSection", names);
        // Playlist
        Assert.Contains("EnablePlaylist", names);
    }

    [Fact]
    public void SourceRowCollection_Implements_IEditableObjectCollection()
    {
        var collectionType = GetType("HomeScreenCompanion.UI.Tabs.SourceRowCollection");
        Assert.Contains(collectionType.GetInterfaces(),
            i => i.FullName == "Emby.Web.GenericEdit.IEditableObjectCollection");
    }

    [Fact]
    public void DateIntervalCollection_Implements_IEditableObjectCollection()
    {
        var collectionType = GetType("HomeScreenCompanion.UI.Tabs.DateIntervalCollection");
        Assert.Contains(collectionType.GetInterfaces(),
            i => i.FullName == "Emby.Web.GenericEdit.IEditableObjectCollection");
    }

    [Fact]
    public void MediaInfoGroupCollection_Implements_IEditableObjectCollection()
    {
        var collectionType = GetType("HomeScreenCompanion.UI.Tabs.MediaInfoGroupCollection");
        Assert.Contains(collectionType.GetInterfaces(),
            i => i.FullName == "Emby.Web.GenericEdit.IEditableObjectCollection");
    }

    [Fact]
    public void TagRuleConfigMapper_Roundtrips_External_Url_And_Local_Sources()
    {
        var config = new TagConfig
        {
            Name = "T",
            Tag = "tag",
            SourceType = "External",
            Url = "https://example.com/list.json",
            LocalSources = new System.Collections.Generic.List<string> { "lib-id-1", "lib-id-2" },
        };
        var ui = new TagRuleEditUI();
        TagRuleConfigMapper.HydrateFrom(ui, config);

        var sources = ui.Sources as System.Collections.Generic.List<SourceRowUI>;
        Assert.NotNull(sources);
        Assert.Contains(sources!, s => s.Value == "https://example.com/list.json" && s.Kind == "Url");
        Assert.Contains(sources!, s => s.Value == "lib-id-1" && s.Kind == "Local");
        Assert.Contains(sources!, s => s.Value == "lib-id-2" && s.Kind == "Local");

        // Roundtrip back to a fresh TagConfig
        var roundtripped = new TagConfig { Name = "T2", Tag = "tag2", SourceType = "External" };
        TagRuleConfigMapper.ApplyTo(ui, roundtripped);
        Assert.Equal("https://example.com/list.json", roundtripped.Url);
        Assert.Contains("lib-id-1", roundtripped.LocalSources);
        Assert.Contains("lib-id-2", roundtripped.LocalSources);
    }

    [Fact]
    public void TagRuleConfigMapper_Roundtrips_Date_Intervals()
    {
        var config = new TagConfig
        {
            Name = "T",
            Tag = "tag",
            SourceType = "External",
            ActiveIntervals = new System.Collections.Generic.List<DateInterval>
            {
                new DateInterval { Type = "SpecificDate", Start = System.DateTime.UtcNow, End = null, DayOfWeek = "Friday" },
            },
        };
        var ui = new TagRuleEditUI();
        TagRuleConfigMapper.HydrateFrom(ui, config);
        Assert.Single(ui.ActiveIntervals);
        Assert.Equal("SpecificDate", ui.ActiveIntervals[0].Type);

        var roundtripped = new TagConfig { Name = "T2", Tag = "tag2", SourceType = "External" };
        TagRuleConfigMapper.ApplyTo(ui, roundtripped);
        Assert.Single(roundtripped.ActiveIntervals);
        Assert.Equal("SpecificDate", roundtripped.ActiveIntervals[0].Type);
    }
}
