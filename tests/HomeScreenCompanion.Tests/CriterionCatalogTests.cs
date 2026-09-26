using System.Collections.Generic;
using System.Reflection;
using HomeScreenCompanion.Criteria;
using Xunit;

namespace HomeScreenCompanion.Tests;

/// <summary>
/// Behavior tests for <see cref="CriterionCatalog"/> — the single source of
/// truth for criterion classification and home-section query translation.
/// All calls go through the typed surface (no reflection, no DLL loading).
/// </summary>
public class CriterionCatalogTests
{
    private static string Prop(object parsed) => (string)parsed.GetType()
        .GetField("Prop", BindingFlags.Public | BindingFlags.Instance)!.GetValue(parsed)!;
    private static string Op(object parsed) => (string)parsed.GetType()
        .GetField("Op", BindingFlags.Public | BindingFlags.Instance)!.GetValue(parsed)!;
    private static string Val(object parsed) => (string)parsed.GetType()
        .GetField("Val", BindingFlags.Public | BindingFlags.Instance)!.GetValue(parsed)!;
    private static string UserScope(object parsed) => (string)parsed.GetType()
        .GetField("UserScope", BindingFlags.Public | BindingFlags.Instance)!.GetValue(parsed)!;
    private static bool Negated(object parsed) => (bool)parsed.GetType()
        .GetField("Negated", BindingFlags.Public | BindingFlags.Instance)!.GetValue(parsed)!;

    private static Dictionary<string, string> ApplySectionQuery(params string[] criteria)
    {
        var dict = new Dictionary<string, string>();
        CriterionCatalog.ApplySectionQuery(criteria, dict);
        return dict;
    }

    // ─── Parse ────────────────────────────────────────────────────────────────────

    [Fact]
    public void Parse_Shorthand()
    {
        var p = CriterionCatalog.Parse("InProgress");
        Assert.Equal("InProgress", Prop(p));
        Assert.Equal("", Op(p));
        Assert.Equal("", Val(p));
        Assert.Equal("", UserScope(p));
        Assert.False(Negated(p));
    }

    [Fact]
    public void Parse_Negation()
    {
        Assert.True(Negated(CriterionCatalog.Parse("!InProgress")));
        Assert.False(Negated(CriterionCatalog.Parse("InProgress")));
    }

    [Fact]
    public void Parse_TwoPart()
    {
        var p = CriterionCatalog.Parse("MediaType:Series");
        Assert.Equal("MediaType", Prop(p));
        Assert.Equal("Series", Val(p));
    }

    [Fact]
    public void Parse_FourPart_UserScope()
    {
        var p = CriterionCatalog.Parse("IsPlayed:__current__:=:Watched");
        Assert.Equal("IsPlayed", Prop(p));
        Assert.Equal("__current__", UserScope(p));
        Assert.Equal("=", Op(p));
        Assert.Equal("Watched", Val(p));
    }

    [Fact]
    public void Parse_ThreePart_TextMatch()
    {
        var p = CriterionCatalog.Parse("Title:contains:Star Wars");
        Assert.Equal("Title", Prop(p));
        Assert.Equal("contains", Op(p));
        Assert.Equal("Star Wars", Val(p));
    }

    [Fact]
    public void Parse_ThreePart_Numeric()
    {
        var p = CriterionCatalog.Parse("Year:>=:1990");
        Assert.Equal("Year", Prop(p));
        Assert.Equal(">=", Op(p));
        Assert.Equal("1990", Val(p));
    }

    [Fact]
    public void Parse_Collection_ColonSafe()
    {
        var p = CriterionCatalog.Parse("Collection:Star: Wars");
        Assert.Equal("Collection", Prop(p));
        Assert.Equal("Star: Wars", Val(p));
    }

    [Fact]
    public void Parse_Empty_IsGlobalOnly()
    {
        var p = CriterionCatalog.Parse("");
        Assert.Equal("", Prop(p));
        Assert.Equal("GlobalOnly", CriterionCatalog.Classify(p).ToString());
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
        Assert.Equal(expected, CriterionCatalog.Classify(CriterionCatalog.Parse(raw)).ToString());
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
        Assert.Equal(expected, CriterionCatalog.IsViewerScoped(raw));
    }

    // ─── IsViewerOnlyGroup (the bug fix) ──────────────────────────────────────────

    [Fact]
    public void IsViewerOnlyGroup_InProgressPlusMediaTypeSeries_IsTrue()
    {
        // Regression: MediaType:Series used to break viewer-only detection,
        // forcing the tag-lookup path and producing an empty/wrong section.
        Assert.True(CriterionCatalog.IsViewerOnlyGroup(new[] { "InProgress", "MediaType:Series" }));
    }

    [Fact]
    public void IsViewerOnlyGroup_InProgressOnly_IsTrue()
    {
        Assert.True(CriterionCatalog.IsViewerOnlyGroup(new[] { "InProgress" }));
    }

    [Fact]
    public void IsViewerOnlyGroup_IsPlayedCurrentPlusMediaTypeMovie_IsTrue()
    {
        Assert.True(CriterionCatalog.IsViewerOnlyGroup(new[] { "IsPlayed:__current__:=:Watched", "MediaType:Movie" }));
    }

    [Fact]
    public void IsViewerOnlyGroup_WithGlobalCriterion_IsFalse()
    {
        Assert.False(CriterionCatalog.IsViewerOnlyGroup(new[] { "InProgress", "4K" }));
    }

