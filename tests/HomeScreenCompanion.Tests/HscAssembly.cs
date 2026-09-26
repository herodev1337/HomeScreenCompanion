using System;
using System.IO;
using System.Linq;
using System.Reflection;
using Xunit;

namespace HomeScreenCompanion.Tests;

/// <summary>
/// Loads the built HomeScreenCompanion plugin DLL via reflection so the test project
/// can call into private/static members without a project reference.
///
/// The DLL lives at <c>HomeScreenCompanion/bin/Release/netstandard2.0/HomeScreenCompanion.dll</c>
/// relative to the repository root, which is 4 levels above the test bin folder.
/// All test failures caused by the DLL being missing or unloadable should call
/// <see cref="EnsureAvailable"/> first and bail with <c>Assert.Skip</c>.
/// </summary>
internal static class HscAssembly
{
    private static readonly Lazy<LoadResult> _load = new(LoadFromDefaultLocation);

    public static LoadResult Result => _load.Value;

    public static bool IsAvailable => _load.Value.Assembly != null;

    public static Assembly Assembly => _load.Value.Assembly
        ?? throw new InvalidOperationException("HomeScreenCompanion.dll is not available; call EnsureAvailable first.");

    /// <summary>Full type name of the giant task class — short alias to keep call sites readable.</summary>
    public const string TaskTypeName = "HomeScreenCompanion.HomeScreenCompanionTask";

    /// <summary>
    /// Skips (locally) or fails (in CI) when the DLL or a member is unavailable.
    /// CI is detected via the <c>CI</c> or <c>GITHUB_ACTIONS</c> env vars that
    /// GitHub Actions / most CI providers set. The split prevents silent skips in
    /// CI while keeping local development friction-free (no DLL yet? skip & continue).
    /// </summary>
    public static void EnsureAvailable()
    {
        if (Result.Assembly != null) return;
        var msg = Result.Error ?? "HomeScreenCompanion.dll not loaded.";
        if (IsCi()) throw new InvalidOperationException("HomeScreenCompanion.dll is required: " + msg);
        Skip.If(true, msg);
    }

    private static bool IsCi() =>
        !string.IsNullOrEmpty(Environment.GetEnvironmentVariable("CI")) ||
        !string.IsNullOrEmpty(Environment.GetEnvironmentVariable("GITHUB_ACTIONS"));

    /// <summary>Find a non-public static method on a type by name, optionally filtering by parameter types.</summary>
    public static MethodInfo? FindStaticMethod(string typeFullName, string methodName, params Type[] parameterTypes)
    {
        var t = FindType(typeFullName);
        if (t == null) return null;
        return FindStaticMethod(t, methodName, parameterTypes);
    }

    public static MethodInfo? FindStaticMethod(Type type, string methodName, params Type[] parameterTypes)
    {
        var flags = BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic;
        if (parameterTypes.Length == 0)
        {
            return type.GetMethods(flags)
                .FirstOrDefault(m => m.Name == methodName);
        }
        return type.GetMethod(methodName, flags, binder: null, types: parameterTypes, modifiers: null);
    }

    public static Type? FindType(string typeFullName)
    {
        try
        {
            return Assembly.GetType(typeFullName);
        }
        catch (Exception ex)
        {
            Result.TypeLoadFailures[typeFullName] = ex.GetType().Name + ": " + ex.Message;
            return null;
        }
    }

    private static LoadResult LoadFromDefaultLocation()
    {
        try
        {
            var path = LocateDll();
            if (!File.Exists(path))
            {
                return LoadResult.Failure($"DLL not found at {path}");
            }
            var asm = Assembly.LoadFrom(path);
            return LoadResult.Success(asm);
        }
        catch (Exception ex)
        {
            return LoadResult.Failure(ex.GetType().Name + ": " + ex.Message);
        }
    }

    private static string LocateDll()
    {
        // test bin: tests/HomeScreenCompanion.Tests/bin/Release/net8.0/
        //   ..              = tests/HomeScreenCompanion.Tests/bin/Release/
        //   ../..           = tests/HomeScreenCompanion.Tests/bin/
        //   ../../..        = tests/HomeScreenCompanion.Tests/
        //   ../../../..     = tests/
        //   ../../../../..  = <repo root>
        var baseDir = AppContext.BaseDirectory;
        var repoRoot = Path.GetFullPath(Path.Combine(baseDir, "..", "..", "..", "..", ".."));
        return Path.Combine(repoRoot, "HomeScreenCompanion", "bin", "Release", "netstandard2.0", "HomeScreenCompanion.dll");
    }

    public sealed class LoadResult
    {
        public Assembly? Assembly { get; private init; }
        public string? Error { get; private init; }
        public System.Collections.Generic.Dictionary<string, string> TypeLoadFailures { get; } =
            new System.Collections.Generic.Dictionary<string, string>();

        public static LoadResult Success(Assembly asm) => new() { Assembly = asm };
        public static LoadResult Failure(string err) => new() { Error = err };
    }
}
