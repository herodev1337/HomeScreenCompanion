using System;
using System.Linq;
using System.Reflection;
using System.Threading.Tasks;
using HomeScreenCompanion.UI;
using MediaBrowser.Model.Logging;
using Xunit;

namespace HomeScreenCompanion.Tests;

/// <summary>
/// Audit-plan v2 / Wave 1 / U4: shape tests for
/// <see cref="TagConfigRow"/> + the per-row edit dialog + the
/// editor factory. Typed surface.
/// </summary>
public sealed class TagRowDialogTests
{
    [Fact]
    public void TagConfigRow_Extends_EditableOptionsBase()
    {
        Assert.Equal("Emby.Web.GenericEdit.EditableOptionsBase", typeof(TagConfigRow).BaseType?.FullName);
    }

    [Fact]
    public void TagConfigRow_Has_Gating_Fields_For_Collection()
    {
        Assert.Contains(typeof(TagConfigRow).GetProperties(BindingFlags.Public | BindingFlags.Instance),
            p => p.Name == "EnableCollection" && p.PropertyType == typeof(bool));

        var collName = typeof(TagConfigRow).GetProperty("CollectionName", BindingFlags.Public | BindingFlags.Instance);
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
        var instance = new TagConfigRow();

        var runItem = typeof(TagConfigRow).GetProperty("RunButton", BindingFlags.Public | BindingFlags.Instance)!
            .GetValue(instance)!;
        var data1 = (string)runItem.GetType()
            .GetProperty("Data1", BindingFlags.Public | BindingFlags.Instance)!
            .GetValue(runItem)!;
        Assert.Equal("RunTag", data1);

        var logsItem = typeof(TagConfigRow).GetProperty("OpenLogsButton", BindingFlags.Public | BindingFlags.Instance)!
            .GetValue(instance)!;
        var data2 = (string)logsItem.GetType()
            .GetProperty("Data1", BindingFlags.Public | BindingFlags.Instance)!
            .GetValue(logsItem)!;
        Assert.Equal("OpenLogs", data2);
    }

    [Fact]
    public void TagRowEditDialog_Extends_PluginDialogView()
    {
        Assert.Equal("HomeScreenCompanion.UIBaseClasses.Views.PluginDialogView", typeof(TagRowEditDialog).BaseType?.FullName);
    }

    [Fact]
    public void TagRowEditor_OpenFor_Returns_Dialog_With_Row_As_ContentData()
    {
        var row = new TagConfigRow();
        var dialog = TagRowEditor.OpenFor(Guid.NewGuid().ToString(), row, new NullLogger());
        Assert.NotNull(dialog);

        var contentDataProp = typeof(TagRowEditDialog).BaseType!.BaseType!
            .GetProperty("ContentData", BindingFlags.Public | BindingFlags.Instance)!;
        Assert.Same(row, contentDataProp.GetValue(dialog));
    }

    [Fact]
    public async Task TagRowEditDialog_RunCommand_OpenLogs_Returns_A_Different_View()
    {
        var row = new TagConfigRow();
        var dialog = TagRowEditor.OpenFor(Guid.NewGuid().ToString(), row, new NullLogger());

        var openLogs = typeof(TagRowEditDialog).GetMethod("RunCommand")!;
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
        var row = new TagConfigRow();
        var dialog = TagRowEditor.OpenFor(Guid.NewGuid().ToString(), row, new NullLogger());

        var openLogs = typeof(TagRowEditDialog).GetMethod("RunCommand")!;
        var task = (Task)openLogs.Invoke(dialog, new object?[] { "row1", "Refresh", null })!;
        await task;

        var resultProp = task.GetType().GetProperty("Result")!;
        var result = resultProp.GetValue(task);
        Assert.Null(result);
    }
}
