using System;
using System.Linq;
using System.Reflection;
using Xunit;

namespace HomeScreenCompanion.Tests;

/// <summary>
/// Audit-plan v2 / Wave 1 / U1: shape tests for the lifted <c>UIBaseClasses/</c>
/// tree. Pure reflection — no project reference needed.
/// </summary>
public sealed class BaseClassesShapeTests
{
    private static Type? FindType(string fullName) => HscAssembly.FindType(fullName);

    [Fact]
    public void ControllerBase_Is_Public_Abstract_And_Implements_IPluginUIPageController()
    {
        var t = FindType("HomeScreenCompanion.UIBaseClasses.ControllerBase");
        Assert.NotNull(t);
        Assert.True(t!.IsPublic, "ControllerBase must be public (SDK-UI templates need cross-assembly inheritance)");
        Assert.True(t.IsAbstract, "ControllerBase must be abstract");
        Assert.Contains(
            t.GetInterfaces(),
            i => i.FullName == "MediaBrowser.Model.Plugins.UI.IPluginUIPageController");
    }

    [Fact]
    public void PluginViewBase_Is_Public_And_Implements_IPluginUIView_And_IPluginViewWithOptions()
    {
        var t = FindType("HomeScreenCompanion.UIBaseClasses.Views.PluginViewBase");
        Assert.NotNull(t);
        Assert.True(t!.IsPublic, "PluginViewBase must be public");
        Assert.Contains(
            t.GetInterfaces(),
            i => i.FullName == "MediaBrowser.Model.Plugins.UI.Views.IPluginUIView");
        Assert.Contains(
            t.GetInterfaces(),
            i => i.FullName == "MediaBrowser.Model.Plugins.UI.Views.IPluginViewWithOptions");
    }

    [Theory]
    [InlineData("HomeScreenCompanion.UIBaseClasses.Views.PluginViewBase")]
    [InlineData("HomeScreenCompanion.UIBaseClasses.Views.PluginPageView")]
    [InlineData("HomeScreenCompanion.UIBaseClasses.Views.PluginDialogView")]
    [InlineData("HomeScreenCompanion.UIBaseClasses.Views.PluginWizardView")]
    public void ViewBase_Is_Public(string fullName)
    {
        var t = FindType(fullName);
        Assert.NotNull(t);
        Assert.True(t!.IsPublic, $"{fullName} must be public");
        Assert.True(t.IsAbstract, $"{fullName} must be abstract");
    }

    [Fact]
    public void PluginPageView_Implements_IPluginPageView_And_Has_ShowSave_AllowSave_OnSaveCommand()
    {
        var t = FindType("HomeScreenCompanion.UIBaseClasses.Views.PluginPageView");
        Assert.NotNull(t);
        Assert.Contains(
            t!.GetInterfaces(),
            i => i.FullName == "MediaBrowser.Model.Plugins.UI.Views.IPluginPageView");

        Assert.Contains(t.GetProperties(BindingFlags.Public | BindingFlags.Instance),
            p => p.Name == "ShowSave" && p.PropertyType == typeof(bool));
        Assert.Contains(t.GetProperties(BindingFlags.Public | BindingFlags.Instance),
            p => p.Name == "AllowSave" && p.PropertyType == typeof(bool));

        var onSave = t.GetMethods(BindingFlags.Public | BindingFlags.Instance)
            .FirstOrDefault(m => m.Name == "OnSaveCommand");
        Assert.NotNull(onSave);
        Assert.StartsWith("System.Threading.Tasks.Task`1", onSave!.ReturnType.FullName);
    }

    [Fact]
    public void PluginDialogView_Implements_IPluginDialogView_With_AllowOk_AllowCancel_ShowDialogFullScreen_OnOkCommand_OnCancelCommand()
    {
        var t = FindType("HomeScreenCompanion.UIBaseClasses.Views.PluginDialogView");
        Assert.NotNull(t);
        Assert.Contains(
            t!.GetInterfaces(),
            i => i.FullName == "MediaBrowser.Model.Plugins.UI.Views.IPluginDialogView");

        foreach (var prop in new[] { "AllowOk", "AllowCancel", "ShowDialogFullScreen" })
        {
            Assert.Contains(t.GetProperties(BindingFlags.Public | BindingFlags.Instance),
                p => p.Name == prop);
        }

        Assert.Contains(t.GetMethods(BindingFlags.Public | BindingFlags.Instance),
            m => m.Name == "OnOkCommand");
        Assert.Contains(t.GetMethods(BindingFlags.Public | BindingFlags.Instance),
            m => m.Name == "OnCancelCommand");
    }

