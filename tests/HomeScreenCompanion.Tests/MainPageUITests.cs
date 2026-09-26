using System;
using System.Linq;
using System.Reflection;
using System.Reflection.Emit;
using HomeScreenCompanion.UI;
using HomeScreenCompanion.UIBaseClasses.Store;
using Xunit;

namespace HomeScreenCompanion.Tests;

/// <summary>
/// Audit-plan v2 / Wave 1 / U3: shape tests for the
/// MainPageUI + MainPageController + MainPageView + MainPageOptionsStore
/// scaffold. Direct typed calls + reflection on the typed
/// <see cref="Type"/> objects (still needed to enumerate row properties).
/// </summary>
public sealed class MainPageUITests
{
    [Fact]
    public void MainPageUI_Extends_EditableOptionsBase_And_Sets_EditorTitle()
    {
        Assert.Equal("Emby.Web.GenericEdit.EditableOptionsBase", typeof(MainPageUI).BaseType?.FullName);
        var titleProp = typeof(MainPageUI).GetProperty("EditorTitle",
            BindingFlags.Public | BindingFlags.Instance);
        Assert.NotNull(titleProp);
        // Must be declared on the derived type, not just inherited abstractly.
        Assert.Equal(typeof(MainPageUI), titleProp!.DeclaringType);

        var instance = new MainPageUI();
        var value = titleProp.GetValue(instance) as string;
        Assert.Equal("Home Screen Companion", value);
    }

    [Fact]
    public void MainPageUI_Has_Five_Scalar_Settings_With_DisplayName_Attribute()
    {
        var expected = new[] { "RunIntervalMinutes", "DryRunMode", "ExtendedConsoleOutput", "LogMissingItems", "ReleaseNotesUrl" };
        foreach (var name in expected)
        {
            var prop = typeof(MainPageUI).GetProperty(name, BindingFlags.Public | BindingFlags.Instance);
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
        var prop = typeof(MainPageUI).GetProperty("RunIntervalMinutes")!;
        var attrs = prop.GetCustomAttributesData().Select(a => a.AttributeType.FullName).ToHashSet();
        Assert.Contains("MediaBrowser.Model.Attributes.MinValueAttribute", attrs);
        Assert.Contains("MediaBrowser.Model.Attributes.MaxValueAttribute", attrs);
    }

    [Fact]
    public void MainPageUI_Has_Tags_EditorDxGrid_Backing_EditorDxGrid_Type()
    {
        var prop = typeof(MainPageUI).GetProperty("Tags");
        Assert.NotNull(prop);
        Assert.Equal("Emby.Web.GenericEdit.Editors.EditorDxGrid", prop!.PropertyType.FullName);
    }

    [Fact]
    public void TagConfigRow_Is_EditableOptionsBase_With_Required_Fields()
    {
        Assert.Equal("Emby.Web.GenericEdit.EditableOptionsBase", typeof(TagConfigRow).BaseType?.FullName);
        var expected = new[] { "Name", "Tag", "Enabled", "Source" };
        foreach (var name in expected)
        {
            var prop = typeof(TagConfigRow).GetProperty(name, BindingFlags.Public | BindingFlags.Instance);
            Assert.NotNull(prop);
        }
    }

    [Fact]
    public void MainPageOptionsStore_Is_A_SimpleFileStore_Of_MainPageUI()
    {
        var baseType = typeof(MainPageOptionsStore).BaseType;
        Assert.NotNull(baseType);
        Assert.StartsWith("HomeScreenCompanion.UIBaseClasses.Store.SimpleFileStore`1", baseType!.FullName);
        Assert.Equal(new[] { "HomeScreenCompanion.UI.MainPageUI" },
            baseType.GetGenericArguments().Select(a => a.FullName).ToArray());
    }

    [Fact]
    public void MainPageController_Extends_ControllerBase_And_Advertises_IsMainConfigPage()
    {
        Assert.Equal("HomeScreenCompanion.UIBaseClasses.ControllerBase", typeof(MainPageController).BaseType?.FullName);
        var pageInfo = typeof(MainPageController).GetProperty("PageInfo",
            BindingFlags.Public | BindingFlags.Instance);
        Assert.NotNull(pageInfo);
        Assert.True(pageInfo!.CanRead);
    }

    [Fact]
    public void MainPageView_Extends_PluginPageView_And_Has_OnSaveCommand()
    {
        Assert.Equal("HomeScreenCompanion.UIBaseClasses.Views.PluginPageView", typeof(MainPageView).BaseType?.FullName);

        var onSave = typeof(MainPageView).GetMethods(BindingFlags.Public | BindingFlags.Instance)
            .FirstOrDefault(m => m.Name == "OnSaveCommand");
        Assert.NotNull(onSave);
        Assert.StartsWith("System.Threading.Tasks.Task`1", onSave!.ReturnType.FullName);
    }

    [Fact]
    public void MainPageUI_Roundtrips_Through_SimpleContentStore()
    {
        // Uses the in-memory SimpleContentStore<T> (the parent of SimpleFileStore<T>)
        // to prove the GetOptions / SetOptions lifecycle is wired correctly. The
        // JSON round-trip via SimpleFileStore<MainPageUI> needs an IFileSystem +
        // IJsonSerializer pair which are provided by Emby at runtime.
        var storeType = typeof(SimpleContentStore<>);
        var closed = storeType.MakeGenericType(typeof(MainPageUI));

        var instance = CreateConcreteInstance(closed);

        var getOptions = closed.GetMethod("GetOptions")!;
        var setOptions = closed.GetMethod("SetOptions")!;

        var loaded = getOptions.Invoke(instance, null);
        Assert.NotNull(loaded);

        var dryRunProp = typeof(MainPageUI).GetProperty("DryRunMode")!;
        var extendedProp = typeof(MainPageUI).GetProperty("ExtendedConsoleOutput")!;
        var intervalProp = typeof(MainPageUI).GetProperty("RunIntervalMinutes")!;

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
