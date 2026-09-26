using System;
using System.ComponentModel;
using Emby.Web.GenericEdit;

namespace HomeScreenCompanion.UI.Tabs
{
    /// <summary>
    /// Single date interval inside a tag rule's schedule. Mirrors the
    /// legacy <c>DateInterval</c> on <see cref="TagConfig"/>. The
    /// "Type" discriminator picks between SpecificDate / Recurring /
    /// WeekDays.
    /// </summary>
    public sealed class DateIntervalUI : EditableObjectBase
    {
        public override string EditorTitle => "";

        [DisplayName("Type")]
        [Description("SpecificDate: one-shot on [Start, End]. Recurring: yearly. WeekDays: every Nth weekday.")]
        public string Type { get; set; } = "SpecificDate";

        [DisplayName("Start")]
        public DateTime? Start { get; set; }

        [DisplayName("End")]
        public DateTime? End { get; set; }

        [DisplayName("Day of week")]
        [Description("Used only when Type = WeekDays.")]
        public string DayOfWeek { get; set; } = "Friday";
    }
}
