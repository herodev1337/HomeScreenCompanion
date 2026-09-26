using System;
using System.Collections.Generic;
using System.Reflection;
using Xunit;

namespace HomeScreenCompanion.Tests;

/// <summary>
/// Direct-typed tests for the <c>internal static</c> pure functions in
/// <c>HomeScreenCompanionTask</c> and friends. Each method is invoked directly
/// against the typed surface (no reflection, no snapshot files) — see the
/// test runner's <c>Snapshots/</c> directory deletion in the commit that
/// introduced this style.
/// </summary>
public class PureFunctionTests
{
    private static TagConfig NewTagConfig() => new();

    private static PluginConfiguration NewPluginConfig() => new();

    private static void SetProp<T>(object o, string name, T value)
    {
        var p = o.GetType().GetProperty(name, BindingFlags.Public | BindingFlags.Instance)
            ?? throw new MissingMemberException(o.GetType().FullName, name);
        p.SetValue(o, value);
    }

    // ─── MatchesAny(string[], string) ─────────────────────────────────────────────

    [Fact]
    public void MatchesAny_Cases()
    {
        Assert.False(HomeScreenCompanionTask.MatchesAny(Array.Empty<string>(), "foo"));
        Assert.False(HomeScreenCompanionTask.MatchesAny(null!, "foo"));
        Assert.True(HomeScreenCompanionTask.MatchesAny(new[] { "foo", "bar" }, "foo"));
        Assert.True(HomeScreenCompanionTask.MatchesAny(new[] { "FOO", "bar" }, "foo"));
        Assert.False(HomeScreenCompanionTask.MatchesAny(new[] { "alpha", "beta" }, "gamma"));
        Assert.True(HomeScreenCompanionTask.MatchesAny(new[] { "alpha-beta" }, "pha-bet"));
        Assert.True(HomeScreenCompanionTask.MatchesAny(new[] { "abc" }, ""));
    }

    // ─── SplitCommaValues(string) ─────────────────────────────────────────────────

    [Fact]
    public void SplitCommaValues_Cases()
    {
        // Despite the name, SplitCommaValues only splits on \n and \r.
        // The "comma" entries come through as a single element.
        Assert.Equal(new[] { "a,b,c" }, HomeScreenCompanionTask.SplitCommaValues("a,b,c"));
        Assert.Equal(new[] { "a", "b", "c" }, HomeScreenCompanionTask.SplitCommaValues("a\nb\rc"));
        Assert.Equal(new[] { "a , b  ,c" }, HomeScreenCompanionTask.SplitCommaValues("  a , b  ,c"));
        Assert.Empty(HomeScreenCompanionTask.SplitCommaValues(""));
        Assert.Empty(HomeScreenCompanionTask.SplitCommaValues("   "));
        Assert.Equal(new[] { "a,", "b,", "c" }, HomeScreenCompanionTask.SplitCommaValues("a,\nb,\rc"));
    }

    // ─── MatchesImdbId(string?, string) ───────────────────────────────────────────

    [Fact]
    public void MatchesImdbId_Cases()
    {
        Assert.True(HomeScreenCompanionTask.MatchesImdbId("tt1234567", "tt1234567"));
        Assert.True(HomeScreenCompanionTask.MatchesImdbId("tt1234567", "tt9999999\ntt1234567"));
        Assert.False(HomeScreenCompanionTask.MatchesImdbId("tt1234567", "tt9999999"));
        Assert.False(HomeScreenCompanionTask.MatchesImdbId(null, "tt1234567"));
        Assert.False(HomeScreenCompanionTask.MatchesImdbId("", "tt1234567"));
        Assert.True(HomeScreenCompanionTask.MatchesImdbId("ttABCdef", "ttabcDEF"));
        Assert.True(HomeScreenCompanionTask.MatchesImdbId("tt1234567", " tt1234567 \ntt9999999"));
    }

    // ─── ApplyNumericOp(double, string, double) ──────────────────────────────────

