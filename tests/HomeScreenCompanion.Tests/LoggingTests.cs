using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Threading;
using Xunit;

namespace HomeScreenCompanion.Tests;

/// <summary>
/// E2a — logging/catch triage regressions:
///   - RunLog sink is capped at <see cref="Cap"/> lines; oldest dropped first.
///   - RunLog source contains no <c>DateTime.Now</c> (UtcNow only).
///   - TryParseDouble helper (if extracted) is culture-invariant.
///   - ListFetcher no longer has bare <c>catch { break; }</c> in pagination loops.
/// </summary>
public class LoggingTests
{
    private const string RunLogTypeName = "HomeScreenCompanion.RunLog";

    private static Type? RunLogType()
    {
        HscAssembly.EnsureAvailable();
        return HscAssembly.FindType(RunLogTypeName);
    }

    private static object NewRunLog(out List<string> sink, int extended = 0)
    {
        HscAssembly.EnsureAvailable();
        sink = new List<string>();
        var t = RunLogType()!;
        // ILogger lives in MediaBrowser.Model.dll which is not the plugin assembly — FindType on
        // HscAssembly.Assembly won't find it. Resolve via the ctor parameter type instead.
        var ctor = t.GetConstructors(BindingFlags.Public | BindingFlags.Instance)
            .FirstOrDefault(c =>
            {
                var ps = c.GetParameters();
                return ps.Length == 4
                    && ps[0].ParameterType == typeof(List<string>)
                    && ps[2].ParameterType == typeof(string)
                    && ps[3].ParameterType == typeof(bool);
            }) ?? throw new MissingMethodException(RunLogTypeName, ".ctor");
        return ctor.Invoke(new object?[] { sink, null, "", extended != 0 });
    }

    [Fact]
    public void RunLog_CapHoldsAndDropsOldest()
    {
        HscAssembly.EnsureAvailable();
        var t = RunLogType()!;
        var capField = t.GetField("MaxLines", BindingFlags.Public | BindingFlags.Static);
        Assert.NotNull(capField);
        var cap = (int)capField!.GetValue(null)!;
        Assert.True(cap >= 1000, $"Cap constant should be at least 1000; got {cap}.");

        var log = NewRunLog(out var sink);

        // Append (cap + 500) lines via Info() so we exercise the public API path.
        var info = t.GetMethod("Info", BindingFlags.Public | BindingFlags.Instance)!;
        var toWrite = cap + 500;
        for (int i = 0; i < toWrite; i++)
            info.Invoke(log, new object?[] { $"line {i:0000}" });

        Assert.True(sink.Count <= cap, $"Sink grew past cap: {sink.Count} > {cap}.");
        Assert.Equal(cap, sink.Count);

        // Oldest entries were dropped — the first surviving line is later than the very first one we wrote.
        var firstSurviving = sink[0];
        var firstWritten = $"[{(DateTime.UtcNow.ToString("HH:mm:ss"))}] line 0000";
        // We can't compare timestamps directly because each line is timestamped; but we can check the
        // numeric suffix of the first surviving line is past 0 (proves oldest were dropped).
        Assert.DoesNotContain("line 0000", firstSurviving);
        Assert.Contains($"line {(toWrite - cap):0000}", firstSurviving);

        // Last line is the most recently appended.
        var lastWritten = $"[{(DateTime.UtcNow.ToString("HH:mm:ss"))}] line {(toWrite - 1):0000}";
        Assert.Equal(lastWritten, sink[sink.Count - 1]);
    }

    [Fact]
    public void RunLog_NoDateTimeNow()
    {
        HscAssembly.EnsureAvailable();
        var t = RunLogType()!;
        var path = t.Assembly.Location;
        // The compiled assembly is what matters; check its IL/source path.
        var srcRoot = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", ".."));
        var sourcePath = Path.Combine(srcRoot, "HomeScreenCompanion", "RunLog.cs");
        Assert.True(File.Exists(sourcePath), "RunLog.cs not found at " + sourcePath);
        var src = File.ReadAllText(sourcePath);

        // Exclude DateTimeOffset.
        var idx = src.IndexOf("DateTime.Now", StringComparison.Ordinal);
        Assert.True(idx < 0, $"RunLog.cs still contains DateTime.Now (at offset {idx}). Use DateTime.UtcNow.");
    }

    // ─── Source scan: ListFetcher no longer swallows pagination failures silently ─

    [Fact]
    public void ListFetcher_NoCatchBreakInPaginationLoops()
    {
        var srcRoot = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", ".."));
        var path = Path.Combine(srcRoot, "HomeScreenCompanion", "ListFetcher.cs");
        Assert.True(File.Exists(path), "ListFetcher.cs not found at " + path);
        var src = File.ReadAllText(path);

        // Bare `catch { break; }` patterns inside pagination loops must be gone —
        // they silently turned network failures into "0 items", dangerous with
        // PreserveTagsOnEmptyResult. The replacement uses a typed catch + log.
        var pattern = "catch { break; }";
        var idx = src.IndexOf(pattern, StringComparison.Ordinal);
        Assert.True(idx < 0, $"ListFetcher.cs still contains bare '{pattern}' at offset {idx}.");
    }

    // ─── TryParseDouble invariant helper (extracted if present) ───────────────

    [Fact]
    public void TryParseDouble_InvariantCulture_ParsesDotOnly()
    {
        HscAssembly.EnsureAvailable();
        var t = HscAssembly.FindType("HomeScreenCompanion.TypeSniffing");
        // Not every extraction lands the helper in this exact class; scan for a TryParseDouble method
        // anywhere in the loaded assembly instead.
        var helper = HscAssembly.Assembly.GetTypes()
            .FirstOrDefault(x => x.GetMethods(BindingFlags.Public | BindingFlags.Static | BindingFlags.NonPublic)
                .Any(m => m.Name == "TryParseDouble" && m.ReturnType == typeof(bool)
                    && m.GetParameters().Length == 2
                    && m.GetParameters()[0].ParameterType == typeof(string)
                    && m.GetParameters()[1].ParameterType == typeof(double).MakeByRefType()));
        Assert.NotNull(helper);

        var method = helper!.GetMethods(BindingFlags.Public | BindingFlags.Static | BindingFlags.NonPublic)
            .First(m => m.Name == "TryParseDouble");
        var args = method.GetParameters();

        var prev = Thread.CurrentThread.CurrentCulture;
        try
        {
            Thread.CurrentThread.CurrentCulture = CultureInfo.GetCultureInfo("de-DE");

            var dotArgs = new object?[] { "1.5", 0.0 };
            var dotOk = (bool)method.Invoke(null, dotArgs)!;
            Assert.True(dotOk, "TryParseDouble('1.5') must succeed under de-DE (Invariant parsing of dot).");
            Assert.Equal(1.5, (double)dotArgs[1]!, 6);

            var commaArgs = new object?[] { "1,5", 0.0 };
            var commaOk = (bool)method.Invoke(null, commaArgs)!;
            Assert.False(commaOk, "TryParseDouble('1,5') must fail under de-DE (Invariant culture rejects comma decimal).");
        }
        finally
        {
            Thread.CurrentThread.CurrentCulture = prev;
        }
    }
}
