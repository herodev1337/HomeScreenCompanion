using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using Xunit;

namespace HomeScreenCompanion.Tests;

/// <summary>
/// Snapshot tests for private static pure functions in
/// <c>HomeScreenCompanionTask.cs</c>. Each test invokes the method via reflection
/// against the built DLL (see <see cref="HscAssembly"/>) and snapshots the JSON
/// output. Snapshots live in <c>Snapshots/&lt;TestName&gt;.snap.json</c>.
/// </summary>
public class PureFunctionTests
{
    private const string T = HscAssembly.TaskTypeName;

    // ─── Construction helpers ────────────────────────────────────────────────────

    private static object NewTagConfig() =>
        Activator.CreateInstance(HscAssembly.FindType("HomeScreenCompanion.TagConfig")!)!;

    private static object NewPluginConfig() =>
        Activator.CreateInstance(HscAssembly.FindType("HomeScreenCompanion.PluginConfiguration")!)!;

    private static object NewDateInterval() =>
        Activator.CreateInstance(HscAssembly.FindType("HomeScreenCompanion.DateInterval")!)!;

    /// <summary>
    /// Constructs a typed <c>List&lt;TagConfig&gt;</c> using the loaded assembly's
    /// <c>TagConfig</c> type so reflection's type checks accept it.
    /// </summary>
    private static object NewTagConfigList()
    {
        var listType = typeof(System.Collections.Generic.List<>).MakeGenericType(
            HscAssembly.FindType("HomeScreenCompanion.TagConfig")!);
        return Activator.CreateInstance(listType)!;
    }

    private static void SetProp(object o, string name, object? value)
    {
        var p = o.GetType().GetProperty(name, BindingFlags.Public | BindingFlags.Instance)
            ?? throw new MissingMemberException(o.GetType().FullName, name);
        p.SetValue(o, value);
    }

    private static object? GetProp(object o, string name)
    {
        var p = o.GetType().GetProperty(name, BindingFlags.Public | BindingFlags.Instance)!;
        return p.GetValue(o);
    }

    private static void SetField(object o, string name, object? value)
    {
        var f = o.GetType().GetField(name, BindingFlags.Public | BindingFlags.Instance)
            ?? throw new MissingFieldException(o.GetType().FullName, name);
        f.SetValue(o, value);
    }

    private static MethodInfo S(string name, params Type[] args) =>
        HscAssembly.FindStaticMethod(T, name, args)
            ?? throw new MissingMethodException(T, name);

    private static MethodInfo S(string typeFullName, string methodName, params Type[] args) =>
        HscAssembly.FindStaticMethod(typeFullName, methodName, args)
            ?? throw new MissingMethodException(typeFullName, methodName);

    private static object? Invoke(MethodInfo m, params object?[] args) => m.Invoke(null, args);

    // ─── MatchesAny(string[], string) ─────────────────────────────────────────────

    [Fact]
    public void MatchesAny_Cases()
    {
        HscAssembly.EnsureAvailable();
        var m = S("MatchesAny", typeof(string[]), typeof(string));

        Snap.Match(new
        {
            empty_array = Invoke(m, Array.Empty<string>(), "foo"),
            null_array = Invoke(m, (string[]?)null, "foo"),
            exact_match = Invoke(m, new[] { "foo", "bar" }, "foo"),
            case_insensitive = Invoke(m, new[] { "FOO", "bar" }, "foo"),
            no_match = Invoke(m, new[] { "alpha", "beta" }, "gamma"),
            substring_match = Invoke(m, new[] { "alpha-beta" }, "pha-bet"),
            empty_search = Invoke(m, new[] { "abc" }, ""),
        });
    }

    // ─── SplitCommaValues(string) ─────────────────────────────────────────────────

