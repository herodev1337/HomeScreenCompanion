using System;
using System.Linq;
using System.Reflection;
using Xunit;

namespace HomeScreenCompanion.Tests;

/// <summary>
/// Audit-plan v2 / Wave 1 / U2: shape tests for <c>Plugin.cs</c> after the
/// <c>IHasWebPages</c> → <c>IHasUIPages</c> swap. Reflection-only.
/// </summary>
public sealed class PluginImplementsUIPagesTests
{
    private static Type? PluginType => HscAssembly.FindType("HomeScreenCompanion.Plugin");

    [Fact]
    public void Plugin_Implements_IHasUIPages_Not_IHasWebPages()
    {
        HscAssembly.EnsureAvailable();
        var t = PluginType;
        Assert.NotNull(t);

        var ifaces = t!.GetInterfaces().Select(i => i.FullName).ToHashSet();
        Assert.Contains("MediaBrowser.Model.Plugins.UI.IHasUIPages", ifaces);
        Assert.DoesNotContain("MediaBrowser.Model.Plugins.UI.IHasWebPages", ifaces);
    }

    [Fact]
    public void Plugin_Still_Implements_IHasThumbImage()
    {
        HscAssembly.EnsureAvailable();
        var t = PluginType!;
        Assert.Contains(
            t.GetInterfaces(),
            i => i.FullName == "MediaBrowser.Common.Plugins.IHasThumbImage");
    }

    [Fact]
    public void Plugin_Has_UIPageControllers_Property_Of_IReadOnlyCollection_Of_IPluginUIPageController()
    {
        HscAssembly.EnsureAvailable();
        var t = PluginType!;
        var prop = t.GetProperty("UIPageControllers",
            BindingFlags.Public | BindingFlags.Instance);
        Assert.NotNull(prop);
        Assert.True(prop!.CanRead, "UIPageControllers must have a getter");
        Assert.False(prop.CanWrite, "UIPageControllers must be read-only");

        Assert.Equal("System.Collections.Generic.IReadOnlyCollection`1",
            prop.PropertyType.GetGenericTypeDefinition().FullName);
        Assert.Equal(
            new[] { "MediaBrowser.Model.Plugins.UI.IPluginUIPageController" },
            prop.PropertyType.GetGenericArguments().Select(a => a.FullName).ToArray());
    }

    [Fact]
    public void Plugin_No_Longer_Has_GetPages_Method()
    {
        HscAssembly.EnsureAvailable();
        var t = PluginType!;
        Assert.DoesNotContain(t.GetMethods(BindingFlags.Public | BindingFlags.Instance),
            m => m.Name == "GetPages");
    }

    [Fact]
    public void Plugin_No_Longer_References_Embedded_HTML_Or_JS_Resources()
    {
        HscAssembly.EnsureAvailable();
        var t = PluginType!;
        var asm = t.Assembly;
        var resources = asm.GetManifestResourceNames();
        Assert.DoesNotContain(resources, n => n.EndsWith("configPage.html", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(resources, n => n.EndsWith("configPage.js", StringComparison.OrdinalIgnoreCase));
        Assert.Contains(resources, n => n.EndsWith("thumb.png"));
    }
}
