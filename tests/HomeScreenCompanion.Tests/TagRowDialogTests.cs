using System;
using System.Linq;
using System.Reflection;
using System.Threading.Tasks;
using HomeScreenCompanion.UI;
using HomeScreenCompanion.UI.Tabs;
using MediaBrowser.Model.Logging;
using Xunit;

namespace HomeScreenCompanion.Tests;

/// <summary>
/// Audit-plan v2 / Wave 1 / U4 + Wave 2 / U11: shape tests for the
/// tag-rule editor. Verifies the existing
/// <see cref="TagConfigRow"/> model, the dialog under its new
/// <c>HomeScreenCompanion.UI.Tabs</c> location, and the
/// <see cref="TagRuleEditUI"/> model.
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
        Assert.Equal("HomeScreenCompanion.UIBaseClasses.Views.PluginDialogView",
            typeof(TagRowEditDialog).BaseType?.FullName);
    }

    [Fact]
    public void TagRowEditDialog_Ctor_Takes_TagConfig()
    {
        var ctor = typeof(TagRowEditDialog).GetConstructor(
            new[] { typeof(string), typeof(TagConfig), typeof(ILogger) });
        Assert.NotNull(ctor);
    }

    [Fact]
    public void TagRowEditDialog_Sets_ContentData_To_TagRuleEditUI()
    {
        var config = new TagConfig { Name = "T1", Tag = "tag1", SourceType = "External" };
        var dialog = new TagRowEditDialog(Guid.NewGuid().ToString(), config, new NullLogger());

        var contentDataProp = typeof(TagRowEditDialog).BaseType!.BaseType!
            .GetProperty("ContentData", BindingFlags.Public | BindingFlags.Instance)!;
        var contentData = contentDataProp.GetValue(dialog);
        Assert.NotNull(contentData);
        Assert.IsType<TagRuleEditUI>(contentData);
    }

    [Fact]
    public async Task TagRowEditDialog_RunCommand_OpenLogs_Returns_A_Different_View()
    {
        var config = new TagConfig { Name = "T2", Tag = "tag2", SourceType = "External" };
        var dialog = new TagRowEditDialog(Guid.NewGuid().ToString(), config, new NullLogger());

        var runCommand = typeof(TagRowEditDialog).GetMethod("RunCommand")!;
        var task = (Task)runCommand.Invoke(dialog, new object?[] { "row1", "OpenLogs", null })!;
        await task;

        var resultProp = task.GetType().GetProperty("Result")!;
        var result = resultProp.GetValue(task);
        Assert.NotNull(result);
        Assert.NotSame(dialog, result);
    }

    [Fact]
    public async Task TagRowEditDialog_RunCommand_Unknown_Command_Returns_Null()
    {
        var config = new TagConfig { Name = "T3", Tag = "tag3", SourceType = "External" };
        var dialog = new TagRowEditDialog(Guid.NewGuid().ToString(), config, new NullLogger());

        var runCommand = typeof(TagRowEditDialog).GetMethod("RunCommand")!;
        var task = (Task)runCommand.Invoke(dialog, new object?[] { "row1", "Refresh", null })!;
        await task;

        var resultProp = task.GetType().GetProperty("Result")!;
        var result = resultProp.GetValue(task);
        Assert.Null(result);
    }
}
