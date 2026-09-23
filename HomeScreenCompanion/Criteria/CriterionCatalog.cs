using System;
using System.Collections.Generic;
using System.Linq;

namespace HomeScreenCompanion.Criteria
{
    /// <summary>
    /// Classification of a media-info criterion with respect to how it is
    /// resolved:
    ///
    /// <list type="bullet">
    /// <item><description>
    ///   <see cref="GlobalOnly"/> — evaluated during the global library scan
    ///   (tag / collection / playlist matching). Never depends on "who is viewing".
    /// </description></item>
    /// <item><description>
    ///   <see cref="ViewerScoped"/> — depends on the viewing user and therefore
    ///   can never be evaluated by the global scan. Resolved per user by Emby
    ///   through a native home-section query filter (IsPlayed / IsResumable).
    /// </description></item>
    /// <item><description>
    ///   <see cref="StaticQueryable"/> — static (no user data) AND expressible
    ///   as a native section query (e.g. <c>MediaType:Series</c> →
    ///   <c>IncludeItemTypes=[Series]</c>). Evaluated globally too, but a group
    ///   consisting only of ViewerScoped + StaticQueryable criteria needs no
    ///   global tag output at all.
    /// </description></item>
    /// </list>
    /// </summary>
    internal enum CriterionClass
    {
        GlobalOnly,
        ViewerScoped,
        StaticQueryable
    }

    /// <summary>
    /// A criterion string parsed into its structural parts. Criterion strings
    /// come in these shapes (all optionally prefixed with <c>!</c> to negate):
    /// <code>
    ///   &lt;Shorthand&gt;                       e.g. InProgress, 4K
    ///   &lt;Prop&gt;:&lt;Val&gt;                 e.g. MediaType:Series, Studio:Marvel
    ///   &lt;Prop&gt;:&lt;Op&gt;:&lt;Val&gt;       e.g. Year:&gt;=:1990, Title:contains:Star
    ///   &lt;Prop&gt;:&lt;User&gt;:&lt;Op&gt;:&lt;Val&gt;  e.g. IsPlayed:__current__:=:Watched
    ///   Collection:&lt;Name&gt; / Playlist:&lt;Name&gt;  (names may contain ':')
    /// </code>
    /// </summary>
    internal readonly struct ParsedCriterion
    {
        public readonly bool Negated;
        /// <summary>Canonical property name, or the shorthand token itself.</summary>
        public readonly string Prop;
        public readonly string Op;
        public readonly string Val;
        /// <summary>"" unless the 4-part form was used: "__current__", "__any__", "__all__" or a user Guid.</summary>
        public readonly string UserScope;

        public ParsedCriterion(bool negated, string prop, string op, string val, string userScope)
        {
            Negated = negated;
            Prop = prop ?? "";
            Op = op ?? "";
            Val = val ?? "";
            UserScope = userScope ?? "";
        }
    }

    /// <summary>
    /// Single source of truth for criterion semantics. Every place in the
    /// plugin that needs to know WHAT a criterion means (global scan,
    /// viewer-only group detection, home-section query translation) goes
    /// through this catalog instead of re-parsing the string ad hoc.
    ///
    /// To add a new criterion property in the future:
    ///   1. teach <see cref="Parse"/> about its shape if it isn't already
    ///      covered (usually it is),
    ///   2. add a classification rule in <see cref="Classify"/>,
    ///   3. add a translation rule in <see cref="ApplySectionQuery"/> if the
    ///      property maps onto a native ItemsQuery filter.
    /// Nothing else needs to change — the call sites all flow through here.
    /// </summary>
    internal static class CriterionCatalog
    {
        public static ParsedCriterion Parse(string? raw)
        {
            if (string.IsNullOrEmpty(raw))
                return new ParsedCriterion(false, "", "", "", "");

            bool negated = raw![0] == '!';
            var c = negated ? raw.Substring(1) : raw;

            // Collection / Playlist names may legitimately contain ':'
            if (c.StartsWith("Collection:", StringComparison.OrdinalIgnoreCase) ||
                c.StartsWith("Playlist:", StringComparison.OrdinalIgnoreCase))
            {
                int ci = c.IndexOf(':');
                return new ParsedCriterion(negated, c.Substring(0, ci), "", c.Substring(ci + 1).Trim(), "");
            }

            var parts = c.Split(':');
            switch (parts.Length)
            {
                case 1:
                    return new ParsedCriterion(negated, parts[0], "", "", "");
                case 2:
                    return new ParsedCriterion(negated, parts[0], "", parts[1].Trim(), "");
                case 3:
                    // "Title:contains:x" / "Title:exact:x" (text match) or "Year:>=:1990" (numeric)
                    if (string.Equals(parts[1], "contains", StringComparison.OrdinalIgnoreCase) ||
                        string.Equals(parts[1], "exact", StringComparison.OrdinalIgnoreCase))
                        return new ParsedCriterion(negated, parts[0], parts[1], parts[2].Trim(), "");
                    return new ParsedCriterion(negated, parts[0], parts[1], parts[2].Trim(), "");
                default:
                    // 4+ parts: Prop:UserScope:Op:Val (extra colons in Val are rejoined)
                    return new ParsedCriterion(negated, parts[0], parts[2], string.Join(":", parts.Skip(3)).Trim(), parts[1]);
            }
        }

