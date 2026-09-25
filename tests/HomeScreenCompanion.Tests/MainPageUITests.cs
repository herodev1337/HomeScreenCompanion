using System;
using System.Linq;
using System.Reflection;
using System.Reflection.Emit;
using Emby.Web.GenericEdit;
using Emby.Web.GenericEdit.Editors;
using Emby.Web.GenericEdit.Elements;
using Xunit;

namespace HomeScreenCompanion.Tests;

/// <summary>
/// Audit-plan v2 / Wave 1 / U3: shape tests for the
/// MainPageUI + MainPageController + MainPageView + MainPageOptionsStore
/// scaffold. Reflection-only.
/// </summary>
public sealed class MainPageUITests
{
    private static Type? MainPageUiType => HscAssembly.FindType("HomeScreenCompanion.UI.MainPageUI");

    private static Type? MainPageControllerType =>
        HscAssembly.FindType("HomeScreenCompanion.UI.MainPageController");

    private static Type? MainPageViewType => HscAssembly.FindType("HomeScreenCompanion.UI.MainPageView");

    private static Type? MainPageOptionsStoreType =>
        HscAssembly.FindType("HomeScreenCompanion.UI.MainPageOptionsStore");

    private static Type? TagConfigRowType =>
        HscAssembly.FindType("HomeScreenCompanion.UI.TagConfigRow");

    [Fact]
    public void MainPageUI_Extends_EditableOptionsBase_And_Sets_EditorTitle()
    {
        HscAssembly.EnsureAvailable();
        var t = MainPageUiType;
        Assert.NotNull(t);
        Assert.Equal("Emby.Web.GenericEdit.EditableOptionsBase", t!.BaseType?.FullName);
        var titleProp = t.GetProperty("EditorTitle",
            BindingFlags.Public | BindingFlags.Instance);
        Assert.NotNull(titleProp);
        // Must be declared on the derived type, not just inherited abstractly.
        Assert.Equal(t, titleProp!.DeclaringType);

        var instance = Activator.CreateInstance(t)!;
        var value = titleProp.GetValue(instance) as string;
        Assert.Equal("Home Screen Companion", value);
    }

    [Fact]
    public void MainPageUI_Has_Five_Scalar_Settings_With_DisplayName_Attribute()
    {
        HscAssembly.EnsureAvailable();
        var t = MainPageUiType!;
        var expected = new[] { "RunIntervalMinutes", "DryRunMode", "ExtendedConsoleOutput", "LogMissingItems", "ReleaseNotesUrl" };
        foreach (var name in expected)
        {
            var prop = t.GetProperty(name, BindingFlags.Public | BindingFlags.Instance);
            Assert.NotNull(prop);
            var attrNames = prop!.GetCustomAttributesData()
                .Select(a => a.AttributeType?.FullName)
                .Where(s => s != null)
                .Select(s => s!)
                .ToHashSet();
            Assert.Contains("System.ComponentModel.DisplayNameAttribute", attrNames);
        }
    }

    [Fact]
    public void MainPageUI_RunIntervalMinutes_Has_Min_Max_Value_Range()
    {
        HscAssembly.EnsureAvailable();
        var t = MainPageUiType!;
        var prop = t.GetProperty("RunIntervalMinutes")!;
        var attrs = prop.GetCustomAttributesData().Select(a => a.AttributeType.FullName).ToHashSet();
        Assert.Contains("MediaBrowser.Model.Attributes.MinValueAttribute", attrs);
        Assert.Contains("MediaBrowser.Model.Attributes.MaxValueAttribute", attrs);
    }

    [Fact]
    public void MainPageUI_Has_Tags_EditorDxGrid_Backing_EditorDxGrid_Type()
    {
        HscAssembly.EnsureAvailable();
        var t = MainPageUiType!;
        var prop = t.GetProperty("Tags");
        Assert.NotNull(prop);
        Assert.Equal("Emby.Web.GenericEdit.Editors.EditorDxGrid", prop!.PropertyType.FullName);
    }

    [Fact]
    public void TagConfigRow_Is_EditableOptionsBase_With_Required_Fields()
    {
        HscAssembly.EnsureAvailable();
        var t = TagConfigRowType;
        Assert.NotNull(t);
        Assert.Equal("Emby.Web.GenericEdit.EditableOptionsBase", t!.BaseType?.FullName);
        var expected = new[] { "Name", "Tag", "Enabled", "Source" };
        foreach (var name in expected)
        {
            var prop = t.GetProperty(name, BindingFlags.Public | BindingFlags.Instance);
            Assert.NotNull(prop);
        }
    }