    [Fact]
    public void ApplyNumericOp_Cases()
    {
        Assert.True(HomeScreenCompanionTask.ApplyNumericOp(5.0, ">", 3.0));
        Assert.False(HomeScreenCompanionTask.ApplyNumericOp(5.0, ">", 5.0));
        Assert.True(HomeScreenCompanionTask.ApplyNumericOp(5.0, ">=", 5.0));
        Assert.False(HomeScreenCompanionTask.ApplyNumericOp(5.0, ">=", 6.0));
        Assert.True(HomeScreenCompanionTask.ApplyNumericOp(5.0, "<", 6.0));
        Assert.False(HomeScreenCompanionTask.ApplyNumericOp(5.0, "<", 5.0));
        Assert.True(HomeScreenCompanionTask.ApplyNumericOp(5.0, "<=", 5.0));
        Assert.False(HomeScreenCompanionTask.ApplyNumericOp(5.0, "<=", 4.0));
        Assert.True(HomeScreenCompanionTask.ApplyNumericOp(5.0, "=", 5.0));
        Assert.True(HomeScreenCompanionTask.ApplyNumericOp(5.0, "=", 5.005));
        Assert.False(HomeScreenCompanionTask.ApplyNumericOp(5.0, "=", 5.02));
        Assert.False(HomeScreenCompanionTask.ApplyNumericOp(5.0, "??", 5.0));
    }

    // ─── TagConfigTargetsEpisodes(TagConfig) ─────────────────────────────────────

    [Fact]
    public void TagConfigTargetsEpisodes_Cases()
    {
        var hit = NewTagConfig();
        SetProp(hit, "MediaInfoConditions", new List<string> { "MediaType:Episode" });

        var includeSeries = NewTagConfig();
        SetProp(includeSeries, "MediaInfoConditions", new List<string> { "MediaType:EpisodeIncludeSeries" });

        var negated = NewTagConfig();
        SetProp(negated, "MediaInfoConditions", new List<string> { "!MediaType:Episode" });

        var noMatch = NewTagConfig();
        SetProp(noMatch, "MediaInfoConditions", new List<string> { "Title:Foo" });

        var empty = NewTagConfig();

        Assert.True(HomeScreenCompanionTask.TagConfigTargetsEpisodes(hit));
        Assert.True(HomeScreenCompanionTask.TagConfigTargetsEpisodes(includeSeries));
        Assert.True(HomeScreenCompanionTask.TagConfigTargetsEpisodes(negated));
        Assert.False(HomeScreenCompanionTask.TagConfigTargetsEpisodes(noMatch));
        Assert.False(HomeScreenCompanionTask.TagConfigTargetsEpisodes(empty));
    }

    // ─── TagConfigIncludesParentSeries(TagConfig) ─────────────────────────────────

    [Fact]
    public void TagConfigIncludesParentSeries_Cases()
    {
        var hit = NewTagConfig();
        SetProp(hit, "MediaInfoConditions", new List<string> { "MediaType:EpisodeIncludeSeries" });

        var episodeOnly = NewTagConfig();
        SetProp(episodeOnly, "MediaInfoConditions", new List<string> { "MediaType:Episode" });

        var negated = NewTagConfig();
        SetProp(negated, "MediaInfoConditions", new List<string> { "!MediaType:EpisodeIncludeSeries" });

        Assert.True(HomeScreenCompanionTask.TagConfigIncludesParentSeries(hit));
        Assert.False(HomeScreenCompanionTask.TagConfigIncludesParentSeries(episodeOnly));
        // `!MediaType:EpisodeIncludeSeries` after TrimStart('!') matches — the helper
        // only strips the negation, so the negated form is still considered
        // "includes parent series" semantically.
        Assert.True(HomeScreenCompanionTask.TagConfigIncludesParentSeries(negated));
    }

    // ─── TagConfigTargetsSeason(TagConfig) ────────────────────────────────────────

