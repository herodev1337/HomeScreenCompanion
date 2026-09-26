using System.Collections;
using System.Threading;
using System.Threading.Tasks;
using MediaBrowser.Common.Net;
using MediaBrowser.Model.Serialization;
using Xunit;

namespace HomeScreenCompanion.Tests;

/// <summary>
/// SSRF guardrails for caller-supplied URLs (audit finding S2.1).
/// List URLs must be https on an exact provider-host allowlist; image URLs
/// must be https and must not point at loopback/private/link-local/CGNAT
/// addresses. The Ollama base URL is user-configured and deliberately NOT
/// validated by these helpers (it may be localhost) — see the last test.
/// </summary>
public class ExternalUrlTests
{
    [Theory]
    [InlineData("https://api.mdblist.com/x")]
    [InlineData("https://api.mdblist.com/lists/foo/items")]
    [InlineData("https://mdblist.com/lists/foo/bar")]
    [InlineData("https://www.mdblist.com/lists/foo/bar")]
    [InlineData("https://api.trakt.tv/users/u/lists/l/items")]
    [InlineData("https://trakt.tv/users/u/lists/l/items")]
    [InlineData("https://app.trakt.tv/users/u/lists/l/items")]
    [InlineData("https://api.themoviedb.org/3/list/1")]
    [InlineData("https://themoviedb.org/list/1")]
    [InlineData("https://www.themoviedb.org/list/1")]
    public void IsAllowedExternalUrl_AcceptsAllowlistedHttpsHosts(string url)
    {
        Assert.True(ListFetcher.IsAllowedExternalUrl(url));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("not a url")]
    [InlineData("users/u/lists/l/items")]
    [InlineData("http://api.mdblist.com/x")]
    [InlineData("https://evil.example/mdblist.com")]
    [InlineData("https://api.mdblist.com.evil.example")]
    [InlineData("https://api.mdblist.com@evil.example")]
    [InlineData("https://user@api.mdblist.com/x")]
    [InlineData("https://127.0.0.1/x")]
    [InlineData("https://10.0.0.1/x")]
    [InlineData("https://169.254.169.254/x")]
    [InlineData("https://[::1]/x")]
    [InlineData("https://192.168.1.1/x")]
    [InlineData("https://localhost/x")]
    public void IsAllowedExternalUrl_RejectsNonAllowlistedAndUnsafeUrls(string? url)
    {
        Assert.False(ListFetcher.IsAllowedExternalUrl(url));
    }

    [Fact]
    public void IsAllowedImageUrl_AcceptsPublicHttpsUrl()
    {
        Assert.True(ListFetcher.IsAllowedImageUrl("https://example.com/pic.jpg"));
        Assert.True(ListFetcher.IsAllowedImageUrl("https://cdn.example.org/images/pic.png?size=large"));
    }

    [Theory]
    [InlineData("http://example.com/pic.jpg")]
    [InlineData("pic.jpg")]
    [InlineData("file:///etc/passwd")]
    [InlineData("https://user:pass@example.com/pic.jpg")]
    [InlineData("https://127.0.0.1/p.jpg")]
    [InlineData("https://10.0.0.1/p.jpg")]
    [InlineData("https://172.16.5.5/p.jpg")]
    [InlineData("https://192.168.1.1/p.jpg")]
    [InlineData("https://169.254.169.254/p.jpg")]
    [InlineData("https://100.64.0.1/p.jpg")]
    [InlineData("https://0.0.0.0/p.jpg")]
    [InlineData("https://[::1]/p.jpg")]
    [InlineData("https://[fc00::1]/p.jpg")]
    [InlineData("https://[fe80::1]/p.jpg")]
    [InlineData("https://localhost/p.jpg")]
    [InlineData("https://foo.local/p.jpg")]
    public void IsAllowedImageUrl_RejectsUnsafeTargets(string? url)
    {
        Assert.False(ListFetcher.IsAllowedImageUrl(url));
    }

    [Fact]
    public async Task FetchItems_DisallowedUrl_ReturnsEmptyListWithoutNetwork()
    {
        // A null IHttpClient is safe: a disallowed URL must be rejected before
        // any provider fetch (an attempted fetch would throw NullReferenceException).
        var fetcher = new ListFetcher(null!, new TestJsonSerializer());

        var task = fetcher.FetchItems("https://evil.example/mdblist.com", 10, "", "", "", CancellationToken.None);
        var result = await task;
        Assert.Empty(result);
    }

    [Fact]
    public void OllamaBaseUrl_IsNotValidatedByTheseHelpers()
    {
        // The Ollama base URL is user-configured and may intentionally be
        // localhost/plain http. It has its own code path (CallOllama) and must
        // not be run through the list/image validators.
        Assert.False(ListFetcher.IsAllowedExternalUrl("http://localhost:11434"));
        Assert.False(ListFetcher.IsAllowedImageUrl("http://localhost:11434/api/chat"));
    }
}
