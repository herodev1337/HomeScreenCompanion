using MediaBrowser.Controller.Entities.Movies;
using MediaBrowser.Controller.Entities.TV;
using System;

namespace HomeScreenCompanion
{
    /// <summary>
    /// Typed <see cref="BaseItem"/> predicates that replace the legacy
    /// <c>item.GetType().Name.Contains("Series"|"Movie"|"Episode")</c>
    /// string-sniff pattern. The string-sniff form is fragile (any user
    /// type whose name happens to contain "Series" matches), and it breaks
    /// if Emby ever moves the types into a namespace that changes the
    /// reflected name. These helpers are <c>IsAssignableFrom</c>-based so
    /// they correctly handle subclasses and derived types too.
    /// </summary>
    internal static class TypeSniffing
    {
        public static bool IsSeriesLike(Type t)
        {
            if (t == null) return false;
            return typeof(Series).IsAssignableFrom(t);
        }

        public static bool IsMovieLike(Type t)
        {
            if (t == null) return false;
            return typeof(Movie).IsAssignableFrom(t);
        }

        public static bool IsEpisodeLike(Type t)
        {
            if (t == null) return false;
            return typeof(Episode).IsAssignableFrom(t);
        }
    }
}
