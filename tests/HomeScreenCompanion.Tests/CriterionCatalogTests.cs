using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using Xunit;

namespace HomeScreenCompanion.Tests;

/// <summary>
/// Behavior tests for <c>HomeScreenCompanion.Criteria.CriterionCatalog</c> —
/// the single source of truth for criterion classification and home-section
/// query translation. Invoked via reflection against the built DLL (see
/// <see cref="HscAssembly"/>), same pattern as <see cref="PureFunctionTests"/>.
/// </summary>
public class CriterionCatalogTests
{
    private const string CatalogType = "HomeScreenCompanion.Criteria.CriterionCatalog";
    private const string ParsedType = "HomeScreenCompanion.Criteria.ParsedCriterion";

    private static Type C => HscAssembly.FindType(CatalogType)!;

    private static object? Invoke(string method, params object?[] args) =>
        C.GetMethod(method, BindingFlags.Public | BindingFlags.Static)!.Invoke(null, args);

    /// <summary>Parse a criterion string into a boxed ParsedCriterion.</summary>
    private static object Parse(string raw) => Invoke("Parse", raw)!;

    private static object ClassifyObj(object parsed) => Invoke("Classify", parsed)!;

    private static string ClassifyName(object parsed) => ClassifyObj(parsed).ToString()!;

    private static bool IsViewerScoped(string raw) => (bool)Invoke("IsViewerScoped", (object)raw)!;

    private static bool IsViewerOnlyGroup(params string[] criteria) =>
        (bool)Invoke("IsViewerOnlyGroup", (object)criteria)!;

    private static Dictionary<string, string> ApplySectionQuery(params string[] criteria)
    {
        var dict = new Dictionary<string, string>();
        Invoke("ApplySectionQuery", (object)criteria, dict);
        return dict;
    }

    private static object Field(object parsed, string name) =>
        parsed.GetType().GetField(name, BindingFlags.Public | BindingFlags.Instance)!.GetValue(parsed)!;

    // ─── Parse ────────────────────────────────────────────────────────────────────

    [Fact]
    public void Parse_Shorthand()
    {
        HscAssembly.EnsureAvailable();
        var p = Parse("InProgress");
        Assert.Equal("InProgress", Field(p, "Prop"));
        Assert.Equal("", Field(p, "Op"));
        Assert.Equal("", Field(p, "Val"));
        Assert.Equal("", Field(p, "UserScope"));
        Assert.Equal(false, Field(p, "Negated"));
    }

    [Fact]
    public void Parse_Negation()
    {
        HscAssembly.EnsureAvailable();
        Assert.Equal(true, Field(Parse("!InProgress"), "Negated"));
        Assert.Equal(false, Field(Parse("InProgress"), "Negated"));
    }

    [Fact]
    public void Parse_TwoPart()
    {
        HscAssembly.EnsureAvailable();
        var p = Parse("MediaType:Series");
        Assert.Equal("MediaType", Field(p, "Prop"));
        Assert.Equal("Series", Field(p, "Val"));
    }

    [Fact]
    public void Parse_FourPart_UserScope()
    {
        HscAssembly.EnsureAvailable();
        var p = Parse("IsPlayed:__current__:=:Watched");
        Assert.Equal("IsPlayed", Field(p, "Prop"));
        Assert.Equal("__current__", Field(p, "UserScope"));
        Assert.Equal("=", Field(p, "Op"));
        Assert.Equal("Watched", Field(p, "Val"));
    }

    [Fact]
    public void Parse_ThreePart_TextMatch()
    {
        HscAssembly.EnsureAvailable();
        var p = Parse("Title:contains:Star Wars");
        Assert.Equal("Title", Field(p, "Prop"));
        Assert.Equal("contains", Field(p, "Op"));
        Assert.Equal("Star Wars", Field(p, "Val"));
    }

    [Fact]
    public void Parse_ThreePart_Numeric()
    {
        HscAssembly.EnsureAvailable();
        var p = Parse("Year:>=:1990");
        Assert.Equal("Year", Field(p, "Prop"));
        Assert.Equal(">=", Field(p, "Op"));
        Assert.Equal("1990", Field(p, "Val"));
    }

    [Fact]
    public void Parse_Collection_ColonSafe()
    {
        HscAssembly.EnsureAvailable();
        var p = Parse("Collection:Star: Wars");
        Assert.Equal("Collection", Field(p, "Prop"));
        Assert.Equal("Star: Wars", Field(p, "Val"));
    }

    [Fact]
    public void Parse_Empty_IsGlobalOnly()
    {
        HscAssembly.EnsureAvailable();
        var p = Parse("");
        Assert.Equal("", Field(p, "Prop"));
        Assert.Equal("GlobalOnly", ClassifyName(p));
    }

    // ─── Classify ─────────────────────────────────────────────────────────────────