    [Fact]
    public void MainPageOptionsStore_Is_A_SimpleFileStore_Of_MainPageUI()
    {
        HscAssembly.EnsureAvailable();
        var t = MainPageOptionsStoreType;
        Assert.NotNull(t);
        var baseType = t!.BaseType;
        Assert.NotNull(baseType);
        Assert.StartsWith("HomeScreenCompanion.UIBaseClasses.Store.SimpleFileStore`1", baseType!.FullName);
        Assert.Equal(new[] { "HomeScreenCompanion.UI.MainPageUI" },
            baseType.GetGenericArguments().Select(a => a.FullName).ToArray());
    }

    [Fact]
    public void MainPageController_Extends_ControllerBase_And_Advertises_IsMainConfigPage()
    {
        HscAssembly.EnsureAvailable();
        var t = MainPageControllerType;
        Assert.NotNull(t);
        Assert.Equal("HomeScreenCompanion.UIBaseClasses.ControllerBase", t!.BaseType?.FullName);
        var pageInfo = t.GetProperty("PageInfo",
            BindingFlags.Public | BindingFlags.Instance);
        Assert.NotNull(pageInfo);
        Assert.True(pageInfo!.CanRead);
    }

    [Fact]
    public void MainPageView_Extends_PluginPageView_And_Has_OnSaveCommand()
    {
        HscAssembly.EnsureAvailable();
        var t = MainPageViewType;
        Assert.NotNull(t);
        Assert.Equal("HomeScreenCompanion.UIBaseClasses.Views.PluginPageView", t!.BaseType?.FullName);

        var onSave = t.GetMethods(BindingFlags.Public | BindingFlags.Instance)
            .FirstOrDefault(m => m.Name == "OnSaveCommand");
        Assert.NotNull(onSave);
        Assert.StartsWith("System.Threading.Tasks.Task`1", onSave!.ReturnType.FullName);
    }

    [Fact]
    public void MainPageUI_Roundtrips_Through_SimpleContentStore()
    {
        HscAssembly.EnsureAvailable();
        // Uses the in-memory SimpleContentStore<T> (the parent of SimpleFileStore<T>)
        // to prove the GetOptions / SetOptions lifecycle is wired correctly. The
        // JSON round-trip via SimpleFileStore<MainPageUI> needs an IFileSystem +
        // IJsonSerializer pair which are provided by Emby at runtime.
        var storeType = HscAssembly.FindType("HomeScreenCompanion.UIBaseClasses.Store.SimpleContentStore`1")!;
        var closed = storeType.MakeGenericType(MainPageUiType!);

        var instance = CreateConcreteInstance(closed);

        var getOptions = closed.GetMethod("GetOptions")!;
        var setOptions = closed.GetMethod("SetOptions")!;

        var loaded = getOptions.Invoke(instance, null);
        Assert.NotNull(loaded);

        var dryRunProp = MainPageUiType!.GetProperty("DryRunMode")!;
        var extendedProp = MainPageUiType!.GetProperty("ExtendedConsoleOutput")!;
        var intervalProp = MainPageUiType!.GetProperty("RunIntervalMinutes")!;

        dryRunProp.SetValue(loaded, true);
        extendedProp.SetValue(loaded, true);
        intervalProp.SetValue(loaded, 123);

        setOptions.Invoke(instance, new[] { loaded });

        var again = getOptions.Invoke(instance, null);
        Assert.NotNull(again);
        Assert.True((bool)dryRunProp.GetValue(again)!);
        Assert.True((bool)extendedProp.GetValue(again)!);
        Assert.Equal(123, (int)intervalProp.GetValue(again)!);

        // Asserts referential identity (in-memory store keeps a single instance).
        Assert.Same(loaded, again);
    }

    private static object CreateConcreteInstance(Type abstractType)
    {
        var assemblyName = new AssemblyName("HomeScreenCompanion.Tests.Dynamic");
        var assemblyBuilder = AssemblyBuilder.DefineDynamicAssembly(assemblyName,
            AssemblyBuilderAccess.Run);
        var moduleBuilder = assemblyBuilder.DefineDynamicModule("Main");
        var typeBuilder = moduleBuilder.DefineType("ConcreteSubclass",
            TypeAttributes.Public | TypeAttributes.Class,
            abstractType,
            Type.EmptyTypes);
        var ctor = typeBuilder.DefineDefaultConstructor(MethodAttributes.Public);
        var concreteType = typeBuilder.CreateType()!;
        return Activator.CreateInstance(concreteType)!;
    }
}
