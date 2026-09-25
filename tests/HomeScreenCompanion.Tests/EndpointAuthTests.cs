using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text.RegularExpressions;
using Xunit;

namespace HomeScreenCompanion.Tests;

/// <summary>
/// Route authentication/authorization coverage (audit finding S1).
///
/// Emby discovers <c>MediaBrowser.Controller.Net.AuthenticatedAttribute</c> because it
/// implements <c>IHasRequestFilter</c>, and Emby's own API applies it to the request DTO
/// class (immediately after <c>[Route(...)]</c>) — not to the service handler method.
/// These tests therefore reflect over the DTO type each handler method takes.
/// </summary>
public class EndpointAuthTests
{
    private const string AuthenticatedAttributeFullName = "MediaBrowser.Controller.Net.AuthenticatedAttribute";
    private const string UnauthenticatedAttributeFullName = "MediaBrowser.Controller.Net.UnauthenticatedAttribute";
    private const string ServiceTypeName = "HomeScreenCompanion.HomeScreenCompanionService";

    /// <summary>Every route in this set must carry <c>[Authenticated(Roles = "Admin")]</c>.</summary>
    private static readonly string[] AdminDtos =
    {
        // BackupContracts
        "ExportBackupRequest",
        "ImportBackupRequest",
        // CollectionImageContracts
        "UploadCollectionImageRequest",
        "FetchCollectionImageFromUrlRequest",
        // ManageContracts
        "DeleteManagedTagRequest",
        "DeleteManagedTagsBatchRequest",
        "DeleteManagedCollectionRequest",
        // StatusContracts
        "TestUrlRequest",
        "RunEntryRequest",
        "DebugSectionsRequest",
        // TopListContracts
        "PrepareTopListFolderRequest",
        "DeleteTopListRequest",
        "PrepareTopListHomeSectionsRequest",
        "SyncAllTopListSectionsRequest",
        "MergeTopListVersionsRequest",
        "GetAllMoviesRequest",
        "GrantTopListLibraryAccessRequest",
        "SnapshotPoliciesRequest",
        "RestoreAndGrantAccessRequest",
        "PrepareManualTopListFolderRequest",
        // DTOs.cs
        "HscSaveUserSectionsRequest",
        "HscDebugMethodsRequest",
        "HscApplyTagHomeSectionsRequest",
        "TestAiSourceRequest"
    };

    /// <summary>Routes open to any signed-in user: <c>[Authenticated]</c> without the Admin role.</summary>
    private static readonly string[] AuthenticatedDtos =
    {
        // StatusContracts
        "GetStatusRequest",
        "VersionRequest",
        "HscGetStatusRequest",
        // ManageContracts
        "GetManagedTagsRequest",
        "GetManagedCollectionsRequest",
        // TopListContracts
        "GetTopListStatusRequest",
        "GetTopListsRequest",
        "GetManualTopListItemsRequest",
        // DTOs.cs
        "HscGetUserSectionsRequest",
        "HscGetSectionSchemaRequest"
    };

    /// <summary>
    /// Self-scoped routes that are allowed to read a body-supplied <c>UserId</c> because the
    /// handler funnels it through <c>ResolveUserId</c> (caller wins unless admin).
    /// </summary>
    private static readonly HashSet<string> SelfScopedUserIdDtos = new(StringComparer.Ordinal)
    {
        "HscGetUserSectionsRequest"
    };

    private static readonly Regex HandlerSignature = new(
        @"\bpublic\s+(?:async\s+)?(?:Task<object>|object|void)\s+(?:Get|Post|Put|Delete)\s*\(\s*(?<dto>[A-Za-z_][A-Za-z0-9_]*)\s+request\s*\)",
        RegexOptions.Compiled);

    [Fact]
    public void EveryRouteDto_CarriesAuthenticatedOrUnauthenticated()
    {
        HscAssembly.EnsureAvailable();

        var routeDtos = RouteDtoTypes();
        Assert.Equal(34, routeDtos.Count);

        var missing = routeDtos
            .Where(dto => FindAttribute(dto, AuthenticatedAttributeFullName) == null
                       && FindAttribute(dto, UnauthenticatedAttributeFullName) == null)
            .Select(dto => dto.Name)
            .OrderBy(name => name, StringComparer.Ordinal)
            .ToList();

        Assert.True(missing.Count == 0,
            "Route DTOs carrying neither [Authenticated] nor [Unauthenticated]: " + string.Join(", ", missing));
    }