    [Fact]
    public void TagConfigTargetsSeason_Cases()
    {
        var seasonTrue = NewTagConfig();
        SetProp(seasonTrue, "TagTargetSeason", true);

        var cSeasonTrue = NewTagConfig();
        SetProp(cSeasonTrue, "CollectionTargetSeason", true);

        var legacySeason = NewTagConfig();
        SetProp(legacySeason, "MediaInfoSeasonMode", true);
        SetProp(legacySeason, "SourceType", "MediaInfo");
        SetProp(legacySeason, "MediaInfoTargetType", "Season");

        var none = NewTagConfig();

        Assert.True(HomeScreenCompanionTask.TagConfigTargetsSeason(seasonTrue));
        Assert.True(HomeScreenCompanionTask.TagConfigTargetsSeason(cSeasonTrue));
        Assert.True(HomeScreenCompanionTask.TagConfigTargetsSeason(legacySeason));
        Assert.False(HomeScreenCompanionTask.TagConfigTargetsSeason(none));
    }

    // ─── EffectiveLegacyTargetType(TagConfig) ─────────────────────────────────────

    [Fact]
    public void EffectiveLegacyTargetType_Cases()
    {
        var explicitEpisode = NewTagConfig();
        SetProp(explicitEpisode, "MediaInfoTargetType", "Episode");

        var legacySeason = NewTagConfig();
        SetProp(legacySeason, "MediaInfoSeasonMode", true);
        SetProp(legacySeason, "SourceType", "MediaInfo");

        var empty = NewTagConfig();

        Assert.Equal("Episode", HomeScreenCompanionTask.EffectiveLegacyTargetType(explicitEpisode));
        Assert.Equal("Season", HomeScreenCompanionTask.EffectiveLegacyTargetType(legacySeason));
        Assert.Equal("", HomeScreenCompanionTask.EffectiveLegacyTargetType(empty));
    }

    // ─── ConfigNeedsMusicItems(PluginConfiguration) ───────────────────────────────

    [Fact]
    public void ConfigNeedsMusicItems_Cases()
    {
        var noTags = NewPluginConfig();
        Assert.False(HomeScreenCompanionTask.ConfigNeedsMusicItems(noTags));

        var artistTag = NewPluginConfig();
        var t1 = NewTagConfig();
        SetProp(t1, "Active", true);
        SetProp(t1, "SourceType", "MediaInfo");
        SetProp(t1, "MediaInfoConditions", new List<string> { "Artist:Beatles" });
        artistTag.Tags.Add(t1);
        Assert.True(HomeScreenCompanionTask.ConfigNeedsMusicItems(artistTag));

        var externalTag = NewPluginConfig();
        var t2 = NewTagConfig();
        SetProp(t2, "Active", true);
        SetProp(t2, "SourceType", "External");
        SetProp(t2, "MediaInfoConditions", new List<string> { "Artist:Beatles" });
        externalTag.Tags.Add(t2);
        Assert.False(HomeScreenCompanionTask.ConfigNeedsMusicItems(externalTag));

        var inactive = NewPluginConfig();
        var t3 = NewTagConfig();
        SetProp(t3, "Active", false);
        SetProp(t3, "SourceType", "MediaInfo");
        SetProp(t3, "MediaInfoConditions", new List<string> { "Artist:Beatles" });
        inactive.Tags.Add(t3);
        Assert.False(HomeScreenCompanionTask.ConfigNeedsMusicItems(inactive));

        var mediaTypeAudio = NewPluginConfig();
        var t4 = NewTagConfig();
        SetProp(t4, "Active", true);
        SetProp(t4, "SourceType", "MediaInfo");
        SetProp(t4, "MediaInfoConditions", new List<string> { "MediaType:Audio" });
        mediaTypeAudio.Tags.Add(t4);
        Assert.True(HomeScreenCompanionTask.ConfigNeedsMusicItems(mediaTypeAudio));
    }

    // ─── BuildItemTypes(PluginConfiguration) ──────────────────────────────────────

    [Fact]
    public void BuildItemTypes_Cases()
    {
        var noMusic = NewPluginConfig();
        Assert.Equal(new[] { "Movie", "Series" }, HomeScreenCompanionTask.BuildItemTypes(noMusic));

        var music = NewPluginConfig();
        var t = NewTagConfig();
        SetProp(t, "Active", true);
        SetProp(t, "SourceType", "MediaInfo");
        SetProp(t, "MediaInfoConditions", new List<string> { "MediaType:Audio" });
        music.Tags.Add(t);
        Assert.Equal(new[] { "Movie", "Series", "Audio", "MusicVideo", "MusicAlbum", "MusicArtist" }, HomeScreenCompanionTask.BuildItemTypes(music));
    }

