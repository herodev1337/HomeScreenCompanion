using System;
using System.IO;
using System.Reflection;
using System.Threading.Tasks;
using MediaBrowser.Model.Serialization;
using Stj = System.Text.Json;
using Xunit;

namespace HomeScreenCompanion.Tests;

/// <summary>
/// Minimal System.Text.Json-backed <see cref="IJsonSerializer"/> for tests.
/// Only string (de)serialization is implemented; every other member throws.
/// Shared by <see cref="AiRequestBodyTests"/> and <see cref="FetchAiListTests"/>.
/// </summary>
internal sealed class TestJsonSerializer : IJsonSerializer
{
    private static readonly Stj.JsonSerializerOptions Options = new() { PropertyNameCaseInsensitive = true };

    public string SerializeToString(object obj) => Stj.JsonSerializer.Serialize(obj, Options);

    public string SerializeToString(object obj, JsonSerializerOptions options) => SerializeToString(obj);

    public T DeserializeFromString<T>(string text) => Stj.JsonSerializer.Deserialize<T>(text, Options)!;

    public object DeserializeFromString(string text, Type type) => Stj.JsonSerializer.Deserialize(text, type, Options)!;

    public void SerializeToStream(object obj, Stream stream) => throw new NotSupportedException();

    public void SerializeToStream(object obj, Stream stream, JsonSerializerOptions options) => throw new NotSupportedException();

    public void SerializeToFile(object obj, string file) => throw new NotSupportedException();

    public void SerializeToFile(object obj, string file, JsonSerializerOptions options) => throw new NotSupportedException();

    public Task<object> DeserializeFromFileAsync(Type type, string file) => throw new NotSupportedException();

    public T DeserializeFromFile<T>(string file) where T : class => throw new NotSupportedException();

    public Task<T> DeserializeFromFileAsync<T>(string file) where T : class => throw new NotSupportedException();

    public T DeserializeFromStream<T>(Stream stream) => throw new NotSupportedException();

    public Task<T> DeserializeFromStreamAsync<T>(Stream stream) => throw new NotSupportedException();

    public object DeserializeFromStream(Stream stream, Type type) => throw new NotSupportedException();

    public Task<object> DeserializeFromStreamAsync(Stream stream, Type type) => throw new NotSupportedException();

    public ReadOnlySpan<char> SerializeToSpan(object obj) => throw new NotSupportedException();

    public T DeserializeFromSpan<T>(ReadOnlySpan<char> text) => throw new NotSupportedException();

    public object DeserializeFromSpan(ReadOnlySpan<char> text, Type type) => throw new NotSupportedException();

    public object DeserializeFromBytes(ReadOnlySpan<byte> bytes, Type type) => throw new NotSupportedException();

    public T DeserializeFromBytes<T>(ReadOnlySpan<byte> bytes) => throw new NotSupportedException();

    public void DeserializePartialJsonInto(string json, object target) => throw new NotSupportedException();
}

/// <summary>
/// Proves the AI request bodies go through <see cref="IJsonSerializer"/>
/// (audit finding S2.3): values containing quotes, backslashes, newlines,
/// HTML-ish text and non-ASCII characters must round-trip exactly. The old
/// string-concatenation path (with its broken <c>EscapeJsonString</c>) would
/// fail these cases.
/// </summary>
public class AiRequestBodyTests
{
    private const string FetcherType = "HomeScreenCompanion.ListFetcher";

    private static readonly string[] SpecialValues =
    {
        "double quote \" backslash \\ newline \n end",
        "</script><script>alert(1)</script>",
        "é漢字",
        new string('x', 10000)
    };

    private static MethodInfo FindBuilder(string name, int stringArguments)
    {
        HscAssembly.EnsureAvailable();
        var parameterTypes = new Type[1 + stringArguments];
        parameterTypes[0] = typeof(IJsonSerializer);
        for (var i = 1; i < parameterTypes.Length; i++) parameterTypes[i] = typeof(string);

        var method = HscAssembly.FindStaticMethod(FetcherType, name, parameterTypes);
        Assert.NotNull(method);
        return method!;
    }

    private static string Build(string name, int stringArguments, params string[] values)
    {
        var args = new object?[values.Length + 1];
        args[0] = new TestJsonSerializer();
        for (var i = 0; i < values.Length; i++) args[i + 1] = values[i];
        return (string)FindBuilder(name, stringArguments).Invoke(null, args)!;
    }

