using System;
using System.IO;
using System.Linq;

namespace HomeScreenCompanion
{
    /// <summary>
    /// One canonical sanitizer for filesystem-folder names derived from user
    /// input (top-list folders, collection names, etc.). Returns "unknown" for
    /// inputs that collapse to nothing after stripping invalid chars + dots.
    /// </summary>
    internal static class FolderNames
    {
        private static readonly char[] InvalidChars = Path.GetInvalidFileNameChars();

        internal static string Sanitize(string name)
        {
            var safe = new string((name ?? "unknown")
                .Select(c => Array.IndexOf(InvalidChars, c) >= 0 ? '_' : c)
                .ToArray())
                .Trim('.');
            return string.IsNullOrWhiteSpace(safe) ? "unknown" : safe;
        }
    }
}