    // ─── ExtractTitleContains(TagConfig) ──────────────────────────────────────────

    [Fact]
    public void ExtractTitleContains_Cases()
    {
        var hit = NewTagConfig();
        SetProp(hit, "MediaInfoConditions", new List<string> { "Title:Foo Bar" });

        var negated = NewTagConfig();
        SetProp(negated, "MediaInfoConditions", new List<string> { "!Title:Foo" });

        var empty = NewTagConfig();
        SetProp(empty, "MediaInfoConditions", new List<string> { "Title:" });

        var spaced = NewTagConfig();
        SetProp(spaced, "MediaInfoConditions", new List<string> { "Title:  Spaced  " });

        var noTitle = NewTagConfig();
        SetProp(noTitle, "MediaInfoConditions", new List<string> { "Genre:Action" });

        Assert.Equal("Foo Bar", HomeScreenCompanionTask.ExtractTitleContains(hit));
        Assert.Equal("Foo", HomeScreenCompanionTask.ExtractTitleContains(negated));
        Assert.Null(HomeScreenCompanionTask.ExtractTitleContains(empty));
        Assert.Equal("Spaced", HomeScreenCompanionTask.ExtractTitleContains(spaced));
        Assert.Null(HomeScreenCompanionTask.ExtractTitleContains(noTitle));
    }

    // ─── GroupKey(TagConfig) ──────────────────────────────────────────────────────

    [Fact]
    public void GroupKey_Cases()
    {
        // US (\x1F) separator — avoid using \x escape sequences in string
        // literals because the C# compiler greedily consumes up to 4 hex digits
        // after \x, which can mask the separator.
        const char sep = '\u001F';

        var t1 = NewTagConfig();
        SetProp(t1, "Name", "foo");
        SetProp(t1, "Tag", "bar");

        var t2 = NewTagConfig();
        SetProp(t2, "Name", "  foo  ");
        SetProp(t2, "Tag", "  bar  ");

        var t3 = NewTagConfig();
        SetProp(t3, "Name", "");
        SetProp(t3, "Tag", "");

        var key1 = HomeScreenCompanionTask.GroupKey(t1);
        Assert.Equal(7, key1.Length);
        Assert.Equal('f', key1[0]);
        Assert.Equal('o', key1[1]);
        Assert.Equal('o', key1[2]);
        Assert.Equal(sep, key1[3]);
        Assert.Equal('b', key1[4]);
        Assert.Equal('a', key1[5]);
        Assert.Equal('r', key1[6]);

        var key2 = HomeScreenCompanionTask.GroupKey(t2);
        Assert.Equal(7, key2.Length);
        Assert.Equal(sep, key2[3]);

        var key3 = HomeScreenCompanionTask.GroupKey(t3);
        Assert.Single(key3);
        Assert.Equal(sep, key3[0]);
    }

    // ─── DescribeSourceCounts(GroupRunStats) ──────────────────────────────────────

    [Fact]
    public void DescribeSourceCounts_Cases()
    {
        var boxSetTagged = new HomeScreenCompanionTask.GroupRunStats { BoxSetHse = true, BoxSetTaggedCount = 2 };
        Assert.Equal("2 collections tagged", HomeScreenCompanionTask.DescribeSourceCounts(boxSetTagged));

        var boxSetMissing = new HomeScreenCompanionTask.GroupRunStats { BoxSetHse = true, BoxSetTaggedCount = 0 };
        Assert.Equal("collection not found", HomeScreenCompanionTask.DescribeSourceCounts(boxSetMissing));

        var mediaInfoViewerOnly = new HomeScreenCompanionTask.GroupRunStats { SourceType = "MediaInfo", ViewerOnly = true };
        Assert.Equal("current-user filter, resolved per user by the home section", HomeScreenCompanionTask.DescribeSourceCounts(mediaInfoViewerOnly));

        var mediaInfoScanned = new HomeScreenCompanionTask.GroupRunStats { SourceType = "MediaInfo", ListCount = 100, MatchCount = 15 };
        Assert.Equal("scanned 100 items, 15 matched", HomeScreenCompanionTask.DescribeSourceCounts(mediaInfoScanned));

        var localCollection = new HomeScreenCompanionTask.GroupRunStats { SourceType = "LocalCollection", ListCount = 5, MatchCount = 2 };
        Assert.Equal("5 in source, 2 matched", HomeScreenCompanionTask.DescribeSourceCounts(localCollection));

        var external = new HomeScreenCompanionTask.GroupRunStats { SourceType = "External", ListCount = 10, MatchCount = 3 };
        Assert.Equal("10 in list, 3 in your library", HomeScreenCompanionTask.DescribeSourceCounts(external));
    }

