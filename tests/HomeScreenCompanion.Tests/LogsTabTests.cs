using System.Linq;
using System.Reflection;
using Xunit;

namespace HomeScreenCompanion.Tests;

/// <summary>
/// Wave 2 / U13: shape tests for the Logs &amp; Status tab.
/// </summary>
public sealed class LogsTabTests
{
    private static System.Type GetType(string fullName)
    {
        var t = typeof(Plugin).Assembly.GetType(fullName);
        Assert.NotNull(t);
        return t!;
    }

    [Fact]
    public void LogsTabUI_Exposes_Status_And_Log_Fields()
    {
        var t = GetType("HomeScreenCompanion.UI.Tabs.LogsTabUI");
        var names = t.GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .Select(p => p.Name)
            .ToHashSet();

        Assert.Contains("LastRunStatus", names);
        Assert.Contains("CurrentRunStatus", names);
        Assert.Contains("RefreshButton", names);
        Assert.Contains("RunButton", names);
        Assert.Contains("RunLog", names);
    }

    [Fact]
    public void LogsTabUI_RunLog_Is_Readonly()
    {
        var t = GetType("HomeScreenCompanion.UI.Tabs.LogsTabUI");
        var prop = t.GetProperty("RunLog", BindingFlags.Public | BindingFlags.Instance)!;
        var attrs = prop.GetCustomAttributesData()
            .Select(a => a.AttributeType?.FullName)
            .Where(s => s != null)
            .Select(s => s!)
            .ToHashSet();
        Assert.Contains("System.ComponentModel.ReadOnlyAttribute", attrs);
    }

    [Fact]
    public void LogsTabView_Extends_PluginPageView()
    {
        Assert.Equal("HomeScreenCompanion.UIBaseClasses.Views.PluginPageView",
            GetType("HomeScreenCompanion.UI.Tabs.LogsTabView").BaseType?.FullName);
    }
}