        /// <summary>Classify a parsed criterion (see <see cref="CriterionClass"/>).</summary>
        public static CriterionClass Classify(ParsedCriterion c)
        {
            if (string.IsNullOrEmpty(c.Prop)) return CriterionClass.GlobalOnly;

            // InProgress — the "started, not finished by the viewing user" shorthand.
            if (string.Equals(c.Prop, "InProgress", StringComparison.OrdinalIgnoreCase) &&
                c.UserScope.Length == 0 && c.Op.Length == 0)
                return CriterionClass.ViewerScoped;

            // IsPlayed scoped to the viewing user. Other scopes (any/all/named)
            // are resolvable by the global scan and stay global.
            if (string.Equals(c.Prop, "IsPlayed", StringComparison.OrdinalIgnoreCase) &&
                string.Equals(c.UserScope, "__current__", StringComparison.OrdinalIgnoreCase))
                return CriterionClass.ViewerScoped;

            // MediaType is static and maps onto IncludeItemTypes. A negated
            // MediaType ("everything but X") has no clean native equivalent,
            // so it stays global-only.
            if (string.Equals(c.Prop, "MediaType", StringComparison.OrdinalIgnoreCase) &&
                c.UserScope.Length == 0)
                return c.Negated ? CriterionClass.GlobalOnly : CriterionClass.StaticQueryable;

            return CriterionClass.GlobalOnly;
        }

        /// <summary>
        /// True when a single criterion is viewer-scoped (same contract as the
        /// legacy <c>IsViewerDependentCriterion</c> — kept for call sites that
        /// reason about individual criteria).
        /// </summary>
        public static bool IsViewerScoped(string? cond) =>
            Classify(Parse(cond)) == CriterionClass.ViewerScoped;

        /// <summary>
        /// True when the whole group can be expressed as a native per-viewer
        /// home-section query: it contains at least one viewer-scoped criterion
        /// and every other criterion is either viewer-scoped or static-queryable.
        /// Such groups produce no global tag/collection/playlist output — the
        /// section query below does all the work.
        /// </summary>
        public static bool IsViewerOnlyGroup(IEnumerable<string>? criteria)
        {
            var parsed = (criteria ?? Enumerable.Empty<string>())
                .Select(Parse)
                .Where(p => p.Prop.Length > 0)
                .ToList();
            if (parsed.Count == 0) return false;
            if (!parsed.Any(p => Classify(p) == CriterionClass.ViewerScoped)) return false;
            return parsed.All(p => Classify(p) != CriterionClass.GlobalOnly);
        }