    // ─── BuildFinalStatus(bool, int, int) ─────────────────────────────────────────

    [Fact]
    public void BuildFinalStatus_Cases()
    {
        Assert.Equal("Dry run — completed", HomeScreenCompanionTask.BuildFinalStatus(true, 0, 0));
        Assert.Equal("Dry run — completed with 2 errors", HomeScreenCompanionTask.BuildFinalStatus(true, 2, 0));
        Assert.Equal("Dry run — completed with 1 warning", HomeScreenCompanionTask.BuildFinalStatus(true, 0, 1));
        Assert.Equal("Completed", HomeScreenCompanionTask.BuildFinalStatus(false, 0, 0));
        Assert.Equal("Completed with 1 error", HomeScreenCompanionTask.BuildFinalStatus(false, 1, 0));
        Assert.Equal("Completed with 5 errors", HomeScreenCompanionTask.BuildFinalStatus(false, 5, 0));
        Assert.Equal("Completed with 1 warning", HomeScreenCompanionTask.BuildFinalStatus(false, 0, 1));
        Assert.Equal("Completed with 3 warnings", HomeScreenCompanionTask.BuildFinalStatus(false, 0, 3));
        Assert.Equal("Completed with 1 error", HomeScreenCompanionTask.BuildFinalStatus(false, 1, 1));
    }

    // ─── StatusSymbol(int, int) ───────────────────────────────────────────────────

    [Fact]
    public void StatusSymbol_Cases()
    {
        Assert.Equal("✖", HomeScreenCompanionTask.StatusSymbol(2, 0));
        Assert.Equal("✖", HomeScreenCompanionTask.StatusSymbol(1, 5));
        Assert.Equal("⚠", HomeScreenCompanionTask.StatusSymbol(0, 1));
        Assert.Equal("✔", HomeScreenCompanionTask.StatusSymbol(0, 0));
    }

    // ─── FolderNames.Sanitize(string) ────────────────────────────────────────

    [Fact]
    public void SanitizeTopListFolderName_Cases()
    {
        Assert.Equal("Normal Name", FolderNames.Sanitize("Normal Name"));
        // NUL is invalid on every platform; the sanitizer replaces invalid chars
        // with '_'. (`:` / `*` / `?` are invalid only on Windows.)
        Assert.Equal("Has_Invalid_Chars_", FolderNames.Sanitize("Has\0Invalid\0Chars\0"));
        // Trim('.') only trims leading/trailing dots; when the string ends with
        // spaces (not dots), the dots stay in place.
        Assert.Equal("  trailing dots...  ", FolderNames.Sanitize("  trailing dots...  "));
        // When dots are at the very end they get trimmed.
        Assert.Equal("trailing dots", FolderNames.Sanitize("trailing dots..."));
        Assert.Equal("unknown", FolderNames.Sanitize(""));
        Assert.Equal("unknown", FolderNames.Sanitize("   "));
        Assert.Equal("unknown", FolderNames.Sanitize("....."));
        Assert.Equal("unknown", FolderNames.Sanitize(null));
    }

    // ─── Typed direct call smoke checks on items via FakeBaseItem ─────────────────

    [Fact]
    public void TryGetDateModified_DefaultsToNullOnFakeItem()
    {
        var item = new FakeBaseItem();
        Assert.Null(HomeScreenCompanionTask.TryGetDateModified(item));
    }

    [Fact]
    public void TryGetFileSize_DefaultsToNullOnFakeItem()
    {
        var item = new FakeBaseItem();
        Assert.Null(HomeScreenCompanionTask.TryGetFileSize(item));
    }
}
