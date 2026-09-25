using System;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text.RegularExpressions;
using Xunit;

namespace HomeScreenCompanion.Tests;

/// <summary>
/// Audit-plan v2 / Wave 2 / T2: source-level guarantees for the
/// SDK-typed status / run endpoints. Source scan + reflection on
/// the new typed response shape.
/// </summary>
public sealed class EndpointReflectionTests
{
    private static string RepoRoot
    {
        get
        {
            var baseDir = System.AppContext.BaseDirectory;
            return Path.GetFullPath(Path.Combine(baseDir, "..", "..", "..", "..", ".."));
        }
    }

    [Fact]
    public void HscEndpoints_File_Has_Zero_BindingFlags_References()
    {
        // T2 replaces the runtime reflection BFS over IUserManager with a
        // static method list. This guard prevents the reflection crawl from
        // creeping back.
        var path = Path.Combine(RepoRoot, "HomeScreenCompanion", "Endpoints", "HscEndpoints.cs");
        Assert.True(File.Exists(path));
        var text = File.ReadAllText(path);

        Assert.False(text.Contains("BindingFlags."),
            "HscEndpoints.cs must not reference System.Reflection.BindingFlags.");
        Assert.False(text.Contains("typeof(IUserManager)"),
            "HscEndpoints.cs must not walk IUserManager by reflection.");
    }

    [Fact]
    public void HscStatusResponse_Has_TaskInfo_Of_SDK_Type()
    {
        var t = HscAssembly.FindType("HomeScreenCompanion.HscStatusResponse");
        Assert.NotNull(t);
        var prop = t!.GetProperty("TaskInfo", BindingFlags.Public | BindingFlags.Instance);
        Assert.NotNull(prop);
        Assert.Equal("MediaBrowser.Model.Tasks.TaskInfo", prop!.PropertyType.FullName);
    }

    [Fact]
    public void HscStatusResponse_Also_Exposes_Logs_StartedUtc_And_SectionsCopied()
    {
        var t = HscAssembly.FindType("HomeScreenCompanion.HscStatusResponse")!;
        var names = t.GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .Select(p => p.Name)
            .ToHashSet();
        Assert.Contains("TaskInfo", names);
        Assert.Contains("Logs", names);
        Assert.Contains("StartedUtc", names);
        Assert.Contains("SectionsCopied", names);
    }

    [Fact]
    public void HscRunRequest_Is_Admin_Only()
    {
        var t = HscAssembly.FindType("HomeScreenCompanion.HscRunRequest")!;
        var authType = FindTypeAcrossLoadedAssemblies("MediaBrowser.Controller.Net.AuthenticatedAttribute");
        Assert.NotNull(authType);
        var attrs = t.GetCustomAttributesData();
        Assert.Contains(attrs, a => a.AttributeType?.FullName == authType!.FullName);

        // [Authenticated(Roles = "Admin")] uses the parameterless ctor +
        // Roles as a named property.
        bool hasAdmin = attrs
            .Where(a => a.AttributeType.FullName == authType!.FullName)
            .SelectMany(a => a.NamedArguments)
            .Any(arg => arg.MemberName == "Roles"
                     && arg.TypedValue.ArgumentType == typeof(string)
                     && (string?)arg.TypedValue.Value == "Admin");
        Assert.True(hasAdmin, "HscRunRequest must declare [Authenticated(Roles = \"Admin\")].");
    }

    [Fact]
    public void HscGetStatusV2Request_Is_Authenticated_Not_Admin()
    {
        var t = HscAssembly.FindType("HomeScreenCompanion.HscGetStatusV2Request")!;
        var authType = FindTypeAcrossLoadedAssemblies("MediaBrowser.Controller.Net.AuthenticatedAttribute");
        Assert.NotNull(authType);
        var attrs = t.GetCustomAttributesData();
        bool isAuth = attrs.Any(a => a.AttributeType?.FullName == authType!.FullName);
        Assert.True(isAuth, "HscGetStatusV2Request must be [Authenticated].");

        bool isAdmin = attrs
            .Where(a => a.AttributeType?.FullName == authType!.FullName)
            .SelectMany(a => a.NamedArguments)
            .Any(arg => arg.MemberName == "Roles"
                     && arg.TypedValue.ArgumentType == typeof(string)
                     && (string?)arg.TypedValue.Value == "Admin");
        Assert.False(isAdmin, "HscGetStatusV2Request must NOT be Admin-only.");
    }

    [Fact]
    public void HscDebugMethodsRequest_Is_Admin_Only()
    {
        var t = HscAssembly.FindType("HomeScreenCompanion.HscDebugMethodsRequest")!;
        var authType = FindTypeAcrossLoadedAssemblies("MediaBrowser.Controller.Net.AuthenticatedAttribute");
        Assert.NotNull(authType);
        var attrs = t.GetCustomAttributesData();
        bool isAdmin = attrs
            .Where(a => a.AttributeType?.FullName == authType!.FullName)
            .SelectMany(a => a.NamedArguments)
            .Any(arg => arg.MemberName == "Roles"
                     && arg.TypedValue.ArgumentType == typeof(string)
                     && (string?)arg.TypedValue.Value == "Admin");
        Assert.True(isAdmin);
    }

    private static Type? FindTypeAcrossLoadedAssemblies(string fullName)
    {
        // First, walk already-loaded assemblies.
        foreach (var asm in System.AppDomain.CurrentDomain.GetAssemblies())
        {
            var t = asm.GetType(fullName, throwOnError: false);
            if (t != null) return t;
        }

        // Fallback: explicitly load MediaBrowser.Controller.dll from the test
        // bin folder (the SDK is a PrivateAssets="all" ref but the DLLs are
        // not eagerly loaded by netcore/xunit). Cover the Common + Model +
        // Controller trio so the same helper works for other SDK types too.
        var baseDir = System.AppContext.BaseDirectory;
        foreach (var name in new[] { "MediaBrowser.Controller.dll", "MediaBrowser.Common.dll", "MediaBrowser.Model.dll" })
        {
            try
            {
                var asm = Assembly.LoadFrom(Path.Combine(baseDir, name));
                var t = asm.GetType(fullName, throwOnError: false);
                if (t != null) return t;
            }
            catch (FileNotFoundException) { /* SDK dll not in the test bin */ }
            catch (Exception) { /* ignore — helper is best-effort */ }
        }
        return null;
    }
}
