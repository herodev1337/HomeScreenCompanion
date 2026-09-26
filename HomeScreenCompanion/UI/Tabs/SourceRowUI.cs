using System.ComponentModel;
using Emby.Web.GenericEdit;

namespace HomeScreenCompanion.UI.Tabs
{
    /// <summary>
    /// Single external source row inside a <see cref="TagRuleEditUI"/>'s
    /// Sources collection. Mirrors the legacy <c>urls[]</c> /
    /// <c>local[]</c> arrays from the old configPage.html but as a
    /// strongly-typed SDK row.
    /// </summary>
    public sealed class SourceRowUI : EditableObjectBase
    {
        public override string EditorTitle => "";

        [DisplayName("Kind")]
        [Description("URL points to a remote list; Local references a library item by id.")]
        public string Kind { get; set; } = "Url";

        [DisplayName("Value")]
        [Description("The URL or library item id.")]
        public string Value { get; set; } = "";
    }
}