    [Fact]
    public void SplitCommaValues_Cases()
    {
        HscAssembly.EnsureAvailable();
        var m = S("SplitCommaValues", typeof(string));

        Snap.Match(new
        {
            basic = Invoke(m, "a,b,c"),
            newlines = Invoke(m, "a\nb\rc"),
            trimmed = Invoke(m, "  a , b  ,c"),
            empty = Invoke(m, ""),
            whitespace_only = Invoke(m, "   "),
            mixed = Invoke(m, "a,\nb,\rc"),
        });
    }

    // ─── MatchesImdbId(string?, string) ───────────────────────────────────────────

    [Fact]
    public void MatchesImdbId_Cases()
    {
        HscAssembly.EnsureAvailable();
        var m = S("MatchesImdbId", typeof(string), typeof(string));

        Snap.Match(new
        {
            exact = Invoke(m, "tt1234567", "tt1234567"),
            list_match = Invoke(m, "tt1234567", "tt9999999\ntt1234567"),
            no_match = Invoke(m, "tt1234567", "tt9999999"),
            null_item = Invoke(m, (string?)null, "tt1234567"),
            empty_item = Invoke(m, "", "tt1234567"),
            case_insensitive = Invoke(m, "ttABCdef", "ttabcDEF"),
            whitespace_in_list = Invoke(m, "tt1234567", " tt1234567 \ntt9999999"),
        });
    }

    // ─── ApplyNumericOp(double, string, double) ──────────────────────────────────

    [Fact]
    public void ApplyNumericOp_Cases()
    {
        HscAssembly.EnsureAvailable();
        var m = S("ApplyNumericOp", typeof(double), typeof(string), typeof(double));

        Snap.Match(new
        {
            gt_true = Invoke(m, 5.0, ">", 3.0),
            gt_false = Invoke(m, 5.0, ">", 5.0),
            gte_true = Invoke(m, 5.0, ">=", 5.0),
            gte_false = Invoke(m, 5.0, ">=", 6.0),
            lt_true = Invoke(m, 5.0, "<", 6.0),
            lt_false = Invoke(m, 5.0, "<", 5.0),
            lte_true = Invoke(m, 5.0, "<=", 5.0),
            lte_false = Invoke(m, 5.0, "<=", 4.0),
            eq_true = Invoke(m, 5.0, "=", 5.0),
            eq_within_tolerance = Invoke(m, 5.0, "=", 5.005),
            eq_outside_tolerance = Invoke(m, 5.0, "=", 5.02),
            unknown_op = Invoke(m, 5.0, "??", 5.0),
        });
    }

    // ─── TagConfigTargetsEpisodes(TagConfig) ─────────────────────────────────────

    [Fact]
    public void TagConfigTargetsEpisodes_Cases()
    {
        HscAssembly.EnsureAvailable();
        var m = S("TagConfigTargetsEpisodes", HscAssembly.FindType("HomeScreenCompanion.TagConfig")!);

        var hit = NewTagConfig();
        SetProp(hit, "MediaInfoConditions", new List<string> { "MediaType:Episode" });

        var includeSeries = NewTagConfig();
        SetProp(includeSeries, "MediaInfoConditions", new List<string> { "MediaType:EpisodeIncludeSeries" });

        var negated = NewTagConfig();
        SetProp(negated, "MediaInfoConditions", new List<string> { "!MediaType:Episode" });

        var noMatch = NewTagConfig();
        SetProp(noMatch, "MediaInfoConditions", new List<string> { "Title:Foo" });

        var empty = NewTagConfig();

        Snap.Match(new
        {
            direct_hit = Invoke(m, hit),
            episodeIncludeSeries_startswith = Invoke(m, includeSeries),
            negated = Invoke(m, negated),
            wrong_prefix = Invoke(m, noMatch),
            empty_criteria = Invoke(m, empty),
        });
    }

    // ─── TagConfigIncludesParentSeries(TagConfig) ─────────────────────────────────

