using System.Collections.Generic;
using System.ComponentModel;
using Emby.Web.GenericEdit;
using MediaBrowser.Model.Attributes;

namespace HomeScreenCompanion.UI.Tabs
{
    /// <summary>
    /// One MediaInfo filter group inside a tag rule. Mirrors the legacy
    /// <see cref="MediaInfoFilter"/>: an Operator (AND/OR) joining a
    /// list of Criteria strings, plus a GroupOperator for combining
    /// with neighbouring groups.
    /// </summary>
    public sealed class MediaInfoGroupUI : EditableObjectBase
    {
        public override string EditorTitle => "";

        [DisplayName("Operator")]
        [Description("How to combine the criteria in this group (AND / OR).")]
        public string Operator { get; set; } = "AND";

        [DisplayName("Criteria")]
        [Description("One criterion per line. e.g. Genre=Action or Year>=2010.")]
        [EditMultiline(4)]
        public string Criteria { get; set; } = "";

        [DisplayName("Group operator")]
        [Description("How to combine this group with the next one (AND / OR).")]
        public string GroupOperator { get; set; } = "AND";
    }
}
