using System.Collections.Generic;
using System.ComponentModel;
using Emby.Web.GenericEdit;
using Emby.Web.GenericEdit.Editors;
using Emby.Web.GenericEdit.Elements;
using Emby.Web.GenericEdit.Elements.DxGrid;
using Emby.Web.GenericEdit.Validation;
using MediaBrowser.Model.Attributes;
using MediaBrowser.Model.Logging;

namespace HomeScreenCompanion.Spike
{
    /// <summary>
    /// Minimal <see cref="EditableOptionsBase"/> subclass that exercises the SDK UI
    /// element catalog we plan to depend on for the HSC config rewrite.
    /// </summary>
    public class SpikePageUI : EditableOptionsBase
    {
        public override string EditorTitle => "HSC SDK-UI spike";
        public override string EditorDescription => "Verifies Emby 4.10 GenericEdit wiring.";

        [DisplayName("Output Folder")]
        [Description("Where the spike writes its artefacts")]
        [EditFolderPicker]
        public string? OutputFolder { get; set; }

        [Description("Log severity for the spike")]
        public LogSeverity LogLevel { get; set; }

        [Description("Must be at least 10 characters")]
        [Required]
        public string? MessageFormat { get; set; }

        public SpacerItem Spacer1 { get; set; } = new SpacerItem();
        public CaptionItem SectionCaption { get; set; } = new CaptionItem("Status demo");
        public StatusItem StatusDemo { get; set; } = new StatusItem("Status", "Spike idle", ItemStatus.Unavailable);
        public ButtonItem RunButton { get; set; } = new ButtonItem("Run spike action")
        {
            Icon = IconNames.run_circle,
            Data1 = "RunSpike",
        };

        public EditorDxGrid TagRows { get; set; } = new EditorDxGrid
        {
            DisplayName = "Tag rows",
            Description = "Drag-reorder grid for tag configs (mirrors current ClientApp rows/setupRowEvents.ts).",
        };

        protected override void Validate(ValidationContext context)
        {
            if (string.IsNullOrEmpty(this.MessageFormat) || this.MessageFormat.Length < 10)
            {
                context.AddValidationError(nameof(this.MessageFormat), "Minimum length is 10 characters");
            }
        }
    }

    /// <summary>
    /// One row in the tag grid. Mirrors the data shape of the current
    /// <c>TagConfig</c> in <c>PluginConfiguration.cs</c> minus the heavy fields.
    /// </summary>
    public class SpikeTagRow
    {
        public string Name { get; set; } = "";
        public string Tag { get; set; } = "";
        public bool Enabled { get; set; }
        public string Source { get; set; } = "";
        public string Collection { get; set; } = "";
    }
}