        /// <summary>
        /// Translates criteria into the plugin's native section-query keys
        /// (<c>_queryIsPlayed</c>, <c>_queryIsResumable</c>,
        /// <c>_queryIncludeItemTypes</c>, <c>_queryEnsureItemTypes</c>) that
        /// <c>BuildContentSection</c> materializes onto the saved home section.
        ///
        /// Viewer-scoped criteria are always translated. Static-queryable
        /// criteria (MediaType) are translated ONLY when the group as a whole
        /// is viewer-only (a pure section query) — in mixed groups the global
        /// tag already carries the constraint and re-encoding it as
        /// IncludeItemTypes would break scan patterns like
        /// <c>MediaType:EpisodeIncludeSeries</c> (tag goes on the parent
        /// Series; the section must keep showing Series, not Episodes).
        ///
        /// Special rule: Emby tracks playback position on Episodes, never on
        /// Series items. A group combining <c>InProgress</c> (IsResumable)
        /// with <c>MediaType:Series</c> is therefore pivoted to Episodes —
        /// "series currently in progress" is expressed as in-progress
        /// Episodes, exactly like the native Continue Watching row.
        /// </summary>
        public static void ApplySectionQuery(IEnumerable<string>? criteria, Dictionary<string, string> settings)
        {
            var list = (criteria ?? Enumerable.Empty<string>()).ToList();
            // Pre-computed once; decides whether static MediaType constraints
            // are safe to re-encode as IncludeItemTypes.
            bool viewerOnly = IsViewerOnlyGroup(list);

            bool resumable = false;
            var itemTypes = new List<string>();

            foreach (var raw in list)
            {
                var c = Parse(raw);
                if (c.Prop.Length == 0) continue;

                switch (Classify(c))
                {
                    case CriterionClass.ViewerScoped when string.Equals(c.Prop, "InProgress", StringComparison.OrdinalIgnoreCase):
                        settings["_queryIsResumable"] = c.Negated ? "false" : "true";
                        if (!c.Negated) resumable = true;
                        break;

                    case CriterionClass.ViewerScoped when string.Equals(c.Prop, "IsPlayed", StringComparison.OrdinalIgnoreCase):
                        bool watched = string.Equals(c.Val, "Watched", StringComparison.OrdinalIgnoreCase);
                        settings["_queryIsPlayed"] = (watched != c.Negated) ? "true" : "false";
                        break;

                    case CriterionClass.StaticQueryable when viewerOnly && string.Equals(c.Prop, "MediaType", StringComparison.OrdinalIgnoreCase):
                        // "EpisodeIncludeSeries" is a scan pseudo-type; its native
                        // section-query equivalent is plain Episode.
                        var v = string.Equals(c.Val, "EpisodeIncludeSeries", StringComparison.OrdinalIgnoreCase)
                            ? "Episode"
                            : c.Val;
                        if (!string.IsNullOrWhiteSpace(v) && !itemTypes.Contains(v, StringComparer.OrdinalIgnoreCase))
                            itemTypes.Add(v);
                        break;
                }
            }

            if (resumable && viewerOnly)
            {
                // "Series in progress" ⇒ in-progress Episodes (Series items have no playback position).
                // Only valid for pure section-query groups: in mixed groups the tag carries the
                // static constraints and pivoting would fight it.
                bool hasSeries = itemTypes.Any(t => string.Equals(t, "Series", StringComparison.OrdinalIgnoreCase));
                bool hasEpisode = itemTypes.Any(t => string.Equals(t, "Episode", StringComparison.OrdinalIgnoreCase));
                if (hasSeries && !hasEpisode)
                {
                    itemTypes.RemoveAll(t => string.Equals(t, "Series", StringComparison.OrdinalIgnoreCase));
                    itemTypes.Add("Episode");
                }
                else if (itemTypes.Count == 0)
                {
                    // No explicit MediaType: pure "In Progress" — surface series-as-Episodes
                    // by widening the section's item types, UNLESS the section explicitly
                    // constrains its ItemTypes away from Series (the user's own choice wins).
                    bool sectionWantsSeries =
                        !settings.TryGetValue("ItemTypes", out var _savedItemTypes) ||
                        string.IsNullOrWhiteSpace(_savedItemTypes) ||
                        _savedItemTypes.IndexOf("Series", StringComparison.OrdinalIgnoreCase) >= 0;
                    if (sectionWantsSeries)
                        settings["_queryEnsureItemTypes"] = "Episode";
                }
            }

            if (itemTypes.Count > 0)
                settings["_queryIncludeItemTypes"] = string.Join(",", itemTypes);
        }
    }
}