    [Fact]
    public void TagConfigIncludesParentSeries_Cases()
    {
        HscAssembly.EnsureAvailable();
        var m = S("TagConfigIncludesParentSeries", HscAssembly.FindType("HomeScreenCompanion.TagConfig")!);

        var hit = NewTagConfig();
        SetProp(hit, "MediaInfoConditions", new List<string> { "MediaType:EpisodeIncludeSeries" });

        var episodeOnly = NewTagConfig();
        SetProp(episodeOnly, "MediaInfoConditions", new List<string> { "MediaType:Episode" });

        var negated = NewTagConfig();
        SetProp(negated, "MediaInfoConditions", new List<string> { "!MediaType:EpisodeIncludeSeries" });

        Snap.Match(new
        {
            hit = Invoke(m, hit),
            episode_only = Invoke(m, episodeOnly),
            negated = Invoke(m, negated),
        });
    }

    // ─── TagConfigTargetsSeason(TagConfig) ────────────────────────────────────────

    [Fact]
    public void TagConfigTargetsSeason_Cases()
    {
        HscAssembly.EnsureAvailable();
        var m = S("TagConfigTargetsSeason", HscAssembly.FindType("HomeScreenCompanion.TagConfig")!);

        var seasonTrue = NewTagConfig();
        SetProp(seasonTrue, "TagTargetSeason", true);

        var cSeasonTrue = NewTagConfig();
        SetProp(cSeasonTrue, "CollectionTargetSeason", true);

        var legacySeason = NewTagConfig();
        SetProp(legacySeason, "MediaInfoSeasonMode", true);
        SetProp(legacySeason, "SourceType", "MediaInfo");
        SetProp(legacySeason, "MediaInfoTargetType", "Season");

        var none = NewTagConfig();

        Snap.Match(new
        {
            tag_target_season = Invoke(m, seasonTrue),
            collection_target_season = Invoke(m, cSeasonTrue),
            legacy_season = Invoke(m, legacySeason),
            none = Invoke(m, none),
        });
    }

    // ─── EffectiveLegacyTargetType(TagConfig) ─────────────────────────────────────

    [Fact]
    public void EffectiveLegacyTargetType_Cases()
    {
        HscAssembly.EnsureAvailable();
        var m = S("EffectiveLegacyTargetType", HscAssembly.FindType("HomeScreenCompanion.TagConfig")!);

        var explicitEpisode = NewTagConfig();
        SetProp(explicitEpisode, "MediaInfoTargetType", "Episode");

        var legacySeason = NewTagConfig();
        SetProp(legacySeason, "MediaInfoSeasonMode", true);
        SetProp(legacySeason, "SourceType", "MediaInfo");

        var empty = NewTagConfig();

        Snap.Match(new
        {
            @explicit = Invoke(m, explicitEpisode),
            legacy_season_mode = Invoke(m, legacySeason),
            empty = Invoke(m, empty),
        });
    }

    // ─── ConfigNeedsMusicItems(PluginConfiguration) ───────────────────────────────

    [Fact]
    public void ConfigNeedsMusicItems_Cases()
    {
        HscAssembly.EnsureAvailable();
        var m = S("ConfigNeedsMusicItems", HscAssembly.FindType("HomeScreenCompanion.PluginConfiguration")!);

        var noTags = NewPluginConfig();

        var artistTag = NewPluginConfig();
        var t1 = NewTagConfig();
        SetProp(t1, "Active", true);
        SetProp(t1, "SourceType", "MediaInfo");
        SetProp(t1, "MediaInfoConditions", new List<string> { "Artist:Beatles" });
        var artistList = NewTagConfigList();
        ((System.Collections.IList)artistList).Add(t1);
        SetProp(artistTag, "Tags", artistList);

        var externalTag = NewPluginConfig();
        var t2 = NewTagConfig();
        SetProp(t2, "Active", true);
        SetProp(t2, "SourceType", "External");
        SetProp(t2, "MediaInfoConditions", new List<string> { "Artist:Beatles" });
        var externalList = NewTagConfigList();
        ((System.Collections.IList)externalList).Add(t2);
        SetProp(externalTag, "Tags", externalList);

        var inactive = NewPluginConfig();
        var t3 = NewTagConfig();
        SetProp(t3, "Active", false);
        SetProp(t3, "SourceType", "MediaInfo");
        SetProp(t3, "MediaInfoConditions", new List<string> { "Artist:Beatles" });
        var inactiveList = NewTagConfigList();
        ((System.Collections.IList)inactiveList).Add(t3);
        SetProp(inactive, "Tags", inactiveList);

        var mediaTypeAudio = NewPluginConfig();
        var t4 = NewTagConfig();
        SetProp(t4, "Active", true);
        SetProp(t4, "SourceType", "MediaInfo");
        SetProp(t4, "MediaInfoConditions", new List<string> { "MediaType:Audio" });
        var mtList = NewTagConfigList();
        ((System.Collections.IList)mtList).Add(t4);
        SetProp(mediaTypeAudio, "Tags", mtList);

        Snap.Match(new
        {
            no_tags = Invoke(m, noTags),
            artist_tag = Invoke(m, artistTag),
            external_source_artist = Invoke(m, externalTag),
            inactive_tag = Invoke(m, inactive),
            media_type_audio = Invoke(m, mediaTypeAudio),
        });
    }

