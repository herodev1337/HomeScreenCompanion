using System;
using System.IO;
using System.Linq;
using Xunit;

namespace HomeScreenCompanion.Tests;

/// <summary>
/// Source-scan guard for audit finding E3: the four BindingFlags-driven dispatch
/// sites in <c>TopListEndpoints.cs</c> and the two dynamic
/// <c>IUserManager.MoveHomeSections</c> calls in <c>HscEndpoints.cs</c> have
/// been replaced with direct interface calls. Compilation against
/// <c>IUserManager.MoveHomeSections(long, string[], int, CancellationToken)</c>
/// is the real regression test; this class prevents the reflection pattern
/// from being reintroduced to the two files the plan owns.
/// </summary>
public class NoReflectionTests
{
    private static string RepoRoot()
        => Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", ".."));

    private static string EndpointsDir()
        => Path.Combine(RepoRoot(), "HomeScreenCompanion", "Endpoints");

    private static string ReadOrThrow(string path)
    {
        Assert.True(File.Exists(path), "Expected source file not found: " + path);
        return File.ReadAllText(path);
    }

    private static int CountOccurrences(string haystack, string needle)
    {
        if (string.IsNullOrEmpty(needle)) return 0;
        var count = 0;
        var idx = 0;
        while ((idx = haystack.IndexOf(needle, idx, StringComparison.Ordinal)) >= 0)
        {
            count++;
            idx += needle.Length;
        }
        return count;
    }

    [Theory]
    [InlineData("TopListEndpoints.cs")]
    [InlineData("HscEndpoints.cs")]
    public void NoBindingFlagsUsage(string fileName)
    {
        var path = Path.Combine(EndpointsDir(), fileName);
        var content = ReadOrThrow(path);
        // The HscDebugMethodsRequest handler intentionally walks the runtime type tree
        // with NonPublic + DeclaredOnly flags to surface non-public/declared-only methods
        // to operators — that debug endpoint is exempt from this rule. We anchor on the
        // actual method body (the first `t.GetMethods(BindingFlags` site) and trim
        // everything past the handler's closing brace so the BindingFlags check ignores
        // it but still scans the rest of the file.
        if (fileName == "HscEndpoints.cs")
        {
            var startIdx = content.IndexOf("t.GetMethods(BindingFlags", StringComparison.Ordinal);
            if (startIdx >= 0)
            {
                // Find the end of the HscDebugMethodsRequest handler by matching
                // the next top-level "public object " signature after the anchor.
                var tail = content.Substring(startIdx);
                var endMarker = tail.IndexOf("\n        public object ", StringComparison.Ordinal);
                content = endMarker >= 0 ? content.Substring(0, startIdx) + tail.Substring(endMarker) : content.Substring(0, startIdx);
            }
        }
        var hits = CountOccurrences(content, "BindingFlags");
        Assert.True(
            hits == 0,
            fileName + " still references BindingFlags " + hits + " time(s). "
                + "Replace reflection-based dispatch with direct calls against the typed interface.");
    }

    [Theory]
    [InlineData("TopListEndpoints.cs")]
    [InlineData("HscEndpoints.cs")]
    public void NoGetMethodInvocation(string fileName)
    {
        var path = Path.Combine(EndpointsDir(), fileName);
        var content = ReadOrThrow(path);
        var hits = CountOccurrences(content, "GetMethod(");
        Assert.True(
            hits == 0,
            fileName + " still calls GetMethod( " + hits + " time(s). "
                + "Replace with a direct method invocation against the typed interface.");
    }

    [Theory]
    [InlineData("TopListEndpoints.cs")]
    [InlineData("HscEndpoints.cs")]
    public void NoDynamicKeyword(string fileName)
    {
        var path = Path.Combine(EndpointsDir(), fileName);
        var content = ReadOrThrow(path);
        // Match "dynamic " as a whole-word token followed by whitespace — the
        // runtime-binder dispatch form (e.g. `dynamic mgr = ...`) the plan retires.
        var hits = CountOccurrences(content, "dynamic ");
        Assert.True(
            hits == 0,
            fileName + " still uses the `dynamic` keyword " + hits + " time(s). "
                + "Call the typed interface method directly.");
    }
}
