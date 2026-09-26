using System;
using System.Threading.Tasks;
using MediaBrowser.Common.Net;
using MediaBrowser.Model.Serialization;
using Xunit;

namespace HomeScreenCompanion.Tests;

/// <summary>
/// Error propagation for <c>ListFetcher.FetchAiList</c> (audit finding S2.2):
/// configuration errors must surface as <see cref="InvalidOperationException"/>
/// instead of being swallowed into an empty list. These paths are checked
/// before any network call, so a null <see cref="IHttpClient"/> is safe.
///
/// Coverage gap: a provider HTTP error (e.g. "OpenAI API error 401") cannot be
/// exercised without network access because the call methods use a private
/// static <c>HttpClient</c> with no injectable seam. The message is built in
/// <c>Call*</c> and now propagates through the removed catch-all; verified by
/// code inspection only.
/// </summary>
public class FetchAiListTests
{
    private static ListFetcher CreateFetcher() => new(null!, new TestJsonSerializer());

    private static Task InvokeFetchAiList(
        ListFetcher fetcher,
        string provider,
        string? openAiKey,
        string? geminiKey,
        string? claudeKey,
        string? ollamaBaseUrl,
        string? ollamaModel)
    {
        return fetcher.FetchAiList(
            provider,
            "Recommend something",       // prompt
            openAiKey,
            "gpt-4o-mini",               // openAiModel
            geminiKey,
            "gemini-2.0-flash",          // geminiModel
            claudeKey,
            "claude-haiku-4-5-20251001", // claudeModel
            ollamaBaseUrl,
            ollamaModel,
            "",                          // systemPrompt
            "",                          // recentlyWatchedContext
            10,                          // limit
            default);
    }

    [Fact]
    public async Task OpenAI_MissingKey_ThrowsNotConfigured()
    {
        var task = InvokeFetchAiList(CreateFetcher(), "OpenAI", null, "", "", "", "");

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() => task);
        Assert.Contains("OpenAI API key is not configured.", ex.Message);
    }

    [Fact]
    public async Task Gemini_MissingKey_ThrowsNotConfigured()
    {
        var task = InvokeFetchAiList(CreateFetcher(), "Gemini", "", null, "", "", "");

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() => task);
        Assert.Contains("Gemini API key is not configured.", ex.Message);
    }

    [Fact]
    public async Task Claude_MissingKey_ThrowsNotConfigured()
    {
        var task = InvokeFetchAiList(CreateFetcher(), "Claude", "", "", "   ", "", "");

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() => task);
        Assert.Contains("Claude API key is not configured.", ex.Message);
    }

    [Fact]
    public async Task Ollama_MissingBaseUrl_ThrowsNotConfigured()
    {
        var task = InvokeFetchAiList(CreateFetcher(), "Ollama", "", "", "", null, "llama3");

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() => task);
        Assert.Contains("Ollama base URL is not configured.", ex.Message);
    }

    [Fact]
    public async Task Ollama_MissingModel_ThrowsNotConfigured()
    {
        var task = InvokeFetchAiList(CreateFetcher(), "Ollama", "", "", "", "http://localhost:11434", "");

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() => task);
        Assert.Contains("Ollama model is not configured.", ex.Message);
    }
}
