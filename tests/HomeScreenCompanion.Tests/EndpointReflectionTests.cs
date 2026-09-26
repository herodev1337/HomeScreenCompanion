using System.IO;
using System.Linq;
using System.Reflection;
using Xunit;

namespace HomeScreenCompanion.Tests;

/// <summary>
/// Audit-plan v2 / Wave 2 / T2: source-level guarantees for the
/// SDK-typed status / run endpoints. Source scan + reflection on
/// the new typed response shape. All calls go through
/// <see cref="typeof(HomeScreenCompanion.HomeScreenCompanionService).Assembly"/>
/// — no separate DLL loading is needed because the test project
/// has a <c>ProjectReference</c> to the plugin.
/// </summary>
public sealed class EndpointReflectionTests
{
    private static string RepoRoot
        => Path.GetFullPath(Path.Combine(System.AppContext.BaseDirectory, "..", "..", "..", "..", ".."));

    private static System.Type SdkType(string fullName) =>
        typeof(MediaBrowser.Model.Plugins.PluginInfo).Assembly.GetType(fullName)
        ?? typeof(MediaBrowser.Controller.Library.ILibraryManager).Assembly.GetType(fullName)
        ?? typeof(MediaBrowser.Common.Net.IHttpClient).Assembly.GetType(fullName)
        ?? System.AppDomain.CurrentDomain.GetAssemblies()
            .Select(a => a.GetType(fullName))
            .FirstOrDefault(t => t != null)
        ?? throw new System.InvalidOperationException("SDK type not found: " + fullName);

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
        var t = typeof(Plugin).Assembly.GetType("HomeScreenCompanion.HscStatusResponse");
        Assert.NotNull(t);
        var prop = t!.GetProperty("TaskInfo", BindingFlags.Public | BindingFlags.Instance);
        Assert.NotNull(prop);
        Assert.Equal("MediaBrowser.Model.Tasks.TaskInfo", prop!.PropertyType.FullName);
    }

    [Fact]
    public void HscStatusResponse_Also_Exposes_Logs_StartedUtc_And_SectionsCopied()
    {
        var t = typeof(Plugin).Assembly.GetType("HomeScreenCompanion.HscStatusResponse")!;
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
        var t = typeof(Plugin).Assembly.GetType("HomeScreenCompanion.HscRunRequest")!;
        var authType = SdkType("MediaBrowser.Controller.Net.AuthenticatedAttribute");
        var attrs = t.GetCustomAttributesData();
        Assert.Contains(attrs, a => a.AttributeType?.FullName == authType.FullName);

        // [Authenticated(Roles = "Admin")] uses the parameterless ctor +
        // Roles as a named property.
        bool hasAdmin = attrs
            .Where(a => a.AttributeType.FullName == authType.FullName)
            .SelectMany(a => a.NamedArguments)
            .Any(arg => arg.MemberName == "Roles"
                     && arg.TypedValue.ArgumentType == typeof(string)
                     && (string?)arg.TypedValue.Value == "Admin");
        Assert.True(hasAdmin, "HscRunRequest must declare [Authenticated(Roles = \"Admin\")].");
    }

    [Fact]
    public void HscGetStatusV2Request_Is_Authenticated_Not_Admin()
    {
        var t = typeof(Plugin).Assembly.GetType("HomeScreenCompanion.HscGetStatusV2Request")!;
        var authType = SdkType("MediaBrowser.Controller.Net.AuthenticatedAttribute");
        var attrs = t.GetCustomAttributesData();
        bool isAuth = attrs.Any(a => a.AttributeType?.FullName == authType.FullName);
        Assert.True(isAuth, "HscGetStatusV2Request must be [Authenticated].");

        bool isAdmin = attrs
            .Where(a => a.AttributeType.FullName == authType.FullName)
            .SelectMany(a => a.NamedArguments)
            .Any(arg => arg.MemberName == "Roles"
                     && arg.TypedValue.ArgumentType == typeof(string)
                     && (string?)arg.TypedValue.Value == "Admin");
        Assert.False(isAdmin, "HscGetStatusV2Request must NOT be Admin-only.");
    }

    [Fact]
    public void HscDebugMethodsRequest_Is_Admin_Only()
    {
        var t = typeof(Plugin).Assembly.GetType("HomeScreenCompanion.HscDebugMethodsRequest")!;
        var authType = SdkType("MediaBrowser.Controller.Net.AuthenticatedAttribute");
        var attrs = t.GetCustomAttributesData();
        bool isAdmin = attrs
            .Where(a => a.AttributeType.FullName == authType.FullName)
            .SelectMany(a => a.NamedArguments)
            .Any(arg => arg.MemberName == "Roles"
                     && arg.TypedValue.ArgumentType == typeof(string)
                     && (string?)arg.TypedValue.Value == "Admin");
        Assert.True(isAdmin);
    }
}