    [Theory]
    [InlineData("InProgress", "ViewerScoped")]
    [InlineData("!InProgress", "ViewerScoped")]
    [InlineData("IsPlayed:__current__:=:Watched", "ViewerScoped")]
    [InlineData("IsPlayed:__current__:=:Unwatched", "ViewerScoped")]
    [InlineData("IsPlayed:__any__:=:Unwatched", "GlobalOnly")]
    [InlineData("IsPlayed:__all__:=:Unwatched", "GlobalOnly")]
    [InlineData("MediaType:Series", "StaticQueryable")]
    [InlineData("MediaType:Movie", "StaticQueryable")]
    [InlineData("MediaType:Episode", "StaticQueryable")]
    [InlineData("MediaType:EpisodeIncludeSeries", "StaticQueryable")]
    [InlineData("!MediaType:Series", "GlobalOnly")]
    [InlineData("Year:>=:1990", "GlobalOnly")]
    [InlineData("4K", "GlobalOnly")]
    [InlineData("Resolution:4K", "GlobalOnly")]
    [InlineData("Collection:Star Wars", "GlobalOnly")]
    [InlineData("", "GlobalOnly")]
    public void Classify_Matrix(string raw, string expected)
    {
        HscAssembly.EnsureAvailable();
        Assert.Equal(expected, ClassifyName(Parse(raw)));
    }

    // ─── IsViewerScoped (legacy-compatible predicate) ─────────────────────────────

    [Theory]
    [InlineData("InProgress", true)]
    [InlineData("IsPlayed:__current__:=:Watched", true)]
    [InlineData("IsPlayed:__any__:=:Unwatched", false)]
    [InlineData("MediaType:Series", false)]
    [InlineData("LastPlayed:__any__:<=:7", false)]
    public void IsViewerScoped_MatchesLegacyContract(string raw, bool expected)
    {
        HscAssembly.EnsureAvailable();
        Assert.Equal(expected, IsViewerScoped(raw));
    }

    // ─── IsViewerOnlyGroup (the bug fix) ──────────────────────────────────────────

    [Fact]
    public void IsViewerOnlyGroup_InProgressPlusMediaTypeSeries_IsTrue()
    {
        // Regression: MediaType:Series used to break viewer-only detection,
        // forcing the tag-lookup path and producing an empty/wrong section.
        HscAssembly.EnsureAvailable();
        Assert.True(IsViewerOnlyGroup("InProgress", "MediaType:Series"));
    }

    [Fact]
    public void IsViewerOnlyGroup_InProgressOnly_IsTrue()
    {
        HscAssembly.EnsureAvailable();
        Assert.True(IsViewerOnlyGroup("InProgress"));
    }

    [Fact]
    public void IsViewerOnlyGroup_IsPlayedCurrentPlusMediaTypeMovie_IsTrue()
    {
        HscAssembly.EnsureAvailable();
        Assert.True(IsViewerOnlyGroup("IsPlayed:__current__:=:Watched", "MediaType:Movie"));
    }

    [Fact]
    public void IsViewerOnlyGroup_WithGlobalCriterion_IsFalse()
    {
        HscAssembly.EnsureAvailable();
        Assert.False(IsViewerOnlyGroup("InProgress", "4K"));
    }

    [Fact]
    public void IsViewerOnlyGroup_StaticOnly_IsFalse()
    {
        HscAssembly.EnsureAvailable();
        Assert.False(IsViewerOnlyGroup("MediaType:Series"));
    }

    [Fact]
    public void IsViewerOnlyGroup_Empty_IsFalse()
    {
        HscAssembly.EnsureAvailable();
        Assert.False(IsViewerOnlyGroup());
    }

    // ─── ApplySectionQuery ────────────────────────────────────────────────────────

    [Fact]
    public void ApplySectionQuery_InProgress_SetsIsResumable()
    {
        HscAssembly.EnsureAvailable();
        var s = ApplySectionQuery("InProgress");
        Assert.Equal("true", s["_queryIsResumable"]);
    }

    [Fact]
    public void ApplySectionQuery_NegatedInProgress_SetsIsResumableFalse()
    {
        HscAssembly.EnsureAvailable();
        var s = ApplySectionQuery("!InProgress");
        Assert.Equal("false", s["_queryIsResumable"]);
    }

    [Fact]
    public void ApplySectionQuery_IsPlayedCurrentWatched_SetsIsPlayed()
    {
        HscAssembly.EnsureAvailable();
        Assert.Equal("true", ApplySectionQuery("IsPlayed:__current__:=:Watched")["_queryIsPlayed"]);
        Assert.Equal("false", ApplySectionQuery("IsPlayed:__current__:=:Unwatched")["_queryIsPlayed"]);
        Assert.Equal("false", ApplySectionQuery("!IsPlayed:__current__:=:Watched")["_queryIsPlayed"]);
    }

