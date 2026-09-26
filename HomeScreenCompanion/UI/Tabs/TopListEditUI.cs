using System.ComponentModel;
using Emby.Web.GenericEdit;
using Emby.Web.GenericEdit.Elements;
using MediaBrowser.Model.Attributes;

namespace HomeScreenCompanion.UI.Tabs
{
    /// <summary>
    /// Backing model for the inline TopList edit dialog. Mirrors the
    /// scalar surface of <see cref="TopListHomeSection"/>.
    /// </summary>
    public sealed class TopListEditUI : EditableOptionsBase
    {
        public override string EditorTitle => "Top list";

        public override string EditorDescription =>
            "Configure the home-section that this top list drives.";

        [DisplayName("Tag name")]
        [Description("Folder name for this top list. Must be unique.")]
        public string TagName { get; set; } = "";

        [DisplayName("Max items")]
        [Description("Maximum number of items shown. 0 = no limit.")]
        public int MaxItems { get; set; } = 50;

        [DisplayName("Library id")]
        [Description("Library this section belongs to. \"auto\" picks the first matching library.")]
        public string LibraryId { get; set; } = "auto";

        [DisplayName("User ids")]
        [Description("One user id per line. Empty = all users with home sections enabled.")]
        [EditMultiline(4)]
        public string UserIds { get; set; } = "";

        [DisplayName("Settings (JSON)")]
        [Description("Free-form JSON settings for the home section (badge style, display mode, etc.).")]
        [EditMultiline(4)]
        public string SettingsJson { get; set; } = "{}";
    }
}
