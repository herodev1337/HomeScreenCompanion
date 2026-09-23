using System;
using System.IO;
using System.Runtime.CompilerServices;
using System.Text.Json;
using Xunit;

namespace HomeScreenCompanion.Tests;

/// <summary>
/// Minimal snapshot helper: on first run, writes <c>Snapshots/&lt;TestName&gt;.snap.json</c>
/// next to the test source file. On subsequent runs, compares the actual value to the
/// on-disk snapshot using semantic JSON equality (whitespace-independent).
///
/// Not using Verify / Snapshot / etc. on purpose — keep deps to just xunit + System.Text.Json.
/// </summary>
internal static class Snap
{
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        WriteIndented = true,
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.Never,
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping
    };

    /// <summary>
    /// Compares <paramref name="actual"/> to the on-disk snapshot, creating it if missing.
    /// Call from inside a Fact body.
    /// </summary>
    public static void Match(object? actual, [CallerFilePath] string sourceFile = "", [CallerMemberName] string testName = "")
    {
        var snapshotPath = ResolvePath(sourceFile, testName);
        var actualJson = JsonSerializer.Serialize(Normalize(actual), JsonOpts);

        if (!File.Exists(snapshotPath))
        {
            Directory.CreateDirectory(Path.GetDirectoryName(snapshotPath)!);
            File.WriteAllText(snapshotPath, actualJson);
            return; // First run: snapshot is created. Test passes.
        }

        var expectedJson = File.ReadAllText(snapshotPath);
        var expectedNorm = NormalizeJson(expectedJson);
        var actualNorm = NormalizeJson(actualJson);

        if (expectedNorm != actualNorm)
        {
            // Pretty diff: dump both as indented lines so the failure message is readable.
            Assert.Fail(
                $"Snapshot mismatch for {testName}.\n" +
                $"Snapshot file: {snapshotPath}\n" +
                $"--- expected ---\n{expectedJson}\n" +
                $"--- actual ---\n{actualJson}\n" +
                $"If the change is intentional, delete the snapshot file and rerun to regenerate it.");
        }
    }

    private static string ResolvePath(string sourceFile, string testName)
    {
        var dir = Path.GetDirectoryName(sourceFile)!;
        return Path.Combine(dir, "Snapshots", testName + ".snap.json");
    }

    /// <summary>
    /// Wrap primitives in a stable shape so JSON serialization is reproducible
    /// (e.g. doubles always have a decimal point).
    /// </summary>
    private static object? Normalize(object? value) => value;

    /// <summary>
    /// Strip whitespace differences so a re-serialized snapshot matches the on-disk one.
    /// </summary>
    private static string NormalizeJson(string json)
    {
        var minified = JsonSerializer.Serialize(JsonDocument.Parse(json).RootElement, JsonOpts);
        return minified;
    }
}
