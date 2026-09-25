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
/// Audit-plan v2 / Wave 1 / U4: shape tests for
/// <see cref="HomeScreenCompanion.UI.TagConfigRow"/> + the
/// per-row edit dialog + the editor factory.
/// </summary>
public sealed class TagRowDialogTests
{
    private static Type? RowType => HscAssembly.FindType("HomeScreenCompanion.UI.TagConfigRow");
    private static Type? DialogType => HscAssembly.FindType("HomeScreenCompanion.UI.TagRowEditDialog");
    private static Type? EditorType => HscAssembly.FindType("HomeScreenCompanion.UI.TagRowEditor");

    [Fact]
    public void TagConfigRow_Extends_EditableOptionsBase()
    {
        HscAssembly.EnsureAvailable();
        var t = RowType;
        Assert.NotNull(t);
        Assert.Equal("Emby.Web.GenericEdit.EditableOptionsBase", t!.BaseType?.FullName);
    }

    [Fact]
    public void TagConfigRow_Has_Gating_Fields_For_Collection()
    {
        HscAssembly.EnsureAvailable();
        var t = RowType!;
        Assert.Contains(t.GetProperties(BindingFlags.Public | BindingFlags.Instance),
            p => p.Name == "EnableCollection" && p.PropertyType == typeof(bool));

        var collName = t.GetProperty("CollectionName", BindingFlags.Public | BindingFlags.Instance);
        Assert.NotNull(collName);
        var attrNames = collName!.GetCustomAttributesData()
            .Select(a => a.AttributeType?.FullName)
            .Where(s => s != null)
            .Select(s => s!)
            .ToHashSet();
        Assert.Contains("MediaBrowser.Model.Attributes.VisibleConditionAttribute", attrNames);
    }

    [Fact]
    public void TagConfigRow_Run_And_OpenLogs_Buttons_Have_Command_Ids()
    {
        HscAssembly.EnsureAvailable();
        var t = RowType!;
        var instance = Activator.CreateInstance(t)!;

        var runProp = t.GetProperty("RunButton", BindingFlags.Public | BindingFlags.Instance)!;
        var runItem = runProp.GetValue(instance)!;
        var data1 = (string)runItem.GetType()
            .GetProperty("Data1", BindingFlags.Public | BindingFlags.Instance)!
            .GetValue(runItem)!;
        Assert.Equal("RunTag", data1);

        var logsProp = t.GetProperty("OpenLogsButton", BindingFlags.Public | BindingFlags.Instance)!;
        var logsItem = logsProp.GetValue(instance)!;
        var data2 = (string)logsItem.GetType()
            .GetProperty("Data1", BindingFlags.Public | BindingFlags.Instance)!
            .GetValue(logsItem)!;
        Assert.Equal("OpenLogs", data2);
    }

    [Fact]
    public void TagRowEditDialog_Extends_PluginDialogView()
    {
        HscAssembly.EnsureAvailable();
        var t = DialogType;
        Assert.NotNull(t);
        Assert.Equal("HomeScreenCompanion.UIBaseClasses.Views.PluginDialogView", t!.BaseType?.FullName);
    }

    [Fact]
    public void TagRowEditor_OpenFor_Returns_Dialog_With_Row_As_ContentData()
    {
        HscAssembly.EnsureAvailable();
        var editor = EditorType;
        Assert.NotNull(editor);
        var openFor = editor!.GetMethod("OpenFor", BindingFlags.Public | BindingFlags.Static);
        Assert.NotNull(openFor);
        var rowInstance = Activator.CreateInstance(RowType!)!;
        var dialog = openFor!.Invoke(null, new object[] { Guid.NewGuid().ToString(), rowInstance, new NullLogger() });
        Assert.NotNull(dialog);

        var contentDataProp = DialogType!.BaseType!.BaseType!
            .GetProperty("ContentData", BindingFlags.Public | BindingFlags.Instance)!;
        Assert.Same(rowInstance, contentDataProp.GetValue(dialog));
    }

    [Fact]
    public async Task TagRowEditDialog_RunCommand_OpenLogs_Returns_A_Different_View()
    {
        HscAssembly.EnsureAvailable();
        var row = Activator.CreateInstance(RowType!)!;
        var dialog = CreateDialog(row);

        var openLogs = dialog.GetType().GetMethod("RunCommand")!;
        var task = (Task)openLogs.Invoke(dialog, new object?[] { "row1", "OpenLogs", null })!;
        await task;

        var resultProp = task.GetType().GetProperty("Result")!;
        var result = resultProp.GetValue(task);
        Assert.NotNull(result);
        Assert.NotSame(dialog, result);
    }

    [Fact]
    public async Task TagRowEditDialog_RunCommand_Unknown_Command_Returns_Self()
    {
        HscAssembly.EnsureAvailable();
        var row = Activator.CreateInstance(RowType!)!;
        var dialog = CreateDialog(row);

        var openLogs = dialog.GetType().GetMethod("RunCommand")!;
        var task = (Task)openLogs.Invoke(dialog, new object?[] { "row1", "Refresh", null })!;
        await task;

        var resultProp = task.GetType().GetProperty("Result")!;
        var result = resultProp.GetValue(task);
        Assert.Null(result);
    }

    private static object CreateDialog(object row)
    {
        var openFor = EditorType!.GetMethod("OpenFor", BindingFlags.Public | BindingFlags.Static)!;
        return openFor.Invoke(null, new object[] { Guid.NewGuid().ToString(), row, new NullLogger() })!;
    }
}