    [Fact]
    public void ApplySectionQuery_InProgressPlusSeries_PivotsToEpisodes()
    {
        // Series items have no playback position — the section must query
        // in-progress Episodes instead. Emby's ItemsQuery has no
        // IncludeItemTypes, so the pivot replaces the section ItemTypes.
        HscAssembly.EnsureAvailable();
        var s = ApplySectionQuery("InProgress", "MediaType:Series");
        Assert.Equal("true", s["_queryIsResumable"]);
        Assert.Equal("[\"Episode\"]", s["ItemTypes"]);
        Assert.Equal("true", s["_querySeriesPivot"]);
        Assert.False(s.ContainsKey("_queryEnsureItemTypes"));
    }

    [Fact]
    public void ApplySectionQuery_InProgressPlusMovie_KeepsMovie()
    {
        HscAssembly.EnsureAvailable();
        var s = ApplySectionQuery("InProgress", "MediaType:Movie");
        Assert.Equal("[\"Movie\"]", s["ItemTypes"]);
        Assert.False(s.ContainsKey("_queryEnsureItemTypes"));
        Assert.False(s.ContainsKey("_querySeriesPivot"));
    }

    [Fact]
    public void ApplySectionQuery_IsPlayedPlusSeries_KeepsSeriesNative()
    {
        // Non-resumable viewer groups can filter Series natively.
        HscAssembly.EnsureAvailable();
        var s = ApplySectionQuery("IsPlayed:__current__:=:Watched", "MediaType:Series");
        Assert.Equal("true", s["_queryIsPlayed"]);
        Assert.Equal("[\"Series\"]", s["ItemTypes"]);
        Assert.False(s.ContainsKey("_querySeriesPivot"));
    }

    [Fact]
    public void ApplySectionQuery_IsPlayedPlusEpisodeIncludeSeries_ShowsEpisodeAndSeries()
    {
        HscAssembly.EnsureAvailable();
        var s = ApplySectionQuery("IsPlayed:__current__:=:Watched", "MediaType:EpisodeIncludeSeries");
        Assert.Equal("[\"Episode\",\"Series\"]", s["ItemTypes"]);
    }

    [Fact]
    public void ApplySectionQuery_InProgressAlone_WidensSectionItemTypes()
    {
        // Pure "In Progress" must also surface series-as-episodes.
        HscAssembly.EnsureAvailable();
        var s = ApplySectionQuery("InProgress");
        Assert.Equal("Episode", s["_queryEnsureItemTypes"]);
        Assert.False(s.ContainsKey("ItemTypes"));
    }

    [Fact]
    public void ApplySectionQuery_InProgressAlone_MovieOnlySection_DoesNotWiden()
    {
        // If the user explicitly constrained the section's ItemTypes to
        // ["Movie"], their choice wins — no Episode widening.
        HscAssembly.EnsureAvailable();
        var dict = new Dictionary<string, string> { ["ItemTypes"] = "[\"Movie\"]" };
        Invoke("ApplySectionQuery", (object)new[] { "InProgress" }, dict);
        Assert.Equal("true", dict["_queryIsResumable"]);
        Assert.False(dict.ContainsKey("_queryEnsureItemTypes"));
    }

    [Fact]
    public void ApplySectionQuery_EpisodeIncludeSeries_MapsToEpisode()
    {
        HscAssembly.EnsureAvailable();
        var s = ApplySectionQuery("InProgress", "MediaType:EpisodeIncludeSeries");
        Assert.Equal("[\"Episode\"]", s["ItemTypes"]);
    }

    [Fact]
    public void ApplySectionQuery_MixedGlobalGroup_OnlyTranslatesViewerCriteria()
    {
        // InProgress + 4K: the tag carries the 4K constraint, so no
        // ItemTypes / EnsureItemTypes — only the resumable flag.
        HscAssembly.EnsureAvailable();
        var s = ApplySectionQuery("InProgress", "4K");
        Assert.Equal("true", s["_queryIsResumable"]);
        Assert.False(s.ContainsKey("ItemTypes"));
        Assert.False(s.ContainsKey("_queryEnsureItemTypes"));
    }

    [Fact]
    public void ApplySectionQuery_StaticOnly_NoTranslation()
    {
        HscAssembly.EnsureAvailable();
        var s = ApplySectionQuery("MediaType:Series");
        Assert.Empty(s);
    }

    [Fact]
    public void ApplySectionQuery_MultipleMediaTypes_Accumulates()
    {
        HscAssembly.EnsureAvailable();
        var s = ApplySectionQuery("InProgress", "MediaType:Series", "MediaType:Movie");
        // Series pivots to Episode; Movie stays.
        Assert.Equal("[\"Episode\",\"Movie\"]", s["ItemTypes"]);
        Assert.Equal("true", s["_querySeriesPivot"]);
    }

    [Fact]
    public void ApplySectionQuery_MediaTypeBeforeInProgress_StillPivots()
    {
        // Pivot decision must not depend on criterion order.
        HscAssembly.EnsureAvailable();
        var s = ApplySectionQuery("MediaType:Series", "InProgress");
        Assert.Equal("[\"Episode\"]", s["ItemTypes"]);
        Assert.Equal("true", s["_querySeriesPivot"]);
    }
}
