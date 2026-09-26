using System.Globalization;

namespace HomeScreenCompanion
{
    /// <summary>
    /// Small parsing helpers that must always be culture-invariant.
    /// <para>
    /// Settings JSON is written / read by the same plugin, so a host that happens to
    /// run under a comma-decimal locale (e.g. <c>de-DE</c>) must still be able to
    /// read numbers we wrote with a period — otherwise saved numeric settings can
    /// silently round to zero on the next server restart.
    /// </para>
    /// </summary>
    internal static class ParseHelpers
    {
        public static bool TryParseDouble(string? raw, out double value)
        {
            value = 0.0;
            if (string.IsNullOrEmpty(raw)) return false;
            return double.TryParse(raw, NumberStyles.Float, CultureInfo.InvariantCulture, out value);
        }
    }
}
