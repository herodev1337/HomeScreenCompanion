using System;
using System.Linq;
using System.Reflection;
using System.Threading.Tasks;
using Emby.Web.GenericEdit;
using Emby.Web.GenericEdit.Elements;
using Emby.Web.GenericEdit.Elements.List;
using MediaBrowser.Model.Logging;
using Xunit;

namespace HomeScreenCompanion.Tests;

/// <summary>
/// Audit-plan v2 / Wave 1 / U5: shape tests for the Top Lists page +
/// MoviesPickerDialog. Reflection-only.
/// </summary>
public sealed class TopListsUITests
{
    private static Type? PageType => HscAssembly.FindType("HomeScreenCompanion.UI.TopListsPageUI");
    private static Type? ViewType => HscAssembly.FindType("HomeScreenCompanion.UI.TopListsPageView");
    private static Type? ControllerType => HscAssembly.FindType("HomeScreenCompanion.UI.TopListsPageController");
    private static Type? PickerDialogType => HscAssembly.FindType("HomeScreenCompanion.UI.MoviesPickerDialog");
    private static Type? PickerUiType => HscAssembly.FindType("HomeScreenCompanion.UI.MoviesPickerUI");

    [Fact]
    public void TopListsPageUI_Extends_EditableOptionsBase_With_Lists()
    {
        HscAssembly.EnsureAvailable();
        var t = PageType;
        Assert.NotNull(t);
        Assert.Equal("Emby.Web.GenericEdit.EditableOptionsBase", t!.BaseType?.FullName);

        var listsProp = t.GetProperty("Lists", BindingFlags.Public | BindingFlags.Instance);
        Assert.NotNull(listsProp);
        Assert.Equal("Emby.Web.GenericEdit.Elements.List.GenericItemList",
            listsProp!.PropertyType.FullName);
    }

    [Fact]
    public void TopListsPageUI_Has_Three_Add_Buttons()
    {
        HscAssembly.EnsureAvailable();
        var t = PageType!;
        var instance = Activator.CreateInstance(t)!;
        var expected = new[] { "AddMdbList", "AddTrakt", "AddTmdb" };
        foreach (var name in expected)
        {
            var prop = t.GetProperty(name, BindingFlags.Public | BindingFlags.Instance);
            Assert.NotNull(prop);
            var button = prop!.GetValue(instance);
            var data1 = (string)button!.GetType()
                .GetProperty("Data1", BindingFlags.Public | BindingFlags.Instance)!
                .GetValue(button)!;
            Assert.Equal(name, data1);
        }
    }

    [Fact]
    public void TopListsPageController_Extends_ControllerBase()
    {
        HscAssembly.EnsureAvailable();
        var t = ControllerType;
        Assert.NotNull(t);
        Assert.Equal("HomeScreenCompanion.UIBaseClasses.ControllerBase", t!.BaseType?.FullName);
    }

    [Fact]
    public void TopListsPageController_Takes_Logger_And_Advertises_PageInfo_Overrides()
    {
        HscAssembly.EnsureAvailable();
        var t = ControllerType!;
        var ctor = t.GetConstructors(BindingFlags.Public | BindingFlags.Instance).First();
        var paramTypes = ctor.GetParameters().Select(p => p.ParameterType.FullName).ToArray();
        Assert.Contains("MediaBrowser.Model.Logging.ILogger", paramTypes);

        var pageInfo = t.GetProperty("PageInfo", BindingFlags.Public | BindingFlags.Instance)!;
        Assert.NotNull(pageInfo);
        // Concrete override, not inherited abstract — verifies the controller
        // owns its own PageInfo and doesn't fall back to ControllerBase's default.
        Assert.Equal(t, pageInfo!.DeclaringType);
    }

    [Fact]
    public void TopListsPageView_RunCommand_AddXxx_Appends_To_Lists()
    {
        HscAssembly.EnsureAvailable();
        var t = ViewType!;
        var instance = CreateView();

        var contentData = t.BaseType!.BaseType!
            .GetProperty("ContentData", BindingFlags.Public | BindingFlags.Instance)!
            .GetValue(instance)!;
        var listsProp = PageType!.GetProperty("Lists", BindingFlags.Public | BindingFlags.Instance)!;
        var listsBefore = (int)listsProp.GetValue(contentData)!.GetType()
            .GetProperty("Count")!.GetValue(listsProp.GetValue(contentData))!;

        var runCommand = t.GetMethod("RunCommand")!;
        var task = (Task)runCommand.Invoke(instance, new object?[] { "row1", "AddMdbList", null })!;
        task.Wait();

        var listsAfter = (int)listsProp.GetValue(contentData)!.GetType()
            .GetProperty("Count")!.GetValue(listsProp.GetValue(contentData))!;
        Assert.Equal(listsBefore + 1, listsAfter);
    }

    [Fact]
    public async Task TopListsPageView_RunCommand_PickMovies_Returns_MoviesPickerDialog()
    {
        HscAssembly.EnsureAvailable();
        var t = ViewType!;
        var instance = CreateView();

        var runCommand = t.GetMethod("RunCommand")!;
        var task = (Task)runCommand.Invoke(instance, new object?[] { "tag1", "PickMovies", null })!;
        await task;

        var result = task.GetType().GetProperty("Result")!.GetValue(task);
        Assert.NotNull(result);
        Assert.Equal("HomeScreenCompanion.UI.MoviesPickerDialog", result!.GetType().FullName);
    }

    [Fact]
    public void MoviesPickerDialog_Extends_PluginDialogView()
    {
        HscAssembly.EnsureAvailable();
        var t = PickerDialogType;
        Assert.NotNull(t);
        Assert.Equal("HomeScreenCompanion.UIBaseClasses.Views.PluginDialogView", t!.BaseType?.FullName);
    }

    [Fact]
    public void MoviesPickerUI_Has_Query_Movies_And_SearchButton()
    {
        HscAssembly.EnsureAvailable();
        var t = PickerUiType!;
        Assert.Contains(t.GetProperties(BindingFlags.Public | BindingFlags.Instance),
            p => p.Name == "Query" && p.PropertyType == typeof(string));
        Assert.Contains(t.GetProperties(BindingFlags.Public | BindingFlags.Instance),
            p => p.Name == "Movies");
        Assert.Contains(t.GetProperties(BindingFlags.Public | BindingFlags.Instance),
            p => p.Name == "SearchButton");
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
