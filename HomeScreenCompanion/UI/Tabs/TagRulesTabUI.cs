using System.Collections.Generic;
using System.ComponentModel;
using Emby.Web.GenericEdit;
using Emby.Web.GenericEdit.Common;
using Emby.Web.GenericEdit.Elements;
using Emby.Web.GenericEdit.Elements.List;
using MediaBrowser.Model.Attributes;

namespace HomeScreenCompanion.UI.Tabs
{
    /// <summary>
    /// Tag &amp; Collection tab — the work surface. Shows the list of
    /// configured tag rules as <see cref="GenericListItem"/> rows
    /// (each backed by a <see cref="TagConfig"/>) and exposes the
    /// "+ Add new source" button that opens the
    /// <c>AddSourceDialog</c>. Click a row to open the full
    /// <c>TagRowEditDialog</c>.
    /// </summary>
    public sealed class TagRulesTabUI : EditableOptionsBase
    {
        public override string EditorTitle => "Tag & collection sources";

        public override string EditorDescription =>
            "Add and edit tag rules that drive tags, collections, home sections and playlists.";

        public CaptionItem Caption { get; set; } = new CaptionItem("Tag rules");

        [DisplayName("Filter source type")]
        [Description("Limit the list to rules of a specific source type.")]
        [SelectItemsSource(nameof(SourceTypeFilterOptions))]
        public string FilterSourceType { get; set; } = "All";

        [Browsable(false)]
        public List<EditorSelectOption> SourceTypeFilterOptions { get; } = new List<EditorSelectOption>
        {
            new EditorSelectOption("All", "All source types") { IsEnabled = true },
            new EditorSelectOption("External", "External") { IsEnabled = true },
            new EditorSelectOption("MediaInfo", "MediaInfo") { IsEnabled = true },
            new EditorSelectOption("AI", "AI") { IsEnabled = true },
            new EditorSelectOption("Playlist", "Playlist") { IsEnabled = true },
            new EditorSelectOption("Collection", "Collection") { IsEnabled = true },
        };

        public ButtonItem AddSourceButton { get; set; } = new ButtonItem("+ Add new source")
        {
            Icon = IconNames.add_circle,
            Data1 = AddSourceCommand
        };

        [Browsable(false)]
        public GenericItemList Rules { get; set; } = new GenericItemList();

        internal const string AddSourceCommand = "AddSource";
    }
}
