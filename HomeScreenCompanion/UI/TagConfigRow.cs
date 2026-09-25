using Emby.Web.GenericEdit;

namespace HomeScreenCompanion.UI
{
    /// <summary>
    /// Forward-declared row type for the Tags editor grid.
    ///
    /// Audit-plan v2: T6 lifts <c>PluginConfiguration.TagConfig</c> into a
    /// DTO-shaped <see cref="EditableOptionsBase"/>-derived model and adds
    /// the per-row columns needed for the U4 edit dialog. Until then this
    /// placeholder gives the <see cref="EditorDxGrid"/> in
    /// <see cref="MainPageUI.Tags"/> a concrete row type to bind against.
    /// </summary>
    public class TagConfigRow : EditableOptionsBase
    {
        public override string EditorTitle => "Tag rule";

        public string Name { get; set; } = "";

        public string Tag { get; set; } = "";

        public bool Enabled { get; set; } = true;

        public string Source { get; set; } = "External";
    }
}
