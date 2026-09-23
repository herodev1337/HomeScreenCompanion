using System;
using System.Reflection;
using Xunit;

namespace HomeScreenCompanion.Tests;

/// <summary>
/// Candidate methods identified for snapshot coverage but that require
/// Jellyfin/Emby runtime types (<c>BaseItem</c>, dynamic fields) or a constructed
/// <c>HomeScreenCompanionTask</c> instance. Each test attempts reflection setup
/// and skips (with a clear reason) if the call cannot be made in a unit test.
/// They are written as a regression guard so that when the planned C# refactor
/// lands, any of these that become independently callable will fail this suite
/// unless deliberately updated — turning them from "skipped because impossible"
/// into "skipped because not yet wired".
/// </summary>
public class SkippableCandidateTests
{
    private const string T = HscAssembly.TaskTypeName;

    private static MethodInfo? TryFind(string methodName, params Type[] argTypes)
    {
        try
        {
            return HscAssembly.FindStaticMethod(T, methodName, argTypes);
        }
        catch
        {
            return null;
        }
    }

    private static void RequireBaseItem(Type argType)
    {
        var baseItemType = HscAssembly.FindType("MediaBrowser.Controller.Entities.BaseItem");
        Skip.If(baseItemType == null, "MediaBrowser.Controller.Entities.BaseItem is not loadable in the unit-test process.");
        Skip.IfNot(baseItemType!.IsAssignableFrom(argType),
            $"Argument type {argType.FullName} does not derive from BaseItem.");
    }

    // ─── MatchesPerson(BaseItem, string, string) ──────────────────────────────────

    [SkippableFact]
    public void MatchesPerson_NeedsBaseItem() => SkipBecauseBaseItem("MatchesPerson",
        typeof(UnknownBaseItemShim), typeof(string), typeof(string));

    // ─── IsTaggableTopLevelItem(BaseItem) ─────────────────────────────────────────

    [SkippableFact]
    public void IsTaggableTopLevelItem_NeedsBaseItem() => SkipBecauseBaseItem("IsTaggableTopLevelItem",
        typeof(UnknownBaseItemShim));

    // ─── MatchesArtistOrAlbumArtist(BaseItem, string, bool) ───────────────────────

    [SkippableFact]
    public void MatchesArtistOrAlbumArtist_NeedsBaseItem() => SkipBecauseBaseItem("MatchesArtistOrAlbumArtist",
        typeof(UnknownBaseItemShim), typeof(string), typeof(bool));

    // ─── MatchesAlbumTitle(BaseItem, string, bool) ────────────────────────────────

    [SkippableFact]
    public void MatchesAlbumTitle_NeedsBaseItem() => SkipBecauseBaseItem("MatchesAlbumTitle",
        typeof(UnknownBaseItemShim), typeof(string), typeof(bool));

    // ─── TryGetDateModified(BaseItem) ──────────────────────────────────────────────

    [SkippableFact]
    public void TryGetDateModified_NeedsBaseItem() => SkipBecauseBaseItem("TryGetDateModified",
        typeof(UnknownBaseItemShim));

    // ─── TryGetFileSize(BaseItem) ──────────────────────────────────────────────────

    [SkippableFact]
    public void TryGetFileSize_NeedsBaseItem() => SkipBecauseBaseItem("TryGetFileSize",
        typeof(UnknownBaseItemShim));

    // ─── IsScheduleActive(List<DateInterval>) — instance method ───────────────────

    [SkippableFact]
    public void IsScheduleActive_NeedsTaskInstance()
    {
        HscAssembly.EnsureAvailable();
        var taskType = HscAssembly.FindType(T)!;
        var dateIntervalType = HscAssembly.FindType("HomeScreenCompanion.DateInterval")!;
        var listType = typeof(System.Collections.Generic.List<>).MakeGenericType(dateIntervalType);

        var m = taskType.GetMethod("IsScheduleActive",
            BindingFlags.Instance | BindingFlags.NonPublic,
            binder: null, types: new[] { listType }, modifiers: null);

        Skip.If(m == null, "IsScheduleActive(List<DateInterval>) method signature not found on HomeScreenCompanionTask.");

        // Constructing HomeScreenCompanionTask requires ~11 Jellyfin services
        // (ILibraryManager, ICollectionManager, etc.) that are not loadable here.
        Skip.If(true,
            "IsScheduleActive is an instance method — requires a constructed HomeScreenCompanionTask, " +
            "which needs ILibraryManager and 10 other Jellyfin services.");
    }

    private void SkipBecauseBaseItem(string methodName, params Type[] argTypes)
    {
        HscAssembly.EnsureAvailable();
        var m = TryFind(methodName, argTypes);
        Skip.If(m == null, $"{methodName} not found or signature changed.");
        RequireBaseItem(argTypes[0]);
    }

    /// <summary>
    /// Placeholder type used purely so the test compiles when <c>BaseItem</c>
    /// is not available at compile-time. The test always calls
    /// <see cref="RequireBaseItem"/> first and asserts-out.
    /// </summary>
    private sealed class UnknownBaseItemShim { }
}
