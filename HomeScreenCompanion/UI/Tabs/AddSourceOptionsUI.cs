using System.Collections.Generic;
using System.ComponentModel;
using Emby.Web.GenericEdit;
using Emby.Web.GenericEdit.Common;
using MediaBrowser.Model.Attributes;

namespace HomeScreenCompanion.UI.Tabs
{
    /// <summary>
    /// Backing model for <c>AddSourceDialog</c>. Mirrors the old
    /// "Add new source" flow — pick a source type, the parent creates
    /// a fresh <see cref="TagConfig"/> with that type and opens the
    /// full edit dialog.
    /// </summary>
    public sealed class AddSourceOptionsUI : EditableOptionsBase
    {
        public override string EditorTitle => "Add tag rule";

        public override string EditorDescription =>
            "Pick a source type for the new tag rule.";

        [DisplayName("Source type")]
        [SelectItemsSource(nameof(SourceTypes))]
        public string SourceType { get; set; } = "External";

        [Browsable(false)]
        public List<EditorSelectOption> SourceTypes { get; } = new List<EditorSelectOption>
        {
            new EditorSelectOption("External", "External — URL or local library item list") { IsEnabled = true },
            new EditorSelectOption("MediaInfo", "MediaInfo — filter by metadata (genre/year/...)") { IsEnabled = true },
            new EditorSelectOption("AI", "AI — ask an LLM for recommendations") { IsEnabled = true },
            new EditorSelectOption("Playlist", "Playlist — sync items from an existing Emby playlist") { IsEnabled = true },
            new EditorSelectOption("Collection", "Collection — sync items from an existing box set") { IsEnabled = true },
        };
    }
}
