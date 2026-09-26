using System;
using MediaBrowser.Controller.Entities.Movies;
using MediaBrowser.Controller.Entities.TV;
using Xunit;

namespace HomeScreenCompanion.Tests;

/// <summary>
/// E2a — type-sniffing helper regressions: <see cref="HomeScreenCompanion.TypeSniffing"/>
/// uses <c>IsAssignableFrom</c> so it correctly classifies the Emby entity hierarchy.
/// </summary>
public class TypeSniffingTests
{
    [Fact]
    public void IsSeriesLike_ReturnsTrueForSeries()
    {
        Assert.True(TypeSniffing.IsSeriesLike(typeof(Series)));
    }

    [Fact]
    public void IsMovieLike_ReturnsTrueForMovie()
    {
        Assert.True(TypeSniffing.IsMovieLike(typeof(Movie)));
    }

    [Fact]
    public void IsEpisodeLike_ReturnsTrueForEpisode()
    {
        Assert.True(TypeSniffing.IsEpisodeLike(typeof(Episode)));
    }

    [Fact]
    public void IsSeriesLike_ReturnsFalseForMovieAndEpisode()
    {
        Assert.False(TypeSniffing.IsSeriesLike(typeof(Movie)));
        Assert.False(TypeSniffing.IsSeriesLike(typeof(Episode)));
    }

    [Fact]
    public void IsMovieLike_ReturnsFalseForSeriesAndEpisode()
    {
        Assert.False(TypeSniffing.IsMovieLike(typeof(Series)));
        Assert.False(TypeSniffing.IsMovieLike(typeof(Episode)));
    }

    [Fact]
    public void IsEpisodeLike_ReturnsFalseForSeriesAndMovie()
    {
        Assert.False(TypeSniffing.IsEpisodeLike(typeof(Series)));
        Assert.False(TypeSniffing.IsEpisodeLike(typeof(Movie)));
    }

    [Fact]
    public void Helpers_ReturnFalseForNullType()
    {
        Assert.False(TypeSniffing.IsSeriesLike(null!));
        Assert.False(TypeSniffing.IsMovieLike(null!));
        Assert.False(TypeSniffing.IsEpisodeLike(null!));
    }

    [Fact]
    public void Helpers_ReturnFalseForUnrelatedType()
    {
        Assert.False(TypeSniffing.IsSeriesLike(typeof(string)));
        Assert.False(TypeSniffing.IsMovieLike(typeof(int)));
        Assert.False(TypeSniffing.IsEpisodeLike(typeof(System.IO.Stream)));
    }
}