    [Fact]
    public void IsViewerOnlyGroup_StaticOnly_IsFalse()
    {
        Assert.False(CriterionCatalog.IsViewerOnlyGroup(new[] { "MediaType:Series" }));
    }

    [Fact]
    public void IsViewerOnlyGroup_Empty_IsFalse()
    {
        Assert.False(CriterionCatalog.IsViewerOnlyGroup(new string[0]));
    }

    // ─── ApplySectionQuery ────────────────────────────────────────────────────────

    [Fact]
    public void ApplySectionQuery_InProgress_SetsIsResumable()
    {
        var s = ApplySectionQuery("InProgress");
        Assert.Equal("true", s["_queryIsResumable"]);
    }

    [Fact]
    public void ApplySectionQuery_NegatedInProgress_SetsIsResumableFalse()
    {
        var s = ApplySectionQuery("!InProgress");
        Assert.Equal("false", s["_queryIsResumable"]);
    }

    [Fact]
    public void ApplySectionQuery_IsPlayedCurrentWatched_SetsIsPlayed()
    {
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
        var s = ApplySectionQuery("InProgress", "MediaType:Series");
        Assert.Equal("true", s["_queryIsResumable"]);
        Assert.Equal("[\"Episode\"]", s["ItemTypes"]);
        Assert.Equal("true", s["_querySeriesPivot"]);
        Assert.False(s.ContainsKey("_queryEnsureItemTypes"));
    }

    [Fact]
    public void ApplySectionQuery_InProgressPlusMovie_KeepsMovie()
    {
        var s = ApplySectionQuery("InProgress", "MediaType:Movie");
        Assert.Equal("[\"Movie\"]", s["ItemTypes"]);
        Assert.False(s.ContainsKey("_queryEnsureItemTypes"));
        Assert.False(s.ContainsKey("_querySeriesPivot"));
    }

    [Fact]
    public void ApplySectionQuery_IsPlayedPlusSeries_KeepsSeriesNative()
    {
        // Non-resumable viewer groups can filter Series natively.
        var s = ApplySectionQuery("IsPlayed:__current__:=:Watched", "MediaType:Series");
        Assert.Equal("true", s["_queryIsPlayed"]);
        Assert.Equal("[\"Series\"]", s["ItemTypes"]);
        Assert.False(s.ContainsKey("_querySeriesPivot"));
    }

    [Fact]
    public void ApplySectionQuery_IsPlayedPlusEpisodeIncludeSeries_ShowsEpisodeAndSeries()
    {
        var s = ApplySectionQuery("IsPlayed:__current__:=:Watched", "MediaType:EpisodeIncludeSeries");
        Assert.Equal("[\"Episode\",\"Series\"]", s["ItemTypes"]);
    }

    [Fact]
    public void ApplySectionQuery_InProgressAlone_WidensSectionItemTypes()
    {
        // Pure "In Progress" must also surface series-as-episodes.
        var s = ApplySectionQuery("InProgress");
        Assert.Equal("Episode", s["_queryEnsureItemTypes"]);
        Assert.False(s.ContainsKey("ItemTypes"));
    }

    [Fact]
    public void ApplySectionQuery_InProgressAlone_MovieOnlySection_DoesNotWiden()
    {
        // If the user explicitly constrained the section's ItemTypes to
        // ["Movie"], their choice wins — no Episode widening.
        var dict = new Dictionary<string, string> { ["ItemTypes"] = "[\"Movie\"]" };
        CriterionCatalog.ApplySectionQuery(new[] { "InProgress" }, dict);
        Assert.Equal("true", dict["_queryIsResumable"]);
        Assert.False(dict.ContainsKey("_queryEnsureItemTypes"));
    }

    [Fact]
    public void ApplySectionQuery_EpisodeIncludeSeries_MapsToEpisode()
    {
        var s = ApplySectionQuery("InProgress", "MediaType:EpisodeIncludeSeries");
        Assert.Equal("[\"Episode\"]", s["ItemTypes"]);
    }

    [Fact]
    public void ApplySectionQuery_MixedGlobalGroup_OnlyTranslatesViewerCriteria()
    {
        // InProgress + 4K: the tag carries the 4K constraint, so no
        // ItemTypes / EnsureItemTypes — only the resumable flag.
        var s = ApplySectionQuery("InProgress", "4K");
        Assert.Equal("true", s["_queryIsResumable"]);
        Assert.False(s.ContainsKey("ItemTypes"));
        Assert.False(s.ContainsKey("_queryEnsureItemTypes"));
    }

    [Fact]
    public void ApplySectionQuery_StaticOnly_NoTranslation()
    {
        var s = ApplySectionQuery("MediaType:Series");
        Assert.Empty(s);
    }

    [Fact]
    public void ApplySectionQuery_MultipleMediaTypes_Accumulates()
    {
        var s = ApplySectionQuery("InProgress", "MediaType:Series", "MediaType:Movie");
        // Series pivots to Episode; Movie stays.
        Assert.Equal("[\"Episode\",\"Movie\"]", s["ItemTypes"]);
        Assert.Equal("true", s["_querySeriesPivot"]);
    }

    [Fact]
    public void ApplySectionQuery_MediaTypeBeforeInProgress_StillPivots()
    {
        // Pivot decision must not depend on criterion order.
        var s = ApplySectionQuery("MediaType:Series", "InProgress");
        Assert.Equal("[\"Episode\"]", s["ItemTypes"]);
        Assert.Equal("true", s["_querySeriesPivot"]);
    }
}
