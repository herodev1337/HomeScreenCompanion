using System;
using System.Linq;
using System.Reflection;
using System.Threading.Tasks;
using HomeScreenCompanion.UI;
using MediaBrowser.Model.Logging;
using MediaBrowser.Model.Plugins;
using Xunit;

namespace HomeScreenCompanion.Tests;

/// <summary>
/// Audit-plan v2 / Wave 1 / U7: shape tests for the Logs page +
/// ReleaseNotesDialog + the MainPageUI updates group. Uses the typed surface.
/// </summary>
public sealed class LogsUITests
{
    [Fact]
    public void LogsPageUI_Extends_EditableOptionsBase()
    {
        Assert.Equal("Emby.Web.GenericEdit.EditableOptionsBase", typeof(LogsPageUI).BaseType?.FullName);
    }

    [Fact]
    public void LogsPageUI_Has_RunLog_SyncProgress_RefreshButton()
    {
        Assert.Contains(typeof(LogsPageUI).GetProperties(BindingFlags.Public | BindingFlags.Instance),
            p => p.Name == "RunLog" && p.PropertyType == typeof(string));
        Assert.Contains(typeof(LogsPageUI).GetProperties(BindingFlags.Public | BindingFlags.Instance),
            p => p.Name == "SyncProgress" && p.PropertyType == typeof(double));
        Assert.Contains(typeof(LogsPageUI).GetProperties(BindingFlags.Public | BindingFlags.Instance),
            p => p.Name == "RefreshButton");

        var instance = new LogsPageUI();
        var button = typeof(LogsPageUI).GetProperty("RefreshButton", BindingFlags.Public | BindingFlags.Instance)!
            .GetValue(instance)!;
        var data1 = (string)button.GetType()
            .GetProperty("Data1", BindingFlags.Public | BindingFlags.Instance)!
            .GetValue(button)!;
        Assert.Equal("Refresh", data1);
    }

    [Fact]
    public void LogsPageController_Extends_ControllerBase_And_Owns_PageInfo()
    {
        Assert.Equal("HomeScreenCompanion.UIBaseClasses.ControllerBase", typeof(LogsPageController).BaseType?.FullName);
        var pageInfo = typeof(LogsPageController).GetProperty("PageInfo", BindingFlags.Public | BindingFlags.Instance)!;
        Assert.Equal(typeof(LogsPageController), pageInfo.DeclaringType);
    }

    [Fact]
    public async Task LogsPageView_RunCommand_Refresh_Returns_Self()
    {
        var instance = CreateView();

        var runCommand = typeof(LogsPageView).GetMethod("RunCommand")!;
        var task = (Task)runCommand.Invoke(instance, new object?[] { "row1", "Refresh", null })!;
        await task;

        var result = task.GetType().GetProperty("Result")!.GetValue(task);
        Assert.Same(instance, result);
    }

    [Fact]
    public void LogsPageView_Ctor_Snapshots_ExecutionLog_Into_RunLog()
    {
        var instance = CreateView();

        var pageProp = typeof(LogsPageView).BaseType!.BaseType!
            .GetProperty("ContentData", BindingFlags.Public | BindingFlags.Instance)!;
        var page = pageProp.GetValue(instance)!;
        var runLogProp = typeof(LogsPageUI).GetProperty("RunLog", BindingFlags.Public | BindingFlags.Instance)!;
        var runLog = (string)runLogProp.GetValue(page)!;
        Assert.NotNull(runLog);
    }

    [Fact]
    public void MainPageUI_Has_Updates_Group_And_OpenReleaseNotes_Button()
    {
        Assert.Contains(typeof(MainPageUI).GetProperties(BindingFlags.Public | BindingFlags.Instance),
            p => p.Name == "UpdatesCaption");
        Assert.Contains(typeof(MainPageUI).GetProperties(BindingFlags.Public | BindingFlags.Instance),
            p => p.Name == "OpenReleaseNotesButton");

        var instance = new MainPageUI();
        var button = typeof(MainPageUI).GetProperty("OpenReleaseNotesButton", BindingFlags.Public | BindingFlags.Instance)!
            .GetValue(instance)!;
        var data1 = (string)button.GetType()
            .GetProperty("Data1", BindingFlags.Public | BindingFlags.Instance)!
            .GetValue(button)!;
        Assert.Equal("OpenReleaseNotes", data1);
    }

    [Fact]
    public void ReleaseNotesDialog_Extends_PluginDialogView()
    {
        Assert.Equal("HomeScreenCompanion.UIBaseClasses.Views.PluginDialogView", typeof(ReleaseNotesDialog).BaseType?.FullName);
    }

    private static object CreateView()
    {
        var ctor = typeof(LogsPageView).GetConstructors(BindingFlags.Public | BindingFlags.Instance).First();
        var pluginInfo = new PluginInfo();
        return ctor.Invoke(new object[] { pluginInfo, new NullLogger() });
    }
}