    [Fact]
    public void AdminRouteDtos_RequireAdminRole()
    {
        HscAssembly.EnsureAvailable();

        foreach (var name in AdminDtos)
        {
            var dto = RequireType(name);
            var attribute = FindAttribute(dto, AuthenticatedAttributeFullName);
            Assert.True(attribute != null, name + " must carry [Authenticated(Roles = \"Admin\")].");

            var roles = GetRoles(attribute!);
            Assert.True(string.Equals(roles, "Admin", StringComparison.OrdinalIgnoreCase),
                name + " must have Roles=\"Admin\" but had Roles=" + (roles ?? "<null>") + ".");
        }
    }

    [Fact]
    public void AuthenticatedOnlyRouteDtos_AreNotAdminGated()
    {
        HscAssembly.EnsureAvailable();

        foreach (var name in AuthenticatedDtos)
        {
            var dto = RequireType(name);
            var attribute = FindAttribute(dto, AuthenticatedAttributeFullName);
            Assert.True(attribute != null, name + " must carry [Authenticated].");

            var roles = GetRoles(attribute!);
            Assert.False(string.Equals(roles, "Admin", StringComparison.OrdinalIgnoreCase),
                name + " must not be restricted to the Admin role.");
        }
    }

    [Fact]
    public void NoRouteDto_UsesUnauthenticated()
    {
        HscAssembly.EnsureAvailable();

        var offenders = RouteDtoTypes()
            .Where(dto => FindAttribute(dto, UnauthenticatedAttributeFullName) != null)
            .Select(dto => dto.Name)
            .OrderBy(name => name, StringComparer.Ordinal)
            .ToList();

        Assert.True(offenders.Count == 0,
            "[Unauthenticated] is forbidden — no route may be reachable without auth: " + string.Join(", ", offenders));
    }

    [Fact]
    public void EndpointSources_OnlyTrustBodyUserId_OnAdminOrResolvedRoutes()
    {
        HscAssembly.EnsureAvailable();

        var endpointsDir = Path.Combine(RepoRoot(), "HomeScreenCompanion", "Endpoints");
        Assert.True(Directory.Exists(endpointsDir), "Endpoints source directory not found: " + endpointsDir);

        var admin = new HashSet<string>(AdminDtos, StringComparer.Ordinal);
        var allowed = new HashSet<string>(admin, StringComparer.Ordinal);
        allowed.UnionWith(SelfScopedUserIdDtos);

        var offenders = new List<string>();
        var bodiesWithUserId = 0;

        foreach (var file in Directory.GetFiles(endpointsDir, "*.cs"))
        {
            var source = File.ReadAllText(file);
            foreach (var (dto, bodyStart, bodyEnd) in FindHandlerBodies(source))
            {
                var body = source.Substring(bodyStart, bodyEnd - bodyStart);
                if (!Regex.IsMatch(body, @"request\.(UserId|RecentlyWatchedUserId)\b"))
                    continue;

                bodiesWithUserId++;
                var location = Path.GetFileName(file) + ": " + dto;

                if (!allowed.Contains(dto))
                    offenders.Add(location + " reads a body-supplied UserId without being admin-gated");

                if (SelfScopedUserIdDtos.Contains(dto) && !body.Contains("ResolveUserId(", StringComparison.Ordinal))
                    offenders.Add(location + " must funnel request.UserId through ResolveUserId");
            }
        }

        Assert.Equal(4, bodiesWithUserId);
        Assert.True(offenders.Count == 0, string.Join("; ", offenders));
    }

    [Theory]
    [InlineData("u1", false, "u2", "u1")]
    [InlineData("u1", true, "u2", "u2")]
    [InlineData("u1", false, "", "u1")]
    [InlineData("u1", true, "u1", "u1")]
    [InlineData("", false, "u2", "")]
    [InlineData("u1", true, "", "u1")]
    [InlineData("u1", false, "U1", "u1")]
    public void ResolveUserId_TruthTable(string callerId, bool callerIsAdmin, string requestedUserId, string expected)
    {
        HscAssembly.EnsureAvailable();

        var method = HscAssembly.FindStaticMethod(ServiceTypeName, "ResolveUserId", typeof(string), typeof(bool), typeof(string));
        Assert.NotNull(method);

        var actual = (string)method!.Invoke(null, new object?[] { callerId, callerIsAdmin, requestedUserId })!;
        Assert.Equal(expected, actual);
    }