    [Fact]
    public void PluginWizardView_Implements_IPluginWizardView_With_AllowNext_AllowBack_AllowCancel_AllowFinish_OnNext_OnPrevious_OnFinish_OnCancel()
    {
        var t = FindType("HomeScreenCompanion.UIBaseClasses.Views.PluginWizardView");
        Assert.NotNull(t);
        Assert.Contains(
            t!.GetInterfaces(),
            i => i.FullName == "MediaBrowser.Model.Plugins.UI.Views.IPluginWizardView");

        foreach (var prop in new[] { "AllowNext", "AllowBack", "AllowCancel", "AllowFinish" })
        {
            Assert.Contains(t.GetProperties(BindingFlags.Public | BindingFlags.Instance),
                p => p.Name == prop);
        }

        foreach (var method in new[] { "OnNextCommand", "OnPreviousCommand", "OnFinishCommand", "OnCancelCommand" })
        {
            Assert.Contains(t.GetMethods(BindingFlags.Public | BindingFlags.Instance),
                m => m.Name == method);
        }
    }

    [Fact]
    public void RaiseUIViewInfoChanged_Is_Protected_On_PluginViewBase()
    {
        var t = FindType("HomeScreenCompanion.UIBaseClasses.Views.PluginViewBase")!;
        var m = t.GetMethods(BindingFlags.NonPublic | BindingFlags.Instance)
            .FirstOrDefault(x => x.Name == "RaiseUIViewInfoChanged");
        Assert.NotNull(m);
        Assert.True(m!.IsFamily, "RaiseUIViewInfoChanged must be protected");
        Assert.Empty(m.GetParameters());
        Assert.Equal(typeof(void), m.ReturnType);
    }

    [Fact]
    public void SimpleFileStore_Ctor_Takes_ApplicationPaths_FileSystem_Json_Logger_And_Name()
    {
        var t = FindType("HomeScreenCompanion.UIBaseClasses.Store.SimpleFileStore`1");
        Assert.NotNull(t);
        Assert.True(t!.IsPublic, "SimpleFileStore<T> must be public");
        Assert.True(t.IsAbstract, "SimpleFileStore<T> must be abstract");

        // ctor signature
        var ctor = t.GetConstructors(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance)
            .FirstOrDefault();
        Assert.NotNull(ctor);
        var paramTypes = ctor!.GetParameters().Select(p => p.ParameterType).ToArray();
        Assert.Contains(paramTypes, p => p.Name == "IApplicationPaths");
        Assert.Contains(paramTypes, p => p.Name == "IFileSystem");
        Assert.Contains(paramTypes, p => p.Name == "IJsonSerializer");
        Assert.Contains(paramTypes, p => p.Name == "ILogger");
        Assert.Contains(paramTypes, p => p.FullName == "System.String");
    }

    [Fact]
    public void SimpleFileStore_Has_FileSaving_And_FileSaved_Events()
    {
        var t = FindType("HomeScreenCompanion.UIBaseClasses.Store.SimpleFileStore`1");
        Assert.NotNull(t);

        var events = t!.GetEvents(BindingFlags.Public | BindingFlags.Instance);
        Assert.Contains(events, e => e.Name == "FileSaving");
        Assert.Contains(events, e => e.Name == "FileSaved");

        var argsSaving = HscAssembly.FindType("HomeScreenCompanion.UIBaseClasses.Store.FileSavingEventArgs");
        Assert.NotNull(argsSaving);
        var argsSaved = HscAssembly.FindType("HomeScreenCompanion.UIBaseClasses.Store.FileSavedEventArgs");
        Assert.NotNull(argsSaved);
    }
}