    [Fact]
    public void OpenAiRequestBody_RoundTripsSpecialValues()
    {
        HscAssembly.EnsureAvailable();
        foreach (var value in SpecialValues)
        {
            var json = Build("BuildOpenAiRequestBody", 3, value, value, value);
            using var doc = Stj.JsonDocument.Parse(json);
            var root = doc.RootElement;

            Assert.Equal(value, root.GetProperty("model").GetString());
            var messages = root.GetProperty("messages");
            Assert.Equal(2, messages.GetArrayLength());
            Assert.Equal("system", messages[0].GetProperty("role").GetString());
            Assert.Equal(value, messages[0].GetProperty("content").GetString());
            Assert.Equal("user", messages[1].GetProperty("role").GetString());
            Assert.Equal(value, messages[1].GetProperty("content").GetString());
        }
    }

    [Fact]
    public void ClaudeRequestBody_RoundTripsSpecialValues()
    {
        HscAssembly.EnsureAvailable();
        foreach (var value in SpecialValues)
        {
            var json = Build("BuildClaudeRequestBody", 3, value, value, value);
            using var doc = Stj.JsonDocument.Parse(json);
            var root = doc.RootElement;

            Assert.Equal(value, root.GetProperty("model").GetString());
            Assert.Equal(1024, root.GetProperty("max_tokens").GetInt32());
            Assert.Equal(value, root.GetProperty("system").GetString());
            var messages = root.GetProperty("messages");
            Assert.Equal(1, messages.GetArrayLength());
            Assert.Equal("user", messages[0].GetProperty("role").GetString());
            Assert.Equal(value, messages[0].GetProperty("content").GetString());
        }
    }

    [Fact]
    public void OllamaRequestBody_RoundTripsSpecialValues()
    {
        HscAssembly.EnsureAvailable();
        foreach (var value in SpecialValues)
        {
            var json = Build("BuildOllamaRequestBody", 3, value, value, value);
            using var doc = Stj.JsonDocument.Parse(json);
            var root = doc.RootElement;

            Assert.Equal(value, root.GetProperty("model").GetString());
            Assert.False(root.GetProperty("stream").GetBoolean());
            var messages = root.GetProperty("messages");
            Assert.Equal(2, messages.GetArrayLength());
            Assert.Equal("system", messages[0].GetProperty("role").GetString());
            Assert.Equal(value, messages[0].GetProperty("content").GetString());
            Assert.Equal("user", messages[1].GetProperty("role").GetString());
            Assert.Equal(value, messages[1].GetProperty("content").GetString());
        }
    }

    [Fact]
    public void GeminiRequestBody_RoundTripsSpecialValues()
    {
        HscAssembly.EnsureAvailable();
        foreach (var value in SpecialValues)
        {
            var json = Build("BuildGeminiRequestBody", 2, value, value);
            using var doc = Stj.JsonDocument.Parse(json);
            var root = doc.RootElement;

            Assert.Equal(value, root.GetProperty("systemInstruction").GetProperty("parts")[0].GetProperty("text").GetString());
            var contents = root.GetProperty("contents");
            Assert.Equal(1, contents.GetArrayLength());
            Assert.Equal("user", contents[0].GetProperty("role").GetString());
            Assert.Equal(value, contents[0].GetProperty("parts")[0].GetProperty("text").GetString());
        }
    }

    [Fact]
    public void GeminiUrl_CarriesModelAndKey()
    {
        HscAssembly.EnsureAvailable();
        var method = HscAssembly.FindStaticMethod(FetcherType, "BuildGeminiUrl", typeof(string), typeof(string));
        Assert.NotNull(method);

        var url = (string)method!.Invoke(null, new object?[] { "KEY", "gemini-2.0-flash" })!;
        Assert.Equal(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=KEY",
            url);
    }

    [Fact]
    public void EscapeJsonString_WasDeleted()
    {
        HscAssembly.EnsureAvailable();
        var type = HscAssembly.FindType(FetcherType);
        Assert.NotNull(type);

        var method = type!.GetMethod(
            "EscapeJsonString",
            BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);

        Assert.Null(method);
    }
}
