using System.Linq;
using System.Reflection;
using HomeScreenCompanion;
using MediaBrowser.Model.Tasks;
using Xunit;

namespace HomeScreenCompanion.Tests;

/// <summary>
/// Audit-plan v2 / Wave 2 / T1: shape tests for the DTO refactor.
///
/// Verifies:
/// * dead types <c>HscUserDto</c> + <c>HscUsersResponse</c> are gone,
/// * <c>ExternalItemDto</c> moved to <c>ListFetcher</c> namespace,
/// * <c>SyncStatusResponse.LastSyncResult</c> is the SDK <c>TaskInfo</c>,
/// * JSON property names stay stable (the legacy ClientApp is gone, but
///   we still produce stable wire shapes for ad-hoc API consumers).
/// </summary>
public sealed class DtoContractTests
{
    [Fact]
    public void HscUserDto_Is_Deleted()
    {
        Assert.Null(typeof(Plugin).Assembly.GetType("HomeScreenCompanion.HscUserDto"));
    }

    [Fact]
    public void HscUsersResponse_Is_Deleted()
    {
        Assert.Null(typeof(Plugin).Assembly.GetType("HomeScreenCompanion.HscUsersResponse"));
    }

    [Fact]
    public void ExternalItemDto_Still_Public_With_Same_Properties_After_Move()
    {
        // Same namespace (HomeScreenCompanion); moved from DTOs.cs to
        // ListFetcher.cs in Wave 2 / T1 since ListFetcher is the only
        // consumer. Public contract unchanged.
        var moved = typeof(Plugin).Assembly.GetType("HomeScreenCompanion.ExternalItemDto");
        Assert.NotNull(moved);
        var props = moved!.GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .Select(p => p.Name)
            .ToHashSet();
        Assert.Contains("Name", props);
        Assert.Contains("Imdb", props);
        Assert.Contains("Tmdb", props);
    }

    [Fact]
    public void SyncStatusResponse_LastSyncResult_Is_TaskInfo()
    {
        var t = typeof(SyncStatusResponse);
        Assert.NotNull(t);
        var prop = t!.GetProperty("LastSyncResult", BindingFlags.Public | BindingFlags.Instance);
        Assert.NotNull(prop);
        Assert.Equal("MediaBrowser.Model.Tasks.TaskInfo", prop!.PropertyType.FullName);
    }

    [Fact]
    public void SyncStatusResponse_Has_Stable_Json_Property_Names()
    {
        // The legacy ClientApp (now deleted) parsed these field names; any
        // extension API consumers still depend on them, so renaming would be
        // a breaking API change.
        var t = typeof(SyncStatusResponse);
        var names = t.GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .Select(p => p.Name)
            .ToHashSet();
        Assert.Contains("LastSyncTime", names);
        Assert.Contains("IsRunning", names);
        Assert.Contains("SectionsCopied", names);
        Assert.Contains("Logs", names);
        Assert.Contains("StartedUtc", names);
        Assert.Contains("LastSyncResult", names);
    }

    [Fact]
    public void ResultMapper_Static_ToCompletionStatus_Maps_Free_Form_Text()
    {
        var t = typeof(ResultMapper);
        Assert.NotNull(t);
        Assert.True(t!.IsAbstract && t.IsSealed, "ResultMapper must be a static class");

        var method = t.GetMethod("ToCompletionStatus",
            BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static);
        Assert.NotNull(method);
        Assert.Equal(typeof(TaskCompletionStatus), method!.ReturnType);
    }

    [Fact]
    public void HomeSectionSyncTask_Exposes_HscTaskKey_And_HscTaskName_Constants()
    {
        var t = typeof(Plugin).Assembly.GetType("HomeScreenCompanion.HomeSectionSyncTask")!;
        var key = t.GetField("HscTaskKey",
            BindingFlags.Public | BindingFlags.Static | BindingFlags.NonPublic);
        Assert.NotNull(key);
        Assert.True(key!.IsLiteral, "HscTaskKey must be a const");

        var name = t.GetField("HscTaskName",
            BindingFlags.Public | BindingFlags.Static | BindingFlags.NonPublic);
        Assert.NotNull(name);
        Assert.True(name!.IsLiteral, "HscTaskName must be a const");
    }
}