    // ─── BuildItemTypes(PluginConfiguration) ──────────────────────────────────────

    [Fact]
    public void BuildItemTypes_Cases()
    {
        HscAssembly.EnsureAvailable();
        var m = S("BuildItemTypes", HscAssembly.FindType("HomeScreenCompanion.PluginConfiguration")!);

        var noMusic = NewPluginConfig();

        var music = NewPluginConfig();
        var t = NewTagConfig();
        SetProp(t, "Active", true);
        SetProp(t, "SourceType", "MediaInfo");
        SetProp(t, "MediaInfoConditions", new List<string> { "MediaType:Audio" });
        var musicList = NewTagConfigList();
        ((System.Collections.IList)musicList).Add(t);
        SetProp(music, "Tags", musicList);

        Snap.Match(new
        {
            no_music = Invoke(m, noMusic),
            music_tag = Invoke(m, music),
        });
    }

    // ─── ExtractTitleContains(TagConfig) ──────────────────────────────────────────

    [Fact]
    public void ExtractTitleContains_Cases()
    {
        HscAssembly.EnsureAvailable();
        var m = S("ExtractTitleContains", HscAssembly.FindType("HomeScreenCompanion.TagConfig")!);

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

        Snap.Match(new
        {
            hit = Invoke(m, hit),
            negated = Invoke(m, negated),
            empty = Invoke(m, empty),
            spaced = Invoke(m, spaced),
            no_title = Invoke(m, noTitle),
        });
    }

    // ─── GroupKey(TagConfig) ──────────────────────────────────────────────────────

    [Fact]
    public void GroupKey_Cases()
    {
        HscAssembly.EnsureAvailable();
        var m = S("GroupKey", HscAssembly.FindType("HomeScreenCompanion.TagConfig")!);

        var t1 = NewTagConfig();
        SetProp(t1, "Name", "foo");
        SetProp(t1, "Tag", "bar");

        var t2 = NewTagConfig();
        SetProp(t2, "Name", "  foo  ");
        SetProp(t2, "Tag", "  bar  ");

        var t3 = NewTagConfig();
        SetProp(t3, "Name", "");
        SetProp(t3, "Tag", "");

        Snap.Match(new
        {
            basic = Invoke(m, t1),
            trimmed = Invoke(m, t2),
            empty = Invoke(m, t3),
        });
    }

    // ─── DescribeSourceCounts(GroupRunStats) ──────────────────────────────────────

