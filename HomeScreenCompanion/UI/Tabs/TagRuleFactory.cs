using System;
using System.Collections.Generic;
using System.Linq;

namespace HomeScreenCompanion.UI.Tabs
{
    /// <summary>
    /// Pure helpers that build a fresh <see cref="TagConfig"/> for a given
    /// source type, name-colliding against the existing list of tags so the
    /// generated name is always unique.
    /// </summary>
    internal static class TagRuleFactory
    {
        public static TagConfig CreateBlank(IEnumerable<TagConfig> existing, string sourceType)
        {
            var taken = existing?.Select(t => t.Name).ToHashSet(StringComparer.OrdinalIgnoreCase)
                ?? new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            var n = 1;
            string name;
            do
            {
                name = sourceType + "-Tag-" + n;
                n++;
            } while (taken.Contains(name));

            return new TagConfig
            {
                Active = true,
                Name = name,
                Tag = name,
                SourceType = sourceType,
                Limit = 50,
                EnableTag = true,
            };
        }
    }
}
