using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Xunit;

namespace HomeScreenCompanion.Tests;

/// <summary>
/// Source-layout guards (audit finding N1).
///
/// <list type="bullet">
///   <item>No two <c>.cs</c> files under <c>HomeScreenCompanion/</c> (excluding
///         <c>bin/</c> and <c>obj/</c>) may share the same filename — collapses
///         <c>git log --follow</c> and IDE file pickers.</item>
///   <item>No source file may reference the stale
///         <c>.planning/codebase/REFACTOR_MAP.md</c> document that no longer
///         exists in the repository.</item>
/// </list>
/// </summary>
public class SourceLayoutTests
{
    private static string RepoRoot()
        => Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", ".."));

    private static string PluginSourceRoot()
        => Path.Combine(RepoRoot(), "HomeScreenCompanion");

    private static IEnumerable<string> EnumerateSourceFiles(string root)
    {
        if (!Directory.Exists(root))
            yield break;

        var stack = new Stack<DirectoryInfo>();
        stack.Push(new DirectoryInfo(root));
        while (stack.Count > 0)
        {
            var dir = stack.Pop();
            foreach (var sub in dir.EnumerateDirectories())
            {
                if (sub.Name is "bin" or "obj")
                    continue;
                stack.Push(sub);
            }
            foreach (var file in dir.EnumerateFiles("*.cs"))
                yield return file.FullName;
        }
    }

    [Fact]
    public void NoTwoSourceFilesShareFilename()
    {
        var pluginRoot = PluginSourceRoot();
        Assert.True(Directory.Exists(pluginRoot), "Plugin source directory not found: " + pluginRoot);

        var groups = EnumerateSourceFiles(pluginRoot)
            .GroupBy(Path.GetFileName, StringComparer.Ordinal)
            .Where(g => g.Count() > 1)
            .Select(g => g.Key + " (" + g.Count() + "x): " + string.Join(", ", g.Select(Path.GetDirectoryName)))
            .ToList();

        Assert.True(
            groups.Count == 0,
            "Duplicate .cs filenames under HomeScreenCompanion/: " + string.Join(" | ", groups));
    }

    [Fact]
    public void NoSourceFileReferences_RefactorMap()
    {
        var pluginRoot = PluginSourceRoot();
        Assert.True(Directory.Exists(pluginRoot), "Plugin source directory not found: " + pluginRoot);

        var offenders = new List<string>();
        foreach (var file in EnumerateSourceFiles(pluginRoot))
        {
            string content;
            try
            {
                content = File.ReadAllText(file);
            }
            catch (IOException ex)
            {
                throw new InvalidOperationException("Failed to read " + file + ": " + ex.Message);
            }

            if (content.Contains("REFACTOR_MAP.md", StringComparison.Ordinal))
                offenders.Add(Path.GetRelativePath(pluginRoot, file));
        }

        Assert.True(
            offenders.Count == 0,
            "Files still reference the stale REFACTOR_MAP.md: " + string.Join(", ", offenders));
    }
}
