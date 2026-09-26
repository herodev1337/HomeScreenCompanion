using System.Linq;
using System.Reflection;
using Xunit;

namespace HomeScreenCompanion.Tests;

/// <summary>
/// Wave 2 / U12: shape tests for the Home Screen tab.
/// </summary>
public sealed class HomeScreenTabTests
{
    private static System.Type GetType(string fullName)
    {
        var t = typeof(Plugin).Assembly.GetType(fullName);
        Assert.NotNull(t);
        return t!;
    }

    [Fact]
    public void HomeScreenTabUI_Has_Two_Section_Picker()
    {
        var t = GetType("HomeScreenCompanion.UI.Tabs.HomeScreenTabUI");
        var viewProp = t.GetProperty("View", BindingFlags.Public | BindingFlags.Instance)!;
        Assert.NotNull(viewProp);
        Assert.True(viewProp!.PropertyType.IsEnum);
    }

    [Fact]
    public void HomeScreenTabUI_Exposes_Both_Manage_And_Sync_Groups()
    {
        var t = GetType("HomeScreenCompanion.UI.Tabs.HomeScreenTabUI");
        var names = t.GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .Select(p => p.Name)
            .ToHashSet();

        // Manage sub-view
        Assert.Contains("SourceUserId", names);
        Assert.Contains("RefreshSectionsButton", names);
        Assert.Contains("Sections", names);
        Assert.Contains("ManageStatus", names);

        // Sync sub-view
        Assert.Contains("SyncSourceUserId", names);
        Assert.Contains("TargetUserIds", names);
        Assert.Contains("SyncLibraryOrder", names);
        Assert.Contains("SyncNowButton", names);
        Assert.Contains("SyncStatus", names);
    }
}
