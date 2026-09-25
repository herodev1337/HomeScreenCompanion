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
    private static bool Invoke(string method, params Type[] argTypes)
    {
        HscAssembly.EnsureAvailable();
        var t = HscAssembly.FindType("HomeScreenCompanion.TypeSniffing")!;
        var m = t.GetMethod(method, argTypes)
            ?? throw new MissingMethodException("HomeScreenCompanion.TypeSniffing", method);
        return (bool)m.Invoke(null, new object?[] { typeof(Series) })!;
    }

    private static bool Call(string method, Type t)
    {
        HscAssembly.EnsureAvailable();
        var type = HscAssembly.FindType("HomeScreenCompanion.TypeSniffing")!;
        var m = type.GetMethod(method, new[] { typeof(Type) })
            ?? throw new MissingMethodException("HomeScreenCompanion.TypeSniffing", method);
        return (bool)m.Invoke(null, new object?[] { t })!;
    }

    [Fact]
    public void IsSeriesLike_ReturnsTrueForSeries()
    {
        Assert.True(Call("IsSeriesLike", typeof(Series)));
    }

    [Fact]
    public void IsMovieLike_ReturnsTrueForMovie()
    {
        Assert.True(Call("IsMovieLike", typeof(Movie)));
    }

    [Fact]
    public void IsEpisodeLike_ReturnsTrueForEpisode()
    {
        Assert.True(Call("IsEpisodeLike", typeof(Episode)));
    }

    [Fact]
    public void IsSeriesLike_ReturnsFalseForMovieAndEpisode()
    {
        Assert.False(Call("IsSeriesLike", typeof(Movie)));
        Assert.False(Call("IsSeriesLike", typeof(Episode)));
    }

    [Fact]
    public void IsMovieLike_ReturnsFalseForSeriesAndEpisode()
    {
        Assert.False(Call("IsMovieLike", typeof(Series)));
        Assert.False(Call("IsMovieLike", typeof(Episode)));
    }

    [Fact]
    public void IsEpisodeLike_ReturnsFalseForSeriesAndMovie()
    {
        Assert.False(Call("IsEpisodeLike", typeof(Series)));
        Assert.False(Call("IsEpisodeLike", typeof(Movie)));
    }

    [Fact]
    public void Helpers_ReturnFalseForNullType()
    {
        Assert.False(Call("IsSeriesLike", null!));
        Assert.False(Call("IsMovieLike", null!));
        Assert.False(Call("IsEpisodeLike", null!));
    }

    [Fact]
    public void Helpers_ReturnFalseForUnrelatedType()
    {
        Assert.False(Call("IsSeriesLike", typeof(string)));
        Assert.False(Call("IsMovieLike", typeof(int)));
        Assert.False(Call("IsEpisodeLike", typeof(System.IO.Stream)));
    }
}