    [Fact]
    public void Service_ImplementsIRequiresRequest_WithPublicSettableRequest()
    {
        HscAssembly.EnsureAvailable();

        var service = RequireType("HomeScreenCompanionService");
        Assert.True(typeof(MediaBrowser.Model.Services.IRequiresRequest).IsAssignableFrom(service));

        var property = service.GetProperty("Request", BindingFlags.Public | BindingFlags.Instance);
        Assert.NotNull(property);
        Assert.Equal(typeof(MediaBrowser.Model.Services.IRequest), property!.PropertyType);
        Assert.True(property.CanRead);
        Assert.True(property.CanWrite);
        Assert.True(property.SetMethod!.IsPublic);
    }

    private static List<Type> RouteDtoTypes()
    {
        var service = RequireType("HomeScreenCompanionService");
        var handlerNames = new HashSet<string>(StringComparer.Ordinal) { "Get", "Post", "Put", "Delete" };

        return service
            .GetMethods(BindingFlags.Public | BindingFlags.Instance)
            .Where(method => handlerNames.Contains(method.Name))
            .Select(method => method.GetParameters())
            .Where(parameters => parameters.Length == 1
                              && parameters[0].ParameterType.Assembly == HscAssembly.Assembly)
            .Select(parameters => parameters[0].ParameterType)
            .Distinct()
            .OrderBy(type => type.Name, StringComparer.Ordinal)
            .ToList();
    }

    private static Type RequireType(string name)
    {
        var type = HscAssembly.FindType("HomeScreenCompanion." + name);
        Assert.True(type != null, "Type HomeScreenCompanion." + name + " not found in the plugin assembly.");
        return type!;
    }

    private static CustomAttributeData? FindAttribute(Type type, string attributeFullName)
        => type.GetCustomAttributesData().FirstOrDefault(a => a.AttributeType.FullName == attributeFullName);

    private static string? GetRoles(CustomAttributeData attribute)
        => attribute.NamedArguments
            .Where(argument => argument.MemberName == "Roles")
            .Select(argument => argument.TypedValue.Value as string)
            .FirstOrDefault();

    private static string RepoRoot()
        => Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", ".."));

    private static IEnumerable<(string Dto, int BodyStart, int BodyEnd)> FindHandlerBodies(string source)
    {
        foreach (Match match in HandlerSignature.Matches(source))
        {
            var open = source.IndexOf('{', match.Index + match.Length);
            if (open < 0) continue;

            var close = FindMatchingBrace(source, open);
            if (close < 0) continue;

            yield return (match.Groups["dto"].Value, open, close + 1);
        }
    }

    /// <summary>Brace matcher that skips string/char literals and comments.</summary>
    private static int FindMatchingBrace(string source, int openIndex)
    {
        var depth = 0;
        for (var i = openIndex; i < source.Length; i++)
        {
            var c = source[i];

            if (c == '"' || c == '\'')
            {
                i = SkipQuoted(source, i);
                continue;
            }

            if (c == '/' && i + 1 < source.Length && source[i + 1] == '/')
            {
                i = source.IndexOf('\n', i);
                if (i < 0) return -1;
                continue;
            }

            if (c == '/' && i + 1 < source.Length && source[i + 1] == '*')
            {
                var end = source.IndexOf("*/", i + 2, StringComparison.Ordinal);
                if (end < 0) return -1;
                i = end + 1;
                continue;
            }

            if (c == '{') depth++;
            else if (c == '}')
            {
                depth--;
                if (depth == 0) return i;
            }
        }

        return -1;
    }

    private static int SkipQuoted(string source, int quoteIndex)
    {
        var quote = source[quoteIndex];
        var verbatim = quote == '"' && quoteIndex > 0 && source[quoteIndex - 1] == '@';

        for (var i = quoteIndex + 1; i < source.Length; i++)
        {
            var c = source[i];
            if (verbatim)
            {
                if (c != '"') continue;
                if (i + 1 < source.Length && source[i + 1] == '"') { i++; continue; }
                return i;
            }

            if (c == '\\') { i++; continue; }
            if (c == quote) return i;
        }

        return source.Length - 1;
    }
}
