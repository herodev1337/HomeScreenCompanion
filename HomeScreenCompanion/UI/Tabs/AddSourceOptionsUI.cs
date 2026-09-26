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
        public IEnumerable<EditorSelectOption> SourceTypes { get; } = new[]
        {
            new EditorSelectOption { Value = "External", Name = "External — URL or local library item list" },
            new EditorSelectOption { Value = "MediaInfo", Name = "MediaInfo — filter by metadata (genre/year/...)" },
            new EditorSelectOption { Value = "AI", Name = "AI — ask an LLM for recommendations" },
            new EditorSelectOption { Value = "Playlist", Name = "Playlist — sync items from an existing Emby playlist" },
            new EditorSelectOption { Value = "Collection", Name = "Collection — sync items from an existing box set" },
        };
    }
}
