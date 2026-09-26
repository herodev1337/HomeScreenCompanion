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
/// Audit-plan v2 / Wave 1 / U5: shape tests for the Top Lists page +
/// MoviesPickerDialog. Typed surface.
/// </summary>
public sealed class TopListsUITests
{
    [Fact]
    public void TopListsPageUI_Extends_EditableOptionsBase_With_Lists()
    {
        Assert.Equal("Emby.Web.GenericEdit.EditableOptionsBase", typeof(TopListsPageUI).BaseType?.FullName);

        var listsProp = typeof(TopListsPageUI).GetProperty("Lists", BindingFlags.Public | BindingFlags.Instance);
        Assert.NotNull(listsProp);
        Assert.Equal("Emby.Web.GenericEdit.Elements.List.GenericItemList",
            listsProp!.PropertyType.FullName);
    }

    [Fact]
    public void TopListsPageUI_Has_Three_Add_Buttons()
    {
        var instance = new TopListsPageUI();
        var expected = new[] { "AddMdbList", "AddTrakt", "AddTmdb" };
        foreach (var name in expected)
        {
            var prop = typeof(TopListsPageUI).GetProperty(name, BindingFlags.Public | BindingFlags.Instance);
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
        Assert.Equal("HomeScreenCompanion.UIBaseClasses.ControllerBase", typeof(TopListsPageController).BaseType?.FullName);
    }

    [Fact]
    public void TopListsPageController_Takes_Logger_And_Advertises_PageInfo_Overrides()
    {
        var ctor = typeof(TopListsPageController).GetConstructors(BindingFlags.Public | BindingFlags.Instance).First();
        var paramTypes = ctor.GetParameters().Select(p => p.ParameterType.FullName).ToArray();
        Assert.Contains("MediaBrowser.Model.Logging.ILogger", paramTypes);

        var pageInfo = typeof(TopListsPageController).GetProperty("PageInfo", BindingFlags.Public | BindingFlags.Instance)!;
        Assert.NotNull(pageInfo);
        // Concrete override, not inherited abstract — verifies the controller
        // owns its own PageInfo and doesn't fall back to ControllerBase's default.
        Assert.Equal(typeof(TopListsPageController), pageInfo!.DeclaringType);
    }

    [Fact]
    public async Task TopListsPageView_RunCommand_AddXxx_Appends_To_Lists()
    {
        var instance = CreateView();

        var contentData = typeof(TopListsPageView).BaseType!.BaseType!
            .GetProperty("ContentData", BindingFlags.Public | BindingFlags.Instance)!
            .GetValue(instance)!;
        var listsProp = typeof(TopListsPageUI).GetProperty("Lists", BindingFlags.Public | BindingFlags.Instance)!;
        var listsBefore = (int)listsProp.GetValue(contentData)!.GetType()
            .GetProperty("Count")!.GetValue(listsProp.GetValue(contentData))!;

        var runCommand = typeof(TopListsPageView).GetMethod("RunCommand")!;
        var task = (Task)runCommand.Invoke(instance, new object?[] { "row1", "AddMdbList", null })!;
        await task;

        var listsAfter = (int)listsProp.GetValue(contentData)!.GetType()
            .GetProperty("Count")!.GetValue(listsProp.GetValue(contentData))!;
        Assert.Equal(listsBefore + 1, listsAfter);
    }

    [Fact]
    public async Task TopListsPageView_RunCommand_PickMovies_Returns_MoviesPickerDialog()
    {
        var instance = CreateView();

        var runCommand = typeof(TopListsPageView).GetMethod("RunCommand")!;
        var task = (Task)runCommand.Invoke(instance, new object?[] { "tag1", "PickMovies", null })!;
        await task;

        var result = task.GetType().GetProperty("Result")!.GetValue(task);
        Assert.NotNull(result);
        Assert.Equal("HomeScreenCompanion.UI.MoviesPickerDialog", result!.GetType().FullName);
    }

    [Fact]
    public void MoviesPickerDialog_Extends_PluginDialogView()
    {
        Assert.Equal("HomeScreenCompanion.UIBaseClasses.Views.PluginDialogView", typeof(MoviesPickerDialog).BaseType?.FullName);
    }

    [Fact]
    public void MoviesPickerUI_Has_Query_Movies_And_SearchButton()
    {
        Assert.Contains(typeof(MoviesPickerUI).GetProperties(BindingFlags.Public | BindingFlags.Instance),
            p => p.Name == "Query" && p.PropertyType == typeof(string));
        Assert.Contains(typeof(MoviesPickerUI).GetProperties(BindingFlags.Public | BindingFlags.Instance),
            p => p.Name == "Movies");
        Assert.Contains(typeof(MoviesPickerUI).GetProperties(BindingFlags.Public | BindingFlags.Instance),
            p => p.Name == "SearchButton");
    }

    private static object CreateView()
    {
        var ctor = typeof(TopListsPageView).GetConstructors(BindingFlags.Public | BindingFlags.Instance).First();
        var pluginInfo = new PluginInfo();
        return ctor.Invoke(new object[] { pluginInfo, new NullLogger() });
    }
}
