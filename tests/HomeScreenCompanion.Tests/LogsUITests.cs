using System;
using System.Linq;
using System.Reflection;
using System.Threading.Tasks;
using Emby.Web.GenericEdit;
using Emby.Web.GenericEdit.Elements;
using MediaBrowser.Model.Logging;
using Xunit;

namespace HomeScreenCompanion.Tests;

/// <summary>
/// Audit-plan v2 / Wave 1 / U7: shape tests for the Logs page +
/// ReleaseNotesDialog + the MainPageUI updates group.
/// Reflection-only.
/// </summary>
public sealed class LogsUITests
{
    private static Type? PageType => HscAssembly.FindType("HomeScreenCompanion.UI.LogsPageUI");
    private static Type? ViewType => HscAssembly.FindType("HomeScreenCompanion.UI.LogsPageView");
    private static Type? ControllerType => HscAssembly.FindType("HomeScreenCompanion.UI.LogsPageController");
    private static Type? ReleaseNotesDialogType =>
        HscAssembly.FindType("HomeScreenCompanion.UI.ReleaseNotesDialog");
    private static Type? MainPageUiType =>
        HscAssembly.FindType("HomeScreenCompanion.UI.MainPageUI");

    [Fact]
    public void LogsPageUI_Extends_EditableOptionsBase()
    {
        HscAssembly.EnsureAvailable();
        var t = PageType;
        Assert.NotNull(t);
        Assert.Equal("Emby.Web.GenericEdit.EditableOptionsBase", t!.BaseType?.FullName);
    }

    [Fact]
    public void LogsPageUI_Has_RunLog_SyncProgress_RefreshButton()
    {
        HscAssembly.EnsureAvailable();
        var t = PageType!;
        Assert.Contains(t.GetProperties(BindingFlags.Public | BindingFlags.Instance),
            p => p.Name == "RunLog" && p.PropertyType == typeof(string));
        Assert.Contains(t.GetProperties(BindingFlags.Public | BindingFlags.Instance),
            p => p.Name == "SyncProgress" && p.PropertyType == typeof(double));
        Assert.Contains(t.GetProperties(BindingFlags.Public | BindingFlags.Instance),
            p => p.Name == "RefreshButton");

        var instance = Activator.CreateInstance(t)!;
        var button = t.GetProperty("RefreshButton", BindingFlags.Public | BindingFlags.Instance)!
            .GetValue(instance)!;
        var data1 = (string)button.GetType()
            .GetProperty("Data1", BindingFlags.Public | BindingFlags.Instance)!
            .GetValue(button)!;
        Assert.Equal("Refresh", data1);
    }

    [Fact]
    public void LogsPageController_Extends_ControllerBase_And_Owns_PageInfo()
    {
        HscAssembly.EnsureAvailable();
        var t = ControllerType;
        Assert.NotNull(t);
        Assert.Equal("HomeScreenCompanion.UIBaseClasses.ControllerBase", t!.BaseType?.FullName);
        var pageInfo = t.GetProperty("PageInfo", BindingFlags.Public | BindingFlags.Instance)!;
        Assert.Equal(t, pageInfo.DeclaringType);
    }

    [Fact]
    public async Task LogsPageView_RunCommand_Refresh_Returns_Self()
    {
        HscAssembly.EnsureAvailable();
        var t = ViewType!;
        var instance = CreateView();

        var runCommand = t.GetMethod("RunCommand")!;
        var task = (Task)runCommand.Invoke(instance, new object?[] { "row1", "Refresh", null })!;
        await task;

        var result = task.GetType().GetProperty("Result")!.GetValue(task);
        Assert.Same(instance, result);
    }

    [Fact]
    public void LogsPageView_Ctor_Snapshots_ExecutionLog_Into_RunLog()
    {
        HscAssembly.EnsureAvailable();
        var t = ViewType!;
        var instance = CreateView();

        var pageProp = t.BaseType!.BaseType!
            .GetProperty("ContentData", BindingFlags.Public | BindingFlags.Instance)!;
        var page = pageProp.GetValue(instance)!;
        var runLogProp = PageType!.GetProperty("RunLog", BindingFlags.Public | BindingFlags.Instance)!;
        var runLog = (string)runLogProp.GetValue(page)!;
        Assert.NotNull(runLog);
    }

    [Fact]
    public void MainPageUI_Has_Updates_Group_And_OpenReleaseNotes_Button()
    {
        HscAssembly.EnsureAvailable();
        var t = MainPageUiType!;
        Assert.Contains(t.GetProperties(BindingFlags.Public | BindingFlags.Instance),
            p => p.Name == "UpdatesCaption");
        Assert.Contains(t.GetProperties(BindingFlags.Public | BindingFlags.Instance),
            p => p.Name == "OpenReleaseNotesButton");

        var instance = Activator.CreateInstance(t)!;
        var button = t.GetProperty("OpenReleaseNotesButton", BindingFlags.Public | BindingFlags.Instance)!
            .GetValue(instance)!;
        var data1 = (string)button.GetType()
            .GetProperty("Data1", BindingFlags.Public | BindingFlags.Instance)!
            .GetValue(button)!;
        Assert.Equal("OpenReleaseNotes", data1);
    }

    [Fact]
    public void ReleaseNotesDialog_Extends_PluginDialogView()
    {
        HscAssembly.EnsureAvailable();
        var t = ReleaseNotesDialogType;
        Assert.NotNull(t);
        Assert.Equal("HomeScreenCompanion.UIBaseClasses.Views.PluginDialogView", t!.BaseType?.FullName);
    }

    private static object CreateView()
    {
        var t = ViewType!;
        var ctor = t.GetConstructors(BindingFlags.Public | BindingFlags.Instance).First();
        var pluginInfoType = FindTypeAcrossLoadedAssemblies("MediaBrowser.Model.Plugins.PluginInfo");
        Assert.NotNull(pluginInfoType);
        var pluginInfo = Activator.CreateInstance(pluginInfoType!)!;
        return ctor.Invoke(new object[] { pluginInfo, new NullLogger() });
    }

    private static Type? FindTypeAcrossLoadedAssemblies(string fullName)
    {
        foreach (var asm in System.AppDomain.CurrentDomain.GetAssemblies())
        {
            var t = asm.GetType(fullName, throwOnError: false);
            if (t != null) return t;
        }
        return null;
    }
}
