using System;
using System.Collections.Generic;
using System.Reflection;
using MediaBrowser.Model.Entities;
using MediaBrowser.Model.Serialization;
using SysJson = System.Text.Json;
using Xunit;

namespace HomeScreenCompanion.Tests;

/// <summary>
/// End-to-end guarantee for the catalog translation: whatever
/// <c>CriterionCatalog.ApplySectionQuery</c> writes into the settings dict must
/// end up on fields that Emby's home-section model actually honors.
///
/// Emby 4.10's <c>ContentSection.Query</c> is an <c>ItemsQuery</c> with a very
/// limited property set (IsPlayed, IsResumable, IsMovie, IsSeries, IsFavorite,
/// IsRepeat, IsNews, IsSports, CollectionTypes, GenreIds, StudioIds, TagIds).
/// There is NO IncludeItemTypes — item-type filters must go through
/// <c>ContentSection.ItemTypes</c>. These tests fail fast if a translation
/// writes to a field Emby drops.
/// </summary>
public class BuildContentSectionTests
{
    /// <summary>
    /// Dynamic fake: satisfies every IJsonSerializer overload without matching
    /// Emby's exact generic constraints. The plugin only needs JSON string
    /// deserialization here.
    /// </summary>
    private class FakeJsonSerializer : System.Reflection.DispatchProxy
    {
        public static IJsonSerializer Create() =>
            System.Reflection.DispatchProxy.Create<IJsonSerializer, FakeJsonSerializer>();

        protected override object? Invoke(MethodInfo? targetMethod, object?[]? args)
        {
            if (targetMethod == null) return null;
            var name = targetMethod.Name;
            if (name == "DeserializeFromString")
            {
                var text = (string)(args?[0] ?? "");
                if (targetMethod.IsGenericMethod)
                {
                    var t = targetMethod.GetGenericArguments()[0];
                    return SysJson.JsonSerializer.Deserialize(text, t);
                }
                var type = (Type)args![1]!;
                return SysJson.JsonSerializer.Deserialize(text, type);
            }
            if (name == "SerializeToString" && args != null)
                return SysJson.JsonSerializer.Serialize(args[0]);
            throw new NotSupportedException(name);
        }
    }

    private static ContentSection Build(Dictionary<string, string> settings, ContentSection? existing = null)
    {
        HscAssembly.EnsureAvailable();
        var method = HscAssembly.Assembly
            .GetType(HscAssembly.TaskTypeName)!
            .GetMethod("BuildContentSection",
                BindingFlags.Static | BindingFlags.NonPublic | BindingFlags.Public,
                binder: null,
                types: new[] { typeof(IJsonSerializer), typeof(Dictionary<string, string>), typeof(string), typeof(ContentSection) },
                modifiers: null);
        Assert.NotNull(method);
        return (ContentSection)method!.Invoke(null, new object?[] { FakeJsonSerializer.Create(), settings, "libId", existing })!;
    }

    [Fact]
    public void Resumable_SeriesPivot_LandsOnSectionItemTypes()
    {
        // The regression: _queryIncludeItemTypes was written to a property
        // Emby's ItemsQuery does not have. The pivot must REPLACE the
        // section-level ItemTypes instead.
        var s = Build(new Dictionary<string, string>
        {
            ["SectionType"] = "items",
            ["_queryIsResumable"] = "true",
            ["_querySeriesPivot"] = "true",
            ["ItemTypes"] = "[\"Episode\"]",
            ["CustomName"] = "Zuletzt gesehen",
        });
        Assert.NotNull(s.Query);
        Assert.True(s.Query!.IsResumable);
        Assert.Equal(new[] { "Episode" }, s.ItemTypes);
        Assert.Equal("items", s.SectionType);
    }

    [Fact]
    public void Resumable_PureInProgress_WidensExistingItemTypesWithEpisode()
    {
        var s = Build(new Dictionary<string, string>
        {
            ["SectionType"] = "items",
            ["_queryIsResumable"] = "true",
            ["_queryEnsureItemTypes"] = "Episode",
            ["ItemTypes"] = "[\"Movie\",\"Series\"]",
        });
        Assert.True(s.Query!.IsResumable);
        Assert.Equal(new[] { "Movie", "Series", "Episode" }, s.ItemTypes);
    }

    [Fact]
    public void Played_IsPlayedFlag_IsHonoredField()
    {
        var s = Build(new Dictionary<string, string>
        {
            ["SectionType"] = "items",
            ["_queryIsPlayed"] = "true",
        });
        Assert.True(s.Query!.IsPlayed);
    }

    [Fact]
    public void EmbyItemsQuery_ExposesOnlyHonoredFields()
    {
        // Tripwire: if an Emby upgrade adds IncludeItemTypes back, this test
        // fails and the IncludeItemTypes translation can be reconsidered.
        // Today the section-level ItemTypes is the only honored type filter.
        var inc = typeof(ItemsQuery).GetProperty("IncludeItemTypes");
        Assert.Null(inc);
    }
}
