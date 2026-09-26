using System.Linq;
using System.Reflection;
using Xunit;

namespace HomeScreenCompanion.Tests;

/// <summary>
/// Wave 2 / U12: shape tests for the Top Lists tab.
/// </summary>
public sealed class TopListsTabTests
{
    private static System.Type GetType(string fullName)
    {
        var t = typeof(Plugin).Assembly.GetType(fullName);
        Assert.NotNull(t);
        return t!;
    }

    [Fact]
    public void TopListsTabUI_Exposes_Add_Button_With_Submenu()
    {
        var t = GetType("HomeScreenCompanion.UI.Tabs.TopListsTabUI");
        var button = t.GetProperty("AddListButton", BindingFlags.Public | BindingFlags.Instance)!;
        var instance = t.GetProperty("AddListButton", BindingFlags.Public | BindingFlags.Instance)!
            .GetValue(System.Activator.CreateInstance(t));
        Assert.NotNull(instance);

        var subMenu = instance!.GetType()
            .GetProperty("SubMenuButtons", BindingFlags.Public | BindingFlags.Instance)!
            .GetValue(instance) as System.Collections.IEnumerable;
        Assert.NotNull(subMenu);
        var items = subMenu!.Cast<object>().ToList();
        Assert.Equal(4, items.Count);
    }

    [Fact]
    public void TopListEditUI_Exposes_Scalar_Fields()
    {
        var t = GetType("HomeScreenCompanion.UI.Tabs.TopListEditUI");
        var names = t.GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .Select(p => p.Name)
            .ToHashSet();
        Assert.Contains("TagName", names);
        Assert.Contains("MaxItems", names);
        Assert.Contains("LibraryId", names);
        Assert.Contains("UserIds", names);
        Assert.Contains("SettingsJson", names);
    }

    [Fact]
    public void TopListEditDialog_Extends_PluginDialogView()
    {
        Assert.Equal("HomeScreenCompanion.UIBaseClasses.Views.PluginDialogView",
            GetType("HomeScreenCompanion.UI.Tabs.TopListEditDialog").BaseType?.FullName);
    }

    [Fact]
    public void TopListEditDialog_Ctor_Takes_TopListHomeSection()
    {
        var ctor = typeof(Plugin).Assembly
            .GetType("HomeScreenCompanion.UI.Tabs.TopListEditDialog")!
            .GetConstructor(new[] { typeof(string), typeof(TopListHomeSection) });
        Assert.NotNull(ctor);
    }
}