    [Fact]
    public void DescribeSourceCounts_Cases()
    {
        HscAssembly.EnsureAvailable();
        var taskType = HscAssembly.FindType(T)!;
        var statsType = taskType.GetNestedType("GroupRunStats", BindingFlags.NonPublic)!;
        var m = taskType.GetMethod("DescribeSourceCounts",
            BindingFlags.Static | BindingFlags.NonPublic,
            binder: null, types: new[] { statsType }, modifiers: null)!;

        object NewStats()
        {
            var s = Activator.CreateInstance(statsType)!;
            // Defaults are fine; set fields per-case below.
            return s;
        }

        var boxSetTagged = NewStats();
        SetField(boxSetTagged, "BoxSetHse", true);
        SetField(boxSetTagged, "BoxSetTaggedCount", 2);

        var boxSetMissing = NewStats();
        SetField(boxSetMissing, "BoxSetHse", true);
        SetField(boxSetMissing, "BoxSetTaggedCount", 0);

        var mediaInfoViewerOnly = NewStats();
        SetField(mediaInfoViewerOnly, "SourceType", "MediaInfo");
        SetField(mediaInfoViewerOnly, "ViewerOnly", true);

        var mediaInfoScanned = NewStats();
        SetField(mediaInfoScanned, "SourceType", "MediaInfo");
        SetField(mediaInfoScanned, "ViewerOnly", false);
        SetField(mediaInfoScanned, "ListCount", 100);
        SetField(mediaInfoScanned, "MatchCount", 15);

        var localCollection = NewStats();
        SetField(localCollection, "SourceType", "LocalCollection");
        SetField(localCollection, "ListCount", 5);
        SetField(localCollection, "MatchCount", 2);

        var external = NewStats();
        SetField(external, "SourceType", "External");
        SetField(external, "ListCount", 10);
        SetField(external, "MatchCount", 3);

        Snap.Match(new
        {
            boxset_tagged = Invoke(m, boxSetTagged),
            boxset_missing = Invoke(m, boxSetMissing),
            mediaInfo_viewer_only = Invoke(m, mediaInfoViewerOnly),
            mediaInfo_scanned = Invoke(m, mediaInfoScanned),
            local_collection = Invoke(m, localCollection),
            external = Invoke(m, external),
        });
    }

    // ─── BuildFinalStatus(bool, int, int) ─────────────────────────────────────────

    [Fact]
    public void BuildFinalStatus_Cases()
    {
        HscAssembly.EnsureAvailable();
        var m = S("BuildFinalStatus", typeof(bool), typeof(int), typeof(int));

        Snap.Match(new
        {
            dry_run_clean = Invoke(m, true, 0, 0),
            dry_run_failed = Invoke(m, true, 2, 0),
            dry_run_warned = Invoke(m, true, 0, 1),
            live_clean = Invoke(m, false, 0, 0),
            live_failed_one = Invoke(m, false, 1, 0),
            live_failed_many = Invoke(m, false, 5, 0),
            live_warned_one = Invoke(m, false, 0, 1),
            live_warned_many = Invoke(m, false, 0, 3),
            live_failed_and_warned = Invoke(m, false, 1, 1),
        });
    }

    // ─── StatusSymbol(int, int) ───────────────────────────────────────────────────

    [Fact]
    public void StatusSymbol_Cases()
    {
        HscAssembly.EnsureAvailable();
        var m = S("StatusSymbol", typeof(int), typeof(int));

        Snap.Match(new
        {
            failed = Invoke(m, 2, 0),
            failed_overrides_warned = Invoke(m, 1, 5),
            warned = Invoke(m, 0, 1),
            clean = Invoke(m, 0, 0),
        });
    }

    // ─── FolderNames.Sanitize(string) ────────────────────────────────────────

    [Fact]
    public void SanitizeTopListFolderName_Cases()
    {
        HscAssembly.EnsureAvailable();
        var m = S("HomeScreenCompanion.FolderNames", "Sanitize", typeof(string));

        Snap.Match(new
        {
            plain = Invoke(m, "Normal Name"),
            invalid_chars = Invoke(m, "Has:Invalid*Chars?"),
            trailing_dots = Invoke(m, "  trailing dots...  "),
            empty = Invoke(m, ""),
            whitespace_only = Invoke(m, "   "),
            all_dots = Invoke(m, "....."),
            null_input = Invoke(m, (string?)null),
        });
    }
}
